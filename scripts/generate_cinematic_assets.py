"""
Generate high-resolution cinematic plates and shader maps from
public/textures/painting-reference.jpg into public/cinematic/:

  - painting-4k.jpg : 3840x2160 plate (4x Real-ESRGAN x4plus -> Lanczos 4K)
  - painting-2k.jpg : 2560x1440 plate (4x Real-ESRGAN x4plus -> Lanczos 2K)
  - depth.png       : 2048x1152 dual-res Depth-Anything-V2-Large fused,
                      color-guided-filtered, foreground-dilated depth map
  - normals.png     : 2048x1152 tangent-space OpenGL normal map from depth
  - fx.png          : 2048x1152 straight RGBA FX mask:
                        R = neon / practical lights
                        G = gold metal
                        B = window / skyline
                        A = screens (laptop + desk tactical tablet)
  - preview.jpg     : High-resolution side-by-side visual QC contact sheet
"""

from __future__ import annotations

import gc
import math
import os
import time
import urllib.request
from pathlib import Path

import cv2
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from PIL import Image, ImageDraw, ImageFont
from scipy.ndimage import gaussian_filter
from transformers import AutoModelForDepthEstimation


REPO_ROOT = Path(__file__).resolve().parent.parent
INPUT_PATH = REPO_ROOT / "public" / "textures" / "painting-reference.jpg"
OUTPUT_DIR = REPO_ROOT / "public" / "cinematic"

REALESRGAN_URL = (
    "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/"
    "RealESRGAN_x4plus.pth"
)
REALESRGAN_CACHE = Path.home() / ".cache" / "realesrgan" / "RealESRGAN_x4plus.pth"
DEPTH_MODEL_ID = "depth-anything/Depth-Anything-V2-Large-hf"

MAP_W, MAP_H = 2048, 1152


# ---------------------------------------------------------------------------
# 1. Exact Real-ESRGAN x4plus RRDBNet (basicsr compatible, strict=True)
# ---------------------------------------------------------------------------
class ResidualDenseBlock(nn.Module):
    def __init__(self, num_feat: int = 64, num_grow_ch: int = 32):
        super().__init__()
        self.conv1 = nn.Conv2d(num_feat, num_grow_ch, 3, 1, 1)
        self.conv2 = nn.Conv2d(num_feat + num_grow_ch, num_grow_ch, 3, 1, 1)
        self.conv3 = nn.Conv2d(num_feat + 2 * num_grow_ch, num_grow_ch, 3, 1, 1)
        self.conv4 = nn.Conv2d(num_feat + 3 * num_grow_ch, num_grow_ch, 3, 1, 1)
        self.conv5 = nn.Conv2d(num_feat + 4 * num_grow_ch, num_feat, 3, 1, 1)
        self.lrelu = nn.LeakyReLU(negative_slope=0.2, inplace=True)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x1 = self.lrelu(self.conv1(x))
        x2 = self.lrelu(self.conv2(torch.cat((x, x1), 1)))
        x3 = self.lrelu(self.conv3(torch.cat((x, x1, x2), 1)))
        x4 = self.lrelu(self.conv4(torch.cat((x, x1, x2, x3), 1)))
        x5 = self.conv5(torch.cat((x, x1, x2, x3, x4), 1))
        return x5 * 0.2 + x


class RRDB(nn.Module):
    def __init__(self, num_feat: int = 64, num_grow_ch: int = 32):
        super().__init__()
        self.rdb1 = ResidualDenseBlock(num_feat, num_grow_ch)
        self.rdb2 = ResidualDenseBlock(num_feat, num_grow_ch)
        self.rdb3 = ResidualDenseBlock(num_feat, num_grow_ch)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        out = self.rdb1(x)
        out = self.rdb2(out)
        out = self.rdb3(out)
        return out * 0.2 + x


class RRDBNet(nn.Module):
    def __init__(
        self,
        num_in_ch: int = 3,
        num_out_ch: int = 3,
        num_feat: int = 64,
        num_block: int = 23,
        num_grow_ch: int = 32,
        scale: int = 4,
    ):
        super().__init__()
        self.scale = scale
        self.conv_first = nn.Conv2d(num_in_ch, num_feat, 3, 1, 1)
        self.body = nn.Sequential(
            *[RRDB(num_feat=num_feat, num_grow_ch=num_grow_ch) for _ in range(num_block)]
        )
        self.conv_body = nn.Conv2d(num_feat, num_feat, 3, 1, 1)
        self.conv_up1 = nn.Conv2d(num_feat, num_feat, 3, 1, 1)
        self.conv_up2 = nn.Conv2d(num_feat, num_feat, 3, 1, 1)
        self.conv_hr = nn.Conv2d(num_feat, num_feat, 3, 1, 1)
        self.conv_last = nn.Conv2d(num_feat, num_out_ch, 3, 1, 1)
        self.lrelu = nn.LeakyReLU(negative_slope=0.2, inplace=True)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        feat = self.conv_first(x)
        body_feat = self.conv_body(self.body(feat))
        feat = feat + body_feat
        feat = self.lrelu(
            self.conv_up1(F.interpolate(feat, scale_factor=2, mode="nearest"))
        )
        feat = self.lrelu(
            self.conv_up2(F.interpolate(feat, scale_factor=2, mode="nearest"))
        )
        out = self.conv_last(self.lrelu(self.conv_hr(feat)))
        return out


def ensure_realesrgan_weights() -> Path:
    REALESRGAN_CACHE.parent.mkdir(parents=True, exist_ok=True)
    if not REALESRGAN_CACHE.exists() or REALESRGAN_CACHE.stat().st_size < 60_000_000:
        print(f"Downloading RealESRGAN_x4plus.pth to {REALESRGAN_CACHE} ...")
        urllib.request.urlretrieve(REALESRGAN_URL, REALESRGAN_CACHE)
    return REALESRGAN_CACHE


@torch.inference_mode()
def upscale_realesrgan_4x(
    img_rgb: np.ndarray,
    device: torch.device,
    tile_size: int = 320,
    tile_pad: int = 32,
) -> np.ndarray:
    t0 = time.perf_counter()
    weights_path = ensure_realesrgan_weights()
    ckpt = torch.load(weights_path, map_location="cpu", weights_only=True)
    state_dict = ckpt.get("params_ema") or ckpt.get("params") or ckpt

    model = RRDBNet(
        num_in_ch=3, num_out_ch=3, num_feat=64, num_block=23, num_grow_ch=32, scale=4
    )
    model.load_state_dict(state_dict, strict=True)
    model.eval()

    use_half = device.type == "cuda"
    model = model.to(device=device, dtype=torch.float16 if use_half else torch.float32)

    h, w, _ = img_rgb.shape
    scale = 4
    img_t = (
        torch.from_numpy(img_rgb.astype(np.float32) / 255.0)
        .permute(2, 0, 1)
        .unsqueeze(0)
    )
    out = np.zeros((h * scale, w * scale, 3), dtype=np.uint8)

    tiles_x = math.ceil(w / tile_size)
    tiles_y = math.ceil(h / tile_size)
    total_tiles = tiles_x * tiles_y
    done = 0

    for y in range(tiles_y):
        for x in range(tiles_x):
            ofs_x = x * tile_size
            ofs_y = y * tile_size
            in_x0 = ofs_x
            in_x1 = min(ofs_x + tile_size, w)
            in_y0 = ofs_y
            in_y1 = min(ofs_y + tile_size, h)

            pad_x0 = max(in_x0 - tile_pad, 0)
            pad_x1 = min(in_x1 + tile_pad, w)
            pad_y0 = max(in_y0 - tile_pad, 0)
            pad_y1 = min(in_y1 + tile_pad, h)

            patch = img_t[:, :, pad_y0:pad_y1, pad_x0:pad_x1].to(
                device=device, dtype=torch.float16 if use_half else torch.float32
            )
            pred = model(patch).float().clamp_(0.0, 1.0)
            pred_np = (
                pred.squeeze(0).permute(1, 2, 0).cpu().numpy() * 255.0 + 0.5
            ).astype(np.uint8)

            crop_x0 = (in_x0 - pad_x0) * scale
            crop_x1 = (in_x1 - pad_x0) * scale
            crop_y0 = (in_y0 - pad_y0) * scale
            crop_y1 = (in_y1 - pad_y0) * scale

            out[in_y0 * scale : in_y1 * scale, in_x0 * scale : in_x1 * scale] = pred_np[
                crop_y0:crop_y1, crop_x0:crop_x1
            ]
            done += 1

    del model, ckpt, state_dict, img_t
    gc.collect()
    if device.type == "cuda":
        torch.cuda.empty_cache()

    print(
        f"[Real-ESRGAN x4plus] {w}x{h} -> {out.shape[1]}x{out.shape[0]} "
        f"({total_tiles} tiles, {device.type}) in {time.perf_counter() - t0:.1f}s"
    )
    return out


# ---------------------------------------------------------------------------
# 2. Dual-Resolution Depth-Anything-V2-Large + Guided Filter + Dilation
# ---------------------------------------------------------------------------
def _depth_preprocess(img_rgb: np.ndarray, width: int, height: int) -> torch.Tensor:
    """Resize to exact multiple-of-14 dimensions and apply ImageNet normalization."""
    resized = cv2.resize(img_rgb, (width, height), interpolation=cv2.INTER_AREA)
    arr = resized.astype(np.float32) / 255.0
    mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
    std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
    arr = (arr - mean) / std
    return torch.from_numpy(arr).permute(2, 0, 1).unsqueeze(0)


@torch.inference_mode()
def run_depth_pass(
    model: nn.Module,
    img_rgb: np.ndarray,
    width: int,
    height: int,
    device: torch.device,
) -> np.ndarray:
    t0 = time.perf_counter()
    pixel_values = _depth_preprocess(img_rgb, width, height)
    use_half = device.type == "cuda"
    pv = pixel_values.to(
        device=device, dtype=torch.float16 if use_half else torch.float32
    )
    out = model(pixel_values=pv).predicted_depth
    depth = out.squeeze(0).float().cpu().numpy()
    if device.type == "cuda":
        torch.cuda.empty_cache()
    print(
        f"[Depth-Anything-V2-Large] pass {width}x{height} -> raw {depth.shape[1]}x{depth.shape[0]} "
        f"on {device.type} in {time.perf_counter() - t0:.1f}s"
    )
    return depth


def guided_filter_color(
    guide_rgb: np.ndarray, src: np.ndarray, radius: int, eps: float
) -> np.ndarray:
    """
    Exact 3-channel color Guided Image Filter (He et al., TPAMI 2013).
    guide_rgb: float32 HxWx3 in [0, 1]
    src:       float32 HxW
    """
    ksize = (2 * radius + 1, 2 * radius + 1)
    r = guide_rgb[:, :, 0]
    g = guide_rgb[:, :, 1]
    b = guide_rgb[:, :, 2]

    mean_r = cv2.boxFilter(r, cv2.CV_32F, ksize, borderType=cv2.BORDER_REFLECT)
    mean_g = cv2.boxFilter(g, cv2.CV_32F, ksize, borderType=cv2.BORDER_REFLECT)
    mean_b = cv2.boxFilter(b, cv2.CV_32F, ksize, borderType=cv2.BORDER_REFLECT)
    mean_p = cv2.boxFilter(src, cv2.CV_32F, ksize, borderType=cv2.BORDER_REFLECT)

    cov_rp = cv2.boxFilter(r * src, cv2.CV_32F, ksize, borderType=cv2.BORDER_REFLECT) - mean_r * mean_p
    cov_gp = cv2.boxFilter(g * src, cv2.CV_32F, ksize, borderType=cv2.BORDER_REFLECT) - mean_g * mean_p
    cov_bp = cv2.boxFilter(b * src, cv2.CV_32F, ksize, borderType=cv2.BORDER_REFLECT) - mean_b * mean_p

    var_rr = cv2.boxFilter(r * r, cv2.CV_32F, ksize, borderType=cv2.BORDER_REFLECT) - mean_r * mean_r + eps
    var_rg = cv2.boxFilter(r * g, cv2.CV_32F, ksize, borderType=cv2.BORDER_REFLECT) - mean_r * mean_g
    var_rb = cv2.boxFilter(r * b, cv2.CV_32F, ksize, borderType=cv2.BORDER_REFLECT) - mean_r * mean_b
    var_gg = cv2.boxFilter(g * g, cv2.CV_32F, ksize, borderType=cv2.BORDER_REFLECT) - mean_g * mean_g + eps
    var_gb = cv2.boxFilter(g * b, cv2.CV_32F, ksize, borderType=cv2.BORDER_REFLECT) - mean_g * mean_b
    var_bb = cv2.boxFilter(b * b, cv2.CV_32F, ksize, borderType=cv2.BORDER_REFLECT) - mean_b * mean_b + eps

    # Analytic inverse of symmetric 3x3 covariance matrix per pixel
    inv_rr = var_gg * var_bb - var_gb * var_gb
    inv_rg = var_gb * var_rb - var_rg * var_bb
    inv_rb = var_rg * var_gb - var_gg * var_rb
    inv_gg = var_rr * var_bb - var_rb * var_rb
    inv_gb = var_rg * var_rb - var_rr * var_gb
    inv_bb = var_rr * var_gg - var_rg * var_rg

    det = var_rr * inv_rr + var_rg * inv_rg + var_rb * inv_rb
    inv_det = 1.0 / np.maximum(det, 1e-12)

    a_r = (inv_rr * cov_rp + inv_rg * cov_gp + inv_rb * cov_bp) * inv_det
    a_g = (inv_rg * cov_rp + inv_gg * cov_gp + inv_gb * cov_bp) * inv_det
    a_b = (inv_rb * cov_rp + inv_gb * cov_gp + inv_bb * cov_bp) * inv_det

    b_term = mean_p - a_r * mean_r - a_g * mean_g - a_b * mean_b

    mean_ar = cv2.boxFilter(a_r, cv2.CV_32F, ksize, borderType=cv2.BORDER_REFLECT)
    mean_ag = cv2.boxFilter(a_g, cv2.CV_32F, ksize, borderType=cv2.BORDER_REFLECT)
    mean_ab = cv2.boxFilter(a_b, cv2.CV_32F, ksize, borderType=cv2.BORDER_REFLECT)
    mean_bt = cv2.boxFilter(b_term, cv2.CV_32F, ksize, borderType=cv2.BORDER_REFLECT)

    return mean_ar * r + mean_ag * g + mean_ab * b + mean_bt


def build_depth_maps(
    plate_rgb_4x: np.ndarray,
    guide_rgb_map: np.ndarray,
    device: torch.device,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """
    Run Depth-Anything-V2-Large at two 16:9 patch-14 resolutions:
      - Low-res  (896x504)   for stable global spatial layout
      - High-res (1792x1008) for fine object contours, hair, rifle, props
    Combine them via frequency split, refine edges with a 3-channel color
    guided filter, and apply silhouette-preserving foreground dilation.

    Returns:
      depth_final   : float32 [0, 1] dilated depth (for depth.png)
      depth_guided  : float32 [0, 1] pre-dilation guided depth (for smooth normals & window masking)
      d_low_norm    : float32 [0, 1] low-res pass (for QC)
      d_high_norm   : float32 [0, 1] aligned high-res pass (for QC)
    """
    local_only = True
    try:
        model = AutoModelForDepthEstimation.from_pretrained(
            DEPTH_MODEL_ID, local_files_only=local_only
        )
    except Exception:
        model = AutoModelForDepthEstimation.from_pretrained(DEPTH_MODEL_ID)

    model.eval()
    use_half = device.type == "cuda"
    model = model.to(device=device, dtype=torch.float16 if use_half else torch.float32)

    # Pass 1: Low-resolution global layout (exact 16:9, multiples of 14: 64x14 x 36x14)
    d_low_raw = run_depth_pass(model, plate_rgb_4x, 896, 504, device)

    # Pass 2: High-resolution fine detail (exact 16:9, 2x linear = 4x pixels: 128x14 x 72x14)
    d_high_raw = None
    for hi_w, hi_h in [(1792, 1008), (1568, 882)]:
        try:
            d_high_raw = run_depth_pass(model, plate_rgb_4x, hi_w, hi_h, device)
            break
        except torch.cuda.OutOfMemoryError:
            print(f"CUDA OOM at {hi_w}x{hi_h}, clearing cache and trying fallback...")
            torch.cuda.empty_cache()

    if d_high_raw is None:
        print("Falling back to CPU fp32 for high-res pass 1568x882...")
        model_cpu = model.to(device=torch.device("cpu"), dtype=torch.float32)
        d_high_raw = run_depth_pass(
            model_cpu, plate_rgb_4x, 1568, 882, torch.device("cpu")
        )

    del model
    gc.collect()
    if device.type == "cuda":
        torch.cuda.empty_cache()

    # Resize both passes smoothly to working map resolution (2048x1152)
    d_low = cv2.resize(d_low_raw, (MAP_W, MAP_H), interpolation=cv2.INTER_CUBIC).astype(
        np.float32
    )
    d_high = cv2.resize(
        d_high_raw, (MAP_W, MAP_H), interpolation=cv2.INTER_CUBIC
    ).astype(np.float32)

    # Robustly normalize low-res global layout to [0, 1]
    lo_p = float(np.percentile(d_low, 0.3))
    hi_p = float(np.percentile(d_low, 99.7))
    d_low_norm = np.clip((d_low - lo_p) / max(hi_p - lo_p, 1e-6), 0.0, 1.0)

    # Affine-align high-res pass to low-res global scale/offset (robust central 96%)
    mask_mid = (d_low_norm > 0.02) & (d_low_norm < 0.98)
    x_fit = d_high[mask_mid]
    y_fit = d_low_norm[mask_mid]
    x_mean = float(x_fit.mean())
    y_mean = float(y_fit.mean())
    scale_a = float(
        np.sum((x_fit - x_mean) * (y_fit - y_mean))
        / max(np.sum((x_fit - x_mean) ** 2), 1e-8)
    )
    shift_b = y_mean - scale_a * x_mean
    d_high_aligned = np.clip(scale_a * d_high + shift_b, 0.0, 1.0)

    # Frequency fusion: low-res governs overall layout, high-res injects crisp structure/detail
    sigma_layout = 30.0  # ~1.5% of 2048px width
    d_low_lp = gaussian_filter(d_low_norm, sigma=sigma_layout)
    d_high_lp = gaussian_filter(d_high_aligned, sigma=sigma_layout)
    d_low_hp = d_low_norm - d_low_lp
    d_high_hp = d_high_aligned - d_high_lp

    # 85% low-res overall layout + 15% high-res low-freq, plus 88% high-res detail + 12% low-res detail
    d_fused = (0.85 * d_low_lp + 0.15 * d_high_lp) + (0.88 * d_high_hp + 0.12 * d_low_hp)
    p0, p1 = np.percentile(d_fused, [0.2, 99.8])
    d_fused = np.clip((d_fused - p0) / max(p1 - p0, 1e-6), 0.0, 1.0)

    # Mild monotonic perceptual lift so mid-ground (operator, husky, helmet, wall)
    # isn't crushed against close foreground desk disparity, while keeping skyline near 0.
    d_lifted = np.power(d_fused, 0.78).astype(np.float32)

    # Edge refinement with 3-channel Color Guided Filter using the upscaled color image
    guide_f = guide_rgb_map.astype(np.float32) / 255.0
    # Lightly clamp extreme 1px specular highlights in the guide image so shiny metallic
    # dots (mug rim, chess piece, desk glints) do not inject false depth spikes.
    guide_clean = cv2.bilateralFilter(guide_f, d=5, sigmaColor=0.08, sigmaSpace=3.0)

    # Stage 1: macro silhouette alignment without copying painted jacket/poster textures
    d_g1 = guided_filter_color(guide_clean, d_lifted, radius=12, eps=2.2e-3)
    # Stage 2: fine contour snap (hair strands, rifle barrel, mug rim, husky ears)
    d_guided = guided_filter_color(guide_clean, d_g1, radius=4, eps=3.0e-3)

    # Bound guided filter output to local min/max envelope of d_lifted so specular
    # highlights can align edges cleanly but NEVER overshoot into isolated bright spikes.
    env_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
    d_env_max = cv2.dilate(d_lifted, env_kernel)
    d_env_min = cv2.erode(d_lifted, env_kernel)
    d_guided = np.clip(d_guided, d_env_min, d_env_max)
    d_guided = cv2.medianBlur(d_guided, 3)

    # Re-normalize cleanly after guided filtering
    gp0, gp1 = np.percentile(d_guided, [0.1, 99.9])
    d_guided = np.clip((d_guided - gp0) / max(gp1 - gp0, 1e-6), 0.0, 1.0)

    # Foreground dilation so foreground silhouettes stay clean under parallax displacement.
    # Morphological opening (small radius) suppresses any sub-2px noise before dilation
    # so dilated silhouettes are continuous curves rather than circular beads.
    open_k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    d_pre_dil = cv2.morphologyEx(d_guided, cv2.MORPH_OPEN, open_k)

    # Two-step soft foreground dilation (radius 3px core + radius 5px gentle halo guard)
    k_fg1 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    k_fg2 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11))
    d_dil1 = cv2.dilate(d_pre_dil, k_fg1)
    d_dil2 = cv2.dilate(d_pre_dil, k_fg2)

    # Dilate strongly only across true silhouette jumps (preserving interior surface slopes)
    jump1 = np.clip((d_dil1 - d_guided) / 0.04, 0.0, 1.0)
    jump2 = np.clip((d_dil2 - d_dil1) / 0.06, 0.0, 1.0)
    d_dil_blend = np.maximum(
        d_guided,
        d_guided + (d_dil1 - d_guided) * (0.25 + 0.75 * jump1),
    )
    d_dil_blend = np.maximum(
        d_dil_blend,
        d_dil_blend + (d_dil2 - d_dil_blend) * (0.35 * jump2),
    )
    d_final = gaussian_filter(d_dil_blend, sigma=0.85).astype(np.float32)
    # Re-anchor range so closest foreground reaches 255 and distant skyline stays near 0
    fp0, fp1 = np.percentile(d_final, [0.05, 99.95])
    d_final = np.clip((d_final - fp0) / max(fp1 - fp0, 1e-6), 0.0, 1.0)

    print(
        f"[Depth] guided p5={np.percentile(d_guided,5):.3f} p50={np.percentile(d_guided,50):.3f} "
        f"p95={np.percentile(d_guided,95):.3f} | "
        f"final p5={np.percentile(d_final,5):.3f} p50={np.percentile(d_final,50):.3f} "
        f"p95={np.percentile(d_final,95):.3f}"
    )
    return d_final, d_guided, d_low_norm, d_high_aligned


# ---------------------------------------------------------------------------
# 3. Normal Map from Depth (OpenGL Tangent Space: +X right, +Y up, +Z out)
# ---------------------------------------------------------------------------
def compute_normals_from_depth(
    depth_guided: np.ndarray, depth_final: np.ndarray
) -> np.ndarray:
    """
    Compute sculpted tangent-space normals from float32 depth (OpenGL: +X right, +Y up, +Z out).
    Combines three spatial scales (fine surface creases, medium form, broad 3D volume)
    with soft tanh compression on steep occluding depth discontinuities so interior 3D
    curvature reads strongly without harsh saturated silhouette rings.
    """
    # Guided depth preserves smooth 3D form; mild blend with dilated depth keeps silhouette bounds
    d_src = 0.80 * depth_guided + 0.20 * depth_final

    # Scale 1 (fine surface detail & edges)
    d_s1 = gaussian_filter(d_src, sigma=1.1).astype(np.float32)
    gx1 = cv2.Scharr(d_s1, cv2.CV_32F, 1, 0) / 32.0
    gy1 = cv2.Scharr(d_s1, cv2.CV_32F, 0, 1) / 32.0

    # Scale 2 (medium folds, helmet NVGs, hands, AK geometry, husky gas mask)
    d_s2 = gaussian_filter(d_src, sigma=3.5).astype(np.float32)
    gx2 = cv2.Scharr(d_s2, cv2.CV_32F, 1, 0) / 32.0
    gy2 = cv2.Scharr(d_s2, cv2.CV_32F, 0, 1) / 32.0

    # Scale 3 (broad 3D volume curvature: torso, helmet dome, mug cylinder, desk plane)
    d_s3 = gaussian_filter(d_src, sigma=10.0).astype(np.float32)
    gx3 = cv2.Scharr(d_s3, cv2.CV_32F, 1, 0) / 32.0
    gy3 = cv2.Scharr(d_s3, cv2.CV_32F, 0, 1) / 32.0

    # Softly cap extreme depth-discontinuity spikes per scale BEFORE combining,
    # so broad/medium 3D slopes retain rich contrast while silhouette cliffs stay smooth.
    gx = (
        1.15 * np.tanh((gx1 * 170.0) / 1.15) * 0.45
        + 1.35 * np.tanh((gx2 * 260.0) / 1.35) * 0.35
        + 1.20 * np.tanh((gx3 * 360.0) / 1.20) * 0.20
    )
    gy = (
        1.15 * np.tanh((gy1 * 170.0) / 1.15) * 0.45
        + 1.35 * np.tanh((gy2 * 260.0) / 1.35) * 0.35
        + 1.20 * np.tanh((gy3 * 360.0) / 1.20) * 0.20
    )

    # OpenGL tangent space: +X right (nx = -dZ/dx), +Y up (ny = +dZ/dy_img), +Z viewer
    nx = -gx
    ny = gy
    nz = np.ones_like(nx, dtype=np.float32)

    inv_len = 1.0 / np.sqrt(nx * nx + ny * ny + nz * nz + 1e-12)
    nx *= inv_len
    ny *= inv_len
    nz *= inv_len

    normals = np.stack([nx * 0.5 + 0.5, ny * 0.5 + 0.5, nz * 0.5 + 0.5], axis=-1)
    return np.clip(np.round(normals * 255.0), 0, 255).astype(np.uint8)


# ---------------------------------------------------------------------------
# 4. FX Masks (R=neon/practical, G=gold metal, B=window/skyline, A=screens)
# ---------------------------------------------------------------------------
def _poly_mask(
    pts_norm: list[tuple[float, float]], w: int, h: int, feather: float = 0.0
) -> np.ndarray:
    mask = np.zeros((h, w), dtype=np.float32)
    pts = np.array([[int(round(x * w)), int(round(y * h))] for x, y in pts_norm], np.int32)
    cv2.fillPoly(mask, [pts], 1.0)
    if feather > 0:
        mask = gaussian_filter(mask, sigma=feather).astype(np.float32)
    return mask


def _rect_mask(
    x0: float, y0: float, x1: float, y1: float, w: int, h: int, feather: float = 0.0
) -> np.ndarray:
    return _poly_mask([(x0, y0), (x1, y0), (x1, y1), (x0, y1)], w, h, feather=feather)


def build_fx_masks(
    rgb_u8: np.ndarray, depth_guided: np.ndarray
) -> tuple[np.ndarray, dict[str, np.ndarray]]:
    """
    Build straight RGBA fx.png at MAP_W x MAP_H:
      R = neon / practical lights
      G = gold metal
      B = window / skyline
      A = screens
    """
    h, w, _ = rgb_u8.shape
    rgb = rgb_u8.astype(np.float32) / 255.0
    r_ch, g_ch, b_ch = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]

    hsv = cv2.cvtColor(rgb_u8, cv2.COLOR_RGB2HSV).astype(np.float32)
    h_deg = hsv[:, :, 0] * 2.0  # [0, 360)
    sat = hsv[:, :, 1] / 255.0
    val = hsv[:, :, 2] / 255.0
    lum = 0.2126 * r_ch + 0.7152 * g_ch + 0.0722 * b_ch

    # -----------------------------------------------------------------------
    # B = Window / Skyline (3 vertical glass panes, occluded by foreground depth)
    # -----------------------------------------------------------------------
    # Exact pixel-measured glass pane quads excluding mullions & left neon strip
    pane_left = _poly_mask(
        [(0.5155, 0.044), (0.5565, 0.032), (0.5565, 0.270), (0.5155, 0.270)], w, h
    )
    pane_center = _poly_mask(
        [(0.5685, 0.026), (0.6250, 0.014), (0.6250, 0.485), (0.5685, 0.485)], w, h
    )
    pane_right = _poly_mask(
        [(0.6400, 0.011), (0.6685, 0.004), (0.6685, 0.430), (0.6400, 0.430)], w, h
    )
    window_panes = np.clip(pane_left + pane_center + pane_right, 0.0, 1.0)

    # Estimate window depth dynamically from the unobstructed upper center pane
    ref_sky = _rect_mask(0.575, 0.04, 0.620, 0.18, w, h) > 0.5
    sky_d95 = float(np.percentile(depth_guided[ref_sky], 95))
    # Operator hair & husky ear sit much closer than the distant skyline
    # Use smooth ramp around threshold so hair fringes stay clean
    d_lo = sky_d95 + 0.035
    d_hi = sky_d95 + 0.115
    far_bg = 1.0 - np.clip((depth_guided - d_lo) / max(d_hi - d_lo, 1e-4), 0.0, 1.0)

    # Also protect operator hair tips / dark mask / husky ear silhouette via guided filter
    win_raw = window_panes * far_bg
    # Remove tiny dark mullion bleed along the vertical borders
    win_refined = guided_filter_color(rgb, win_raw.astype(np.float32), radius=4, eps=5e-4)
    # Constrain strictly within the three glass pane rectangles (soft 1px edge)
    panes_aa = gaussian_filter(window_panes, sigma=1.0).astype(np.float32)
    mask_window = np.clip(win_refined * panes_aa, 0.0, 1.0)
    # Boost clean interior glass to full 1.0 while keeping smooth hair-edge alpha
    mask_window = np.clip((mask_window - 0.12) / 0.72, 0.0, 1.0)

    # -----------------------------------------------------------------------
    # A = Screens (Bottom-right laptop display + flat desk tactical tablet)
    # -----------------------------------------------------------------------
    # 1. Laptop active screen strictly inside bezel (measured from zoomed grid)
    laptop_quad = _poly_mask(
        [(0.9735, 0.674), (1.000, 0.674), (1.000, 0.897), (0.9345, 0.878)],
        w,
        h,
        feather=1.2,
    )
    # 2. Illuminated flat tactical tablet screen on desk beside laptop
    tablet_quad = _poly_mask(
        [(0.746, 0.898), (0.806, 0.885), (0.905, 0.896), (0.855, 0.918)],
        w,
        h,
        feather=1.0,
    )
    # Dark out-of-focus foreground prop overlaps the lower-right corner of the tablet;
    # keep the brightly illuminated screen surface cleanly separated from that dark prop.
    tablet_lit = np.clip((lum - 0.28) / 0.25, 0.0, 1.0)
    tablet_lit = guided_filter_color(rgb, tablet_lit.astype(np.float32), radius=3, eps=5e-4)
    tablet_mask = np.clip(tablet_quad * tablet_lit * 1.15, 0.0, 1.0)

    mask_screens = np.clip(np.maximum(laptop_quad, tablet_mask), 0.0, 1.0)
    mask_screens = np.where(mask_screens < 0.03, 0.0, mask_screens).astype(np.float32)

    # -----------------------------------------------------------------------
    # R = Neon / Practical Lights
    # -----------------------------------------------------------------------
    # Define fixture zones (generously bounded; pixel-level emissive luminance/chroma
    # isolates the exact neon tubes, white-hot cores, and practical lantern glow!)
    neon_zones = np.zeros((h, w), dtype=np.float32)
    # Far-left top red accent & vertical warm-amber/red LED strip left of framed painting
    neon_zones = np.maximum(neon_zones, _rect_mask(0.000, 0.000, 0.042, 0.120, w, h, feather=6))
    neon_zones = np.maximum(neon_zones, _rect_mask(0.045, 0.000, 0.078, 0.335, w, h, feather=5))
    # Top center-left glowing red neon frame & vertical tube behind foliage
    neon_zones = np.maximum(neon_zones, _rect_mask(0.395, 0.000, 0.472, 0.165, w, h, feather=6))
    # Vertical red neon bar along left edge of window frame (stops before glass at 0.5155)
    neon_zones = np.maximum(neon_zones, _rect_mask(0.504, 0.000, 0.5155, 0.155, w, h, feather=3))
    # Right bookshelf vertical red neon light tubes (top to middle-bottom)
    neon_zones = np.maximum(neon_zones, _rect_mask(0.905, 0.035, 0.955, 0.420, w, h, feather=6))
    # Far-right glowing crimson cage lantern (incandescent white-red practical light)
    neon_zones = np.maximum(neon_zones, _rect_mask(0.958, 0.415, 1.000, 0.585, w, h, feather=6))
    # Small warm amber desk lantern / candle lamp beside crate right of husky
    neon_zones = np.maximum(neon_zones, _rect_mask(0.840, 0.505, 0.874, 0.615, w, h, feather=5))
    # Glowing crimson reflections/practical accent inside right glass globe & lamp stem
    neon_zones = np.maximum(neon_zones, _rect_mask(0.875, 0.435, 0.958, 0.560, w, h, feather=6))

    # Emissive light pixel score: catches BOTH saturated red/orange neon glow AND
    # clipped bright white-pink/amber-white neon cores!
    is_red_warm = ((h_deg <= 42.0) | (h_deg >= 325.0)).astype(np.float32)
    red_glow = np.clip((r_ch - 0.35) / 0.45, 0.0, 1.0) * np.clip(
        (r_ch - np.maximum(g_ch, b_ch) * 0.85) / 0.25, 0.0, 1.0
    )
    white_core = np.clip((lum - 0.62) / 0.32, 0.0, 1.0) * np.clip(
        (r_ch - b_ch + 0.20) / 0.30, 0.0, 1.0
    )
    warm_lamp = is_red_warm * np.clip((val - 0.52) / 0.40, 0.0, 1.0) * np.clip(
        (sat - 0.22) / 0.40, 0.0, 1.0
    )
    emissive_raw = np.clip(np.maximum.reduce([red_glow, white_core, warm_lamp]), 0.0, 1.0)

    # Combine fixture zones with emissive signal, strictly excluding window & screens
    neon_core = emissive_raw * neon_zones * (1.0 - mask_window) * (1.0 - mask_screens)
    # Add soft practical light bloom halo around strong emissive cores
    neon_halo = gaussian_filter(neon_core, sigma=5.0).astype(np.float32)
    mask_neon = np.clip(np.maximum(neon_core * 1.15, neon_halo * 0.85), 0.0, 1.0)
    mask_neon = guided_filter_color(rgb, mask_neon, radius=3, eps=1e-3)
    mask_neon = np.clip(mask_neon * (1.0 - mask_window) * (1.0 - mask_screens), 0.0, 1.0)
    mask_neon = np.where(mask_neon < 0.03, 0.0, mask_neon).astype(np.float32)

    # -----------------------------------------------------------------------
    # G = Gold Metal (AK filigree, chess knight, bullets, frames, emblems, latches)
    # -----------------------------------------------------------------------
    # True warm metallic gold / brass color signature:
    #   - Hue cleanly in warm gold/amber/yellow [18 deg .. 54 deg] (rejects crimson red <16 deg)
    #   - R > G > B with strong yellow warmth (G/R in [0.54, 0.94], B/R < 0.62)
    #   - Bright specular highlights on polished gold (high val, warm tint)
    hue_gold = (
        np.clip((h_deg - 17.0) / 7.0, 0.0, 1.0)
        * np.clip((52.0 - h_deg) / 8.0, 0.0, 1.0)
    )
    g_ratio = g_ch / np.maximum(r_ch, 1e-4)
    b_ratio = b_ch / np.maximum(r_ch, 1e-4)
    warm_gold_ratio = (
        np.clip((g_ratio - 0.50) / 0.14, 0.0, 1.0)
        * np.clip((0.93 - g_ratio) / 0.09, 0.0, 1.0)
        * np.clip((0.66 - b_ratio) / 0.22, 0.0, 1.0)
    )
    sat_gold = np.clip((sat - 0.28) / 0.22, 0.0, 1.0)
    val_gold = np.clip((val - 0.20) / 0.28, 0.0, 1.0)

    gold_chroma = hue_gold * warm_gold_ratio * sat_gold * val_gold

    # Also catch bright specular white-gold glint highlights adjacent to gold metal
    gold_nearby = gaussian_filter((gold_chroma > 0.25).astype(np.float32), sigma=4.0)
    gold_spec = (
        np.clip((val - 0.72) / 0.22, 0.0, 1.0)
        * np.clip((r_ch - b_ch - 0.04) / 0.14, 0.0, 1.0)
        * np.clip(gold_nearby * 3.5, 0.0, 1.0)
    )
    gold_raw = np.clip(np.maximum(gold_chroma * 1.25, gold_spec), 0.0, 1.0)

    # Spatial exclusions for non-gold warm elements (skin/face, husky fur/paw, warm foliage,
    # red/warm painting interior, neon lamps, window skyline, screens, red poster)
    gold_exclude = np.zeros((h, w), dtype=np.float32)
    # Operator face/eye/skin area
    gold_exclude = np.maximum(gold_exclude, _rect_mask(0.455, 0.245, 0.545, 0.345, w, h, feather=6))
    # Husky face, white fur chest, paw, tail
    gold_exclude = np.maximum(gold_exclude, _rect_mask(0.610, 0.360, 0.800, 0.780, w, h, feather=8))
    gold_exclude = np.maximum(gold_exclude, _rect_mask(0.700, 0.730, 0.915, 0.875, w, h, feather=8))
    # Inside the framed painting canvas (keep ONLY the outer gold frame!)
    gold_exclude = np.maximum(
        gold_exclude,
        _poly_mask(
            [(0.088, 0.000), (0.304, 0.040), (0.296, 0.295), (0.082, 0.255)],
            w,
            h,
            feather=3,
        ),
    )
    # YA red poster canvas
    gold_exclude = np.maximum(gold_exclude, _rect_mask(0.675, 0.000, 0.855, 0.520, w, h, feather=5))
    # Green/yellow potted plant leaves right of poster & top-center foliage
    gold_exclude = np.maximum(gold_exclude, _rect_mask(0.845, 0.270, 0.920, 0.440, w, h, feather=6))
    gold_exclude = np.maximum(gold_exclude, _rect_mask(0.335, 0.000, 0.455, 0.140, w, h, feather=6))
    # Bookshelf spines on far right (white/beige book text, not gold metal)
    gold_exclude = np.maximum(gold_exclude, _rect_mask(0.942, 0.095, 1.000, 0.400, w, h, feather=4))
    # White printed horse patch on operator's thigh drape & white/beige desk paper
    gold_exclude = np.maximum(gold_exclude, _rect_mask(0.200, 0.690, 0.285, 0.880, w, h, feather=5))
    # Window, neon lights, and screens
    gold_exclude = np.maximum(gold_exclude, np.clip(mask_window * 1.2, 0.0, 1.0))
    gold_exclude = np.maximum(gold_exclude, np.clip(mask_neon * 1.2, 0.0, 1.0))
    gold_exclude = np.maximum(gold_exclude, np.clip(mask_screens * 1.2, 0.0, 1.0))

    gold_masked = gold_raw * (1.0 - np.clip(gold_exclude, 0.0, 1.0))
    # Guided filter snaps gold mask tightly onto intricate AK filigree edges!
    mask_gold = guided_filter_color(rgb, gold_masked.astype(np.float32), radius=3, eps=6e-4)
    mask_gold = np.clip(mask_gold * 1.15, 0.0, 1.0)
    mask_gold = np.where(mask_gold < 0.04, 0.0, mask_gold).astype(np.float32)

    # Pack into straight (un-premultiplied) RGBA uint8
    fx_rgba = np.stack(
        [
            np.clip(np.round(mask_neon * 255.0), 0, 255).astype(np.uint8),
            np.clip(np.round(mask_gold * 255.0), 0, 255).astype(np.uint8),
            np.clip(np.round(mask_window * 255.0), 0, 255).astype(np.uint8),
            np.clip(np.round(mask_screens * 255.0), 0, 255).astype(np.uint8),
        ],
        axis=-1,
    )

    for idx, label in enumerate(
        ["R (neon/practical)", "G (gold metal)", "B (window/skyline)", "A (screens)"]
    ):
        ch = fx_rgba[:, :, idx]
        print(
            f"[FX] {label:20s}: max={ch.max():3d}  mean={ch.mean():5.2f}  "
            f">64={(ch > 64).mean() * 100:5.2f}%  >128={(ch > 128).mean() * 100:5.2f}%"
        )

    return fx_rgba, {
        "neon": mask_neon,
        "gold": mask_gold,
        "window": mask_window,
        "screens": mask_screens,
    }


# ---------------------------------------------------------------------------
# 5. Side-by-Side Visual Verification Preview
# ---------------------------------------------------------------------------
def _load_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for candidate in [
        "C:/Windows/Fonts/consolab.ttf",
        "C:/Windows/Fonts/segoeuib.ttf",
        "C:/Windows/Fonts/arialbd.ttf",
        "C:/Windows/Fonts/arial.ttf",
    ]:
        if os.path.exists(candidate):
            return ImageFont.truetype(candidate, size)
    return ImageFont.load_default()


def _label_bar(img_pil: Image.Image, title: str, subtitle: str = "") -> Image.Image:
    w, h = img_pil.size
    bar_h = 44
    canvas = Image.new("RGB", (w, h + bar_h), (14, 15, 19))
    canvas.paste(img_pil, (0, bar_h))
    draw = ImageDraw.Draw(canvas)
    draw.rectangle([0, 0, w, bar_h - 1], fill=(22, 24, 30))
    draw.line([(0, bar_h - 1), (w, bar_h - 1)], fill=(65, 70, 82), width=1)
    f_title = _load_font(19)
    f_sub = _load_font(14)
    draw.text((14, 11), title, fill=(242, 244, 248), font=f_title)
    if subtitle:
        bbox = draw.textbbox((0, 0), subtitle, font=f_sub)
        tw = bbox[2] - bbox[0]
        draw.text((w - tw - 14, 14), subtitle, fill=(168, 176, 192), font=f_sub)
    return canvas


def build_preview(
    orig_rgb: np.ndarray,
    plate_4k_rgb: np.ndarray,
    depth_u8: np.ndarray,
    normals_u8: np.ndarray,
    fx_rgba: np.ndarray,
    out_path: Path,
) -> None:
    pw, ph = 960, 540  # 16:9 per panel -> 3x2 grid = ~2960 x 1220
    pad = 16

    # Panel 1: 4K Upscaled Plate
    p1_img = Image.fromarray(plate_4k_rgb).resize((pw, ph), Image.Resampling.LANCZOS)
    p1 = _label_bar(p1_img, "1. REAL-ESRGAN x4PLUS PLATE", "6400x3600 -> 4K & 2K JPG")

    # Panel 2: Depth Map (grayscale)
    depth_rgb = np.stack([depth_u8, depth_u8, depth_u8], axis=-1)
    p2_img = Image.fromarray(depth_rgb).resize((pw, ph), Image.Resampling.LANCZOS)
    p2 = _label_bar(
        p2_img, "2. DEPTH MAP (depth.png)", "Dual-Res DA-V2-L + Guided + FG Dilated"
    )

    # Panel 3: Normal Map
    p3_img = Image.fromarray(normals_u8).resize((pw, ph), Image.Resampling.LANCZOS)
    p3 = _label_bar(p3_img, "3. NORMAL MAP (normals.png)", "OpenGL Tangent Space from Depth")

    # Panel 4: FX Overlay Composite over darkened plate
    base_dark = (
        cv2.resize(plate_4k_rgb, (MAP_W, MAP_H), interpolation=cv2.INTER_AREA).astype(
            np.float32
        )
        * 0.30
    )
    r_m = fx_rgba[:, :, 0:1].astype(np.float32) / 255.0
    g_m = fx_rgba[:, :, 1:2].astype(np.float32) / 255.0
    b_m = fx_rgba[:, :, 2:3].astype(np.float32) / 255.0
    a_m = fx_rgba[:, :, 3:4].astype(np.float32) / 255.0

    overlay = base_dark.copy()
    # Vivid distinct tints: R=Crimson, G=Gold, B=Cyan-Blue, A=Magenta
    overlay += r_m * np.array([255.0, 45.0, 55.0], dtype=np.float32) * 0.95
    overlay += g_m * np.array([255.0, 205.0, 40.0], dtype=np.float32) * 0.90
    overlay += b_m * np.array([40.0, 175.0, 255.0], dtype=np.float32) * 0.85
    overlay += a_m * np.array([235.0, 70.0, 255.0], dtype=np.float32) * 0.95
    overlay_u8 = np.clip(overlay, 0, 255).astype(np.uint8)
    p4_img = Image.fromarray(overlay_u8).resize((pw, ph), Image.Resampling.LANCZOS)
    p4 = _label_bar(
        p4_img,
        "4. FX OVERLAY ON PLATE",
        "Red=Neon | Gold=Metal | Cyan=Window | Magenta=Screens",
    )

    # Panel 5: 2x2 Individual FX Channels (R, G, B, A)
    sw, sh = pw // 2, ph // 2
    sub_specs = [
        (0, "R: NEON / PRACTICAL", np.array([255, 55, 65], np.float32)),
        (1, "G: GOLD METAL", np.array([255, 208, 45], np.float32)),
        (2, "B: WINDOW / SKYLINE", np.array([55, 185, 255], np.float32)),
        (3, "A: SCREENS", np.array([235, 80, 255], np.float32)),
    ]
    p5_img = Image.new("RGB", (pw, ph), (10, 10, 12))
    f_small = _load_font(15)
    for idx, lbl, tint in sub_specs:
        ch = fx_rgba[:, :, idx].astype(np.float32) / 255.0
        vis = np.clip(ch[:, :, None] * tint[None, None, :], 0, 255).astype(np.uint8)
        tile = Image.fromarray(vis).resize((sw, sh), Image.Resampling.LANCZOS)
        td = ImageDraw.Draw(tile)
        td.rectangle([0, 0, sw, 24], fill=(16, 18, 22))
        td.text((8, 4), lbl, fill=tuple(int(v) for v in tint), font=f_small)
        td.rectangle([0, 0, sw - 1, sh - 1], outline=(55, 60, 72), width=1)
        gx = (idx % 2) * sw
        gy = (idx // 2) * sh
        p5_img.paste(tile, (gx, gy))
    p5 = _label_bar(p5_img, "5. FX CHANNELS (fx.png RGBA)", "Individual Un-Premultiplied Channels")

    # Panel 6: 2x2 Close-Up Crops (Upscale sharpness + Hair/Window Silhouette + AK Gold + Screens)
    p6_img = Image.new("RGB", (pw, ph), (10, 10, 12))

    # Crop A: Aspect-preserved side-by-side Original vs 4K Real-ESRGAN (operator eye/headphone)
    # Match sub-panel aspect ratio (sw//2 : sh = 240:270 = 8:9) so neither half is stretched
    oh, ow, _ = orig_rgb.shape
    uh, uw, _ = plate_4k_rgb.shape
    half_w = sw // 2
    crop_h_n = 0.19
    crop_w_n = crop_h_n * (half_w / sh) * (oh / ow)
    cx_n, cy_n = 0.470, 0.290
    x0_n, x1_n = cx_n - crop_w_n / 2.0, cx_n + crop_w_n / 2.0
    y0_n, y1_n = cy_n - crop_h_n / 2.0, cy_n + crop_h_n / 2.0
    c_orig = Image.fromarray(
        orig_rgb[int(y0_n * oh) : int(y1_n * oh), int(x0_n * ow) : int(x1_n * ow)]
    ).resize((half_w, sh), Image.Resampling.NEAREST)
    c_esr = Image.fromarray(
        plate_4k_rgb[int(y0_n * uh) : int(y1_n * uh), int(x0_n * uw) : int(x1_n * uw)]
    ).resize((half_w, sh), Image.Resampling.LANCZOS)
    tile_a = Image.new("RGB", (sw, sh))
    tile_a.paste(c_orig, (0, 0))
    tile_a.paste(c_esr, (half_w, 0))
    da = ImageDraw.Draw(tile_a)
    da.line([(half_w, 0), (half_w, sh)], fill=(255, 220, 60), width=2)
    da.rectangle([0, 0, sw, 24], fill=(16, 18, 22))
    da.text((8, 4), "ORIG 1600p (NEAREST) | ESRGAN 4K", fill=(240, 240, 240), font=f_small)
    p6_img.paste(tile_a, (0, 0))

    # Crop B: Window/Hair silhouette depth + window mask check
    wbox = (int(0.47 * MAP_W), int(0.02 * MAP_H), int(0.70 * MAP_W), int(0.46 * MAP_H))
    d_crop = depth_u8[wbox[1]:wbox[3], wbox[0]:wbox[2]]
    win_crop = fx_rgba[wbox[1]:wbox[3], wbox[0]:wbox[2], 2]
    sil_vis = np.stack(
        [
            d_crop,
            np.clip(d_crop.astype(np.int32) + (win_crop.astype(np.int32) // 3), 0, 255).astype(np.uint8),
            np.clip(d_crop.astype(np.int32) + (win_crop.astype(np.int32) // 1), 0, 255).astype(np.uint8),
        ],
        axis=-1,
    )
    tile_b = Image.fromarray(sil_vis).resize((sw, sh), Image.Resampling.LANCZOS)
    db = ImageDraw.Draw(tile_b)
    db.rectangle([0, 0, sw, 24], fill=(16, 18, 22))
    db.text((8, 4), "DEPTH + WINDOW SILHOUETTE", fill=(80, 210, 255), font=f_small)
    p6_img.paste(tile_b, (sw, 0))

    # Crop C: AK Gold filigree overlay zoom
    gbox = (int(0.30 * MAP_W), int(0.52 * MAP_H), int(0.70 * MAP_W), int(0.92 * MAP_H))
    tile_c = Image.fromarray(overlay_u8[gbox[1]:gbox[3], gbox[0]:gbox[2]]).resize(
        (sw, sh), Image.Resampling.LANCZOS
    )
    dc = ImageDraw.Draw(tile_c)
    dc.rectangle([0, 0, sw, 24], fill=(16, 18, 22))
    dc.text((8, 4), "GOLD FILIGREE MASK ZOOM", fill=(255, 210, 50), font=f_small)
    p6_img.paste(tile_c, (0, sh))

    # Crop D: Screens (laptop + tablet) overlay zoom
    sbox = (int(0.72 * MAP_W), int(0.64 * MAP_H), MAP_W, int(0.96 * MAP_H))
    tile_d = Image.fromarray(overlay_u8[sbox[1]:sbox[3], sbox[0]:sbox[2]]).resize(
        (sw, sh), Image.Resampling.LANCZOS
    )
    dd = ImageDraw.Draw(tile_d)
    dd.rectangle([0, 0, sw, 24], fill=(16, 18, 22))
    dd.text((8, 4), "SCREENS (A) MASK ZOOM", fill=(235, 95, 255), font=f_small)
    p6_img.paste(tile_d, (sw, sh))

    p6 = _label_bar(p6_img, "6. DETAIL & ALIGNMENT ZOOMS", "Upscale, Silhouettes, Gold, Screens")

    # Assemble 3x2 grid
    panel_w, panel_h = p1.size
    header_h = 56
    total_w = 3 * panel_w + 4 * pad
    total_h = header_h + 2 * panel_h + 3 * pad
    sheet = Image.new("RGB", (total_w, total_h), (10, 11, 14))
    sdraw = ImageDraw.Draw(sheet)
    sdraw.text(
        (pad, 14),
        "CINEMATIC ASSET PIPELINE QC  |  painting-reference.jpg (1600x900) -> 4K/2K Plates + Depth + Normals + FX RGBA",
        fill=(245, 246, 250),
        font=_load_font(22),
    )

    panels = [p1, p2, p3, p4, p5, p6]
    for i, panel in enumerate(panels):
        col = i % 3
        row = i // 3
        x = pad + col * (panel_w + pad)
        y = header_h + pad + row * (panel_h + pad)
        sheet.paste(panel, (x, y))

    sheet.save(out_path, format="JPEG", quality=92, subsampling=0, optimize=True)
    print(f"[Preview] Saved {out_path} ({sheet.size[0]}x{sheet.size[1]})")


# ---------------------------------------------------------------------------
# Main Pipeline
# ---------------------------------------------------------------------------
def main() -> None:
    t_start = time.perf_counter()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Running cinematic pipeline on {device} ...")

    orig_pil = Image.open(INPUT_PATH).convert("RGB")
    orig_rgb = np.array(orig_pil)
    print(f"Loaded reference: {INPUT_PATH} ({orig_rgb.shape[1]}x{orig_rgb.shape[0]})")

    # 1. Real-ESRGAN x4plus 4x upscale -> save 4K and 2K plates
    upscaled_4x = upscale_realesrgan_4x(orig_rgb, device=device)
    upscaled_pil = Image.fromarray(upscaled_4x)

    plate_4k_pil = upscaled_pil.resize((3840, 2160), Image.Resampling.LANCZOS)
    plate_2k_pil = upscaled_pil.resize((2560, 1440), Image.Resampling.LANCZOS)

    path_4k = OUTPUT_DIR / "painting-4k.jpg"
    path_2k = OUTPUT_DIR / "painting-2k.jpg"
    plate_4k_pil.save(
        path_4k, format="JPEG", quality=92, subsampling=0, optimize=True, progressive=True
    )
    plate_2k_pil.save(
        path_2k, format="JPEG", quality=90, subsampling=0, optimize=True, progressive=True
    )
    print(
        f"[Plates] Saved {path_4k.name} ({path_4k.stat().st_size / 1024:.0f} KB), "
        f"{path_2k.name} ({path_2k.stat().st_size / 1024:.0f} KB)"
    )

    plate_4k_rgb = np.array(plate_4k_pil)
    guide_rgb_map = np.array(
        upscaled_pil.resize((MAP_W, MAP_H), Image.Resampling.LANCZOS)
    )
    del upscaled_pil

    # 2. Dual-resolution Depth-Anything-V2-Large + fusion + guided filter + FG dilation
    depth_final, depth_guided, _, _ = build_depth_maps(
        upscaled_4x, guide_rgb_map, device=device
    )
    del upscaled_4x
    gc.collect()

    depth_u8 = np.clip(np.round(depth_final * 255.0), 0, 255).astype(np.uint8)
    path_depth = OUTPUT_DIR / "depth.png"
    Image.fromarray(depth_u8, mode="L").save(path_depth, format="PNG", optimize=True)
    print(f"[Depth] Saved {path_depth.name} ({path_depth.stat().st_size / 1024:.0f} KB)")

    # 3. Normal map computed from depth
    normals_u8 = compute_normals_from_depth(depth_guided, depth_final)
    path_normals = OUTPUT_DIR / "normals.png"
    Image.fromarray(normals_u8, mode="RGB").save(path_normals, format="PNG", optimize=True)
    print(
        f"[Normals] Saved {path_normals.name} ({path_normals.stat().st_size / 1024:.0f} KB)"
    )

    # 4. FX mask (R=neon/practical, G=gold metal, B=window/skyline, A=screens)
    fx_rgba, _ = build_fx_masks(guide_rgb_map, depth_guided)
    path_fx = OUTPUT_DIR / "fx.png"
    Image.fromarray(fx_rgba, mode="RGBA").save(path_fx, format="PNG", optimize=True)
    print(f"[FX] Saved {path_fx.name} ({path_fx.stat().st_size / 1024:.0f} KB)")

    # 5. Side-by-side preview
    path_preview = OUTPUT_DIR / "preview.jpg"
    build_preview(orig_rgb, plate_4k_rgb, depth_u8, normals_u8, fx_rgba, path_preview)

    print(f"Done in {time.perf_counter() - t_start:.1f}s.")


if __name__ == "__main__":
    main()
