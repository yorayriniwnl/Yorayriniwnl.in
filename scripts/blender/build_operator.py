import math
import os
import sys
import bpy
from mathutils import Vector, Euler

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "..", ".."))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

from pbr_utils import (
    reset_scene,
    ensure_collection,
    join_objects,
    create_box,
    create_cylinder,
    create_capsule,
    create_3d_text_mesh,
    gen_brushed_metal_pbr,
    gen_ak_gold_filigree_pbr,
    gen_leather_pbr,
    make_pbr_material,
    export_glb,
    render_preview,
)


def build_gold_engraved_ak(mats, col):
    """Detailed 24K baroque gold-engraved AK-47 with '064532' forend stamp and curved banana mag."""
    parts = []
    parts.append(create_box("AK_Receiver", (0.042, 0.26, 0.078), location=(0, -0.095, 0.088),
                            mat=mats["gold_engraved"], col=col, bevel=0.005, uv_scale=3.8))
    parts.append(create_cylinder("AK_DustCover", radius=0.021, depth=0.24, segments=14,
                                 location=(0, -0.092, 0.128), rotation=(math.pi * 0.5, 0, 0),
                                 mat=mats["gunmetal"], col=col))
    parts.append(create_box("AK_TopGoldLine", (0.011, 0.23, 0.005), location=(0, -0.092, 0.148),
                            mat=mats["gold_pure"], col=col))
    parts.append(create_box("AK_RearSight", (0.032, 0.052, 0.022), location=(0, -0.225, 0.144),
                            mat=mats["gunmetal"], col=col, bevel=0.003))
    parts.append(create_box("AK_BoltCarrier", (0.012, 0.105, 0.016), location=(-0.024, -0.12, 0.114),
                            mat=mats["gold_pure"], col=col, bevel=0.002))
    parts.append(create_box("AK_LowerHandguard", (0.042, 0.22, 0.054), location=(0, -0.345, 0.090),
                            mat=mats["gold_engraved"], col=col, bevel=0.007, uv_scale=4.2))
    parts.append(create_cylinder("AK_GasTube", radius=0.014, depth=0.21, segments=14,
                                 location=(0, -0.345, 0.128), rotation=(math.pi * 0.5, 0, 0),
                                 mat=mats["gunmetal"], col=col))
    parts.append(create_box("AK_HandguardCollar", (0.046, 0.020, 0.064), location=(0, -0.455, 0.100),
                            mat=mats["gold_pure"], col=col, bevel=0.003))
    for sgn, rot_z in ((-1, -math.pi * 0.5), (1, math.pi * 0.5)):
        parts.append(create_3d_text_mesh(f"AK_Serial_{sgn}", "064532", size=0.018, extrude=0.0018,
                                         bevel_depth=0.0003, location=(sgn * 0.022, -0.335, 0.090),
                                         rotation=(math.pi * 0.5, 0, rot_z), mat=mats["gold_pure"], col=col))
    parts.append(create_cylinder("AK_Barrel", radius=0.0105, depth=0.36, segments=14,
                                 location=(0, -0.60, 0.098), rotation=(math.pi * 0.5, 0, 0),
                                 mat=mats["gunmetal"], col=col))
    parts.append(create_cylinder("AK_CleanRod", radius=0.0038, depth=0.30, segments=8,
                                 location=(0, -0.58, 0.078), rotation=(math.pi * 0.5, 0, 0),
                                 mat=mats["gold_pure"], col=col))
    parts.append(create_box("AK_GasBlock", (0.024, 0.034, 0.052), location=(0, -0.505, 0.116),
                            mat=mats["gunmetal"], col=col, bevel=0.003))
    parts.append(create_box("AK_FrontSight", (0.022, 0.030, 0.064), location=(0, -0.735, 0.122),
                            mat=mats["gunmetal"], col=col, bevel=0.003))
    parts.append(create_cylinder("AK_MuzzleBrake", radius=0.014, depth=0.054, segments=14,
                                 location=(0, -0.79, 0.098), rotation=(math.pi * 0.5, 0, 0),
                                 mat=mats["gold_pure"], col=col))
    for idx, (loc, pitch, h) in enumerate((
        ((0, -0.175, -0.004), 10.0, 0.088),
        ((0, -0.194, -0.086), 22.0, 0.088),
        ((0, -0.230, -0.162), 34.0, 0.084),
    )):
        parts.append(create_box(f"AK_BananaMag_{idx}", (0.027, 0.062, h), location=loc,
                                rotation=(math.radians(-pitch), 0, 0),
                                mat=mats["gold_engraved"], col=col, bevel=0.004, uv_scale=4.5))
    parts.append(create_box("AK_MagBaseGold", (0.031, 0.066, 0.014), location=(0, -0.256, -0.204),
                            rotation=(math.radians(-36), 0, 0), mat=mats["gold_pure"], col=col, bevel=0.002))
    parts.append(create_box("AK_PistolGrip", (0.032, 0.042, 0.122), location=(0, 0.018, -0.016),
                            rotation=(math.radians(24), 0, 0), mat=mats["obsidian"], col=col, bevel=0.006))
    parts.append(create_box("AK_TriggerGuard", (0.018, 0.070, 0.007), location=(0, -0.056, 0.018),
                            mat=mats["gold_pure"], col=col))
    parts.append(create_box("AK_StockNeck", (0.036, 0.115, 0.062), location=(0, 0.088, 0.072),
                            rotation=(math.radians(10), 0, 0), mat=mats["gold_engraved"], col=col, bevel=0.007, uv_scale=4.0))
    parts.append(create_box("AK_StockBody", (0.040, 0.20, 0.112), location=(0, 0.220, 0.044),
                            rotation=(math.radians(12), 0, 0), mat=mats["gold_engraved"], col=col, bevel=0.009, uv_scale=3.6))
    parts.append(create_box("AK_Buttplate", (0.042, 0.015, 0.118), location=(0, 0.322, 0.022),
                            rotation=(math.radians(12), 0, 0), mat=mats["gold_pure"], col=col, bevel=0.003))
    rifle = join_objects(parts, "Op_GoldEngravedAK", col=col)
    return rifle


def bind_to_mixamo_bone(obj, bone_name, arm_obj):
    """Attach a world-space mesh (placed in REST pose coordinates) cleanly to a Mixamo Armature bone."""
    # Bake world location/rot/scale directly into mesh vertices at identity transform
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    # Convert world meters -> arm_obj local coordinates (Mixamo Soldier arm_obj has scale=0.01!)
    inv_arm = arm_obj.matrix_world.inverted()
    for v in obj.data.vertices:
        v.co = inv_arm @ v.co
    obj.data.update()

    obj.parent = arm_obj
    obj.matrix_parent_inverse.identity()
    vg = obj.vertex_groups.get(bone_name) or obj.vertex_groups.new(name=bone_name)
    vg.add([v.index for v in obj.data.vertices], 1.0, 'REPLACE')
    mod = obj.modifiers.new("Armature", 'ARMATURE')
    mod.object = arm_obj


def upgrade_vanguard_materials():
    """Restyle Mixamo Vanguard's real baked armor textures into Obsidian + Crimson Tactical Spec-Ops."""
    body_mat = bpy.data.materials.get("VanguardBodyMat")
    if body_mat and body_mat.use_nodes:
        nt = body_mat.node_tree
        bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if bsdf:
            bc = bsdf.inputs["Base Color"]
            # Darken original metallic armor diffuse into rich stealth obsidian-crimson carbon armor
            mix = nt.nodes.new("ShaderNodeMix")
            mix.data_type = 'RGBA'
            mix.blend_type = 'MULTIPLY'
            mix.inputs[0].default_value = 1.0
            rgba_in = [i for i in mix.inputs if i.type == 'RGBA']
            rgba_out = [o for o in mix.outputs if o.type == 'RGBA']
            rgba_in[1].default_value = (0.16, 0.055, 0.062, 1.0)
            if bc.is_linked:
                src = bc.links[0].from_socket
                nt.links.remove(bc.links[0])
                nt.links.new(src, rgba_in[0])
            else:
                rgba_in[0].default_value = (0.5, 0.5, 0.5, 1.0)
            nt.links.new(rgba_out[0], bc)
            bsdf.inputs["Metallic"].default_value = 0.58
            bsdf.inputs["Roughness"].default_value = 0.34
            if "Coat Weight" in bsdf.inputs:
                bsdf.inputs["Coat Weight"].default_value = 0.25
                bsdf.inputs["Coat Roughness"].default_value = 0.24
        for n in nt.nodes:
            if n.type == 'TEX_IMAGE' and n.image:
                try:
                    n.image.pack()
                except Exception:
                    pass

    visor_mat = bpy.data.materials.get("Vanguard_VisorMat")
    if visor_mat and visor_mat.use_nodes:
        nt = visor_mat.node_tree
        bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if bsdf:
            for l in list(bsdf.inputs["Base Color"].links):
                nt.links.remove(l)
            bsdf.inputs["Base Color"].default_value = (0.03, 0.004, 0.005, 1.0)
            bsdf.inputs["Metallic"].default_value = 0.94
            bsdf.inputs["Roughness"].default_value = 0.06
            bsdf.inputs["Emission Color"].default_value = (0.95, 0.05, 0.04, 1.0)
            bsdf.inputs["Emission Strength"].default_value = 0.55


def build_operator():
    scene = reset_scene()
    col_acc = ensure_collection("Operator_YA_Gear")
    col_lights = ensure_collection("Preview_Lights")

    soldier_path = os.path.join(SCRIPT_DIR, "aaa_assets", "hero", "Soldier.glb")
    if not os.path.exists(soldier_path):
        raise FileNotFoundError(f"Run scripts/blender/fetch_aaa_assets.py first! Missing {soldier_path}")

    bpy.ops.import_scene.gltf(filepath=soldier_path)

    # Remove unused Icosphere from Soldier.glb
    ico = bpy.data.objects.get("Icosphere")
    if ico:
        bpy.data.objects.remove(ico, do_unlink=True)

    arm_obj = bpy.data.objects["Character"]
    # Switch to REST pose while placing and skinning YA attachments so bone-binding is exact!
    arm_obj.data.pose_position = 'REST'
    bpy.context.view_layer.update()

    upgrade_vanguard_materials()

    # Materials for YA Tactical Headphones, Chest Emblem, Red Dog-Tag, and 24K Gold-Engraved AK-47
    gun_pbr = gen_brushed_metal_pbr("OpGunmetal", res=512, seed=45, base_rgb=(0.050, 0.052, 0.058), rough_base=0.26)
    ak_gold_pbr = gen_ak_gold_filigree_pbr("AKBaroqueGold", res=1024, seed=55)
    leather_pbr = gen_leather_pbr("OpGearLeather", res=512, seed=39, base_rgb=(0.024, 0.022, 0.026), tufted=False)

    mats = {
        "gunmetal": make_pbr_material("Mat_OpGunmetal", albedo_img=gun_pbr["albedo"], metallic=0.88,
                                      roughness_img=gun_pbr["roughness"], normal_img=gun_pbr["normal"], normal_strength=0.25),
        "gold_engraved": make_pbr_material("Mat_AK24KFiligree", albedo_img=ak_gold_pbr["albedo"], metallic=0.94,
                                           roughness_img=ak_gold_pbr["roughness"], normal_img=ak_gold_pbr["normal"],
                                           normal_strength=0.88, coat_weight=0.55),
        "gold_pure": make_pbr_material("Mat_AK24KGold", base_color=(0.94, 0.72, 0.24), metallic=0.98,
                                       roughness=0.16, coat_weight=0.45),
        "obsidian": make_pbr_material("Mat_OpObsidian", base_color=(0.018, 0.018, 0.022), metallic=0.12, roughness=0.45),
        "leather": make_pbr_material("Mat_OpLeather", albedo_img=leather_pbr["albedo"],
                                     roughness_img=leather_pbr["roughness"], normal_img=leather_pbr["normal"]),
        "crimson_ya": make_pbr_material("Mat_OpCrimsonYA", base_color=(0.90, 0.05, 0.07), roughness=0.22,
                                        emission_color=(1.0, 0.06, 0.07), emission_strength=3.4),
        "silver": make_pbr_material("Mat_OpSilver", base_color=(0.76, 0.78, 0.82), metallic=0.96, roughness=0.18),
    }

    # =========================================================================
    # 1. OVER-EAR BLACK & CRIMSON-LED "YA" TACTICAL HEADPHONES (mixamorig:Head)
    #    REST HEAD bounds: X=[-0.10..+0.10], Y=[-0.12..+0.11], Z=[1.57..1.78] (front=+Y)
    # =========================================================================
    hp_parts = []
    hb_pts = []
    for k in range(13):
        ang = math.radians(-10 + 200 * (k / 12.0))
        hb_pts.append((0.118 * math.cos(ang), -0.020, 1.676 + 0.118 * math.sin(ang)))
    for k in range(len(hb_pts) - 1):
        hp_parts.append(create_capsule(f"HP_Band_{k}", hb_pts[k], hb_pts[k + 1], 0.012, 0.012,
                                       segments=10, mat=mats["gunmetal"], col=col_acc))
    for sgn, rot_z in ((-1.0, -math.pi * 0.5), (1.0, math.pi * 0.5)):
        hp_parts.append(create_cylinder(f"HP_Cushion_{sgn}", radius=0.048, depth=0.022, segments=20,
                                        location=(sgn * 0.108, -0.018, 1.670), rotation=(0, math.pi * 0.5, 0),
                                        mat=mats["leather"], col=col_acc))
        hp_parts.append(create_cylinder(f"HP_Cup_{sgn}", radius=0.044, depth=0.028, segments=20,
                                        location=(sgn * 0.126, -0.018, 1.670), rotation=(0, math.pi * 0.5, 0),
                                        mat=mats["gunmetal"], col=col_acc))
        hp_parts.append(create_cylinder(f"HP_RedRing_{sgn}", radius=0.046, depth=0.007, segments=20,
                                        location=(sgn * 0.132, -0.018, 1.670), rotation=(0, math.pi * 0.5, 0),
                                        mat=mats["crimson_ya"], col=col_acc))
        hp_parts.append(create_3d_text_mesh(f"HP_YA_{sgn}", "YA", size=0.030, extrude=0.0025, bevel_depth=0.0004,
                                            location=(sgn * 0.143, -0.018, 1.670),
                                            rotation=(math.pi * 0.5, 0, rot_z), mat=mats["crimson_ya"], col=col_acc))
    hp_obj = join_objects(hp_parts, "Op_YAHeadphones", col=col_acc)
    bind_to_mixamo_bone(hp_obj, "mixamorig:Head", arm_obj)

    # =========================================================================
    # 2. FRONT CHEST "YA" INSIGNIA + GLOWING RED DOG-TAG (mixamorig:Spine2)
    #    REST CHEST front surface at Y=+0.148, Z=[1.26..1.46]
    # =========================================================================
    chest_parts = [
        create_box("Op_ChestBadgePlate", (0.088, 0.012, 0.048), location=(0, 0.150, 1.375),
                   mat=mats["gunmetal"], col=col_acc, bevel=0.003),
        create_3d_text_mesh("Op_ChestYA", "YA", size=0.034, extrude=0.003, bevel_depth=0.0005,
                            location=(0, 0.158, 1.375), rotation=(math.pi * 0.5, 0, math.pi),
                            mat=mats["crimson_ya"], col=col_acc),
        create_box("Op_RedDogTag", (0.026, 0.006, 0.046), location=(0, 0.155, 1.305),
                   mat=mats["crimson_ya"], col=col_acc, bevel=0.002),
    ]
    chest_obj = join_objects(chest_parts, "Op_ChestInsignia", col=col_acc)
    bind_to_mixamo_bone(chest_obj, "mixamorig:Spine2", arm_obj)

    # =========================================================================
    # 3. 24K GOLD-ENGRAVED AK-47 SLUNG DIAGONALLY ACROSS BACK (mixamorig:Spine2)
    #    REST CHEST back surface at Y=-0.225 -> mount cleanly at Y=-0.242!
    #    In 3rd-person view, the player walks behind the Operator and sees this
    #    gleaming 24K baroque gold AK slung diagonally across his back!
    # =========================================================================
    ak = build_gold_engraved_ak(mats, col_acc)
    # Local AK: barrel along -Y, stock along +Y, magazine along -Z, thickness along X.
    # Rotate so receiver lies flat against his back (Y=-0.245), stock upper-right (+X,+Z), barrel down-left (-X,-Z),
    # curved gold banana magazine facing cleanly outward/downward (-Y) with zero clipping!
    ak.scale = (0.94, 0.94, 0.94)
    ak.rotation_euler = Euler((math.radians(-48), math.radians(-18), math.radians(-90)), 'XYZ')
    ak.location = Vector((-0.08, -0.255, 1.32))
    bind_to_mixamo_bone(ak, "mixamorig:Spine2", arm_obj)

    # Restore POSE mode so Idle/Walk/Run NLA clips export cleanly!
    arm_obj.data.pose_position = 'POSE'
    bpy.context.view_layer.update()

    # =========================================================================
    # 4. EXPORT ANIMATED MIXAMO OPERATOR.GLB (Idle, Walk, Run, TPose preserved!)
    # =========================================================================
    glb_path = os.path.join(REPO_ROOT, "public", "models", "operator.glb")
    export_glb(glb_path, export_apply=False, export_skins=True, export_lights=False)

    # =========================================================================
    # 5. STUDIO PREVIEW RENDERS (FRONT + 3RD-PERSON BACK VIEW)
    # =========================================================================
    world = scene.world
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs["Color"].default_value = (0.04, 0.012, 0.015, 1.0)
        bg.inputs["Strength"].default_value = 0.85

    def add_light(name, loc, energy, color, size=1.6, rot=(0, 0, 0)):
        ld = bpy.data.lights.new(name=name, type='AREA')
        ld.energy = energy
        ld.color = color
        ld.size = size
        lo = bpy.data.objects.new(name, ld)
        lo.location = loc
        lo.rotation_euler = rot
        col_lights.objects.link(lo)

    add_light("Front_Key", (1.6, 2.4, 2.2), 260.0, (1.0, 0.90, 0.80), size=2.0, rot=(math.radians(-55), 0, math.radians(145)))
    add_light("Back_GoldKey", (-1.6, -2.4, 2.1), 280.0, (1.0, 0.88, 0.72), size=1.8, rot=(math.radians(55), 0, math.radians(-35)))
    add_light("Crimson_Rim", (2.0, -1.2, 2.0), 300.0, (1.0, 0.12, 0.12), size=1.8, rot=(math.radians(52), 0, math.radians(55)))

    preview_dir = os.path.join(REPO_ROOT, "scripts", "blender", "previews")
    render_preview(os.path.join(preview_dir, "operator_aaa_front.png"),
                   cam_pos=(0.55, 2.85, 1.25), target_pos=(0.0, 0.0, 0.95), lens=42.0)
    render_preview(os.path.join(preview_dir, "operator_aaa_back3p.png"),
                   cam_pos=(-0.45, -2.65, 1.48), target_pos=(0.0, 0.0, 1.05), lens=42.0)


if __name__ == "__main__":
    build_operator()
