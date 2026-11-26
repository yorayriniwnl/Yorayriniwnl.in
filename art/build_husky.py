"""YOR husky: seated companion with tactical helmet, NVG and gas mask.

    python art/build_husky.py public/models/husky.glb

Blender coords: Z up, faces -Y, origin on the seat under the body.
Node contract:
    husky         root
    husky_body    body + harness (fur shells are generated at runtime from
                  the `fur_*` materials; vertex colour carries the coat pattern)
    husky_head    pivot at the top of the neck (looks around)
    husky_tail    pivot at the tail root (wags)
"""
from __future__ import annotations

import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from lib import *  # noqa: F401,F403
from lib import TAU, Meta, Matrix, Vector, np
import textures as tx
from mathutils.bvhtree import BVHTree

OUT = sys.argv[-1] if sys.argv[-1].endswith(".glb") else "husky.glb"
reset()

M = {
    "fur": mat("fur_coat", (1, 1, 1), rough=0.9),  # vertex colour drives the coat
    "nose": mat("nose_leather", (0.01, 0.01, 0.01), rough=0.35),
    "eye": mat("husky_eye", (0.5, 0.03, 0.03), rough=0.15, emission=(1.0, 0.08, 0.05), strength=3.0),
    "rubber": mat("rubber", (0.02, 0.02, 0.022), rough=0.85),
    "mask": mat("gasmask_rubber", (0.018, 0.018, 0.02), rough=0.6),
    "steel": mat("metal_dark", (0.05, 0.05, 0.055), metal=1.0, rough=0.35),
    "helmet": mat("helmet_polymer", (0.03, 0.03, 0.032), rough=0.7),
    "lens": mat("lens_red", (0.2, 0.0, 0.0), metal=0.5, rough=0.05, emission=(0.9, 0.04, 0.03), strength=1.5),
    "neon": mat("neon_red", (0.9, 0.04, 0.04), rough=0.4, emission=(1.0, 0.06, 0.05), strength=4.0),
    "logo": mat("logo_red", (0.75, 0.04, 0.05), rough=0.5),
    "webbing": mat("cloth_pants", (0.03, 0.028, 0.03), rough=0.9),
    "silver": mat("metal_silver", (0.7, 0.7, 0.72), metal=1.0, rough=0.25),
}

root = empty("husky")
body_grp = empty("husky_body", parent=root)
NECK = Vector((0, -0.09, 0.58))
head_grp = empty("husky_head", NECK, parent=root)
head_grp.rotation_euler = (math.radians(4), 0, math.radians(28))
head_grp.scale = (1.12, 1.12, 1.12)  # looks off to the right, like the art
TAIL_ROOT = Vector((0, 0.25, 0.12))
tail_grp = empty("husky_tail", TAIL_ROOT, parent=root)

# ------------------------------------------------------------------ body ---
# Sitting dog: a lofted spine (rump -> waist -> deep chest -> neck), folded
# haunches and straight forelegs, unioned and relaxed into one surface.
SPINE = [Vector((0, 0.24, 0.08)), Vector((0, 0.19, 0.17)), Vector((0, 0.12, 0.28)), Vector((0, 0.05, 0.37)), Vector((0, -0.02, 0.45)), Vector((0, -0.06, 0.52)), Vector((0, -0.09, 0.6))]
#        (depth, width) half radii along the spine
SPINE_R = [(0.06, 0.07), (0.11, 0.115), (0.105, 0.098), (0.125, 0.105), (0.115, 0.1), (0.08, 0.075), (0.06, 0.058)]


def spine_tube(name, grow=0.0, lo=0, hi=None):
    path = catmull(SPINE, 10)
    rr = []
    for k in range(len(path)):
        u = k / (len(path) - 1) * (len(SPINE_R) - 1)
        i = min(int(u), len(SPINE_R) - 2)
        f = u - i
        d = SPINE_R[i][0] * (1 - f) + SPINE_R[i + 1][0] * f + grow
        w = SPINE_R[i][1] * (1 - f) + SPINE_R[i + 1][1] * f + grow
        rr.append((d, w))
    hi = hi or len(path)
    return tube(name, path[lo:hi], rr[lo:hi], None, None, 28, caps=grow == 0.0, twist_up=(1, 0, 0))


parts = [spine_tube("spine")]
# chest keel drops forward between the forelegs
parts.append(sphere("keel", Vector((0, -0.09, 0.34)), 1.0, None, None, 28, 18, (0.075, 0.07, 0.11)))
for sx in (-1, 1):
    parts.append(sphere(f"haunch{sx}", Vector((0.085 * sx, 0.11, 0.1)), 1.0, None, None, 28, 18, (0.06, 0.13, 0.095)))
    parts.append(limb_tube(f"hind{sx}", [Vector((0.1 * sx, 0.03, 0.05)), Vector((0.095 * sx, -0.06, 0.028)), Vector((0.09 * sx, -0.13, 0.02))], [0.03, 0.026, 0.024]))
    parts.append(sphere(f"hpaw{sx}", Vector((0.09 * sx, -0.15, 0.018)), 1.0, None, None, 16, 12, (0.03, 0.042, 0.02)))
    parts.append(limb_tube(f"fore{sx}", [Vector((0.068 * sx, -0.06, 0.4)), Vector((0.07 * sx, -0.1, 0.27)), Vector((0.066 * sx, -0.13, 0.15)), Vector((0.064 * sx, -0.15, 0.04))], [0.042, 0.034, 0.026, 0.024]))
    parts.append(sphere(f"fpaw{sx}", Vector((0.064 * sx, -0.17, 0.018)), 1.0, None, None, 16, 12, (0.03, 0.042, 0.02)))
    parts.append(sphere(f"ruff{sx}", Vector((0.06 * sx, -0.07, 0.5)), 1.0, None, None, 20, 14, (0.05, 0.06, 0.07)))
body = union("husky_body_mesh", parts, voxel=0.006, smooth_iter=8)
decimate(body, 0.5)

# ------------------------------------------------------------------ head ---
hm = Meta("HuskyHead", resolution=0.006)
HC = Vector((0, -0.04, 0.1))  # head-local skull centre
hm.ellipsoid(HC, (0.072, 0.082, 0.066))
hm.ellipsoid(HC + Vector((0, -0.09, -0.028)), (0.04, 0.07, 0.034))  # muzzle
hm.ellipsoid(HC + Vector((0, -0.08, -0.055)), (0.032, 0.05, 0.016))  # jaw
for sx in (-1, 1):
    hm.ellipsoid(HC + Vector((0.055 * sx, -0.02, -0.03)), (0.04, 0.05, 0.045))  # cheek ruff
    hm.ball(HC + Vector((0.032 * sx, -0.07, 0.012)), 0.012, negative=True)  # eye socket
hm.capsule(Vector((0, 0.02, -0.06)), HC + Vector((0, 0.01, -0.03)), 0.06)
head = hm.to_mesh("husky_head_mesh", voxel=0.005)
smooth_corrective(head, 3, 0.5)
head.parent = head_grp

# ears: rounded pyramids with cupped inner face
ears = []
for sx in (-1, 1):
    base = HC + Vector((0.055 * sx, 0.012, 0.045))
    tip = base + Vector((0.03 * sx, 0.012, 0.09))
    verts, faces = [], []
    ring = 12
    for i, t in enumerate(np.linspace(0, 1, 8)):
        c = base.lerp(tip, t)
        w = 0.034 * (1 - t) ** 0.9 + 0.002
        d = 0.016 * (1 - t) + 0.002
        for k in range(ring):
            a = TAU * k / ring
            cup = 0.6 if math.sin(a) < 0 else 1.0  # front side scooped
            verts.append(c + Vector((math.cos(a) * w, math.sin(a) * d * cup, 0)))
    for i in range(7):
        for k in range(ring):
            a = i * ring + k
            b = i * ring + (k + 1) % ring
            faces.append((a, b, b + ring, a + ring))
    e = from_pydata(f"ear{sx}", verts, faces, None, head_grp)
    ears.append(e)

# nose + eyes
nose = sphere("nose", HC + Vector((0, -0.158, -0.016)), 0.016, M["nose"], head_grp, 20, 12, (1.2, 0.8, 0.8))
for sx in (-1, 1):
    sphere(f"heye{sx}", HC + Vector((0.033 * sx, -0.07, 0.014)), 0.0105, M["eye"], head_grp, 16, 10, (1.0, 0.7, 0.8))


# ------------------------------------------------------- coat pattern ----
def coat(obj, kind):
    """Husky markings as vertex colour (in parent space of the object)."""
    co = mesh_coords(obj)
    no = mesh_normals(obj)
    dark = np.array([0.045, 0.045, 0.05])
    silver = np.array([0.28, 0.28, 0.3])
    white = np.array([0.82, 0.8, 0.77])
    n = fbm(co * 18, 3, 3) * 0.5 + 0.5
    if kind == "body":
        up = no[:, 2]
        frontal = -no[:, 1]
        w = np.clip((0.14 - co[:, 2]) * 6, 0, 1) * np.clip((-no[:, 1]) * 2 + 0.3, 0, 1)  # paws and lower legs
        w = np.maximum(w, np.clip((frontal - 0.35) * 3, 0, 1) * np.clip((0.46 - co[:, 2]) * 8, 0, 1) * (np.abs(co[:, 0]) < 0.065))  # chest bib
        w = np.maximum(w, np.clip((-co[:, 1] - 0.15) * 12, 0, 1) * (co[:, 2] < 0.3) * np.clip(-no[:, 1] * 2, 0, 1))  # foreleg fronts
        s = np.clip(up * 0.5 + 0.5, 0, 1) * 0.6 + n * 0.4
        base = dark + (silver - dark) * (1 - s)[:, None] * 0.7
    elif kind == "head":
        rel = co - np.array(HC)
        mask_face = (rel[:, 1] < -0.04) & (rel[:, 2] < 0.0)  # muzzle + jaw
        cheek = (np.abs(rel[:, 0]) > 0.035) & (rel[:, 2] < 0.0)
        brow = np.exp(-(((np.abs(rel[:, 0]) - 0.03) / 0.012) ** 2 + ((rel[:, 2] - 0.032) / 0.01) ** 2 + ((rel[:, 1] + 0.065) / 0.02) ** 2))
        stripe = np.exp(-((rel[:, 0] / 0.009) ** 2)) * (rel[:, 2] > 0.0) * (rel[:, 1] < -0.02)
        w = np.clip(mask_face * 1.0 + cheek * 0.9 + brow * 1.2 - stripe * 1.2, 0, 1)
        w = np.where(rel[:, 2] > 0.035, w * 0.2, w)
        base = dark + (silver - dark) * n[:, None] * 0.4
    else:  # ears: dark outside, white inner
        w = np.clip((-no[:, 1] - 0.2) * 2.5, 0, 1) * 0.85
        base = dark
    col = base * (1 - w)[:, None] + white * w[:, None]
    col *= (0.85 + 0.3 * n)[:, None]
    me = obj.data
    attr = me.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
    rgba = np.concatenate([np.clip(col, 0, 1), np.ones((len(co), 1))], 1)
    attr.data.foreach_set("color", rgba.astype(np.float32).ravel())
    me.color_attributes.active_color = attr
    set_mat(obj, M["fur"])


coat(body, "body")
coat(head, "head")
for e in ears:
    coat(e, "ear")
for o in (body, head, *ears):
    uv_project(o, "smart", 66, 0.004)
body.parent = body_grp

# ------------------------------------------------------------------ tail ---
tail_pts = [Vector((0, 0, 0)), Vector((0.03, 0.06, -0.04)), Vector((0.12, 0.05, -0.08)), Vector((0.18, -0.06, -0.08)), Vector((0.15, -0.16, -0.07))]
tail = limb_tube("husky_tail_mesh", tail_pts, [0.04, 0.05, 0.048, 0.04, 0.02], 8, 16)
remesh(tail, 0.006)
smooth_corrective(tail, 4, 0.5)
co = mesh_coords(tail)
tail.parent = tail_grp
coat_tail = mesh_coords(tail)
attr = tail.data.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
w = np.clip((-mesh_normals(tail)[:, 2]) * 1.5, 0, 1)
tip = np.clip((np.linalg.norm(co - np.array(tail_pts[-1]), axis=1) < 0.05) * 1.0, 0, 1)
w = np.maximum(w, tip)
col = np.array([0.05, 0.05, 0.055]) * (1 - w)[:, None] + np.array([0.8, 0.78, 0.75]) * w[:, None]
attr.data.foreach_set("color", np.concatenate([col, np.ones((len(co), 1))], 1).astype(np.float32).ravel())
tail.data.color_attributes.active_color = attr
set_mat(tail, M["fur"])
uv_project(tail, "smart", 66, 0.004)

# -------------------------------------------------------------- gas mask --
bmh = bmesh.new()
bmh.from_mesh(head.data)
bvh = BVHTree.FromBMesh(bmh)
MC = HC + Vector((0, -0.085, -0.03))
rows, cols = 18, 30
verts, faces = [], []
for r in range(rows):
    v = r / (rows - 1)
    for c in range(cols):
        u = c / (cols - 1)
        az = math.radians(-95 + 190 * u)
        el = math.radians(12 - 95 * v)
        d = Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el)))
        hit = bvh.ray_cast(MC + d * 0.3, -d)
        p = (hit[0] if hit[0] is not None else MC + d * 0.05) + d * 0.006
        verts.append(p)
for r in range(rows - 1):
    for c in range(cols - 1):
        a = r * cols + c
        faces.append((a, a + 1, a + cols + 1, a + cols))
gm = from_pydata("gasmask", verts, faces, M["mask"], head_grp)
subsurf(gm, 1)
solidify(gm, 0.004)
# keep the gas mask from covering the eyes: push the top rim down
co = mesh_coords(gm)
rel = co - np.array(MC)
hi = rel[:, 2] > 0.018
co[hi, 2] = MC.z + 0.018 + (co[hi, 2] - MC.z - 0.018) * 0.1
set_coords(gm, co)
# filters, valve and lenses
for sx in (-1, 1):
    fc = MC + Vector((0.034 * sx, -0.03, -0.018))
    ax = Vector((0.85 * sx, -0.45, -0.25)).normalized()
    f = cylinder(f"filter{sx}", fc + ax * 0.016, 0.019, 0.03, M["rubber"], head_grp, 28, bevel_w=0.003)
    f.rotation_mode = "QUATERNION"
    f.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(ax)
    rim = torus(f"filter_rim{sx}", fc + ax * 0.031, 0.019, 0.003, M["logo"], head_grp, 32, 8)
    rim.rotation_mode = "QUATERNION"
    rim.rotation_quaternion = f.rotation_quaternion
valve = cylinder("valve", MC + Vector((0, -0.08, -0.008)), 0.016, 0.022, M["steel"], head_grp, 24, (math.radians(90), 0, 0), 0.004)
# --------------------------------------------------------- helmet + NVG ---
helm = Meta("Helmet", resolution=0.005)
helm.ellipsoid(HC + Vector((0, 0.0, 0.05)), (0.058, 0.078, 0.045))
helm_o = helm.to_mesh("helmet", voxel=0.004)
co = mesh_coords(helm_o)
keep = co[:, 2] > HC.z + 0.045
co[~keep, 2] = HC.z + 0.045
set_coords(helm_o, co)
# ear holes: push helmet verts away from ear bases
set_mat(helm_o, M["helmet"])
helm_o.parent = head_grp
box("helmet_rail_l", HC + Vector((0.056, 0.0, 0.065)), (0.006, 0.08, 0.014), M["steel"], head_grp, 0.002)
box("helmet_rail_r", HC + Vector((-0.056, 0.0, 0.065)), (0.006, 0.08, 0.014), M["steel"], head_grp, 0.002)
box("nvg_mount", HC + Vector((0, -0.074, 0.085)), (0.04, 0.02, 0.03), M["steel"], head_grp, 0.004)
for sx in (-1, 1):
    tube_c = HC + Vector((0.02 * sx, -0.1, 0.1))
    cylinder(f"nvg_tube{sx}", tube_c, 0.014, 0.05, M["helmet"], head_grp, 20, (math.radians(90), 0, 0), 0.003)
    cylinder(f"nvg_lens{sx}", tube_c + Vector((0, -0.026, 0)), 0.011, 0.004, M["lens"], head_grp, 20, (math.radians(90), 0, 0))
patch = box("helmet_patch", HC + Vector((0, 0.035, 0.093)), (0.045, 0.03, 0.004), M["logo"], head_grp, 0.002, rot=(math.radians(-25), 0, 0))
text_mesh("helmet_ya", "YA", HC + Vector((0, 0.036, 0.0955)), 0.02, M["neon"], head_grp, rot=(math.radians(-25), 0, 0), extrude=0.001)

# --------------------------------------------------------------- harness --
path_len = len(catmull(SPINE, 10))
vest = spine_tube("husky_vest", grow=0.012, lo=int(path_len * 0.42), hi=int(path_len * 0.7))
solidify(vest, 0.008, 1.0)
set_mat(vest, M["webbing"])
box_uv_world(vest, 6)
vest.parent = body_grp
for z, yy, rr in ((0.31, 0.065, 0.118), (0.44, -0.015, 0.118)):
    torus(f"strap{z}", Vector((0, yy, z)), rr, 0.007, M["rubber"], body_grp, 40, 6, scale=(1.0, 1.08, 1.0))
box("vest_buckle", Vector((0, -0.15, 0.4)), (0.035, 0.012, 0.025), M["silver"], body_grp, 0.003)
for sx in (-1, 1):
    p = box(f"vest_patch{sx}", Vector((0.122 * sx, 0.03, 0.38)), (0.008, 0.07, 0.045), M["logo"], body_grp, 0.003)
    text_mesh(f"vest_sas{sx}", "SAS", Vector((0.127 * sx, 0.03, 0.39)), 0.02, M["neon"], body_grp, rot=(math.radians(90), 0, math.radians(90 * sx)), extrude=0.001)
    text_mesh(f"vest_ya{sx}", "YA", Vector((0.127 * sx, 0.03, 0.367)), 0.016, M["neon"], body_grp, rot=(math.radians(90), 0, math.radians(90 * sx)), extrude=0.001)
torus("collar", Vector((0, -0.07, 0.54)), 0.07, 0.009, M["rubber"], body_grp, 40, 8, rot=(math.radians(20), 0, 0))
box("collar_tag", Vector((0, -0.14, 0.51)), (0.02, 0.004, 0.026), M["silver"], body_grp, 0.004)


def consolidate(group, name):
    objs = [o for o in bpy.context.scene.objects if o.type == "MESH" and o.parent == group]
    return join(objs, name) if objs else None


bodym = consolidate(body_grp, "husky_body_all")
headm = consolidate(head_grp, "husky_head_all")
tailm = consolidate(tail_grp, "husky_tail_all")
print("tris", stats([bodym, headm, tailm]))
export_glb(OUT, [root, body_grp, head_grp, tail_grp, bodym, headm, tailm])
print("exported", OUT)
