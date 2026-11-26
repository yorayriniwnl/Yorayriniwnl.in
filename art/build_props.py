"""War room props: tufted leather sofa, walnut table, crates, lantern, laptop,
gold chess knight, YA mug, notebook, helmet, pens.

    python art/build_props.py public/models/props.glb

Each prop is a top-level node named `prop_*`; the runtime places them.
Text that must stay editable (book spines, laptop screen, notebook cover)
is drawn at runtime onto the `screen_*` / `cover_*` materials.
"""
from __future__ import annotations

import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from lib import *  # noqa: F401,F403
from lib import TAU, Meta, Vector, np
import textures as tx

OUT = sys.argv[-1] if sys.argv[-1].endswith(".glb") else "props.glb"
reset()

leather = tx.leather_grain(256)
leather_n = image_from_array("leather-normal", tx.height_to_normal(leather, 2.0))
wood = tx.tile_noise(512, 3, 4, 5)
x = np.linspace(0, 1, 512)[None, :]
grain = 0.5 + 0.5 * np.sin((x * 40 + wood * 6) * math.tau)
wood_rgb = tx.to_rgba(grain * 0.6 + wood * 0.4, (0.035, 0.016, 0.009), (0.11, 0.05, 0.026))
wood_img = image_from_array("walnut", wood_rgb)

M = {
    "sofa": textured_mat("leather_sofa", None, rough=0.42, normal=leather_n, normal_strength=0.6),
    "wood": textured_mat("wood_walnut", wood_img, rough=0.35),
    "gold": mat("metal_gold", (1.0, 0.72, 0.36), metal=1.0, rough=0.22),
    "brass": mat("metal_brass", (0.8, 0.55, 0.25), metal=1.0, rough=0.35),
    "steel": mat("metal_dark", (0.05, 0.05, 0.055), metal=1.0, rough=0.35),
    "crate": mat("crate_polymer", (0.022, 0.022, 0.025), rough=0.55),
    "rubber": mat("rubber", (0.02, 0.02, 0.022), rough=0.85),
    "logo": mat("logo_red", (0.75, 0.04, 0.05), rough=0.5),
    "neon": mat("neon_red", (0.9, 0.04, 0.04), rough=0.4, emission=(1.0, 0.06, 0.05), strength=4.0),
    "amber": mat("neon_amber", (1.0, 0.45, 0.12), rough=0.4, emission=(1.0, 0.42, 0.12), strength=5.0),
    "glass": mat("glass_lantern", (0.6, 0.2, 0.1), rough=0.05, alpha=0.35),
    "screen": mat("screen_laptop", (0.02, 0.0, 0.0), rough=0.2, emission=(0.4, 0.02, 0.02), strength=1.0),
    "cover": mat("cover_notebook", (0.03, 0.025, 0.025), rough=0.6),
    "paper": mat("paper", (0.75, 0.7, 0.62), rough=0.9),
    "mug": mat("mug_ceramic", (0.02, 0.02, 0.022), rough=0.25),
    "helmet": mat("helmet_polymer", (0.03, 0.03, 0.032), rough=0.7),
    "lens": mat("lens_red", (0.2, 0.0, 0.0), metal=0.5, rough=0.05, emission=(0.9, 0.04, 0.03), strength=1.5),
    "velvet": mat("cloth_red", (0.32, 0.015, 0.02), rough=0.7),
}

nodes = []


def node(name):
    e = empty(name)
    nodes.append(e)
    return e


# ------------------------------------------------------------------ sofa ---
# 2.3 m chesterfield: tufted seat and back, rolled arms. Origin: floor centre.
sofa = node("prop_sofa")
W, D = 2.3, 0.9
parts = []
seat = box("seat", (0, 0, 0.33), (W - 0.36, D - 0.2, 0.2), None, None, 0.05, 3)
parts.append(seat)
base = box("base", (0, 0.02, 0.15), (W, D, 0.2), None, None, 0.03, 2)
parts.append(base)
back = box("back", (0, D / 2 - 0.11, 0.62), (W - 0.1, 0.22, 0.6), None, None, 0.06, 3)
parts.append(back)
for sx in (-1, 1):
    parts.append(box(f"arm{sx}", (sx * (W / 2 - 0.1), 0.0, 0.42), (0.2, D, 0.42), None, None, 0.05, 3))
    parts.append(cylinder(f"roll{sx}", (sx * (W / 2 - 0.1), 0.0, 0.64), 0.13, D, None, None, 32, (math.radians(90), 0, 0)))
sofa_m = union("sofa_mesh", parts, voxel=0.012, smooth_iter=2)
co = mesh_coords(sofa_m)
no = mesh_normals(sofa_m)
# diamond tufting on the back and seat: dimples on a staggered lattice
disp = np.zeros(len(co))
for face, sel, (u_ax, v_ax), step in (
    ("back", (co[:, 1] < D / 2 - 0.15) & (co[:, 2] > 0.42) & (np.abs(co[:, 0]) < W / 2 - 0.2) & (no[:, 1] < -0.5), (0, 2), 0.16),
    ("seat", (co[:, 2] > 0.4) & (co[:, 2] < 0.46) & (np.abs(co[:, 0]) < W / 2 - 0.2) & (co[:, 1] < D / 2 - 0.22) & (no[:, 2] > 0.6), (0, 1), 0.2),
):
    u = co[:, u_ax] / step
    v = co[:, v_ax] / step
    # nearest lattice point of a diamond grid
    gu = np.round(u)
    gv = np.round(v + 0.5 * (gu % 2)) - 0.5 * (gu % 2)
    d = np.sqrt((u - gu) ** 2 + (v - gv) ** 2) * step
    dimple = -0.022 * np.exp(-(d / 0.022) ** 2)
    pleat = -0.006 * np.exp(-((np.abs(u - gu) - np.abs(v - gv)) ** 2) / 0.004)
    disp = np.where(sel, dimple + pleat, disp)
set_coords(sofa_m, co + no * disp[:, None])
box_uv_world(sofa_m, 5)
set_mat(sofa_m, M["sofa"])
sofa_m.parent = sofa
# buttons
for face in ("back",):
    for i in range(-6, 7):
        for j in range(3, 6):
            u, v = i, j + 0.5 * (i % 2)
            p = Vector((u * 0.16, D / 2 - 0.235, v * 0.16))
            if abs(p.x) < W / 2 - 0.22 and 0.48 < p.z < 0.88:
                sphere(f"btn{i}{j}", p, 0.011, M["sofa"], sofa, 8, 6)
for sx in (-1, 1):
    for sy in (-1, 1):
        cylinder(f"foot{sx}{sy}", (sx * (W / 2 - 0.08), sy * (D / 2 - 0.08) + 0.02, 0.025), 0.03, 0.05, M["brass"], sofa, 16)
# red velvet throw over the left arm (from the art)
throw = box("throw", (-0.75, 0.0, 0.47), (0.55, D - 0.1, 0.02), M["velvet"], sofa, 0.008)
subsurf(throw, 2)
co = mesh_coords(throw)
co[:, 2] += -0.06 * np.clip(np.abs(co[:, 1]) - 0.25, 0, None) * 4 + 0.012 * np.sin(co[:, 0] * 30)
set_coords(throw, co)

# ---------------------------------------------------------------- table ---
table = node("prop_table")
top = box("table_top", (0, 0, 0.42), (1.6, 0.75, 0.05), M["wood"], table, 0.012, 3)
box_uv_world(top, 0.8)
trim = box("table_trim", (0, 0, 0.392), (1.62, 0.77, 0.015), M["gold"], table, 0.004)
apron = box("table_apron", (0, 0, 0.35), (1.5, 0.66, 0.08), M["wood"], table, 0.008)
box_uv_world(apron, 0.8)
for sx in (-1, 1):
    for sy in (-1, 1):
        leg = limb_tube(f"leg{sx}{sy}", [Vector((sx * 0.7, sy * 0.3, 0.32)), Vector((sx * 0.72, sy * 0.31, 0.2)), Vector((sx * 0.69, sy * 0.3, 0.08)), Vector((sx * 0.71, sy * 0.31, 0.0))], [0.035, 0.028, 0.022, 0.03], 6, 16, 1.0, M["wood"], table)
        box_uv_world(leg, 0.8)
        cylinder(f"legcap{sx}{sy}", (sx * 0.71, sy * 0.31, 0.01), 0.032, 0.02, M["gold"], table, 16)

# ---------------------------------------------------------------- crates ---
def crate(name, size, logo=True):
    c = node(name)
    sx, sy, sz = size
    body = box(name + "_body", (0, 0, sz / 2), size, M["crate"], c, 0.012, 3)
    for z in (0.12 * sz, 0.88 * sz):
        box(name + f"_rib{z:.2f}", (0, 0, z), (sx + 0.012, sy + 0.012, 0.03), M["crate"], c, 0.006)
    for ix in (-1, 1):
        for iy in (-1, 1):
            box(name + f"_corner{ix}{iy}", (ix * sx / 2, iy * sy / 2, sz / 2), (0.05, 0.05, sz + 0.01), M["steel"], c, 0.01)
    for ix in (-0.25, 0.25):
        box(name + f"_latch{ix}", (ix * sx, -sy / 2 - 0.008, sz * 0.7), (0.06, 0.02, 0.08), M["brass"], c, 0.006)
    box(name + "_handle", (sx / 2 + 0.012, 0, sz * 0.6), (0.02, 0.18, 0.03), M["rubber"], c, 0.008)
    if logo:
        text_mesh(name + "_ya", "YA", (-sx * 0.15, -sy / 2 - 0.004, sz * 0.42), sz * 0.32, M["logo"], c, rot=(math.radians(90), 0, 0), extrude=0.002)
        text_mesh(name + "_sas", "SAS", (sx * 0.25, -sy / 2 - 0.004, sz * 0.42), sz * 0.1, M["logo"], c, rot=(math.radians(90), 0, 0), extrude=0.001)
    return c


crate("prop_crate_a", (0.8, 0.5, 0.42))
crate("prop_crate_b", (0.62, 0.44, 0.34))
crate("prop_crate_c", (0.7, 0.48, 0.38))

# ---------------------------------------------------------------- helmet ---
helmet = node("prop_helmet")
hm = Meta("PropHelmet", resolution=0.008)
hm.ellipsoid((0, 0, 0.1), (0.13, 0.15, 0.12))
h = hm.to_mesh("helmet_shell", voxel=0.006)
co = mesh_coords(h)
co[co[:, 2] < 0.05, 2] = 0.05
set_coords(h, co)
set_mat(h, M["helmet"])
h.parent = helmet
for sx in (-1, 1):
    box(f"hrail{sx}", (sx * 0.125, 0.0, 0.1), (0.012, 0.18, 0.03), M["steel"], helmet, 0.003)
    cylinder(f"hnvg{sx}", (sx * 0.035, -0.19, 0.17), 0.028, 0.1, M["helmet"], helmet, 24, (math.radians(90), 0, 0), 0.004)
    cylinder(f"hlens{sx}", (sx * 0.035, -0.242, 0.17), 0.022, 0.006, M["lens"], helmet, 24, (math.radians(90), 0, 0))
box("hmount", (0, -0.15, 0.18), (0.09, 0.05, 0.05), M["steel"], helmet, 0.006)
box("hpatch", (0, 0.12, 0.15), (0.07, 0.01, 0.04), M["logo"], helmet, 0.003, rot=(math.radians(-35), 0, 0))
box("hstrap", (0, 0, 0.05), (0.2, 0.25, 0.012), M["rubber"], helmet, 0.004)

# --------------------------------------------------------------- lantern ---
lantern = node("prop_lantern")
cylinder("lan_base", (0, 0, 0.02), 0.085, 0.04, M["brass"], lantern, 32, bevel_w=0.006)
cylinder("lan_top", (0, 0, 0.36), 0.075, 0.03, M["brass"], lantern, 32, bevel_w=0.006)
cylinder("lan_cap", (0, 0, 0.4), 0.05, 0.04, M["brass"], lantern, 32, bevel_w=0.006)
torus("lan_ring", (0, 0, 0.46), 0.03, 0.006, M["brass"], lantern, 24, 8, rot=(math.radians(90), 0, 0))
cylinder("lan_glass", (0, 0, 0.19), 0.065, 0.3, M["glass"], lantern, 32, cap=False)
for k in range(6):
    a = TAU * k / 6
    tube(f"lan_bar{k}", [(math.cos(a) * 0.072, math.sin(a) * 0.072, 0.04), (math.cos(a) * 0.072, math.sin(a) * 0.072, 0.35)], 0.005, M["brass"], lantern, 6)
cylinder("lan_core", (0, 0, 0.17), 0.018, 0.12, M["amber"], lantern, 16)

# ---------------------------------------------------------------- laptop ---
laptop = node("prop_laptop")
box("lap_base", (0, 0, 0.009), (0.36, 0.25, 0.018), M["steel"], laptop, 0.006)
box("lap_keys", (0, -0.01, 0.0185), (0.32, 0.12, 0.002), M["rubber"], laptop, 0.001)
lid = empty("lap_lid", (0, 0.125, 0.018), laptop)
lid.rotation_euler = (math.radians(-18), 0, 0)
box("lap_lid_shell", (0, 0.0, 0.12), (0.36, 0.012, 0.24), M["steel"], lid, 0.006)
scr = box("lap_screen", (0, -0.0065, 0.122), (0.33, 0.002, 0.21), M["screen"], lid, 0.0)
# planar UVs for the runtime screen texture
me = scr.data
me.uv_layers.new(name="UVMap")
co = mesh_coords(scr)
for poly in me.polygons:
    for li in poly.loop_indices:
        v = co[me.loops[li].vertex_index]
        me.uv_layers.active.data[li].uv = (v[0] / 0.33 + 0.5, (v[2] - 0.122) / 0.21 + 0.5)

# ---------------------------------------------------------- chess knight ---
knight = node("prop_knight")
prof = [(0.0, 0.0), (0.042, 0.0), (0.045, 0.01), (0.036, 0.02), (0.03, 0.03), (0.034, 0.038), (0.026, 0.045), (0.022, 0.06), (0.0, 0.06)]
verts, faces = [], []
seg = 40
for (r, z) in prof:
    for k in range(seg):
        a = TAU * k / seg
        verts.append((math.cos(a) * r, math.sin(a) * r, z))
for i in range(len(prof) - 1):
    for k in range(seg):
        a = i * seg + k
        b = i * seg + (k + 1) % seg
        faces.append((a, b, b + seg, a + seg))
kb = from_pydata("knight_base", verts, faces, M["gold"], knight)
# head: a classic side silhouette, extruded and bevelled so it reads from the
# camera at the table (profile in the XZ plane, facing -X)
outline = [(0.022, 0.058), (0.027, 0.085), (0.025, 0.108), (0.018, 0.128), (0.008, 0.143), (0.004, 0.157),
           (-0.003, 0.146), (-0.015, 0.140), (-0.026, 0.131), (-0.036, 0.118), (-0.042, 0.106), (-0.039, 0.097),
           (-0.030, 0.096), (-0.020, 0.099), (-0.011, 0.091), (-0.014, 0.076), (-0.022, 0.058)]
half = 0.012
kv = [(x, -half, z) for x, z in outline] + [(x, half, z) for x, z in outline]
n = len(outline)
kf = [tuple(range(n - 1, -1, -1)), tuple(range(n, 2 * n))]
for i in range(n):
    j = (i + 1) % n
    kf.append((i, j, n + j, n + i))
kh = from_pydata("knight_head", kv, kf, M["gold"], knight)
bevel(kh, 0.0045, 3, angle=math.radians(25))
autosmooth(kh, 50)
# eye and mane ridge
sphere("knight_eye", (-0.016, -half - 0.0005, 0.127), 0.0032, M["rubber"], knight, 12)
sphere("knight_eye_b", (-0.016, half + 0.0005, 0.127), 0.0032, M["rubber"], knight, 12)
for k in range(5):
    t = k / 4
    sphere(f"knight_mane{k}", (0.026 - 0.017 * t, 0.0, 0.1 + 0.04 * t), 0.0075, M["gold"], knight, 10)

# ------------------------------------------------------------------- mug ---
mug = node("prop_mug")
cylinder("mug_body", (0, 0, 0.05), 0.04, 0.1, M["mug"], mug, 40, bevel_w=0.003)
cylinder("mug_inner", (0, 0, 0.098), 0.035, 0.004, M["rubber"], mug, 40)
torus("mug_handle", (0.045, 0, 0.05), 0.022, 0.006, M["mug"], mug, 24, 8, rot=(math.radians(90), 0, 0), scale=(0.8, 1.0, 1.0))
text_mesh("mug_ya", "YA", (0, -0.0405, 0.052), 0.04, M["logo"], mug, rot=(math.radians(90), 0, 0), extrude=0.001)

# -------------------------------------------------------------- notebook ---
notebook = node("prop_notebook")
box("nb_pages", (0, 0, 0.012), (0.2, 0.27, 0.02), M["paper"], notebook, 0.002)
cov = box("nb_cover", (0, 0, 0.0235), (0.205, 0.275, 0.003), M["cover"], notebook, 0.001)
me = cov.data
me.uv_layers.new(name="UVMap")
co = mesh_coords(cov)
for poly in me.polygons:
    for li in poly.loop_indices:
        v = co[me.loops[li].vertex_index]
        me.uv_layers.active.data[li].uv = (v[0] / 0.205 + 0.5, v[1] / 0.275 + 0.5)
box("nb_band", (0.07, 0, 0.0255), (0.01, 0.28, 0.001), M["rubber"], notebook)

# ------------------------------------------------------------------ pens ---
pens = node("prop_pens")
for i in range(5):
    x0 = (i - 2) * 0.03
    cylinder(f"pen{i}", (x0, 0, 0.006), 0.006, 0.14, M["gold"] if i % 2 else M["steel"], pens, 16, (math.radians(90), 0, math.radians(8 * (i - 2))))

# -------------------------------------------------------------- export ----
export_glb(OUT, None)
print("tris", stats())
print("exported", OUT)
