"""Procedural texture generators (numpy) used by the asset builds.

All textures are tileable and generated deterministically, so the GLBs are
reproducible without external image sources.
"""
from __future__ import annotations

import math

import numpy as np


def _grid(n):
    y, x = np.mgrid[0:n, 0:n].astype(np.float32) / n
    return x, y


def _blur(a, r=1):
    out = a.copy()
    for _ in range(r):
        out = (out + np.roll(out, 1, 0) + np.roll(out, -1, 0) + np.roll(out, 1, 1) + np.roll(out, -1, 1)) / 5
    return out


def tile_noise(n, freq=8, seed=0, octaves=4):
    """Tileable fbm in [0,1]."""
    rng = np.random.default_rng(seed)
    acc = np.zeros((n, n), np.float32)
    amp, total = 1.0, 0.0
    for o in range(octaves):
        f = freq * 2 ** o
        g = rng.uniform(0, 1, (f, f)).astype(np.float32)
        # bicubic-ish upsample with wrap
        x = np.linspace(0, f, n, endpoint=False)
        i0 = np.floor(x).astype(int)
        t = x - i0
        t = t * t * (3 - 2 * t)
        i1 = (i0 + 1) % f
        rows = g[i0][:, i0] * (1 - t)[None, :] + g[i0][:, i1] * t[None, :]
        rows1 = g[i1][:, i0] * (1 - t)[None, :] + g[i1][:, i1] * t[None, :]
        layer = rows * (1 - t)[:, None] + rows1 * t[:, None]
        acc += layer * amp
        total += amp
        amp *= 0.5
    return acc / total


def height_to_normal(h, strength=2.0):
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * strength
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * strength
    nz = np.ones_like(h)
    n = np.stack([-dx, dy, nz], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    rgba = np.concatenate([n * 0.5 + 0.5, np.ones_like(h)[..., None]], -1)
    return rgba


def stamp_line(canvas, pts, width, value=1.0):
    """Rasterise an anti-aliased polyline (pixel coords, wraps) into canvas (max)."""
    n = canvas.shape[0]
    r = int(math.ceil(width + 2))
    for i in range(len(pts) - 1):
        (x0, y0), (x1, y1) = pts[i], pts[i + 1]
        seg = max(1, int(math.hypot(x1 - x0, y1 - y0) / max(0.6, width * 0.5)))
        for s in range(seg + 1):
            x = x0 + (x1 - x0) * s / seg
            y = y0 + (y1 - y0) * s / seg
            w = width if not callable(width) else width
            xi, yi = int(x), int(y)
            ys = np.arange(yi - r, yi + r + 1)
            xs = np.arange(xi - r, xi + r + 1)
            dy = (ys[:, None] - y)
            dx = (xs[None, :] - x)
            d = np.sqrt(dx * dx + dy * dy)
            a = np.clip(w - d + 0.5, 0, 1) * value
            sub = canvas[np.ix_(ys % n, xs % n)]
            canvas[np.ix_(ys % n, xs % n)] = np.maximum(sub, a)


def scrollwork(n=512, seed=3, count=26, line=1.0):
    """Gold filigree mask: interlocking acanthus-like spirals. Returns 0..1 mask."""
    rng = np.random.default_rng(seed)
    m = np.zeros((n, n), np.float32)
    for _ in range(count):
        cx, cy = rng.uniform(0, n, 2)
        size = rng.uniform(0.05, 0.12) * n
        turns = rng.uniform(1.4, 2.4)
        direction = rng.choice([-1, 1])
        a0 = rng.uniform(0, math.tau)
        pts = []
        steps = 120
        for s in range(steps):
            t = s / (steps - 1)
            ang = a0 + direction * t * turns * math.tau
            rad = size * (1 - t) ** 1.25 + 1.5
            pts.append((cx + math.cos(ang) * rad, cy + math.sin(ang) * rad))
        for i in range(0, steps - 10, 10):
            stamp_line(m, pts[i:i + 11], (2.4 * (1 - i / steps) + 0.9) * line)
        # sweeping stem with leaves leaving the spiral
        ang = a0 + rng.uniform(-0.5, 0.5)
        x, y = pts[0]
        stem = [(x, y)]
        for s in range(30):
            ang += direction * 0.05 + rng.normal(0, 0.03)
            x += math.cos(ang) * size * 0.06
            y += math.sin(ang) * size * 0.06
            stem.append((x, y))
            if s % 8 == 4:
                la = ang + direction * 1.2
                leaf = [(x, y)]
                for k in range(8):
                    la -= direction * 0.18
                    leaf.append((leaf[-1][0] + math.cos(la) * size * 0.05, leaf[-1][1] + math.sin(la) * size * 0.05))
                stamp_line(m, leaf, 1.6 * line)
        stamp_line(m, stem, 1.8 * line)
    return np.clip(m, 0, 1)


def damask(n=512, seed=5):
    """Ornamental red damask motif for the jacket print. 0..1 mask."""
    x, y = _grid(n)
    m = np.zeros((n, n), np.float32)
    # two offset rows of medallions
    for ox, oy in ((0.25, 0.25), (0.75, 0.75)):
        dx = ((x - ox + 0.5) % 1) - 0.5
        dy = ((y - oy + 0.5) % 1) - 0.5
        r = np.sqrt((dx * 1.25) ** 2 + dy ** 2)
        a = np.arctan2(dy, dx)
        petals = 0.5 + 0.5 * np.cos(a * 6)
        shape = np.clip(1 - np.abs(r - (0.12 + 0.05 * petals)) / 0.012, 0, 1)
        core = np.clip(1 - np.abs(r - 0.05) / 0.01, 0, 1)
        flame = np.clip(1 - np.abs(np.abs(dx) * 3.2 - (0.22 - dy) ** 2 * 3) / 0.03, 0, 1) * (np.abs(dy) < 0.22)
        m = np.maximum(m, np.maximum(shape, np.maximum(core, flame * 0.9)))
    swirl = scrollwork(n, seed, 10) * 0.55
    m = np.maximum(m, swirl)
    return _blur(m, 1)


def fabric_weave(n=256, seed=1):
    """Ripstop weave height map 0..1."""
    x, y = _grid(n)
    k = 64
    wx = 0.5 + 0.5 * np.sin(x * math.tau * k)
    wy = 0.5 + 0.5 * np.sin(y * math.tau * k)
    weave = np.where(((np.floor(x * k) + np.floor(y * k)) % 2) == 0, wx, wy)
    grid = np.maximum(np.clip(1 - np.abs(((x * 8) % 1) - 0.5) * 60, 0, 1), np.clip(1 - np.abs(((y * 8) % 1) - 0.5) * 60, 0, 1))
    h = weave * 0.6 + grid * 0.35 + tile_noise(n, 8, seed) * 0.25
    return h / h.max()


def leather_grain(n=256, seed=2):
    """Pebbled leather height 0..1 (cellular)."""
    rng = np.random.default_rng(seed)
    pts = rng.uniform(0, 1, (220, 2))
    x, y = _grid(n)
    d = np.full((n, n), 9.0, np.float32)
    for px, py in pts:
        dx = np.abs(x - px)
        dx = np.minimum(dx, 1 - dx)
        dy = np.abs(y - py)
        dy = np.minimum(dy, 1 - dy)
        d = np.minimum(d, np.sqrt(dx * dx + dy * dy))
    h = np.clip(d * 18, 0, 1)
    return 1 - (1 - h) ** 2


def fur_strands(n=256, seed=7):
    """Directional fur clump height for the husky (strands along v)."""
    rng = np.random.default_rng(seed)
    h = np.zeros((n, n), np.float32)
    for _ in range(900):
        x0, y0 = rng.uniform(0, n, 2)
        length = rng.uniform(10, 28)
        ang = math.pi / 2 + rng.normal(0, 0.18)
        pts = [(x0 + math.cos(ang) * length * t, y0 + math.sin(ang) * length * t) for t in np.linspace(0, 1, 6)]
        stamp_line(h, pts, rng.uniform(0.6, 1.2), rng.uniform(0.4, 1.0))
    return _blur(h, 1)


def to_rgba(gray, lo=(0, 0, 0), hi=(1, 1, 1)):
    lo = np.array(lo, np.float32)
    hi = np.array(hi, np.float32)
    rgb = lo + (hi - lo) * gray[..., None]
    return np.concatenate([rgb, np.ones_like(gray)[..., None]], -1)
