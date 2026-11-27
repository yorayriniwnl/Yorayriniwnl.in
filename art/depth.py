"""Monocular depth for the painting: MiDaS small (ONNX), global pass plus
overlapping tiles fused onto the global scale, then an edge-aware guided
filter against the painting so depth edges follow the drawn silhouettes.

    python depth.py model.onnx painting.png out.png
"""
import sys

import cv2
import numpy as np
import onnxruntime as ort

model, src, out = sys.argv[1:4]
sess = ort.InferenceSession(model)
iname = sess.get_inputs()[0].name
img = cv2.cvtColor(cv2.imread(src), cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
H, W = img.shape[:2]
MEAN = np.array([0.485, 0.456, 0.406], np.float32)
STD = np.array([0.229, 0.224, 0.225], np.float32)


def run(crop):
    h, w = crop.shape[:2]
    x = cv2.resize(crop, (256, 256), interpolation=cv2.INTER_AREA)
    # this ONNX export expects plain RGB in 0..1 (normalization is baked in)
    x = x.transpose(2, 0, 1)[None].astype(np.float32)
    d = sess.run(None, {iname: x})[0][0]
    return cv2.resize(d, (w, h), interpolation=cv2.INTER_CUBIC)


# global pass, padded to a square so the aspect is not squashed
side = max(H, W)
pad = np.zeros((side, side, 3), np.float32)
pad[:H, :W] = img
pad[H:, :W] = img[H - 1 :H][:, :]  # repeat bottom row
g = run(pad)[:H, :W]
g = (g - g.min()) / (g.max() - g.min())

# tiles
acc = np.zeros((H, W), np.float64)
wsum = np.zeros((H, W), np.float64)
T, step = 420, 210
ys = list(range(0, max(1, H - T) + 1, step)) + [H - T]
xs = list(range(0, max(1, W - T) + 1, step)) + [W - T]
win = np.outer(np.hanning(T) + 1e-3, np.hanning(T) + 1e-3)
for y in sorted(set(ys)):
    for x in sorted(set(xs)):
        t = run(img[y : y + T, x : x + T])
        ref = g[y : y + T, x : x + T]
        A = np.stack([t.ravel(), np.ones(t.size)], 1)
        a, b = np.linalg.lstsq(A, ref.ravel(), rcond=None)[0]
        acc[y : y + T, x : x + T] += (a * t + b) * win
        wsum[y : y + T, x : x + T] += win
tiled = acc / np.maximum(wsum, 1e-6)
d = 0.55 * tiled + 0.45 * g


def guided(I, p, r, eps):
    k = (2 * r + 1, 2 * r + 1)
    mI = cv2.boxFilter(I, -1, k)
    mp = cv2.boxFilter(p, -1, k)
    cov = cv2.boxFilter(I * p, -1, k) - mI * mp
    var = cv2.boxFilter(I * I, -1, k) - mI * mI
    a = cov / (var + eps)
    b = mp - a * mI
    return cv2.boxFilter(a, -1, k) * I + cv2.boxFilter(b, -1, k)


gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY).astype(np.float32)
d = d.astype(np.float32)
d = guided(gray, d, 6, 1e-3)
d = cv2.bilateralFilter(d, 7, 0.05, 5)
lo, hi = np.percentile(d, [0.5, 99.5])
d = np.clip((d - lo) / (hi - lo), 0, 1)
cv2.imwrite(out, (d * 65535).astype(np.uint16))
cv2.imwrite(out.replace(".png", "-preview.png"), (d * 255).astype(np.uint8))
print("depth", d.shape, float(d.mean()))
