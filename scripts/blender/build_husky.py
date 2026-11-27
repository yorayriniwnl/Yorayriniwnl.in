import math
import os
import sys
import bpy
import numpy as np
from mathutils import Vector

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "..", ".."))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

from pbr_utils import (
    reset_scene,
    ensure_collection,
    join_objects,
    voxel_sculpt_join,
    create_box,
    create_cylinder,
    create_sphere,
    create_capsule,
    create_3d_text_mesh,
    gen_fur_detail_pbr,
    gen_brushed_metal_pbr,
    gen_leather_pbr,
    gen_tactical_fabric_pbr,
    make_pbr_material,
    export_glb,
    render_preview,
)


def paint_husky_coat_vertex_colors(mesh_obj):
    """Paint realistic high-contrast Siberian Husky double-coat markings onto COLOR_0
    (paired with GPU multi-shell fur in Three.js for lush wolf-coat depth)."""
    me = mesh_obj.data
    if "Color" in me.color_attributes:
        me.color_attributes.remove(me.color_attributes["Color"])
    ca = me.color_attributes.new(name="Color", type='BYTE_COLOR', domain='CORNER')

    verts = me.vertices
    n_verts = len(verts)
    coords = np.empty((n_verts, 3), dtype=np.float32)
    normals = np.empty((n_verts, 3), dtype=np.float32)
    verts.foreach_get("co", coords.ravel())
    verts.foreach_get("normal", normals.ravel())

    x, y, z = coords[:, 0], coords[:, 1], coords[:, 2]
    ax = np.abs(x)
    ny, nz = normals[:, 1], normals[:, 2]

    # Organic fur boundary feathering
    feather = (
        0.024 * np.sin(x * 42.0 + z * 28.0) * np.cos(y * 34.0)
        + 0.012 * np.sin(x * 92.0 - y * 76.0 + z * 68.0)
    )

    mantle = np.zeros(n_verts, dtype=np.float32)
    # Jet-black / dark silver-wolf dorsal saddle wrapping prominently over shoulders, flanks, and haunches
    spine_z = np.clip(0.32 - 0.95 * y, 0.06, 0.56)
    above_belly = np.clip((z - (spine_z - 0.18 + feather)) / 0.10, 0.0, 1.0)
    back_facing = np.clip((y + 0.24 + feather) / 0.10, 0.0, 1.0)
    dorsal = above_belly * back_facing * np.clip(0.88 + nz * 0.45 + ny * 0.45, 0.0, 1.0)
    front_clear = np.clip((y + 0.18 - feather) / 0.07, 0.0, 1.0)
    mantle = np.maximum(mantle, np.clip(dorsal * front_clear * 1.45, 0.0, 1.0))

    haunch = (
        np.clip((y + 0.02 + feather) / 0.10, 0.0, 1.0)
        * np.clip((z - 0.09 + feather) / 0.08, 0.0, 1.0)
        * (z < 0.44)
    )
    mantle = np.maximum(mantle, np.clip(haunch * 1.15, 0.0, 1.0))

    # Head markings: jet-black crown, dark ear backs, iconic widow's peak & eye mask framing white cheeks/muzzle
    in_head = (z > 0.54)
    crown = np.clip((z - (0.675 + 0.16 * np.maximum(0.0, -y - 0.21) + feather)) / 0.034, 0.0, 1.0)
    back_neck = np.clip((y + 0.19 + feather) / 0.06, 0.0, 1.0) * np.clip((z - 0.48) / 0.07, 0.0, 1.0)
    ears = (z > 0.72) & (ax > 0.020)
    ear_dark = np.where(ears, np.clip((ny + 0.58 + feather * 2.5) / 0.48, 0.35, 1.0), 0.0)
    widow_peak = np.exp(-((ax / 0.030) ** 2)) * np.clip((z - 0.676) / 0.022, 0.0, 1.0) * (y < -0.22) * (y > -0.37)
    eye_stripe = np.exp(-(((ax - 0.048) / 0.024) ** 2)) * np.exp(-(((z - 0.706) / 0.018) ** 2)) * (y < -0.25)
    head_dark = np.where(in_head, np.maximum.reduce([crown, back_neck, ear_dark, widow_peak, eye_stripe * 0.92]), 0.0)

    muzzle_white = (y < -0.305) & (z < 0.690)
    cheek_white = (ax > 0.052) & (z < 0.692) & (z > 0.565) & (y < -0.17)
    head_dark = np.where(muzzle_white, head_dark * 0.06, head_dark)
    head_dark = np.where(cheek_white, head_dark * 0.08, head_dark)
    mantle = np.maximum(mantle, head_dark)

    # Curled plush wolf tail: dark charcoal upper brush, snow-white underside
    in_tail = (y > 0.21) | ((y > 0.16) & (z > 0.28))
    tail_dark = np.where(in_tail, np.clip((ny * 0.62 + nz * 0.75 + 0.48 + feather * 2.8), 0.10, 1.0), 0.0)
    mantle = np.where(in_tail, tail_dark, mantle)

    # Crisp snow-white forelegs, chest ruff, and paws
    paws = ((z < 0.25) & (y < -0.05)) | (z < 0.075)
    mantle = np.where(paws, mantle * 0.04, mantle)

    m = np.clip(mantle, 0.0, 1.0)
    white_col = np.array([0.88, 0.87, 0.86], dtype=np.float32)
    silver_col = np.array([0.22, 0.23, 0.26], dtype=np.float32)
    black_col = np.array([0.022, 0.024, 0.028], dtype=np.float32)

    low_t = np.clip(m * 2.1, 0.0, 1.0)[:, None]
    high_t = np.clip((m - 0.36) / 0.64, 0.0, 1.0)[:, None]
    col_v = white_col * (1.0 - low_t) + silver_col * low_t
    col_v = col_v * (1.0 - high_t) + black_col * high_t

    micro = (0.92 + 0.14 * np.sin(x * 185.0 + y * 165.0 + z * 205.0))[:, None]
    col_v = np.clip(col_v * micro, 0.016, 0.94)

    n_loops = len(me.loops)
    loop_vidx = np.empty(n_loops, dtype=np.int32)
    me.loops.foreach_get("vertex_index", loop_vidx)
    loop_rgba = np.ones((n_loops, 4), dtype=np.float32)
    loop_rgba[:, :3] = col_v[loop_vidx]
    ca.data.foreach_set("color", loop_rgba.ravel())
    me.update()


def build_husky_armature(col):
    arm_data = bpy.data.armatures.new("Husky_Armature")
    arm_obj = bpy.data.objects.new("Husky_Armature", arm_data)
    col.objects.link(arm_obj)
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm_data.edit_bones

    def add_bone(name, head, tail, parent_name=None, connect=False):
        b = eb.new(name)
        b.head = Vector(head)
        b.tail = Vector(tail)
        if parent_name is not None:
            b.parent = eb[parent_name]
            b.use_connect = connect
        return b

    add_bone("Pelvis", (0, 0.16, 0.14), (0, 0.05, 0.28))
    add_bone("Spine", (0, 0.05, 0.28), (0, -0.08, 0.44), "Pelvis", connect=True)
    add_bone("Chest", (0, -0.08, 0.44), (0, -0.16, 0.56), "Spine", connect=True)
    add_bone("Neck", (0, -0.16, 0.56), (0, -0.20, 0.67), "Chest", connect=True)
    add_bone("Head", (0, -0.20, 0.67), (0, -0.36, 0.66), "Neck", connect=True)
    add_bone("Ear_L", (0.064, -0.198, 0.745), (0.082, -0.208, 0.90), "Head")
    add_bone("Ear_R", (-0.064, -0.198, 0.745), (-0.082, -0.208, 0.90), "Head")

    for side, sgn in (("L", 1.0), ("R", -1.0)):
        add_bone(f"FrontUpper_{side}", (sgn * 0.098, -0.145, 0.44), (sgn * 0.092, -0.175, 0.24), "Chest")
        add_bone(f"FrontLower_{side}", (sgn * 0.092, -0.175, 0.24), (sgn * 0.088, -0.195, 0.04), f"FrontUpper_{side}", connect=True)
        add_bone(f"FrontPaw_{side}", (sgn * 0.088, -0.195, 0.04), (sgn * 0.088, -0.265, 0.02), f"FrontLower_{side}", connect=True)

    for side, sgn in (("L", 1.0), ("R", -1.0)):
        add_bone(f"HindUpper_{side}", (sgn * 0.132, 0.11, 0.22), (sgn * 0.152, -0.01, 0.10), "Pelvis")
        add_bone(f"HindLower_{side}", (sgn * 0.152, -0.01, 0.10), (sgn * 0.145, 0.13, 0.045), f"HindUpper_{side}", connect=True)
        add_bone(f"HindPaw_{side}", (sgn * 0.145, 0.13, 0.045), (sgn * 0.145, -0.04, 0.02), f"HindLower_{side}", connect=True)

    add_bone("Tail1", (0.00, 0.24, 0.12), (0.06, 0.36, 0.19), "Pelvis")
    add_bone("Tail2", (0.06, 0.36, 0.19), (0.14, 0.39, 0.32), "Tail1", connect=True)
    add_bone("Tail3", (0.14, 0.39, 0.32), (0.17, 0.31, 0.44), "Tail2", connect=True)

    bpy.ops.object.mode_set(mode='OBJECT')
    return arm_obj


def weight_husky_body(body_obj, arm_obj):
    bone_segs = [(b.name, b.head_local.copy(), b.tail_local.copy()) for b in arm_obj.data.bones]
    vgs = {name: body_obj.vertex_groups.new(name=name) for name, _, _ in bone_segs}
    for v in body_obj.data.vertices:
        p = v.co
        dists = []
        for bname, h, t in bone_segs:
            ab = t - h
            u = max(0.0, min(1.0, (p - h).dot(ab) / max(ab.length_squared, 1e-6)))
            d = (p - (h + ab * u)).length
            if "_L" in bname and p.x < -0.01:
                d += 0.8
            if "_R" in bname and p.x > 0.01:
                d += 0.8
            if bname.startswith("Ear") and p.z < 0.71:
                d += 0.5
            if bname.startswith("Tail") and p.y < 0.16:
                d += 0.5
            dists.append((d, bname))
        dists.sort(key=lambda item: item[0])
        d0, b0 = dists[0]
        d1, b1 = dists[1]
        w0 = 1.0 / (d0 ** 4 + 1e-6)
        w1 = 1.0 / (d1 ** 4 + 1e-6)
        s = w0 + w1
        vgs[b0].add([v.index], w0 / s, 'REPLACE')
        if w1 / s > 0.02:
            vgs[b1].add([v.index], w1 / s, 'REPLACE')
    body_obj.parent = arm_obj
    mod = body_obj.modifiers.new("Armature", 'ARMATURE')
    mod.object = arm_obj


def bind_rigid(obj, bone_name, arm_obj):
    vg = obj.vertex_groups.get(bone_name) or obj.vertex_groups.new(name=bone_name)
    vg.add([v.index for v in obj.data.vertices], 1.0, 'REPLACE')
    obj.parent = arm_obj
    mod = obj.modifiers.new("Armature", 'ARMATURE')
    mod.object = arm_obj


def build_husky():
    scene = reset_scene()
    col = ensure_collection("Husky_Rigged")
    col_lights = ensure_collection("Preview_Lights")

    fur_detail = gen_fur_detail_pbr("HuskyFurDetail", res=512, seed=91)
    gear_metal = gen_brushed_metal_pbr("HuskyGearMetal", res=512, seed=47, base_rgb=(0.042, 0.044, 0.050), rough_base=0.32)
    harness_fab = gen_tactical_fabric_pbr("HuskyHarness", res=512, seed=69, base_rgb=(0.028, 0.026, 0.030))
    rubber_pbr = gen_leather_pbr("HuskyGasMaskRubber", res=512, seed=33, base_rgb=(0.020, 0.020, 0.024), tufted=False)

    mats = {
        "fur_coat": make_pbr_material("Mat_HuskyDoubleCoat", albedo_img=fur_detail["albedo"],
                                      roughness_img=fur_detail["roughness"], normal_img=fur_detail["normal"],
                                      normal_strength=0.45, sheen_weight=0.55, use_vertex_color=True),
        "eyelid": make_pbr_material("Mat_HuskyEyelid", base_color=(0.015, 0.015, 0.018), roughness=0.45),
        # Realistic piercing glowing crimson wolf iris (not oversized white/pink blob)
        "eye_crimson": make_pbr_material("Mat_HuskyCrimsonEye", base_color=(0.55, 0.04, 0.04), roughness=0.06,
                                         emission_color=(0.95, 0.06, 0.05), emission_strength=2.2, coat_weight=0.95),
        "eye_pupil": make_pbr_material("Mat_HuskyPupil", base_color=(0.008, 0.008, 0.010), roughness=0.04, coat_weight=0.95),
        "helmet": make_pbr_material("Mat_K9Helmet", albedo_img=gear_metal["albedo"], metallic=0.34,
                                    roughness_img=gear_metal["roughness"], normal_img=gear_metal["normal"], normal_strength=0.30),
        "gasmask": make_pbr_material("Mat_K9GasMask", albedo_img=rubber_pbr["albedo"], metallic=0.12,
                                     roughness_img=rubber_pbr["roughness"], normal_img=rubber_pbr["normal"], normal_strength=0.35),
        "harness": make_pbr_material("Mat_K9Harness", albedo_img=harness_fab["albedo"],
                                     roughness_img=harness_fab["roughness"], normal_img=harness_fab["normal"]),
        "gunmetal": make_pbr_material("Mat_K9Gunmetal", albedo_img=gear_metal["albedo"], metallic=0.84,
                                      roughness_img=gear_metal["roughness"]),
        "crimson_ya": make_pbr_material("Mat_K9CrimsonAccent", base_color=(0.82, 0.05, 0.07), roughness=0.28,
                                        emission_color=(0.95, 0.05, 0.07), emission_strength=1.8),
        "nvg_lens": make_pbr_material("Mat_K9NVGLens", base_color=(0.24, 0.02, 0.02), metallic=0.5, roughness=0.06,
                                      emission_color=(0.95, 0.06, 0.06), emission_strength=1.4),
        "gold": make_pbr_material("Mat_K9BuckleGold", base_color=(0.84, 0.62, 0.22), metallic=0.92, roughness=0.24),
    }

    arm_obj = build_husky_armature(col)

    # =========================================================================
    # 1. ANATOMICAL VOXEL-SCULPTED SITTING SIBERIAN HUSKY WITH FUR RUFF VOLUME
    # =========================================================================
    vols = [
        create_sphere("HV_Rump", radius=0.155, scale=(1.04, 1.10, 0.86), location=(0, 0.17, 0.135), col=col),
        create_sphere("HV_Pelvis", radius=0.152, scale=(1.00, 1.15, 0.95), location=(0, 0.07, 0.245), col=col),
        create_sphere("HV_Ribcage", radius=0.160, scale=(0.98, 1.18, 1.08), location=(0, -0.05, 0.375), col=col),
        create_sphere("HV_Chest", radius=0.158, scale=(0.98, 1.06, 1.16), location=(0, -0.145, 0.470), col=col),
        # Thick wolf chest ruff & neck mane
        create_sphere("HV_ChestMane", radius=0.132, scale=(1.06, 0.88, 1.24), location=(0, -0.205, 0.495),
                      rotation=(math.radians(-16), 0, 0), col=col),
        create_capsule("HV_Neck", (0, -0.155, 0.50), (0, -0.205, 0.675), 0.118, 0.092, segments=18, col=col),
        create_sphere("HV_Cranium", radius=0.104, scale=(0.96, 1.10, 0.94), location=(0, -0.215, 0.692), col=col),
        create_sphere("HV_BrowRidge", radius=0.068, scale=(1.12, 0.80, 0.68), location=(0, -0.280, 0.720), col=col),
        create_capsule("HV_Muzzle", (0, -0.275, 0.674), (0, -0.412, 0.658), 0.052, 0.028, segments=18, col=col),
        create_capsule("HV_Jaw", (0, -0.268, 0.640), (0, -0.392, 0.636), 0.040, 0.020, segments=14, col=col),
    ]
    for sgn in (-1.0, 1.0):
        # Plush Siberian cheek fur ruffs
        vols.append(create_sphere(f"HV_CheekRuff_{sgn}", radius=0.066, scale=(0.88, 1.08, 0.80),
                                  location=(sgn * 0.074, -0.220, 0.654),
                                  rotation=(0, 0, math.radians(-sgn * 24)), col=col))
        vols.append(create_sphere(f"HV_ShoulderFur_{sgn}", radius=0.088, scale=(0.84, 1.05, 1.15),
                                  location=(sgn * 0.118, -0.145, 0.475), col=col))
        # Tall pointed Siberian Husky ears poking cleanly above the tactical K9 helmet!
        vols.append(create_cylinder(f"HV_Ear_{sgn}", radius=0.044, radius2=0.007, depth=0.180, segments=14,
                                    location=(sgn * 0.068, -0.194, 0.822),
                                    rotation=(math.radians(-6), math.radians(sgn * 14), math.radians(-sgn * 16)), col=col))
        vols.append(create_capsule(f"HV_FrontUpper_{sgn}", (sgn * 0.100, -0.145, 0.45),
                                   (sgn * 0.092, -0.175, 0.23), 0.064, 0.046, segments=16, col=col))
        vols.append(create_capsule(f"HV_FrontLower_{sgn}", (sgn * 0.092, -0.175, 0.23),
                                   (sgn * 0.088, -0.195, 0.038), 0.044, 0.036, segments=16, col=col))
        vols.append(create_sphere(f"HV_FrontPaw_{sgn}", radius=0.046, scale=(0.95, 1.42, 0.62),
                                  location=(sgn * 0.088, -0.228, 0.028), col=col))
        vols.append(create_sphere(f"HV_HindThigh_{sgn}", radius=0.120, scale=(0.78, 1.40, 1.06),
                                  location=(sgn * 0.132, 0.095, 0.195),
                                  rotation=(math.radians(-20), 0, math.radians(-sgn * 10)), col=col))
        vols.append(create_capsule(f"HV_HindLower_{sgn}", (sgn * 0.145, 0.140, 0.088),
                                   (sgn * 0.145, -0.025, 0.042), 0.048, 0.036, segments=14, col=col))
        vols.append(create_sphere(f"HV_HindPaw_{sgn}", radius=0.048, scale=(0.96, 1.44, 0.62),
                                  location=(sgn * 0.145, -0.055, 0.028), col=col))

    # Full curled wolf tail brush
    for idx, (p0, p1, r0, r1) in enumerate((
        ((0.00, 0.23, 0.11), (0.06, 0.36, 0.19), 0.062, 0.078),
        ((0.06, 0.36, 0.19), (0.14, 0.39, 0.32), 0.082, 0.086),
        ((0.14, 0.39, 0.32), (0.17, 0.31, 0.44), 0.082, 0.064),
        ((0.17, 0.31, 0.44), (0.12, 0.20, 0.47), 0.058, 0.022),
    )):
        vols.append(create_capsule(f"HV_Tail_{idx}", p0, p1, r0, r1, segments=14, col=col))

    # Clean optimized ~12k-tri mesh so Three.js 10-layer GPU shell-fur runs at locked 60+ FPS!
    husky_body = voxel_sculpt_join(vols, "Husky_SculptedBody", voxel_size=0.011, smooth_iters=14,
                                   decimate_ratio=0.20, mat=mats["fur_coat"], col=col, uv_scale=2.6)
    paint_husky_coat_vertex_colors(husky_body)
    weight_husky_body(husky_body, arm_obj)

    # =========================================================================
    # 2. PIERCING CRIMSON WOLF EYES + COMPACT SNUG K9 TACTICAL GEAR (NO FLOATING/OVERSIZED PARTS!)
    # =========================================================================
    eye_parts = []
    for sgn in (-1.0, 1.0):
        eye_parts.append(create_sphere(f"Husky_Eyelid_{sgn}", radius=0.019, scale=(1.24, 0.72, 0.60), segments=14, rings=10,
                                       location=(sgn * 0.045, -0.308, 0.703),
                                       rotation=(math.radians(10), math.radians(-sgn * 16), math.radians(-sgn * 24)),
                                       mat=mats["eyelid"], col=col))
        eye_parts.append(create_sphere(f"Husky_UpperLid_{sgn}", radius=0.019, scale=(1.26, 0.80, 0.44), segments=12, rings=8,
                                       location=(sgn * 0.046, -0.314, 0.710),
                                       rotation=(math.radians(20), math.radians(-sgn * 18), math.radians(-sgn * 24)),
                                       mat=mats["eyelid"], col=col))
        eye_parts.append(create_sphere(f"Husky_CrimsonEye_{sgn}", radius=0.0135, scale=(1.05, 0.80, 0.76), segments=14, rings=10,
                                       location=(sgn * 0.047, -0.314, 0.701),
                                       rotation=(math.radians(10), math.radians(-sgn * 16), math.radians(-sgn * 24)),
                                       mat=mats["eye_crimson"], col=col))
        eye_parts.append(create_sphere(f"Husky_Pupil_{sgn}", radius=0.0065, scale=(0.95, 0.68, 0.84), segments=10, rings=8,
                                       location=(sgn * 0.049, -0.322, 0.700),
                                       rotation=(math.radians(10), math.radians(-sgn * 16), math.radians(-sgn * 24)),
                                       mat=mats["eye_pupil"], col=col))
    bind_rigid(join_objects(eye_parts, "Husky_Eyes", col=col), "Head", arm_obj)

    # Snug Tactical K9 Helmet + Subtle Crimson YA + Sleek Flipped-Up NVG + Compact Ear-Pro
    helm_parts = [
        create_sphere("K9_HelmetBrow", radius=0.095, scale=(1.02, 1.05, 0.50), segments=22, rings=14,
                      location=(0, -0.226, 0.752), rotation=(math.radians(10), 0, 0),
                      mat=mats["helmet"], col=col),
        create_3d_text_mesh("K9_HelmetYA", "YA", size=0.026, extrude=0.0025, bevel_depth=0.0004,
                            location=(0.015, -0.320, 0.754), rotation=(math.radians(78), 0, math.radians(-10)),
                            mat=mats["crimson_ya"], col=col),
        create_box("K9_NVGMount", (0.036, 0.030, 0.028), location=(-0.048, -0.305, 0.782),
                   rotation=(math.radians(-18), math.radians(-14), 0), mat=mats["gunmetal"], col=col, bevel=0.004),
        create_cylinder("K9_NVGTube1", radius=0.018, depth=0.072, segments=16,
                        location=(-0.062, -0.332, 0.784), rotation=(math.radians(74), 0, math.radians(-22)),
                        mat=mats["helmet"], col=col),
        create_cylinder("K9_NVGLens1", radius=0.013, depth=0.006, segments=16,
                        location=(-0.074, -0.366, 0.776), rotation=(math.radians(74), 0, math.radians(-22)),
                        mat=mats["nvg_lens"], col=col),
        create_cylinder("K9_NVGTube2", radius=0.015, depth=0.062, segments=14,
                        location=(-0.034, -0.336, 0.800), rotation=(math.radians(72), 0, math.radians(-14)),
                        mat=mats["helmet"], col=col),
    ]
    for sgn in (-1.0, 1.0):
        helm_parts.append(create_cylinder(f"K9_EarProCup_{sgn}", radius=0.038, depth=0.028, segments=20,
                                          location=(sgn * 0.100, -0.218, 0.692), rotation=(0, math.pi * 0.5, 0),
                                          mat=mats["helmet"], col=col))
        helm_parts.append(create_cylinder(f"K9_EarProRing_{sgn}", radius=0.039, depth=0.006, segments=20,
                                          location=(sgn * 0.108, -0.218, 0.692), rotation=(0, math.pi * 0.5, 0),
                                          mat=mats["gunmetal"], col=col))
    bind_rigid(join_objects(helm_parts, "Husky_K9HelmetNVG", col=col), "Head", arm_obj)

    # Compact, Form-Fitting Canine Tactical Respirator Mask (hugs snout cleanly, NO oversized soup can!)
    mask_parts = [
        create_capsule("K9_MaskSnout", (0, -0.312, 0.660), (0, -0.398, 0.650), 0.048, 0.036,
                       segments=20, mat=mats["gasmask"], col=col),
        create_cylinder("K9_MainFilter", radius=0.034, depth=0.034, segments=24,
                        location=(0, -0.422, 0.644), rotation=(math.radians(82), 0, 0),
                        mat=mats["gasmask"], col=col),
        create_cylinder("K9_FilterCrimsonRing", radius=0.0355, depth=0.007, segments=24,
                        location=(0, -0.436, 0.642), rotation=(math.radians(82), 0, 0),
                        mat=mats["crimson_ya"], col=col),
        create_cylinder("K9_FilterCenterCap", radius=0.024, depth=0.008, segments=20,
                        location=(0, -0.440, 0.641), rotation=(math.radians(82), 0, 0),
                        mat=mats["gunmetal"], col=col),
        # Compact side cheek intake valves
        create_cylinder("K9_SideValveL", radius=0.017, depth=0.018, segments=14,
                        location=(0.044, -0.372, 0.644), rotation=(0, math.pi * 0.5, math.radians(-26)),
                        mat=mats["gunmetal"], col=col),
        create_cylinder("K9_SideValveR", radius=0.017, depth=0.018, segments=14,
                        location=(-0.044, -0.372, 0.644), rotation=(0, math.pi * 0.5, math.radians(26)),
                        mat=mats["gunmetal"], col=col),
        create_cylinder("K9_SideRingL", radius=0.013, depth=0.005, segments=14,
                        location=(0.052, -0.376, 0.644), rotation=(0, math.pi * 0.5, math.radians(-26)),
                        mat=mats["crimson_ya"], col=col),
        create_cylinder("K9_SideRingR", radius=0.013, depth=0.005, segments=14,
                        location=(-0.052, -0.376, 0.644), rotation=(0, math.pi * 0.5, math.radians(26)),
                        mat=mats["crimson_ya"], col=col),
    ]
    bind_rigid(join_objects(mask_parts, "Husky_K9GasMask", col=col), "Head", arm_obj)

    # Flush-Fitted K9 Tactical Chest Harness & Straps hugging chest ruff cleanly
    har_parts = [
        create_cylinder("K9_CollarBelt", radius=0.130, depth=0.038, segments=24,
                        location=(0, -0.192, 0.562), rotation=(math.radians(24), 0, 0),
                        mat=mats["harness"], col=col),
        create_cylinder("K9_ChestStrap", radius=0.178, depth=0.044, segments=24,
                        location=(0, -0.125, 0.448), rotation=(math.radians(36), 0, 0),
                        mat=mats["harness"], col=col),
        create_box("K9_ChestPouch", (0.096, 0.030, 0.082), location=(0, -0.328, 0.478),
                   rotation=(math.radians(-14), 0, 0), mat=mats["gasmask"], col=col, bevel=0.007),
        create_box("K9_ChestCrimsonBar", (0.054, 0.008, 0.012), location=(0, -0.344, 0.492),
                   rotation=(math.radians(-14), 0, 0), mat=mats["crimson_ya"], col=col),
        create_box("K9_ChestBuckle", (0.034, 0.014, 0.022), location=(0, -0.326, 0.538),
                   rotation=(math.radians(-14), 0, 0), mat=mats["gold"], col=col, bevel=0.003),
    ]
    bind_rigid(join_objects(har_parts, "Husky_K9Harness", col=col), "Chest", arm_obj)

    # =========================================================================
    # 3. EXPORT OPTIMIZED RIGGED TACTICAL HUSKY.GLB
    # =========================================================================
    glb_path = os.path.join(REPO_ROOT, "public", "models", "playable-war-room", "husky.glb")
    export_glb(glb_path, export_apply=False, export_skins=True, export_lights=False)

    # Preview render
    world = scene.world
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs["Color"].default_value = (0.045, 0.015, 0.018, 1.0)
        bg.inputs["Strength"].default_value = 0.75

    def add_light(name, loc, energy, color, size=1.4, rot=(0, 0, 0)):
        ld = bpy.data.lights.new(name=name, type='AREA')
        ld.energy = energy
        ld.color = color
        ld.size = size
        lo = bpy.data.objects.new(name, ld)
        lo.location = loc
        lo.rotation_euler = rot
        col_lights.objects.link(lo)

    add_light("Key_Warm", (-1.4, -1.8, 1.6), 175.0, (1.0, 0.94, 0.88), size=1.6, rot=(math.radians(48), 0, math.radians(-38)))
    add_light("Rim_Crimson", (1.6, 1.4, 1.4), 240.0, (1.0, 0.14, 0.14), size=1.5, rot=(math.radians(-52), 0, math.radians(135)))
    add_light("Fill_Soft", (1.4, -1.5, 0.9), 75.0, (0.72, 0.78, 0.90), size=1.6, rot=(math.radians(72), 0, math.radians(45)))

    preview_dir = os.path.join(REPO_ROOT, "scripts", "blender", "previews")
    render_preview(os.path.join(preview_dir, "husky_aaa_34.png"),
                   cam_pos=(-1.05, -1.52, 0.78), target_pos=(0.02, -0.08, 0.46), lens=45.0)


if __name__ == "__main__":
    build_husky()
