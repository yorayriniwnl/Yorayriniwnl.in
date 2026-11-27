"""YOR operator: masked, headphoned, seated with the gold-engraved rifle.

    python art/build_operator.py public/models/operator.glb

Coordinates (Blender): Z up, the character faces -Y, character's left is +X.
Node contract for the runtime:
    operator          root (floor under the seat)
    operator_body     jacket, legs, hands, vest, accessories (breathes)
    operator_head     pivot at the top of the neck (looks at the cursor)
    operator_rifle    the engraved rifle prop
"""
from __future__ import annotations

import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from lib import *  # noqa: F401,F403
from lib import TAU, Meta, Matrix, Quaternion, Vector, np
import textures as tx
from mathutils.bvhtree import BVHTree

OUT = sys.argv[-1] if sys.argv[-1].endswith(".glb") else "operator.glb"
rnd = random.Random(7)
reset()

# --------------------------------------------------------------- materials --
weave = tx.fabric_weave(256)
weave_n = image_from_array("weave-normal", tx.height_to_normal(weave, 3.0))
dam = tx.damask(512)
jacket_rgb = tx.to_rgba(dam, (0.018, 0.016, 0.017), (0.30, 0.018, 0.022))
jacket_img = image_from_array("jacket-damask", jacket_rgb)
leather = tx.leather_grain(256)
leather_n = image_from_array("leather-normal", tx.height_to_normal(leather, 2.0))

M = {
    "jacket": textured_mat("cloth_jacket", jacket_img, rough=0.82, normal=weave_n, normal_strength=0.6),
    "pants": textured_mat("cloth_pants", None, rough=0.9, normal=weave_n, normal_strength=0.5),
    "hood": textured_mat("cloth_hood", jacket_img, rough=0.85, normal=weave_n, normal_strength=0.6),
    "lining": mat("cloth_red", (0.32, 0.015, 0.02), rough=0.7),
    "boot": textured_mat("leather_boot", None, rough=0.45, normal=leather_n, normal_strength=0.7),
    "glove": textured_mat("leather_glove", None, rough=0.5, normal=leather_n, normal_strength=0.3),
    "rubber": mat("rubber", (0.02, 0.02, 0.022), rough=0.85),
    "steel": mat("metal_dark", (0.05, 0.05, 0.055), metal=1.0, rough=0.35),
    "silver": mat("metal_silver", (0.7, 0.7, 0.72), metal=1.0, rough=0.25),
    "gold": mat("metal_gold", (1.0, 0.72, 0.36), metal=1.0, rough=0.22),
    "skin": mat("skin", (0.16, 0.08, 0.048), rough=0.52),
    "eyewhite": mat("eye_white", (0.32, 0.27, 0.27), rough=0.3),
    "iris": mat("eye_iris", (0.6, 0.02, 0.02), rough=0.2, emission=(1.0, 0.05, 0.04), strength=6.0),
    "pupil": mat("eye_pupil", (0.0, 0.0, 0.0), rough=0.2),
    "lash": mat("eye_lash", (0.004, 0.003, 0.003), rough=0.6),
    "hair": mat("hair", (0.012, 0.010, 0.010), rough=0.55),
    "mask": textured_mat("cloth_mask", None, rough=0.88, normal=weave_n, normal_strength=0.8),
    "neon": mat("neon_red", (0.9, 0.04, 0.04), rough=0.4, emission=(1.0, 0.06, 0.05), strength=4.0),
    "logo": mat("logo_red", (0.75, 0.04, 0.05), rough=0.5),
    "glass": mat("glass_dark", (0.02, 0.02, 0.025), metal=0.0, rough=0.05),
    "tag": mat("tag_red", (0.6, 0.03, 0.04), metal=0.6, rough=0.3, emission=(0.6, 0.02, 0.02), strength=0.6),
}
for k in ("pants", "boot", "glove", "mask"):
    bsdf = M[k].node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = {"pants": (0.03, 0.028, 0.03, 1), "boot": (0.02, 0.018, 0.018, 1), "glove": (0.025, 0.022, 0.022, 1), "mask": (0.012, 0.012, 0.013, 1)}[k]

root = empty("operator")
body_grp = empty("operator_body", parent=root)
NECK = Vector((0, 0.115, 1.10))
head_grp = empty("operator_head", NECK, parent=root)
head_grp.rotation_euler = (math.radians(-9), 0, math.radians(4))  # chin down, slight turn to the light

# ------------------------------------------------------------ skeleton pts --
PELVIS = Vector((0, 0.10, 0.54))
WAIST = Vector((0, 0.115, 0.70))
CHEST = Vector((0, 0.135, 0.88))
SH_L, SH_R = Vector((0.185, 0.15, 1.0)), Vector((-0.185, 0.15, 1.0))
EL_L, EL_R = Vector((0.27, -0.07, 0.84)), Vector((-0.27, 0.05, 0.75))
WR_L, WR_R = Vector((0.07, -0.065, 1.03)), Vector((-0.11, -0.17, 0.70))
HIP_L, HIP_R = Vector((0.10, 0.07, 0.49)), Vector((-0.10, 0.07, 0.49))
KN_L, KN_R = Vector((0.15, -0.37, 0.575)), Vector((-0.15, -0.41, 0.53))
AN_L, AN_R = Vector((0.17, -0.47, 0.12)), Vector((-0.21, -0.57, 0.12))


def cloth_folds(obj, limbs, base_amp=0.0015, seed=0):
    """Compression folds: sparse sharp creases bunched near joints, soft elsewhere."""
    co = mesh_coords(obj)
    no = mesh_normals(obj)
    best = np.full(len(co), 9.0)
    disp = np.zeros(len(co))
    warp = fbm(co * 7.0, 3, seed) * 3.2
    tilt = fbm(co * 3.0, 2, seed + 9) * 1.4
    for a, b, amp, freq, bunch in limbs:
        t, d = segment_param(co, a, b)
        L = (Vector(b) - Vector(a)).length
        phase = t * L * freq * TAU + warp + tilt * np.sign(np.sin(co[:, 0] * 40))
        crease = 1.0 - np.abs(np.sin(phase * 0.5))  # broad ridges, sharp valleys
        val = (crease ** 3 - 0.25) * amp * (0.25 + 0.75 * np.exp(-((t - bunch) ** 2) / 0.03))
        sel = d < best
        best = np.where(sel, d, best)
        disp = np.where(sel, val, disp)
    disp += fbm(co * 5.0, 2, seed + 5) * base_amp * 3 + fbm(co * 30.0, 2, seed + 7) * base_amp
    set_coords(obj, co + no * disp[:, None])


def spine_point(z):
    """Torso centre line, reclined back toward +Y."""
    return Vector((0, 0.10 + (z - 0.5) * 0.06, z))


# ------------------------------------------------------------------ jacket --
torso = loft("torso", [
    (spine_point(0.46), 0.15, 0.11), (spine_point(0.56), 0.168, 0.125), (spine_point(0.68), 0.16, 0.118),
    (spine_point(0.80), 0.172, 0.122), (spine_point(0.90), 0.185, 0.125), (spine_point(0.98), 0.19, 0.115),
    (spine_point(1.04), 0.13, 0.09), (spine_point(1.08), 0.07, 0.065),
], 48, power=2.4)
parts = [torso]
for s, nm in ((SH_L, "l"), (SH_R, "r")):
    parts.append(sphere("shoulder_" + nm, s + Vector((0, 0, -0.012)), 0.075, None, None, 24, 16, (1.0, 1.0, 0.9)))
parts.append(limb_tube("arm_l", [SH_L, (SH_L + EL_L) / 2 + Vector((0.025, 0, 0)), EL_L, (EL_L + WR_L) / 2 + Vector((0.02, -0.025, -0.01)), WR_L], [0.066, 0.06, 0.054, 0.05, 0.044]))
parts.append(limb_tube("arm_r", [SH_R, (SH_R + EL_R) / 2 + Vector((-0.025, 0, 0)), EL_R, (EL_R + WR_R) / 2 + Vector((-0.015, 0, 0.0)), WR_R], [0.066, 0.06, 0.054, 0.05, 0.044]))
# jacket hem flaring over the hips, split at the front
for sx in (-1, 1):
    parts.append(sphere(f"hem_{sx}", PELVIS + Vector((0.11 * sx, -0.07, 0.0)), 0.07, None, None, 20, 14, (1.0, 1.5, 0.75)))
jacket = union("jacket_mesh", parts, voxel=0.0055, smooth_iter=4)
cloth_folds(jacket, [
    (SH_L, EL_L, 0.0045, 11, 0.9), (EL_L, WR_L, 0.005, 14, 0.12), (SH_R, EL_R, 0.0045, 11, 0.9), (EL_R, WR_R, 0.005, 14, 0.15),
    (spine_point(0.5), spine_point(0.95), 0.003, 6, 0.3),
], seed=1)
decimate(jacket, 0.4)
box_uv_world(jacket, 2.2)
set_mat(jacket, M["jacket"])
jacket.parent = body_grp

# ribbed cuffs (red lining shows at the sleeve ends)
for el, wr, name in ((EL_L, WR_L, "cuff_l"), (EL_R, WR_R, "cuff_r")):
    d = (wr - el).normalized()
    tube(name, [wr - d * 0.03, wr + d * 0.004], [0.046, 0.043], M["lining"], body_grp, 24)

# ------------------------------------------------------------------- pants --
pp = [loft("pelvis", [(spine_point(0.40), 0.15, 0.115), (spine_point(0.50), 0.16, 0.12), (spine_point(0.60), 0.15, 0.11)], 40, power=2.4)]
pp.append(limb_tube("leg_l", [HIP_L, (HIP_L + KN_L) / 2 + Vector((0, 0, 0.015)), KN_L, (KN_L + AN_L) / 2 + Vector((0, -0.012, 0)), AN_L + Vector((0, 0, 0.09))], [0.082, 0.072, 0.058, 0.054, 0.048]))
pp.append(limb_tube("leg_r", [HIP_R, (HIP_R + KN_R) / 2 + Vector((0, 0, 0.015)), KN_R, (KN_R + AN_R) / 2 + Vector((0, -0.012, 0)), AN_R + Vector((0, 0, 0.09))], [0.082, 0.072, 0.058, 0.054, 0.048]))
pants = union("pants_mesh", pp, voxel=0.0065, smooth_iter=4)
cloth_folds(pants, [(HIP_L, KN_L, 0.004, 8, 0.95), (KN_L, AN_L, 0.0055, 10, 0.88), (HIP_R, KN_R, 0.004, 8, 0.95), (KN_R, AN_R, 0.0055, 10, 0.88)], seed=2)
decimate(pants, 0.42)
box_uv_world(pants, 2.2)
set_mat(pants, M["pants"])
pants.parent = body_grp

# knee pads
for kn, hip, an, nm in ((KN_L, HIP_L, AN_L, "kneepad_l"), (KN_R, HIP_R, AN_R, "kneepad_r")):
    fwd = ((kn - hip).normalized() + (kn - an).normalized()).normalized()
    pad = sphere(nm, kn + fwd * 0.045, 0.06, M["rubber"], body_grp, 20, 12, (1.0, 0.45, 1.1))
    pad.rotation_euler = Vector((0, 0, 1)).rotation_difference(fwd).to_euler()
    pad.rotation_mode = "QUATERNION"
    pad.rotation_quaternion = Vector((0, -1, 0)).rotation_difference(fwd)
    stripe = box(nm + "_stripe", kn + fwd * 0.069, (0.07, 0.006, 0.01), M["logo"], body_grp, 0.002)
    stripe.rotation_mode = "QUATERNION"
    stripe.rotation_quaternion = Vector((0, -1, 0)).rotation_difference(fwd)

# ------------------------------------------------------------------- boots --
for an, kn, nm in ((AN_L, KN_L, "boot_l"), (AN_R, KN_R, "boot_r")):
    bt = Meta("Boot" + nm[-1].upper(), resolution=0.01)
    bt.capsule(an + Vector((0, 0, 0.10)), an + Vector((0, 0, 0.0)), 0.058)
    bt.ellipsoid(an + Vector((0, -0.075, -0.07)), (0.052, 0.11, 0.045))
    bt.ellipsoid(an + Vector((0, 0.02, -0.07)), (0.05, 0.06, 0.05))
    boot = bt.to_mesh(nm, voxel=0.006)
    box_uv_world(boot, 14)
    set_mat(boot, M["boot"])
    boot.parent = body_grp
    sole = box(nm + "_sole", an + Vector((0, -0.05, -0.112)), (0.115, 0.27, 0.025), M["rubber"], body_grp, 0.008)
    for i in range(4):
        tube(f"{nm}_lace{i}", [an + Vector((-0.045, -0.055 + i * 0.0, 0.06 - i * 0.03)), an + Vector((0.0, -0.068, 0.068 - i * 0.03)), an + Vector((0.045, -0.055, 0.06 - i * 0.03))], 0.004, M["rubber"], body_grp, 6)


# ---------------------------------------------------------------- gloves --
def glove(name, wrist, fwd, up, curl=1.0, spread=0.0, thumb_side=1):
    """Gloved fist. fwd = finger direction (knuckles), up = back of hand."""
    fwd, up = Vector(fwd).normalized(), Vector(up).normalized()
    side = fwd.cross(up).normalized() * thumb_side
    up = side.cross(fwd).normalized() * thumb_side
    W = lambda x, y, z: wrist + side * x + fwd * y + up * z  # noqa: E731
    g = Meta("Glove" + name, resolution=0.006)
    g.ellipsoid(W(0, 0.045, 0), (0.045, 0.05, 0.022), rot=Matrix((side, fwd, up)).transposed().to_quaternion())
    g.capsule(W(0, -0.01, 0), W(0, 0.02, 0), 0.032)
    for i, (x, L) in enumerate(((-0.03, 0.040), (-0.01, 0.046), (0.01, 0.044), (0.029, 0.036))):
        base = Vector((x, 0.09, 0.0))
        pts = [base]
        ang = 0.0
        p = base.copy()
        for k, seg in enumerate((L, L * 0.65, L * 0.55)):
            ang += (0.9 + 0.35 * k) * curl
            p = p + Vector((spread * x, math.cos(ang) * seg, -math.sin(ang) * seg))
            pts.append(p.copy())
        g.limb([W(*q) for q in pts], [0.0115, 0.0105, 0.0095, 0.0085], step=0.006)
    # thumb wraps across the curled fingers
    g.limb([W(-0.04, 0.02, -0.01), W(-0.055, 0.06, -0.025), W(-0.035, 0.09, -0.04), W(-0.012, 0.1, -0.035)], [0.014, 0.012, 0.011, 0.01], step=0.006)
    o = g.to_mesh(name, voxel=0.0035)
    box_uv_world(o, 22)
    set_mat(o, M["glove"])
    o.parent = body_grp
    # knuckle guard + logo plate
    guard = box(name + "_guard", W(0, 0.085, 0.024), (0.07, 0.025, 0.012), M["rubber"], body_grp, 0.004)
    guard.rotation_mode = "QUATERNION"
    guard.rotation_quaternion = Matrix((side, fwd, up)).transposed().to_quaternion()
    patch = box(name + "_patch", W(0, 0.04, 0.024), (0.032, 0.026, 0.004), M["logo"], body_grp, 0.002)
    patch.rotation_mode = "QUATERNION"
    patch.rotation_quaternion = guard.rotation_quaternion
    return o


# left fist under the chin: knuckles up toward the jaw, back of hand faces the viewer
glove("glove_l", WR_L, fwd=(-0.35, 0.05, 1.0), up=(0.15, -1.0, 0.1), curl=1.05, thumb_side=-1)
# right hand wraps the pistol grip
glove("glove_r", WR_R, fwd=(0.55, -0.5, -0.35), up=(-0.25, -0.25, 1.0), curl=1.2, thumb_side=1)

# watch on the right wrist
wd = (WR_R - EL_R).normalized()
strap = torus("watch_strap", WR_R - wd * 0.03, 0.05, 0.007, M["rubber"], body_grp, 32, 8)
strap.rotation_mode = "QUATERNION"
strap.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(wd)
face_dir = Vector((-0.2, -0.4, 1.0)).normalized()
wpos = WR_R - wd * 0.03 + face_dir * 0.052
bezel = cylinder("watch_bezel", wpos, 0.021, 0.012, M["silver"], body_grp, 32)
bezel.rotation_mode = "QUATERNION"
bezel.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(face_dir)
dial = cylinder("watch_dial", wpos + face_dir * 0.0062, 0.017, 0.002, M["glass"], body_grp, 32)
dial.rotation_mode = "QUATERNION"
dial.rotation_quaternion = bezel.rotation_quaternion
hand = box("watch_hand", wpos + face_dir * 0.0075, (0.002, 0.012, 0.001), M["neon"], body_grp)
hand.rotation_mode = "QUATERNION"
hand.rotation_quaternion = bezel.rotation_quaternion

# ------------------------------------------------------------------ hood ---
hd = Meta("Hood", resolution=0.01)
for i in range(18):
    a = TAU * i / 18
    back = 0.5 + 0.5 * math.cos(a - math.pi / 2)  # +Y is the back
    r = 0.03 + 0.03 * back
    hd.ball(NECK + Vector((math.cos(a) * (0.1 + 0.015 * back), math.sin(a) * (0.08 + 0.04 * back), -0.06 + 0.04 * back)), r)
hd.ellipsoid(NECK + Vector((0, 0.12, -0.01)), (0.12, 0.05, 0.09))
hood = hd.to_mesh("hood_mesh", voxel=0.006)
cloth_folds(hood, [(NECK + Vector((-0.12, 0, 0)), NECK + Vector((0.12, 0, 0)), 0.006, 12, 0.5)], seed=3)
box_uv_world(hood, 2.2)
set_mat(hood, M["hood"])
hood.parent = body_grp

# ------------------------------------------------------- vest / chest rig --
vest_rot = (math.radians(-12), 0, 0)
vest = box("vest_plate", CHEST + Vector((0, -0.125, -0.015)), (0.30, 0.05, 0.27), M["rubber"], body_grp, 0.014, 3, vest_rot)
box_uv_world(vest, 3)
for i, x in enumerate((-0.085, 0.0, 0.085)):
    p = box(f"mag_pouch{i}", CHEST + Vector((x, -0.16, -0.075)), (0.075, 0.04, 0.12), M["pants"], body_grp, 0.01, 2, vest_rot)
    box_uv_world(p, 6)
    flap = box(f"mag_flap{i}", CHEST + Vector((x, -0.178, -0.022)), (0.078, 0.012, 0.035), M["rubber"], body_grp, 0.004, 2, vest_rot)
    clip = box(f"mag_clip{i}", CHEST + Vector((x, -0.186, -0.03)), (0.02, 0.006, 0.02), M["steel"], body_grp, 0.002, 2, vest_rot)
patch = box("vest_patch", CHEST + Vector((0, -0.158, 0.06)), (0.09, 0.006, 0.045), M["logo"], body_grp, 0.003, 2, vest_rot)
ya = text_mesh("vest_ya", "YA", CHEST + Vector((0, -0.163, 0.061)), 0.036, M["neon"], body_grp, rot=(math.radians(90 - 12), 0, 0), extrude=0.002)
ya.rotation_euler = (math.radians(90 - 12), 0, math.pi)
ya.rotation_euler = (math.radians(90 - 12), 0, 0)
for sx in (-1, 1):
    tube(f"vest_strap{sx}", [CHEST + Vector((0.11 * sx, -0.11, 0.12)), SH_R.lerp(SH_L, 0.5 + 0.35 * sx) + Vector((0, -0.02, 0.085)), SH_R.lerp(SH_L, 0.5 + 0.35 * sx) + Vector((0, 0.12, 0.06)), CHEST + Vector((0.12 * sx, 0.14, -0.02))], [(0.025, 0.006)] * 4, M["rubber"], body_grp, 8)
    box(f"buckle{sx}", CHEST + Vector((0.115 * sx, -0.145, 0.12)), (0.03, 0.01, 0.022), M["silver"], body_grp, 0.003, 2, vest_rot)
cummer = torus("cummerbund", WAIST + Vector((0, 0.01, 0.0)), 0.165, 0.035, M["rubber"], body_grp, 48, 10, scale=(1.0, 0.78, 1.0))
belt = torus("belt", PELVIS + Vector((0, 0.0, 0.06)), 0.172, 0.018, M["glove"], body_grp, 48, 8, scale=(1.0, 0.76, 0.9))
buckle = box("belt_buckle", PELVIS + Vector((0, -0.13, 0.06)), (0.06, 0.012, 0.035), M["silver"], body_grp, 0.004)
# shoulder patches (left: wings + flag stripe)
for sx, nm in ((1, "patch_l"), (-1, "patch_r")):
    s = SH_L if sx > 0 else SH_R
    pp = box(nm, s + Vector((0.07 * sx, -0.015, -0.03)), (0.008, 0.06, 0.05), M["logo"] if sx > 0 else M["rubber"], body_grp, 0.003)
    pp.rotation_euler = (0, math.radians(-25 * sx), 0)

# chain + red tag
chain_pts = [NECK + Vector((0.06, -0.02, -0.03)), CHEST + Vector((0.05, -0.17, 0.10)), CHEST + Vector((0.0, -0.19, 0.03)), CHEST + Vector((-0.05, -0.17, 0.10)), NECK + Vector((-0.06, -0.02, -0.03))]
tube("chain", catmull(chain_pts, 6), 0.0022, M["silver"], body_grp, 6, caps=False)
tag = box("dog_tag", CHEST + Vector((0.0, -0.195, 0.0)), (0.026, 0.004, 0.045), M["tag"], body_grp, 0.005, 3, vest_rot)

# ------------------------------------------------------------------ head ---
# Built upright in head-local space (origin at neck pivot), parented to operator_head.
HC = Vector((0, -0.005, 0.125))  # head centre
hm = Meta("Head", resolution=0.006)
hm.ellipsoid(HC + Vector((0, 0.012, 0.022)), (0.074, 0.09, 0.086))
hm.ellipsoid(HC + Vector((0, -0.02, -0.035)), (0.064, 0.072, 0.06))
hm.ellipsoid(HC + Vector((0, -0.05, -0.078)), (0.036, 0.03, 0.026))  # chin
hm.ellipsoid(HC + Vector((0, -0.088, -0.015)), (0.012, 0.016, 0.026))  # nose
for sx in (-1, 1):
    hm.ellipsoid(HC + Vector((0.048 * sx, -0.05, -0.04)), (0.026, 0.03, 0.03))  # cheeks
    hm.ellipsoid(HC + Vector((0.075 * sx, 0.005, -0.005)), (0.012, 0.022, 0.03))  # ears
    hm.ball(HC + Vector((0.033 * sx, -0.088, 0.012)), 0.018, negative=True)  # eye sockets
hm.capsule(Vector((0, 0.02, -0.04)), HC + Vector((0, 0.01, -0.06)), 0.05)  # neck
head = hm.to_mesh("head_mesh", voxel=0.0045)
smooth_corrective(head, 4, 0.5)
set_mat(head, M["skin"])
head.parent = head_grp

# eyes: sclera, glowing red iris, pupil, sharp upper lash line, brows
for sx, nm in ((1, "l"), (-1, "r")):
    ec = HC + Vector((0.033 * sx, -0.079, 0.012))
    white = sphere(f"eye_{nm}", ec, 0.0145, M["eyewhite"], head_grp, 24, 16, (1.15, 0.8, 0.36))
    iris = sphere(f"iris_{nm}", ec + Vector((-0.001 * sx, -0.0122, -0.0008)), 0.0068, M["iris"], head_grp, 24, 12, (0.92, 0.22, 0.9))
    pupil = sphere(f"pupil_{nm}", ec + Vector((-0.001 * sx, -0.0136, -0.0008)), 0.0027, M["pupil"], head_grp, 12, 8, (0.6, 0.2, 1.4))
    glint = sphere(f"glint_{nm}", ec + Vector((0.0022 * sx, -0.0141, 0.0016)), 0.0011, M["neon"], head_grp, 8, 6)
    # heavy upper lid: skin shell that hides the top of the eye -> narrow, sharp gaze
    lidshell = sphere(f"lid_{nm}", ec + Vector((0, -0.0015, 0.0052)), 0.0162, M["skin"], head_grp, 28, 14, (1.14, 0.86, 0.3))
    lidshell.rotation_euler = (0, math.radians(-9 * sx), 0)
    # almond lid line: thick, sweeping up at the outer corner
    lid = [ec + Vector((-0.016 * sx, -0.006, 0.000)), ec + Vector((-0.006 * sx, -0.0125, 0.0068)), ec + Vector((0.006 * sx, -0.012, 0.0072)), ec + Vector((0.0175 * sx, -0.004, 0.0062))]
    tube(f"lash_{nm}", catmull(lid, 5), 0.0021, M["lash"], head_grp, 6)
    low = [ec + Vector((-0.012 * sx, -0.009, -0.004)), ec + Vector((0.0, -0.0115, -0.0068)), ec + Vector((0.014 * sx, -0.006, -0.0045))]
    tube(f"lowlid_{nm}", catmull(low, 5), 0.0008, M["lash"], head_grp, 5)
    brow = [ec + Vector((-0.017 * sx, -0.0105, 0.016)), ec + Vector((-0.002 * sx, -0.012, 0.0215)), ec + Vector((0.018 * sx, -0.005, 0.0235))]
    tube(f"brow_{nm}", catmull(brow, 5), [0.0028, 0.0024, 0.0014] if False else 0.0024, M["hair"], head_grp, 6, flatten=0.5)

# ------------------------------------------------------------------ mask ---
bm_head = bmesh.new()
bm_head.from_mesh(head.data)
bvh = BVHTree.FromBMesh(bm_head)


def surface_point(direction, offset):
    hit = bvh.ray_cast(HC + direction * 0.3, -direction)
    if hit[0] is None:
        return HC + direction * 0.09
    return hit[0] + direction * offset


rows, cols = 26, 44
verts, faces = [], []
for r in range(rows):
    v = r / (rows - 1)
    for c in range(cols):
        u = c / (cols - 1)
        az = math.radians(-118 + 236 * u)  # around the face, 0 = front (-Y)
        # top edge rides over the nose bridge, dips at the cheeks, rises to the ears
        top = math.radians(-6 - 10 * abs(math.sin(az)) ** 0.7 + 4 * max(0, abs(math.degrees(az)) - 70) / 48)
        bot = math.radians(-78)
        el = top + (bot - top) * v
        d = Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el)))
        p = surface_point(d, 0.0045 + 0.004 * v * (1 - abs(math.sin(az))))
        # mask hangs loose below the chin
        if v > 0.75:
            p += Vector((0, -0.004, -0.004)) * ((v - 0.75) / 0.25)
        verts.append(p)
for r in range(rows - 1):
    for c in range(cols - 1):
        a = r * cols + c
        faces.append((a, a + 1, a + cols + 1, a + cols))
mask = from_pydata("mask", verts, faces, M["mask"], head_grp)
subsurf(mask, 1)
cloth_folds(mask, [(HC + Vector((-0.07, -0.06, -0.06)), HC + Vector((0.07, -0.06, -0.06)), 0.0018, 30, 0.5)], 0.0008, seed=4)
solidify(mask, 0.0025, 1.0)
box_uv_world(mask, 4)
# red YA on the left cheek of the mask, following the reference art
ya_mask = text_mesh("mask_ya", "YA", HC + Vector((0.026, -0.098, -0.04)), 0.024, M["logo"], head_grp, rot=(math.radians(90), 0, math.radians(14)), extrude=0.0012)
# headband strap behind the ears
tube("mask_strap", catmull([surface_point(Vector((0.98, 0.15, -0.1)).normalized(), 0.004), HC + Vector((0.06, 0.07, -0.02)), HC + Vector((0, 0.1, -0.025)), HC + Vector((-0.06, 0.07, -0.02)), surface_point(Vector((-0.98, 0.15, -0.1)).normalized(), 0.004)], 5), (0.008, 0.002), M["mask"], head_grp, 6)

# ------------------------------------------------------------------ hair ---
# Chunky, layered locks flowing from a crown whorl, lifted off the scalp for
# volume, falling under gravity into a heavy fringe over the eyes.
SC = HC + Vector((0, 0.012, 0.03))  # scalp centre
SR = Vector((0.081, 0.097, 0.088))   # scalp radii
WHORL = SC + Vector((0.01, 0.035, 0.085))
cap = Meta("HairCap", resolution=0.006)
cap.ellipsoid(SC + Vector((0, 0.008, 0.004)), (0.086, 0.1, 0.09))
capm = cap.to_mesh("hair_cap", voxel=0.006)
co = mesh_coords(capm)
d = co - np.array(SC)
front = (d[:, 1] < -0.045) & (d[:, 2] < 0.04)
co[front] -= d[front] * 0.2
set_coords(capm, co)
set_mat(capm, M["hair"])
capm.parent = head_grp


def scalp(n):
    return SC + Vector((n.x * SR.x, n.y * SR.y, n.z * SR.z))


def hair_lock(name, root_n, length, width, lift, rng, layer=0, stray=False):
    n = root_n.normalized()
    p = scalp(n)
    # flow direction: away from the whorl along the scalp surface
    away = (p - WHORL)
    away = (away - n * away.dot(n)).normalized() if away.length > 1e-4 else Vector((0, -1, 0))
    frontness = max(0.0, -n.y)
    if frontness > 0.45 and n.z < 0.75:
        # fringe: falls forward then down across the brow, sweeping to the character's left
        away = (away * 0.5 + Vector((0.25, -0.55, -0.35))).normalized()
    pts = [p - n * 0.006]
    clipped = False
    dirv = away
    pos = p + n * lift * 0.5
    pts.append(pos.copy())
    segs = 7
    step = length / segs
    for s in range(segs):
        t = (s + 1) / segs
        gravity = Vector((0, 0, -1)) * (0.35 + 0.9 * t * t) * (0.6 if frontness > 0.45 else 1.0)
        dirv = (dirv + gravity * 0.35 + Vector(rng.normal(0, 0.12, 3))).normalized()
        pos = pos + dirv * step
        rel = pos - SC
        # keep the lock floating over the scalp shell (volume)
        shell = Vector((rel.x / (SR.x + lift), rel.y / (SR.y + lift), rel.z / (SR.z + lift)))
        if shell.length < 1.0:
            pos = SC + Vector((shell.x * (SR.x + lift), shell.y * (SR.y + lift), shell.z * (SR.z + lift))) / shell.length
        # the fringe stops above the lash line so the eyes stay readable;
        # a few strays may cut across between or beside the eyes, never over them
        face_top = HC.z + 0.024 + 0.02 * (abs(pos.x - HC.x) / 0.07) ** 2
        in_face = pos.y < HC.y - 0.055 and abs(pos.x - HC.x) < 0.07 and pos.z < face_top
        cup_rel = Vector((0, pos.y - (HC.y + 0.012), pos.z - HC.z))
        under_cup = abs(pos.x - HC.x) > 0.075 and cup_rel.length < 0.062
        if pos.y < HC.y - 0.092:
            pos.y = HC.y - 0.092 - 0.003 * layer
        over_eye = abs(abs(pos.x - HC.x) - 0.033) < 0.022
        if (in_face and (not stray or over_eye)) or under_cup:
            if in_face:
                pos.z = face_top
            pts.append(pos.copy())
            clipped = True
            break
        pts.append(pos.copy())
    # tip flick
    tip = (pts[-1] - pts[-2]).normalized()
    flick = (tip + Vector(rng.normal(0, 0.6, 3)) * 0.7).normalized()
    if clipped:
        flick = Vector((flick.x, flick.y, max(0.2, abs(flick.z)) * 0.3)).normalized()
    pts.append(pts[-1] + flick * length * (0.05 if clipped else 0.12))
    path = catmull(pts, 3)
    m = len(path)
    widths = []
    for k in range(m):
        u = k / (m - 1)
        w = width * (0.75 + 0.5 * math.sin(min(1, u * 1.6) * math.pi * 0.5)) * (1 - u) ** 1.35 + 0.0006
        widths.append((w, max(0.0012, w * 0.32)))
    return tube(name, path, widths, M["hair"], head_grp, 7, caps=False, twist_up=tuple(n))


rng = np.random.default_rng(11)
locks = []
golden = math.pi * (3 - math.sqrt(5))
for layer, (count, zmin, lift, Lr, Wr) in enumerate(((280, -0.45, 0.008, (0.10, 0.16), (0.015, 0.022)), (210, -0.25, 0.018, (0.10, 0.17), (0.017, 0.026)), (120, 0.1, 0.028, (0.06, 0.11), (0.018, 0.028)))):
    for i in range(count):
        z = 1 - (i + 0.5) / count * (1 - zmin)
        r = math.sqrt(max(0, 1 - z * z))
        th = i * golden + layer * 1.3
        n = Vector((math.cos(th) * r, math.sin(th) * r, z))
        if n.y < -0.62 and n.z < 0.2:
            continue  # face window
        frontness = max(0.0, -n.y)
        L = rng.uniform(*Lr) * (1.0 + 0.35 * frontness + 0.25 * max(0.0, n.y))
        W = rng.uniform(*Wr)
        stray = rng.random() < 0.025
        locks.append(hair_lock(f"lock_{layer}_{i}", n, L, W * (0.55 if stray else 1.0), lift + rng.uniform(0, 0.008), rng, layer, stray))
hair = join(locks + [capm], "hair_mesh")
if os.environ.get("NOHAIR"):
    hair.parent = None  # debug: excluded from the export
decimate(hair, 0.6)

# ------------------------------------------------------------- headphones --
band_pts = []
for k in range(25):
    a = math.radians(-90 + 180 * k / 24)
    band_pts.append(SC + Vector((math.sin(a) * 0.138, 0.02, math.cos(a) * 0.13 + 0.004)))
tube("hp_band", band_pts, (0.012, 0.007), M["rubber"], head_grp, 10)
tube("hp_band_pad", [p + Vector((0, 0, -0.01)) * (1 if abs(p.x - SC.x) < 0.06 else 0) for p in band_pts[7:18]], (0.016, 0.006), M["glove"], head_grp, 10)
for sx, nm in ((1, "l"), (-1, "r")):
    cc = HC + Vector((0.118 * sx, 0.012, 0.0))
    axis_rot = (0, math.radians(90), 0)
    cup = cylinder(f"hp_cup_{nm}", cc, 0.052, 0.042, M["rubber"], head_grp, 40, axis_rot, 0.008)
    cushion = torus(f"hp_cushion_{nm}", cc - Vector((0.022 * sx, 0, 0)), 0.042, 0.013, M["glove"], head_grp, 40, 10, axis_rot)
    ring = torus(f"hp_ring_{nm}", cc + Vector((0.022 * sx, 0, 0)), 0.045, 0.0035, M["neon"], head_grp, 48, 8, axis_rot)
    plate = cylinder(f"hp_plate_{nm}", cc + Vector((0.022 * sx, 0, 0)), 0.039, 0.004, M["steel"], head_grp, 40, axis_rot)
    logo = text_mesh(f"hp_ya_{nm}", "YA", cc + Vector((0.0255 * sx, 0, 0)), 0.034, M["neon"], head_grp, rot=(math.radians(90), 0, math.radians(90 * sx)), extrude=0.0015)
    yoke = tube(f"hp_yoke_{nm}", [cc + Vector((0.005 * sx, 0, 0.045)), cc + Vector((0.008 * sx, 0.01, 0.07)), band_pts[0 if sx < 0 else -1]], 0.005, M["steel"], head_grp, 8)

# ------------------------------------------------------------------ rifle --
# Built along +X in rifle space, then placed across the lap.
rifle = empty("operator_rifle", parent=root)
start = Vector((-0.31, -0.07, 0.725))
end = Vector((0.64, -0.64, 0.62))
axis = (end - start).normalized()
yaw_up = Vector((0, 0, 1))
side = yaw_up.cross(axis).normalized()
upv = axis.cross(side).normalized()
rifle.matrix_world = Matrix((
    (axis.x, side.x, upv.x, start.x), (axis.y, side.y, upv.y, start.y), (axis.z, side.z, upv.z, start.z), (0, 0, 0, 1),
)) @ Matrix.Rotation(math.radians(-28), 4, "X")

scroll = tx.scrollwork(1024, 9, 34, 1.15) * 0.92
base_rgb = np.array([0.012, 0.011, 0.012], np.float32)
gold_rgb = np.array([0.85, 0.56, 0.24], np.float32)
col = base_rgb + (gold_rgb - base_rgb) * scroll[..., None]
gun_col = image_from_array("gun-engraving", np.concatenate([col, np.ones_like(scroll)[..., None]], -1))
mr = np.stack([np.zeros_like(scroll), 0.38 - 0.18 * scroll, 0.55 + 0.45 * scroll, np.ones_like(scroll)], -1)
gun_mr = image_from_array("gun-metalrough", mr)
gun_n = image_from_array("gun-normal", tx.height_to_normal(tx._blur(scroll, 1), 1.6))
M["gun"] = textured_mat("gun_engraved", gun_col, rough=0.35, metal=0.8, normal=gun_n, normal_strength=0.8, mr_image=gun_mr)

R = []


def rbox(name, c, s, m="gun", bw=0.004, rot=(0, 0, 0)):
    o = box(name, c, s, M[m], None, bw, 2, rot)
    R.append(o)
    return o


def rtube(name, pts, r, m="steel", sides=16):
    o = tube(name, pts, r, M[m], None, sides)
    R.append(o)
    return o


# stock (tapered), receiver, grip, curved magazine, handguard, gas tube, barrel
stock = rbox("stock", (0.12, 0, -0.015), (0.26, 0.042, 0.075), bw=0.012)
co = mesh_coords(stock)
co[:, 2] += np.where(co[:, 0] < 0.1, (0.1 - co[:, 0]) * -0.18, 0) * (co[:, 2] < 0)
co[:, 2] *= np.where(co[:, 0] < 0.05, 1.0 + (0.05 - co[:, 0]) * 1.8, 1.0)
set_coords(stock, co)
rbox("butt_pad", (-0.012, 0, -0.03), (0.016, 0.046, 0.11), "rubber", 0.006)
rbox("receiver", (0.36, 0, 0.0), (0.24, 0.046, 0.062), bw=0.006)
rbox("dust_cover", (0.36, 0, 0.035), (0.23, 0.04, 0.012), bw=0.005)
grip = rbox("grip", (0.29, 0, -0.07), (0.032, 0.034, 0.09), bw=0.008, rot=(0, math.radians(-18), 0))
trig = rtube("trigger_guard", catmull([(0.31, 0, -0.03), (0.33, 0, -0.06), (0.37, 0, -0.06), (0.38, 0, -0.03)], 4), 0.004, "steel", 8)
mag_pts = [Vector((0.40 + 0.0, 0, -0.03)), Vector((0.415, 0, -0.10)), Vector((0.445, 0, -0.165)), Vector((0.49, 0, -0.22))]
mag = rtube("magazine", catmull(mag_pts, 6), (0.022, 0.032), "gun", 4)
rbox("handguard", (0.58, 0, -0.004), (0.2, 0.05, 0.058), bw=0.012)
rbox("gas_tube", (0.6, 0, 0.042), (0.2, 0.03, 0.022), "gun", 0.008)
rbox("rail", (0.36, 0, 0.048), (0.2, 0.024, 0.01), "steel", 0.002)
for k in range(12):
    rbox(f"rail_t{k}", (0.27 + k * 0.016, 0, 0.056), (0.008, 0.026, 0.006), "steel", 0.001)
rtube("barrel", [(0.66, 0, 0.0), (0.92, 0, 0.0)], 0.011, "steel", 16)
rtube("muzzle", [(0.92, 0, 0.0), (0.98, 0, 0.0)], 0.017, "steel", 16)
for k in range(4):
    rbox(f"muzzle_port{k}", (0.935 + k * 0.012, 0, 0.012), (0.006, 0.02, 0.012), "rubber", 0.001)
rtube("front_sight", [(0.9, 0, 0.0), (0.9, 0, 0.04)], 0.006, "steel", 8)
rtube("charging", [(0.42, 0.025, 0.02), (0.42, 0.05, 0.02)], 0.006, "gold", 8)
serial = text_mesh("serial", "064532", (0.33, -0.0245, 0.0), 0.016, M["gold"], None, rot=(math.radians(90), 0, 0), extrude=0.0008)
R.append(serial)
for o in R:
    box_uv_world(o, 3.2)
gun = join(R, "rifle_mesh")
gun.parent = rifle
gun.matrix_parent_inverse = Matrix.Identity(4)

# -------------------------------------------------------------- consolidate --


def consolidate(group, name):
    objs = [o for o in bpy.context.scene.objects if o.type == "MESH" and o.parent == group]
    if not objs:
        return None
    return join(objs, name)


body = consolidate(body_grp, "operator_body_mesh")
headm = consolidate(head_grp, "operator_head_mesh")
print("tris body", stats([body]), "head", stats([headm]), "rifle", stats([gun]))
os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
export_glb(OUT, [root, body_grp, head_grp, rifle, body, headm, gun])
print("exported", OUT)
