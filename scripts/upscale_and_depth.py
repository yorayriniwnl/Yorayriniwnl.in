"""Neural 4x artwork upscaling and high-resolution multi-scale depth estimation.

Pipeline:
1. Tiled 4x super-resolution with mirror-padded context and raised-cosine overlap
   blending via Spandrel (supports 4x-UltraSharp, RealESRGAN_x4plus, SwinIR, HAT, etc.).
2. Multi-scale monocular depth estimation using Depth Anything V2 Large:
   - Global pass with horizontal-flip test-time augmentation (TTA)
   - Overlapping 2x2 + center focal-zone high-res tiles aligned to global depth via
     trimmed least squares
   - Multi-band frequency fusion (global low-freq + tiled high-freq)
   - Edge-weighted guided filtering against the upscaled RGB image (crisp silhouettes
     without flat-surface RGB texture leakage)
3. Exports native 4x PNG, 4K PNG & 4:4:4 JPEG, 16-bit & 8-bit 4K depth maps,
   Inferno depth visualization, and a smooth tangent-space 4K normal map.
"""

from __future__ import annotations

import argparse
import math
import os
import time
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
import torch
import torch.nn.functional as F


def get_device(preferred: str = "auto") -> torch.device:
    if preferred == "cuda" or (preferred == "auto" and torch.cuda.is_available()):
        return torch.device("cuda")
    return torch.device("cpu")


def make_1d_ramp(length: int, fade_start: int, fade_end: int) -> np.ndarray:
    w = np.ones(length, dtype=np.float32)
    if fade_start > 0:
        n = min(fade_start, length)
        t = np.linspace(0.0, 1.0, n, dtype=np.float32)
        w[:n] = np.minimum(w[:n], 0.5 - 0.5 * np.cos(math.pi * t))
    if fade_end > 0:
        n = min(fade_end, length)
        t = np.linspace(1.0, 0.0, n, dtype=np.float32)
        w[length - n :] = np.minimum(w[length - n :], 0.5 - 0.5 * np.cos(math.pi * t))
    return np.maximum(w, 1e-4)


def compute_tile_starts(total: int, tile: int, overlap: int) -> list[int]:
    if total <= tile:
        return [0]
    step = tile - overlap
    starts = list(range(0, total - tile + 1, step))
    if starts[-1] + tile < total:
        starts.append(total - tile)
    return starts


def load_sr_model(model_path: Path, device: torch.device):
    import spandrel

    descriptor = spandrel.ModelLoader(device=device).load_from_file(str(model_path))
    model = descriptor.model
    model.eval()
    use_half = device.type == "cuda" and getattr(descriptor, "supports_half", False)
    if use_half:
        model = model.half()
    return descriptor, model, use_half


@torch.inference_mode()
def upscale_tiled(
    img_rgb: np.ndarray,
    model_path: Path,
    device: torch.device,
    tile_size: int = 256,
    overlap: int = 32,
    margin: int = 24,
) -> np.ndarray:
    t0 = time.perf_counter()
    descriptor, model, use_half = load_sr_model(model_path, device)
    scale = int(getattr(descriptor, "scale", 4))
    h, w, _ = img_rgb.shape
    out_h, out_w = h * scale, w * scale

    tensor = torch.from_numpy(img_rgb.astype(np.float32) / 255.0).permute(2, 0, 1).unsqueeze(0)
    # Mirror pad once so every tile gets clean reflection context
    pad_t = min(margin, h - 1)
    pad_l = min(margin, w - 1)
    padded = F.pad(tensor, (pad_l, pad_l, pad_t, pad_t), mode="reflect")

    xs = compute_tile_starts(w, tile_size, overlap)
    ys = compute_tile_starts(h, tile_size, overlap)
    total_tiles = len(xs) * len(ys)
    print(
        f"[SR] Model={model_path.name} scale={scale}x arch={descriptor.architecture.name} "
        f"device={device} fp16={use_half} tiles={len(xs)}x{len(ys)} ({total_tiles})",
        flush=True,
    )

    accum = np.zeros((out_h, out_w, 3), dtype=np.float32)
    weights = np.zeros((out_h, out_w, 1), dtype=np.float32)

    idx = 0
    for y0 in ys:
        y1 = min(y0 + tile_size, h)
        for x0 in xs:
            x1 = min(x0 + tile_size, w)
            idx += 1
            patch = padded[:, :, y0 : y1 + 2 * pad_t, x0 : x1 + 2 * pad_l].to(device)
            if use_half:
                patch = patch.half()
            pred = model(patch).float().cpu()
            # Crop off context margin
            oy0 = pad_t * scale
            ox0 = pad_l * scale
            th = (y1 - y0) * scale
            tw = (x1 - x0) * scale
            pred = pred[0, :, oy0 : oy0 + th, ox0 : ox0 + tw].permute(1, 2, 0).numpy()
            pred = np.clip(pred, 0.0, 1.0)

            fade_l = overlap * scale if x0 > 0 else 0
            fade_r = overlap * scale if x1 < w else 0
            fade_t = overlap * scale if y0 > 0 else 0
            fade_b = overlap * scale if y1 < h else 0
            wx = make_1d_ramp(tw, fade_l, fade_r)[None, :, None]
            wy = make_1d_ramp(th, fade_t, fade_b)[:, None, None]
            w2d = wy * wx

            accum[y0 * scale : y1 * scale, x0 * scale : x1 * scale] += pred * w2d
            weights[y0 * scale : y1 * scale, x0 * scale : x1 * scale] += w2d
            if idx % 3 == 0 or idx == total_tiles:
                print(
                    f"  [SR] Tile {idx}/{total_tiles} done ({time.perf_counter() - t0:.1f}s)",
                    flush=True,
                )

    out = np.clip(accum / np.maximum(weights, 1e-6), 0.0, 1.0)
    out_u8 = np.round(out * 255.0).astype(np.uint8)
    print(f"[SR] Finished {w}x{h} -> {out_w}x{out_h} in {time.perf_counter() - t0:.1f}s", flush=True)
    return out_u8


def load_depth_model(model_id: str, device: torch.device):
    from transformers import AutoImageProcessor, AutoModelForDepthEstimation

    try:
        processor = AutoImageProcessor.from_pretrained(model_id, local_files_only=True)
        model = AutoModelForDepthEstimation.from_pretrained(model_id, local_files_only=True)
        print(f"[Depth] Loaded {model_id} from local HF cache", flush=True)
    except Exception:
        print(f"[Depth] Downloading {model_id} from Hugging Face...", flush=True)
        processor = AutoImageProcessor.from_pretrained(model_id)
        model = AutoModelForDepthEstimation.from_pretrained(model_id)

    model.to(device).eval()
    return processor, model


@torch.inference_mode()
def predict_single_depth(
    pil_img: Image.Image,
    processor,
    model,
    device: torch.device,
    flip_tta: bool = True,
) -> np.ndarray:
    def _run(im: Image.Image) -> np.ndarray:
        inputs = processor(images=im, return_tensors="pt")
        inputs = {k: v.to(device) for k, v in inputs.items()}
        if device.type == "cuda":
            with torch.autocast(device_type="cuda", dtype=torch.float16):
                depth = model(**inputs).predicted_depth
        else:
            depth = model(**inputs).predicted_depth
        depth = F.interpolate(
            depth.unsqueeze(1).float(),
            size=(im.height, im.width),
            mode="bicubic",
            align_corners=False,
        )[0, 0]
        return depth.cpu().numpy()

    d = _run(pil_img)
    if flip_tta:
        d_flip = _run(pil_img.transpose(Image.FLIP_LEFT_RIGHT))
        d = 0.5 * (d + d_flip[:, ::-1])
    return d.astype(np.float32)


def robust_align_tile(tile_depth: np.ndarray, ref_depth: np.ndarray) -> tuple[float, float, float]:
    """Fit a * tile_depth + b ~= ref_depth via trimmed least squares. Returns (a, b, pearson_r)."""
    x = tile_depth.reshape(-1).astype(np.float64)
    y = ref_depth.reshape(-1).astype(np.float64)
    # Subsample for speed on 4K crops
    stride = max(1, len(x) // 65536)
    x = x[::stride]
    y = y[::stride]

    mask = np.isfinite(x) & np.isfinite(y)
    a, b = 1.0, 0.0
    for _ in range(3):
        xm, ym = x[mask], y[mask]
        x_mean = xm.mean()
        y_mean = ym.mean()
        dx = xm - x_mean
        denom = float(np.dot(dx, dx))
        if denom < 1e-12:
            return 0.0, float(y_mean), 0.0
        a = float(np.dot(dx, ym - y_mean) / denom)
        a = max(a, 1e-5)
        b = float(y_mean - a * x_mean)
        resid = np.abs((a * x + b) - y)
        thresh = np.percentile(resid[mask], 92)
        mask = np.isfinite(x) & np.isfinite(y) & (resid <= max(thresh, 1e-7))

    xm, ym = x[mask], y[mask]
    denom_r = float(np.std(xm) * np.std(ym))
    r = float(np.mean((xm - xm.mean()) * (ym - ym.mean())) / denom_r) if denom_r > 1e-12 else 0.0
    return a, b, r


def guided_filter_gray(guide: np.ndarray, src: np.ndarray, radius: int, eps: float) -> np.ndarray:
    k = 2 * radius + 1
    mean_i = cv2.boxFilter(guide, cv2.CV_32F, (k, k))
    mean_p = cv2.boxFilter(src, cv2.CV_32F, (k, k))
    corr_ip = cv2.boxFilter(guide * src, cv2.CV_32F, (k, k))
    var_i = cv2.boxFilter(guide * guide, cv2.CV_32F, (k, k)) - mean_i * mean_i
    cov_ip = corr_ip - mean_i * mean_p
    a = cov_ip / (var_i + eps)
    b = mean_p - a * mean_i
    mean_a = cv2.boxFilter(a, cv2.CV_32F, (k, k))
    mean_b = cv2.boxFilter(b, cv2.CV_32F, (k, k))
    return mean_a * guide + mean_b


def generate_depth_multiscale(
    img_4k_rgb: np.ndarray,
    model_id: str,
    device: torch.device,
    tile_tta: bool = False,
) -> np.ndarray:
    t0 = time.perf_counter()
    processor, model = load_depth_model(model_id, device)
    h, w, _ = img_4k_rgb.shape
    pil_full = Image.fromarray(img_4k_rgb)

    print(f"[Depth] Running global Flip-TTA pass on {w}x{h}...", flush=True)
    d_global = predict_single_depth(pil_full, processor, model, device, flip_tta=True)
    print(f"  [Depth] Global pass done ({time.perf_counter() - t0:.1f}s)", flush=True)

    # Normalize working scale so alignment & gradients are well-conditioned
    g_lo, g_hi = np.percentile(d_global, [0.1, 99.9])
    d_global = np.clip((d_global - g_lo) / max(g_hi - g_lo, 1e-6), 0.0, 1.0)

    # 2x2 overlapping quadrants + hero center crop for fine detail resolution
    crop_specs = [
        ("TL", 0.00, 0.00, 0.60, 0.60),
        ("TR", 0.40, 0.00, 1.00, 0.60),
        ("BL", 0.00, 0.40, 0.60, 1.00),
        ("BR", 0.40, 0.40, 1.00, 1.00),
        ("CENTER", 0.18, 0.12, 0.82, 0.88),
    ]

    tile_accum = np.zeros((h, w), dtype=np.float32)
    tile_weight = np.zeros((h, w), dtype=np.float32)

    for name, fx0, fy0, fx1, fy1 in crop_specs:
        x0, x1 = int(round(fx0 * w)), int(round(fx1 * w))
        y0, y1 = int(round(fy0 * h)), int(round(fy1 * h))
        crop_pil = pil_full.crop((x0, y0, x1, y1))
        d_tile_raw = predict_single_depth(crop_pil, processor, model, device, flip_tta=tile_tta)
        t_lo, t_hi = np.percentile(d_tile_raw, [0.1, 99.9])
        d_tile = np.clip((d_tile_raw - t_lo) / max(t_hi - t_lo, 1e-6), 0.0, 1.0).astype(np.float32)
        a, b, r = robust_align_tile(d_tile, d_global[y0:y1, x0:x1])
        d_aligned = np.clip(a * d_tile + b, 0.0, 1.0).astype(np.float32)

        ch, cw = y1 - y0, x1 - x0
        fade_x = int(cw * 0.22)
        fade_y = int(ch * 0.22)
        wx = make_1d_ramp(cw, fade_x if x0 > 0 else 0, fade_x if x1 < w else 0)[None, :]
        wy = make_1d_ramp(ch, fade_y if y0 > 0 else 0, fade_y if y1 < h else 0)[:, None]
        w2d = wy * wx
        if name == "CENTER":
            w2d *= 1.15

        tile_accum[y0:y1, x0:x1] += d_aligned * w2d
        tile_weight[y0:y1, x0:x1] += w2d
        print(
            f"  [Depth] Tile {name} ({cw}x{ch}) aligned a={a:.4f} b={b:.4f} r={r:.4f} "
            f"({time.perf_counter() - t0:.1f}s)",
            flush=True,
        )

    d_tiles = tile_accum / np.maximum(tile_weight, 1e-6)

    # Multi-band frequency fusion: lock low frequencies to global pass, take crisp detail from tiles
    small_w, small_h = max(64, w // 4), max(64, h // 4)
    sigma_small = max(small_w, small_h) * 0.025
    d_global_low = cv2.resize(
        cv2.GaussianBlur(cv2.resize(d_global, (small_w, small_h), interpolation=cv2.INTER_AREA), (0, 0), sigma_small),
        (w, h),
        interpolation=cv2.INTER_CUBIC,
    )
    d_tiles_low = cv2.resize(
        cv2.GaussianBlur(cv2.resize(d_tiles, (small_w, small_h), interpolation=cv2.INTER_AREA), (0, 0), sigma_small),
        (w, h),
        interpolation=cv2.INTER_CUBIC,
    )
    d_fused = d_global_low + 0.78 * (d_tiles - d_tiles_low) + 0.22 * (d_global - d_global_low)
    d_fused = np.clip(d_fused, 0.0, 1.0).astype(np.float32)

    # Edge-weighted guided filtering: snaps depth boundaries to RGB silhouettes with zero flat-surface bleed
    guide = cv2.cvtColor(img_4k_rgb, cv2.COLOR_RGB2GRAY).astype(np.float32) / 255.0
    radius = max(3, int(round(w / 640.0)))  # ~6px at 3840px
    d_guided = guided_filter_gray(guide, d_fused, radius=radius, eps=8e-4)

    gx = cv2.Sobel(d_fused, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(d_fused, cv2.CV_32F, 0, 1, ksize=3)
    grad = np.sqrt(gx * gx + gy * gy)
    grad_blur = cv2.GaussianBlur(grad, (0, 0), max(2.0, radius * 0.9))
    g_scale = float(np.percentile(grad_blur, 97)) + 1e-6
    edge_mask = np.clip(grad_blur / g_scale, 0.0, 1.0)
    edge_mask = edge_mask * edge_mask * (3.0 - 2.0 * edge_mask)  # smoothstep
    edge_mask = (0.72 * edge_mask).astype(np.float32)

    d_final = (1.0 - edge_mask) * d_fused + edge_mask * d_guided

    # Clean final [0, 1] normalization (near = 1.0 white, far = 0.0 black)
    lo, hi = np.percentile(d_final, [0.05, 99.95])
    d_final = np.clip((d_final - lo) / max(hi - lo, 1e-6), 0.0, 1.0).astype(np.float32)

    # Sanity log: bottom foreground should be closer than top background
    bottom_mean = float(d_final[int(h * 0.85) :, :].mean())
    top_mean = float(d_final[: int(h * 0.20), :].mean())
    print(
        f"[Depth] Complete in {time.perf_counter() - t0:.1f}s | "
        f"top_mean={top_mean:.3f} bottom_mean={bottom_mean:.3f}",
        flush=True,
    )
    return d_final


def depth_to_normals(depth01: np.ndarray, strength: float | None = None) -> np.ndarray:
    """Compute clean tangent-space OpenGL normal map (+X right, +Y up, +Z out) from float32 depth."""
    h, w = depth01.shape
    scale_factor = w / 1024.0
    if strength is None:
        strength = 36.0 * scale_factor
    sigma = max(1.5, 1.1 * scale_factor)
    smooth = cv2.GaussianBlur(depth01, (0, 0), sigma)
    gx = cv2.Scharr(smooth, cv2.CV_32F, 1, 0) / 32.0
    gy = cv2.Scharr(smooth, cv2.CV_32F, 0, 1) / 32.0
    nx = -gx * strength
    ny = gy * strength
    nz = np.ones_like(smooth, dtype=np.float32)
    norm = np.sqrt(nx * nx + ny * ny + nz * nz) + 1e-8
    nx /= norm
    ny /= norm
    nz /= norm
    rgb = np.stack([nx * 0.5 + 0.5, ny * 0.5 + 0.5, nz * 0.5 + 0.5], axis=-1)
    return np.round(np.clip(rgb, 0.0, 1.0) * 255.0).astype(np.uint8)


def save_outputs(
    art_4x_rgb: np.ndarray | None,
    depth01: np.ndarray,
    output_dir: Path,
    target_4k_width: int = 3840,
) -> dict[str, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    dh, dw = depth01.shape
    paths: dict[str, Path] = {}

    if art_4x_rgb is not None:
        h4x, w4x, _ = art_4x_rgb.shape
        target_4k_height = int(round(target_4k_width * (h4x / w4x)))

        # 1. Native 4x lossless PNG
        p_4x = output_dir / "art-4x.png"
        Image.fromarray(art_4x_rgb).save(p_4x, format="PNG", compress_level=6)
        paths["art_4x_png"] = p_4x

        # 2. 4K UHD (3840x2160) lossless PNG + 4:4:4 Q95 JPEG
        art_4k_pil = Image.fromarray(art_4x_rgb).resize(
            (target_4k_width, target_4k_height), Image.Resampling.LANCZOS
        )
        p_4k_png = output_dir / "art-4k.png"
        art_4k_pil.save(p_4k_png, format="PNG", compress_level=6)
        paths["art_4k_png"] = p_4k_png

        p_4k_jpg = output_dir / "art-4k.jpg"
        art_4k_pil.save(p_4k_jpg, format="JPEG", quality=95, subsampling=0, optimize=True)
        paths["art_4k_jpg"] = p_4k_jpg

    # 3. 16-bit lossless 4K depth PNG (65536 levels, zero banding)
    depth_u16 = np.round(depth01 * 65535.0).astype(np.uint16)
    p_depth16 = output_dir / "depth-4k-16bit.png"
    cv2.imwrite(str(p_depth16), depth_u16)
    paths["depth_16bit"] = p_depth16

    # 4. 8-bit grayscale 4K depth PNG
    depth_u8 = np.round(depth01 * 255.0).astype(np.uint8)
    p_depth8 = output_dir / "depth-4k.png"
    Image.fromarray(depth_u8, mode="L").save(p_depth8, format="PNG", compress_level=6)
    paths["depth_8bit"] = p_depth8

    # 5. Colorized Inferno depth preview (1920x1080)
    prev_w = 1920
    prev_h = int(round(prev_w * (dh / dw)))
    depth_prev_u8 = cv2.resize(depth_u8, (prev_w, prev_h), interpolation=cv2.INTER_AREA)
    depth_color_bgr = cv2.applyColorMap(depth_prev_u8, cv2.COLORMAP_INFERNO)
    depth_color_rgb = cv2.cvtColor(depth_color_bgr, cv2.COLOR_BGR2RGB)
    p_preview = output_dir / "depth-preview.png"
    Image.fromarray(depth_color_rgb).save(p_preview, format="PNG", compress_level=6)
    paths["depth_preview"] = p_preview

    # 6. Clean tangent-space 4K normal map
    normals_rgb = depth_to_normals(depth01)
    p_normals = output_dir / "normals-4k.png"
    Image.fromarray(normals_rgb).save(p_normals, format="PNG", compress_level=6)
    paths["normals_4k"] = p_normals

    return paths


def main() -> None:
    parser = argparse.ArgumentParser(description="Upscale artwork 4x and generate high-res depth map.")
    parser.add_argument("--input", type=Path, help="Input artwork image path")
    parser.add_argument("--reuse-4k", type=Path, help="Existing upscaled 4K image (skip SR step)")
    parser.add_argument("--output-dir", type=Path, required=True, help="Directory for output files")
    parser.add_argument("--sr-model", type=Path, help="Path to 4x SR model (.pth/.safetensors)")
    parser.add_argument(
        "--depth-model",
        type=str,
        default="depth-anything/Depth-Anything-V2-Large-hf",
        help="Hugging Face depth model ID or local path",
    )
    parser.add_argument("--device", type=str, default="auto", choices=["auto", "cuda", "cpu"])
    parser.add_argument("--tile-size", type=int, default=256)
    parser.add_argument("--overlap", type=int, default=32)
    parser.add_argument("--margin", type=int, default=24)
    parser.add_argument("--target-4k-width", type=int, default=3840)
    parser.add_argument("--tile-tta", action="store_true", help="Enable flip TTA on depth tiles")
    args = parser.parse_args()

    device = get_device(args.device)

    art_4x_rgb: np.ndarray | None = None
    if args.reuse_4k is not None:
        print(f"[Init] Device={device} Reusing 4K={args.reuse_4k}", flush=True)
        art_4k_rgb = np.array(Image.open(args.reuse_4k).convert("RGB"))
    else:
        if args.input is None or args.sr_model is None:
            parser.error("--input and --sr-model are required unless --reuse-4k is provided")
        print(f"[Init] Device={device} Input={args.input}", flush=True)
        img_pil = Image.open(args.input).convert("RGB")
        img_rgb = np.array(img_pil)
        print(f"[Init] Input size: {img_pil.width}x{img_pil.height}", flush=True)

        art_4x_rgb = upscale_tiled(
            img_rgb,
            model_path=args.sr_model,
            device=device,
            tile_size=args.tile_size,
            overlap=args.overlap,
            margin=args.margin,
        )

        h4x, w4x, _ = art_4x_rgb.shape
        target_4k_height = int(round(args.target_4k_width * (h4x / w4x)))
        art_4k_rgb = np.array(
            Image.fromarray(art_4x_rgb).resize(
                (args.target_4k_width, target_4k_height), Image.Resampling.LANCZOS
            )
        )

    depth01 = generate_depth_multiscale(
        art_4k_rgb,
        model_id=args.depth_model,
        device=device,
        tile_tta=args.tile_tta,
    )

    paths = save_outputs(
        art_4x_rgb=art_4x_rgb,
        depth01=depth01,
        output_dir=args.output_dir,
        target_4k_width=args.target_4k_width,
    )

    print("[Done] Generated outputs:", flush=True)
    for k, p in paths.items():
        size_kb = os.path.getsize(p) / 1024.0
        print(f"  {k}: {p} ({size_kb:.1f} KB)", flush=True)


if __name__ == "__main__":
    main()
