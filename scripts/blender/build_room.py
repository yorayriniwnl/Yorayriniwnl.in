import math
import os
import sys
import bpy
from mathutils import Vector, Euler

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "..", ".."))
ASSETS_DIR = os.path.join(SCRIPT_DIR, "aaa_assets")
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

from pbr_utils import (
    reset_scene,
    ensure_collection,
    join_objects,
    create_box,
    create_cylinder,
    create_sphere,
    create_plane,
    create_3d_text_mesh,
    gen_brushed_metal_pbr,
    gen_ak_gold_filigree_pbr,
    load_image_packed,
    load_polyhaven_pbr,
    import_aaa_asset,
    duplicate_aaa_asset,
    make_pbr_material,
    export_glb,
    render_preview,
)


def make_parent_empty(name, location=(0, 0, 0), col=None):
    emp = bpy.data.objects.new(name, None)
    emp.location = Vector(location)
    if col is not None:
        col.objects.link(emp)
    else:
        bpy.context.scene.collection.objects.link(emp)
    return emp


def parent_group(children, parent_obj):
    for ch in children:
        if ch is None:
            continue
        ch.parent = parent_obj
        ch.matrix_parent_inverse = parent_obj.matrix_world.inverted()


def make_artwork_mat(name, rel_tex_path, emission_strength=0.35, roughness=0.42):
    full = os.path.join(REPO_ROOT, "public", "textures", rel_tex_path)
    img = load_image_packed(full, "sRGB")
    return make_pbr_material(
        name,
        albedo_img=img,
        roughness=roughness,
        emission_img=img if emission_strength > 0 else None,
        emission_strength=emission_strength,
    )


def build_helicopter(name, location, yaw_deg, scale, mat_body, mat_strobe, col):
    parts = [
        create_sphere(f"{name}_Fuse", radius=0.55, scale=(1.55, 0.55, 0.58), segments=14, rings=10, mat=mat_body, col=col),
        create_box(f"{name}_TailBoom", (1.35, 0.14, 0.16), location=(1.15, 0, 0.12), mat=mat_body, col=col),
        create_box(f"{name}_TailFin", (0.28, 0.08, 0.56), location=(1.82, 0, 0.24), rotation=(0, math.radians(20), 0), mat=mat_body, col=col),
        create_box(f"{name}_Rotor1", (3.2, 0.10, 0.03), location=(0, 0, 0.48), mat=mat_body, col=col),
        create_box(f"{name}_Rotor2", (0.10, 3.2, 0.03), location=(0, 0, 0.48), mat=mat_body, col=col),
        create_sphere(f"{name}_Strobe", radius=0.075, segments=10, rings=8, location=(1.85, 0, 0.52), mat=mat_strobe, col=col),
        create_sphere(f"{name}_NoseLED", radius=0.065, segments=10, rings=8, location=(-0.82, 0, -0.05), mat=mat_strobe, col=col),
    ]
    heli = join_objects(parts, name, col=col)
    heli.location = Vector(location)
    heli.rotation_euler = Euler((0, math.radians(-5), math.radians(yaw_deg)), 'XYZ')
    heli.scale = (scale, scale, scale)
    return heli


def build_room():
    scene = reset_scene()
    col_arch = ensure_collection("Architecture")
    col_props = ensure_collection("HeroProps")
    col_lights = ensure_collection("PreviewLights")

    tex_dir = os.path.join(ASSETS_DIR, "textures")
    mod_dir = os.path.join(ASSETS_DIR, "models")
    hero_dir = os.path.join(ASSETS_DIR, "hero")

    # =========================================================================
    # 1. REAL POLY HAVEN 2K SCANNED PBR MATERIALS + CUSTOM METAL/NEON SHADERS
    # =========================================================================
    metal_pbr = gen_brushed_metal_pbr("RoomMetal", res=512, seed=41, base_rgb=(0.055, 0.058, 0.064), rough_base=0.28)
    ak_gold_pbr = gen_ak_gold_filigree_pbr("RoomDeskGold", res=512, seed=55)

    mats = {
        "floor": load_polyhaven_pbr(
            os.path.join(tex_dir, "herringbone_parquet"), "Mat_PolyParquet",
            tint=(0.24, 0.16, 0.14), rough_mult=0.45, normal_strength=0.75, uv_repeat=(4.5, 4.2), coat_weight=0.35
        ),
        "wall": load_polyhaven_pbr(
            os.path.join(tex_dir, "grey_plaster_02"), "Mat_PolyWallPlaster",
            tint=(0.14, 0.10, 0.11), rough_mult=0.88, normal_strength=0.70, uv_repeat=(3.2, 1.8)
        ),
        "wainscot": load_polyhaven_pbr(
            os.path.join(tex_dir, "dark_wooden_planks"), "Mat_PolyWainscot",
            tint=(0.18, 0.12, 0.11), rough_mult=0.65, normal_strength=0.65, uv_repeat=(3.0, 1.0)
        ),
        "walnut_desk": load_polyhaven_pbr(
            os.path.join(tex_dir, "black_walnut_veneer_01"), "Mat_PolyWalnutDesk",
            tint=(0.24, 0.14, 0.12), rough_mult=0.22, normal_strength=0.45, uv_repeat=(1.6, 1.0), coat_weight=0.78
        ),
        "crimson_leather": load_polyhaven_pbr(
            os.path.join(tex_dir, "leather_red_02"), "Mat_PolyCrimsonLeather",
            tint=(0.48, 0.08, 0.09), rough_mult=0.42, normal_strength=0.85, uv_repeat=(2.2, 2.2), coat_weight=0.42
        ),
        "steel": make_pbr_material(
            "Mat_DarkSteel", albedo_img=metal_pbr["albedo"], metallic=0.88,
            roughness_img=metal_pbr["roughness"], normal_img=metal_pbr["normal"], normal_strength=0.35
        ),
        "gold_mirror": make_pbr_material(
            "Mat_24KGoldMirror", base_color=(0.95, 0.74, 0.24), metallic=0.98, roughness=0.14, coat_weight=0.55
        ),
        "gold_filigree": make_pbr_material(
            "Mat_24KGoldFiligree", albedo_img=ak_gold_pbr["albedo"], metallic=0.95,
            roughness_img=ak_gold_pbr["roughness"], normal_img=ak_gold_pbr["normal"], normal_strength=0.85, coat_weight=0.45
        ),
        "brass": make_pbr_material("Mat_Brass", base_color=(0.82, 0.62, 0.26), metallic=0.92, roughness=0.24),
        "obsidian": make_pbr_material("Mat_Obsidian", base_color=(0.018, 0.018, 0.022), metallic=0.14, roughness=0.42),
        "rain_glass": make_pbr_material("Mat_RainWindowGlass", base_color=(0.12, 0.03, 0.04), roughness=0.08, alpha=0.06),
        "rug": make_pbr_material("Mat_CrimsonRug", base_color=(0.045, 0.008, 0.011), roughness=0.96),
        "neon_red": make_pbr_material(
            "Mat_NeonCrimson", base_color=(1.0, 0.08, 0.08), roughness=0.22,
            emission_color=(1.0, 0.08, 0.07), emission_strength=6.5
        ),
        "neon_soft": make_pbr_material(
            "Mat_NeonSoft", base_color=(0.95, 0.14, 0.12), roughness=0.25,
            emission_color=(1.0, 0.14, 0.12), emission_strength=3.6
        ),
        "warm_led": make_pbr_material(
            "Mat_WarmGalleryLED", base_color=(1.0, 0.88, 0.68), roughness=0.20,
            emission_color=(1.0, 0.84, 0.60), emission_strength=5.5
        ),
        "lantern_core": make_pbr_material(
            "Mat_LanternCrimsonCore", base_color=(1.0, 0.22, 0.14), roughness=0.15,
            emission_color=(1.0, 0.16, 0.10), emission_strength=10.5
        ),
        "eclipse_backdrop": make_artwork_mat("Mat_EclipseSkyline", "eclipse-skyline.jpg", emission_strength=1.55, roughness=0.85),
        "painting_op": make_artwork_mat("Mat_PaintingOperator", "painting-operator.jpg", emission_strength=0.30, roughness=0.38),
        "poster_eclipse": make_artwork_mat("Mat_PosterEclipse", "poster-eclipse.jpg", emission_strength=0.45, roughness=0.34),
        "ayush_portrait": make_artwork_mat("Mat_AyushPortrait", "ayush-portrait.jpg", emission_strength=0.28, roughness=0.36),
        "laptop_map": make_artwork_mat("Mat_LaptopMap", "laptop-map.jpg", emission_strength=2.2, roughness=0.14),
        "notebook_pages": make_artwork_mat("Mat_NotebookPages", "notebook-pages.jpg", emission_strength=0.16, roughness=0.72),
    }

    # =========================================================================
    # 2. CLOSED 4-WALL ARCHITECTURAL SHELL (9.2m x 8.6m x 3.85m, Playable 3rd Person!)
    #    X: [-4.6, +4.6], Y: [-4.2, +4.4], Z: [0.0, 3.85]
    # =========================================================================
    arch_parts = []
    # Floor & Ceiling
    arch_parts.append(create_box("Floor_Parquet", (9.4, 8.8, 0.14), location=(0, 0.1, -0.07), mat=mats["floor"], col=col_arch, uv_scale=0.16))
    arch_parts.append(create_box("Ceiling_Slab", (9.4, 8.8, 0.16), location=(0, 0.1, 3.93), mat=mats["wall"], col=col_arch, uv_scale=0.18))
    # Plush crimson rug beneath sofa & desk zone
    arch_parts.append(create_box("Floor_Rug", (4.6, 3.9, 0.012), location=(0.0, 0.95, 0.006), mat=mats["rug"], col=col_arch, bevel=0.004))

    # North Wall (Y = +4.4) split cleanly around the Floor-to-Ceiling Window (X: -1.45 .. +1.15, Z: 0.12 .. 3.72)
    arch_parts.append(create_box("Wall_North_Left", (3.25, 0.22, 3.9), location=(-3.075, 4.46, 1.95), mat=mats["wall"], col=col_arch, uv_scale=0.22))
    arch_parts.append(create_box("Wall_North_Right", (3.55, 0.22, 3.9), location=(2.925, 4.46, 1.95), mat=mats["wall"], col=col_arch, uv_scale=0.22))
    arch_parts.append(create_box("Wall_North_Sill", (2.8, 0.26, 0.14), location=(-0.15, 4.44, 0.07), mat=mats["wainscot"], col=col_arch))
    arch_parts.append(create_box("Wall_North_Header", (2.8, 0.26, 0.22), location=(-0.15, 4.44, 3.82), mat=mats["wainscot"], col=col_arch))

    # East, West, South Walls
    arch_parts.append(create_box("Wall_East", (0.22, 8.8, 3.9), location=(4.66, 0.1, 1.95), mat=mats["wall"], col=col_arch, uv_scale=0.22))
    arch_parts.append(create_box("Wall_West", (0.22, 8.8, 3.9), location=(-4.66, 0.1, 1.95), mat=mats["wall"], col=col_arch, uv_scale=0.22))
    arch_parts.append(create_box("Wall_South", (9.4, 0.22, 3.9), location=(0.0, -4.26, 1.95), mat=mats["wall"], col=col_arch, uv_scale=0.22))

    # Dark Wood Wainscoting Dado Rail & Baseboard around room perimeter
    for nm, dims, loc in (
        ("Wainscot_East", (0.05, 8.6, 1.02), (4.53, 0.1, 0.51)),
        ("Wainscot_West", (0.05, 8.6, 1.02), (-4.53, 0.1, 0.51)),
        ("Wainscot_SouthL", (3.2, 0.05, 1.02), (-3.0, -4.13, 0.51)),
        ("Wainscot_SouthR", (3.2, 0.05, 1.02), (3.0, -4.13, 0.51)),
        ("Wainscot_NorthL", (3.15, 0.05, 1.02), (-3.03, 4.33, 0.51)),
        ("Wainscot_NorthR", (3.45, 0.05, 1.02), (2.88, 4.33, 0.51)),
    ):
        arch_parts.append(create_box(nm, dims, location=loc, mat=mats["wainscot"], col=col_arch, bevel=0.005, uv_scale=0.45))

    # Coffered Ceiling Timber Beams + Concealed Crimson Perimeter Cove LEDs
    for bx in (-3.2, -1.05, 1.05, 3.2):
        arch_parts.append(create_box(f"CeilBeamX_{bx:+.1f}", (0.18, 8.7, 0.18), location=(bx, 0.1, 3.76), mat=mats["wainscot"], col=col_arch))
    for by in (-2.6, 0.1, 2.8):
        arch_parts.append(create_box(f"CeilBeamY_{by:+.1f}", (9.2, 0.18, 0.18), location=(0, by, 3.76), mat=mats["wainscot"], col=col_arch))
    for nm, dims, loc in (
        ("CeilNeon_N", (8.8, 0.026, 0.026), (0, 4.28, 3.74)),
        ("CeilNeon_S", (8.8, 0.026, 0.026), (0, -4.08, 3.74)),
        ("CeilNeon_E", (0.026, 8.2, 0.026), (4.48, 0.1, 3.74)),
        ("CeilNeon_W", (0.026, 8.2, 0.026), (-4.48, 0.1, 3.74)),
    ):
        arch_parts.append(create_box(nm, dims, location=loc, mat=mats["neon_soft"], col=col_arch))

    # Join static architectural shell into 1 single draw-call-efficient multi-material mesh!
    join_objects(arch_parts, "Room_Architecture", col=col_arch)

    # =========================================================================
    # 3. FLOOR-TO-CEILING RAIN-STREAKED WINDOW + ECLIPSE SKYLINE + HELICOPTERS
    # =========================================================================
    win_root = make_parent_empty("Interactive_EclipseWindow", location=(-0.15, 4.40, 1.92), col=col_props)
    win_frame_parts = [
        create_box("Win_FrameL", (0.09, 0.14, 3.68), location=(-1.45, 4.38, 1.92), mat=mats["steel"], col=col_props),
        create_box("Win_FrameR", (0.09, 0.14, 3.68), location=(1.15, 4.38, 1.92), mat=mats["steel"], col=col_props),
        create_box("Win_FrameTop", (2.70, 0.14, 0.09), location=(-0.15, 4.38, 3.72), mat=mats["steel"], col=col_props),
        create_box("Win_FrameBot", (2.70, 0.14, 0.09), location=(-0.15, 4.38, 0.12), mat=mats["steel"], col=col_props),
        create_box("Win_MullionV1", (0.045, 0.08, 3.60), location=(-0.58, 4.38, 1.92), mat=mats["steel"], col=col_props),
        create_box("Win_MullionV2", (0.045, 0.08, 3.60), location=(0.28, 4.38, 1.92), mat=mats["steel"], col=col_props),
        create_box("Win_MullionH1", (2.60, 0.08, 0.045), location=(-0.15, 4.38, 1.38), mat=mats["steel"], col=col_props),
        create_box("Win_MullionH2", (2.60, 0.08, 0.045), location=(-0.15, 4.38, 2.66), mat=mats["steel"], col=col_props),
        create_box("Win_NeonEdgeL", (0.024, 0.024, 3.55), location=(-1.40, 4.31, 1.92), mat=mats["neon_red"], col=col_props),
        create_box("Win_NeonEdgeR", (0.024, 0.024, 3.55), location=(1.10, 4.31, 1.92), mat=mats["neon_red"], col=col_props),
    ]
    win_frame = join_objects(win_frame_parts, "Window_Mullions", col=col_props)
    # Dedicated transparent glass plane named Window_RainGlass (Three.js upgrades to animated GLSL rain-on-glass!)
    rain_glass = create_plane("Window_RainGlass", size=(2.60, 3.60), location=(-0.15, 4.39, 1.92),
                              rotation=(math.pi * 0.5, 0, 0), mat=mats["rain_glass"], col=col_props)
    skyline = create_plane("EclipseSkyline_Backdrop", size=(6.8, 4.8), location=(-0.15, 5.85, 2.02),
                           rotation=(math.pi * 0.5, 0, 0), mat=mats["eclipse_backdrop"], col=col_props)
    heli1 = build_helicopter("Skyline_Heli1", (-0.42, 5.25, 2.52), yaw_deg=18, scale=0.22,
                             mat_body=mats["obsidian"], mat_strobe=mats["neon_red"], col=col_props)
    heli2 = build_helicopter("Skyline_Heli2", (0.18, 5.38, 1.72), yaw_deg=-22, scale=0.14,
                             mat_body=mats["obsidian"], mat_strobe=mats["neon_red"], col=col_props)
    parent_group([win_frame, rain_glass, skyline, heli1, heli2], win_root)

    # =========================================================================
    # 4. NORTH-LEFT FRAMED OPERATOR+HUSKY PAINTING ("KEEP GRINDING, KEEP LOSING.")
    #    Using REAL Poly Haven fancy_picture_frame_01!
    # =========================================================================
    op_paint_root = make_parent_empty("Interactive_OperatorPainting", location=(-2.95, 4.30, 2.38), col=col_props)
    op_frame = import_aaa_asset(
        os.path.join(mod_dir, "fancy_picture_frame_01", "fancy_picture_frame_01_1k.gltf"),
        "OpPaint_FancyFrame", col_props, target_width=1.82,
        location=(-2.95, 4.31, 1.68), rotation=(0, 0, 0),
        tint_albedo=(0.82, 0.65, 0.42)
    )
    op_canvas = create_plane("PaintPort_Canvas", size=(1.60, 1.18), location=(-2.95, 4.29, 2.38),
                             rotation=(math.pi * 0.5, 0, 0), mat=mats["painting_op"], col=col_props)
    op_quote = create_3d_text_mesh("PaintPort_Quote", "KEEP GRINDING, KEEP LOSING.",
                                   size=0.072, extrude=0.008, bevel_depth=0.001,
                                   location=(-2.95, 4.30, 1.54), rotation=(math.pi * 0.5, 0, 0),
                                   mat=mats["neon_soft"], col=col_props)
    op_light = join_objects([
        create_cylinder("OpPaint_LightTube", radius=0.018, depth=0.68, segments=14,
                        location=(-2.95, 4.14, 3.16), rotation=(0, math.pi * 0.5, 0), mat=mats["brass"], col=col_props),
        create_box("OpPaint_LightGlow", (0.62, 0.018, 0.014), location=(-2.95, 4.14, 3.14), mat=mats["warm_led"], col=col_props),
    ], "OpPaint_GalleryLight", col=col_props)
    parent_group([op_frame, op_canvas, op_quote, op_light], op_paint_root)

    # =========================================================================
    # 5. NORTH-RIGHT HUGE ECLIPSE DARK-RIDER "YA" WAR POSTER
    # =========================================================================
    poster_root = make_parent_empty("Interactive_WarPoster", location=(2.68, 4.30, 2.18), col=col_props)
    poster_parts = [
        create_box("Poster_BackFrame", (1.84, 0.045, 2.48), location=(2.68, 4.32, 2.18), mat=mats["obsidian"], col=col_props, bevel=0.006),
        create_box("Poster_TopNeon", (1.82, 0.025, 0.025), location=(2.68, 4.28, 3.43), mat=mats["neon_red"], col=col_props),
    ]
    poster_frame = join_objects(poster_parts, "Poster_Frame", col=col_props)
    poster_art = create_plane("Poster_Artwork", size=(1.74, 2.38), location=(2.68, 4.29, 2.18),
                              rotation=(math.pi * 0.5, 0, 0), mat=mats["poster_eclipse"], col=col_props)
    parent_group([poster_frame, poster_art], poster_root)

    # =========================================================================
    # 6. HERO CRIMSON LEATHER SOFA (REAL Poly Haven sofa_03 + leather_red_02!)
    # =========================================================================
    sofa_root = make_parent_empty("Interactive_Sofa", location=(0.0, 2.18, 0.55), col=col_props)
    sofa = import_aaa_asset(
        os.path.join(mod_dir, "sofa_03", "sofa_03_1k.gltf"),
        "Hero_CrimsonSofa", col_props, target_width=2.55,
        location=(0.0, 2.18, 0.0), rotation=(0, 0, 0),
        override_mat=mats["crimson_leather"]
    )
    parent_group([sofa], sofa_root)

    # =========================================================================
    # 7. LEFT TACTICAL CRATE + KHRONOS DAMAGED HELMET WITH QUAD-NVG OPTICS
    # =========================================================================
    nvg_root = make_parent_empty("Interactive_NVGCase", location=(-2.35, 2.15, 0.65), col=col_props)
    crate_l = import_aaa_asset(
        os.path.join(mod_dir, "old_military_crate", "old_military_crate_1k.gltf"),
        "NVG_MilitaryCrate", col_props, target_width=0.98,
        location=(-2.35, 2.15, 0.0), rotation=(0, 0, math.radians(10)),
        decimate_ratio=0.40, tint_albedo=(0.14, 0.13, 0.14)
    )
    crate_l2 = duplicate_aaa_asset(
        crate_l, "NVG_MilitaryCrateTop", col_props,
        location=(-2.35, 2.15, 0.17), rotation=(0, 0, math.radians(6)), scale=(0.94, 0.94, 0.94)
    )
    # Stand a clean matte-black Pelican riser + YA badge
    pelican_parts = [
        create_box("Pelican_Body", (0.76, 0.50, 0.44), location=(-2.35, 2.15, 0.54),
                   rotation=(0, 0, math.radians(12)), mat=mats["obsidian"], col=col_props, bevel=0.014),
        create_3d_text_mesh("Pelican_YA", "YA", size=0.14, extrude=0.008, bevel_depth=0.001,
                            location=(-2.30, 1.89, 0.54), rotation=(math.pi * 0.5, 0, math.radians(12)),
                            mat=mats["neon_red"], col=col_props),
    ]
    pelican = join_objects(pelican_parts, "Pelican_YACase", col=col_props)
    # REAL Khronos DamagedHelmet.glb re-tinted stealth dark tactical + quad-NVG optic tubes!
    helmet = import_aaa_asset(
        os.path.join(hero_dir, "DamagedHelmet.glb"),
        "QuadNVG_TacticalHelmet", col_props, target_height=0.34,
        location=(-2.34, 2.14, 0.76), rotation=(0, 0, math.radians(22)),
        decimate_ratio=0.50, tint_albedo=(0.24, 0.16, 0.18)
    )
    nvg_tubes = []
    for ox in (-0.11, -0.04, 0.04, 0.11):
        nvg_tubes.append(create_cylinder(f"NVG_Tube_{ox:+.2f}", radius=0.022, depth=0.12, segments=12,
                                         location=(-2.28 + ox, 1.92, 0.96), rotation=(math.radians(82), 0, math.radians(20)),
                                         mat=mats["steel"], col=col_props))
        nvg_tubes.append(create_cylinder(f"NVG_Lens_{ox:+.2f}", radius=0.017, depth=0.008, segments=12,
                                         location=(-2.26 + ox, 1.86, 0.95), rotation=(math.radians(82), 0, math.radians(20)),
                                         mat=mats["neon_red"], col=col_props))
    nvg_mount = join_objects(nvg_tubes, "QuadNVG_Optics", col=col_props)
    parent_group([crate_l, crate_l2, pelican, helmet, nvg_mount], nvg_root)

    # =========================================================================
    # 8. RIGHT TACTICAL CRATE + POLY HAVEN LANTERN_01 + OBSIDIAN WAR GLOBE
    # =========================================================================
    lantern_root = make_parent_empty("Interactive_Lantern", location=(2.38, 2.15, 0.92), col=col_props)
    crate_r = create_box("RightCrate_Stand", (0.82, 0.56, 0.76), location=(2.38, 2.15, 0.38),
                         rotation=(0, 0, math.radians(-10)), mat=mats["obsidian"], col=col_props, bevel=0.014)
    ammo_r = import_aaa_asset(
        os.path.join(mod_dir, "ammo_box", "ammo_box_1k.gltf"),
        "RightCrate_AmmoBox", col_props, target_height=0.26,
        location=(2.05, 1.62, 0.0), rotation=(0, 0, math.radians(-22)),
        tint_albedo=(0.20, 0.18, 0.18)
    )
    lantern_mesh = import_aaa_asset(
        os.path.join(mod_dir, "Lantern_01", "Lantern_01_1k.gltf"),
        "Hero_PolyLantern", col_props, target_height=0.46,
        location=(2.58, 2.10, 0.76), rotation=(0, 0, math.radians(-18)),
        decimate_ratio=0.25, tint_albedo=(0.30, 0.24, 0.22)
    )
    lantern_core = create_cylinder("Lantern_GlowCore", radius=0.044, depth=0.16, segments=14,
                                   location=(2.58, 2.10, 0.94), mat=mats["lantern_core"], col=col_props)
    globe_parts = [
        create_cylinder("Globe_Base", radius=0.095, depth=0.032, segments=18, location=(2.18, 2.16, 0.776), mat=mats["brass"], col=col_props),
        create_cylinder("Globe_Stem", radius=0.016, depth=0.14, segments=12, location=(2.18, 2.16, 0.85), mat=mats["brass"], col=col_props),
        create_sphere("Globe_Orb", radius=0.145, segments=22, rings=16, location=(2.18, 2.16, 1.04), mat=mats["steel"], col=col_props),
        create_3d_text_mesh("Globe_MMXXVII", "MMXXVII", size=0.028, extrude=0.003, bevel_depth=0.0004,
                            location=(2.18, 1.94, 0.79), rotation=(math.pi * 0.5, 0, math.radians(-10)),
                            mat=mats["gold_mirror"], col=col_props),
    ]
    globe_obj = join_objects(globe_parts, "Hero_WarGlobe", col=col_props)
    parent_group([crate_r, ammo_r, lantern_mesh, lantern_core, globe_obj], lantern_root)

    # =========================================================================
    # 9. EXECUTIVE REFLECTIVE WAR DESK (X=0.0, Y=-0.38, Z=0.78) + ALL HERO PROPS
    #    Generous 1.3m walking lane between sofa & desk, wide 3.4m floor south!
    # =========================================================================
    desk_parts = [
        create_box("Desk_WalnutTop", (2.46, 0.96, 0.065), location=(0.0, -0.38, 0.75), mat=mats["walnut_desk"], col=col_props, bevel=0.010, uv_scale=0.5),
        create_box("Desk_Apron", (2.30, 0.82, 0.09), location=(0.0, -0.38, 0.675), mat=mats["obsidian"], col=col_props),
        create_box("Desk_UnderNeon", (2.26, 0.022, 0.022), location=(0.0, -0.82, 0.705), mat=mats["neon_soft"], col=col_props),
        create_box("Desk_LegFL", (0.09, 0.09, 0.72), location=(-1.12, -0.78, 0.36), mat=mats["steel"], col=col_props, bevel=0.006),
        create_box("Desk_LegFR", (0.09, 0.09, 0.72), location=(1.12, -0.78, 0.36), mat=mats["steel"], col=col_props, bevel=0.006),
        create_box("Desk_LegBL", (0.09, 0.09, 0.72), location=(-1.12, 0.02, 0.36), mat=mats["steel"], col=col_props, bevel=0.006),
        create_box("Desk_LegBR", (0.09, 0.09, 0.72), location=(1.12, 0.02, 0.36), mat=mats["steel"], col=col_props, bevel=0.006),
    ]
    join_objects(desk_parts, "Hero_WarDesk", col=col_props)

    # 9A. TACTICAL LAPTOP (REAL Poly Haven classic_laptop + Glowing Red World Map flush in bezel!)
    laptop_root = make_parent_empty("Interactive_Laptop", location=(0.82, -0.34, 0.96), col=col_props)
    laptop_body = import_aaa_asset(
        os.path.join(mod_dir, "classic_laptop", "classic_laptop_1k.gltf"),
        "Desk_ClassicLaptop", col_props, target_width=0.46,
        location=(0.82, -0.34, 0.783), rotation=(0, 0, math.radians(-18)),
        decimate_ratio=0.55, tint_albedo=(0.08, 0.08, 0.09)
    )
    # Flush glowing crimson tactical world-map display inset on laptop screen face
    laptop_screen = create_plane("Laptop_ScreenMap", size=(0.35, 0.24),
                                 location=(0.862, -0.215, 0.992),
                                 rotation=(math.radians(88), 0, math.radians(-18)),
                                 mat=mats["laptop_map"], col=col_props)
    parent_group([laptop_body, laptop_screen], laptop_root)

    # 9B. 24K GOLD CHESS KNIGHT (REAL Poly Haven sculpted chess_set knight -> Mirror 24K Gold!)
    chess_root = make_parent_empty("Interactive_ChessKnight", location=(-0.82, -0.52, 0.96), col=col_props)
    knight_mesh = import_aaa_asset(
        os.path.join(mod_dir, "chess_set", "chess_set_1k.gltf"),
        "Desk_24KGoldKnight", col_props, target_height=0.31,
        location=(-0.82, -0.52, 0.783), rotation=(0, 0, math.radians(-38)),
        keep_only_names=["piece_knight_white_01"],
        override_mat=mats["gold_mirror"]
    )
    parent_group([knight_mesh], chess_root)

    # 9C. "IDEAS BUILD GRIND REPEAT" NOTEBOOK + POLY HAVEN BINDER + BRASS SHELLS + YA MUG
    nb_root = make_parent_empty("Interactive_Notebook", location=(-0.22, -0.46, 0.84), col=col_props)
    binder = import_aaa_asset(
        os.path.join(mod_dir, "binder_notebook", "binder_notebook_1k.gltf"),
        "Desk_PolyBinder", col_props, target_width=0.36,
        location=(-0.44, -0.50, 0.783), rotation=(0, 0, math.radians(16)),
        decimate_ratio=0.25, tint_albedo=(0.12, 0.12, 0.14)
    )
    nb_parts = [
        create_box("NB_Hardcover", (0.21, 0.28, 0.022), location=(-0.44, -0.50, 0.798),
                   rotation=(0, 0, math.radians(16)), mat=mats["obsidian"], col=col_props, bevel=0.003),
        create_3d_text_mesh("NB_Title1", "IDEAS", size=0.022, extrude=0.0015, bevel_depth=0.0002,
                            location=(-0.45, -0.44, 0.810), rotation=(0, 0, math.radians(16)), mat=mats["gold_mirror"], col=col_props),
        create_3d_text_mesh("NB_Title2", "BUILD", size=0.022, extrude=0.0015, bevel_depth=0.0002,
                            location=(-0.44, -0.48, 0.810), rotation=(0, 0, math.radians(16)), mat=mats["gold_mirror"], col=col_props),
        create_3d_text_mesh("NB_Title3", "GRIND", size=0.022, extrude=0.0015, bevel_depth=0.0002,
                            location=(-0.43, -0.52, 0.810), rotation=(0, 0, math.radians(16)), mat=mats["gold_mirror"], col=col_props),
        create_3d_text_mesh("NB_Title4", "REPEAT", size=0.022, extrude=0.0015, bevel_depth=0.0002,
                            location=(-0.42, -0.56, 0.810), rotation=(0, 0, math.radians(16)), mat=mats["gold_mirror"], col=col_props),
        create_box("NB_OpenBase", (0.36, 0.24, 0.014), location=(-0.02, -0.48, 0.790),
                   rotation=(0, 0, math.radians(-8)), mat=mats["obsidian"], col=col_props, bevel=0.003),
        create_plane("NB_OpenPages", size=(0.34, 0.22), location=(-0.02, -0.48, 0.799),
                     rotation=(0, 0, math.radians(-8)), mat=mats["notebook_pages"], col=col_props),
    ]
    # Brass bullet casings scattered beside the notebook
    for idx, (bx, by, rotz) in enumerate(((-0.62, -0.66, 32), (-0.28, -0.62, -18), (-0.23, -0.65, 44), (-0.18, -0.60, 11))):
        nb_parts.append(create_cylinder(f"Shell_{idx}", radius=0.007, depth=0.056, segments=10,
                                        location=(bx, by, 0.790), rotation=(math.pi * 0.5, 0, math.radians(rotz)),
                                        mat=mats["brass"], col=col_props))
    nb_join = join_objects(nb_parts, "Desk_JournalsAndShells", col=col_props)
    # Clean Matte Obsidian Tactical "YA" Mug (zero base slab!)
    mug_parts = [
        create_cylinder("Desk_MugBody", radius=0.048, depth=0.125, segments=22,
                        location=(-1.04, -0.58, 0.846), mat=mats["obsidian"], col=col_props),
        create_cylinder("Desk_MugRim", radius=0.049, depth=0.008, segments=22,
                        location=(-1.04, -0.58, 0.908), mat=mats["steel"], col=col_props),
        create_box("Desk_MugHandle", (0.036, 0.014, 0.068), location=(-0.988, -0.58, 0.846),
                   mat=mats["obsidian"], col=col_props, bevel=0.005),
    ]
    mug = join_objects(mug_parts, "Desk_YAMug", col=col_props)
    mug_ya = create_3d_text_mesh("Desk_MugYA", "YA", size=0.042, extrude=0.003, bevel_depth=0.0004,
                                 location=(-1.04, -0.630, 0.846), rotation=(math.pi * 0.5, 0, 0),
                                 mat=mats["neon_red"], col=col_props)
    parent_group([binder, nb_join, mug, mug_ya], nb_root)

    # 9D. DESK ARSENAL SHOWCASE: 24K GOLD-ENGRAVED AK-47 ON VELVET/BRASS STAND!
    arsenal_root = make_parent_empty("Interactive_DeskArsenal", location=(0.24, -0.14, 0.86), col=col_props)
    # Minimalist high-detail gold AK resting cleanly on twin brass cradle pillars on the desk
    ak_stand_parts = [
        create_box("DeskAK_CradleL", (0.04, 0.06, 0.08), location=(0.04, -0.12, 0.82), mat=mats["brass"], col=col_props, bevel=0.004),
        create_box("DeskAK_CradleR", (0.04, 0.06, 0.08), location=(0.44, -0.18, 0.82), mat=mats["brass"], col=col_props, bevel=0.004),
        create_box("DeskAK_Rec", (0.28, 0.044, 0.075), location=(0.16, -0.14, 0.885), rotation=(0, 0, math.radians(-8)), mat=mats["gold_filigree"], col=col_props, bevel=0.005),
        create_box("DeskAK_Fore", (0.22, 0.042, 0.054), location=(0.41, -0.175, 0.888), rotation=(0, 0, math.radians(-8)), mat=mats["gold_filigree"], col=col_props, bevel=0.006),
        create_cylinder("DeskAK_Barrel", radius=0.011, depth=0.34, segments=12, location=(0.66, -0.21, 0.895),
                        rotation=(0, math.pi * 0.5, math.radians(-8)), mat=mats["steel"], col=col_props),
        create_cylinder("DeskAK_Brake", radius=0.015, depth=0.055, segments=12, location=(0.84, -0.235, 0.895),
                        rotation=(0, math.pi * 0.5, math.radians(-8)), mat=mats["gold_mirror"], col=col_props),
        create_box("DeskAK_Stock", (0.24, 0.040, 0.105), location=(-0.10, -0.105, 0.875), rotation=(0, math.radians(10), math.radians(-8)), mat=mats["gold_filigree"], col=col_props, bevel=0.008),
        create_box("DeskAK_Mag1", (0.062, 0.028, 0.11), location=(0.24, -0.15, 0.81), rotation=(0, math.radians(-18), math.radians(-8)), mat=mats["gold_filigree"], col=col_props, bevel=0.004),
        create_3d_text_mesh("DeskAK_064532", "064532", size=0.018, extrude=0.002, bevel_depth=0.0003,
                            location=(0.40, -0.198, 0.888), rotation=(math.pi * 0.5, 0, math.radians(-8)), mat=mats["gold_mirror"], col=col_props),
    ]
    desk_ak = join_objects(ak_stand_parts, "Desk_24KGoldAK", col=col_props)
    parent_group([desk_ak], arsenal_root)

    # =========================================================================
    # 10. EAST WALL: TWIN POLY HAVEN BOOKSHELVES (OPEN FACING ROOM!) + DEDUPLICATED SCULPTED BOOKS
    # =========================================================================
    shelf_root = make_parent_empty("Interactive_Bookshelf", location=(4.22, -0.15, 1.55), col=col_props)
    shelf_objs = []
    # Import bookshelf & encyclopedia set ONCE, then share mesh/textures via duplicate_aaa_asset!
    shelf_master = import_aaa_asset(
        os.path.join(mod_dir, "wooden_bookshelf_worn", "wooden_bookshelf_worn_1k.gltf"),
        "East_PolyBookshelf_0", col_props, target_height=2.56,
        location=(4.20, 1.15, 0.0), rotation=(0, 0, -math.pi * 0.5),
        tint_albedo=(0.24, 0.16, 0.15)
    )
    shelf_2 = duplicate_aaa_asset(
        shelf_master, "East_PolyBookshelf_1", col_props,
        location=(4.20, -1.42, 0.0), rotation=(0, 0, -math.pi * 0.5)
    )
    shelf_objs.extend([shelf_master, shelf_2])

    books_master = import_aaa_asset(
        os.path.join(mod_dir, "book_encyclopedia_set_01", "book_encyclopedia_set_01_1k.gltf"),
        "East_PolyBooks_Master", col_props, target_height=0.27,
        location=(4.18, 1.15, 0.14), rotation=(0, 0, -math.pi * 0.5),
        decimate_ratio=0.10, tint_albedo=(0.40, 0.20, 0.20)
    )
    shelf_objs.append(books_master)
    for s_idx, sy in enumerate((1.15, -1.42)):
        for row_idx, bz in enumerate((0.14, 0.65, 1.15, 1.65)):
            if s_idx == 0 and row_idx == 0:
                continue
            bk = duplicate_aaa_asset(
                books_master, f"East_PolyBooks_{s_idx}_{row_idx}", col_props,
                location=(4.18, sy + (-0.12 if row_idx % 2 == 0 else 0.12), bz),
                rotation=(0, 0, -math.pi * 0.5)
            )
            shelf_objs.append(bk)

    # Architectural crimson vertical neon backlight rails & glowing "DISCIPLINE, EXECUTION" header sign!
    sign_parts = [
        create_box("Shelf_SignPlaque", (0.06, 2.45, 0.30), location=(4.48, -0.13, 2.94), mat=mats["obsidian"], col=col_props, bevel=0.008),
        create_3d_text_mesh("Sign_DisciplineExecution", "DISCIPLINE, EXECUTION",
                            size=0.145, extrude=0.012, bevel_depth=0.0015,
                            location=(4.43, -0.13, 2.94), rotation=(math.pi * 0.5, 0, -math.pi * 0.5),
                            mat=mats["neon_red"], col=col_props),
        create_box("Shelf_SignNeonTop", (0.025, 2.40, 0.022), location=(4.44, -0.13, 3.10), mat=mats["neon_red"], col=col_props),
        create_box("Shelf_SignNeonBot", (0.025, 2.40, 0.022), location=(4.44, -0.13, 2.78), mat=mats["neon_red"], col=col_props),
        # Center dark walnut display plinth between the two bookshelves holding the hero titled books!
        create_box("Shelf_CenterPlinth", (0.52, 0.72, 0.78), location=(4.24, -0.13, 0.39), mat=mats["wainscot"], col=col_props, bevel=0.008),
    ]
    for ny in (-2.28, -0.58, 0.32, 2.02):
        sign_parts.append(create_box(f"Shelf_VertNeon_{ny:+.2f}", (0.026, 0.026, 2.60),
                                     location=(4.46, ny, 1.30), mat=mats["neon_red"], col=col_props))
    # Stacked Hero Titled Book Spines on center pedestal (matching painting.webp!)
    hero_titles = ("A BETTER ME", "FINANCE", "TECH", "C++", "CS2", "FREEDOM", "COMPOUND", "EXECUTION", "DISCIPLINE")
    for idx, title in enumerate(hero_titles):
        z_b = 0.82 + idx * 0.068
        sign_parts.append(create_box(f"HeroBook_{idx}", (0.28, 0.42, 0.056), location=(4.20, -0.13, z_b),
                                     rotation=(0, 0, math.radians((idx % 3 - 1) * 4)), mat=mats["obsidian"], col=col_props, bevel=0.004))
        sign_parts.append(create_3d_text_mesh(f"HeroBookTxt_{idx}", title, size=0.026, extrude=0.002, bevel_depth=0.0003,
                                              location=(4.05, -0.13, z_b), rotation=(math.pi * 0.5, 0, -math.pi * 0.5),
                                              mat=mats["gold_mirror"], col=col_props))
    shelf_objs.append(join_objects(sign_parts, "Shelf_NeonAndTitles", col=col_props))
    parent_group(shelf_objs, shelf_root)

    # Real Poly Haven Organic Greenery (fern_02 instanced + potted_plant_01 decimated cleanly!)
    plant_ne = import_aaa_asset(
        os.path.join(mod_dir, "potted_plant_01", "potted_plant_01_1k.gltf"),
        "Plant_NE_Corner", col_props, target_height=1.55,
        location=(3.85, 3.35, 0.0), rotation=(0, 0, math.radians(-35)),
        decimate_ratio=0.05, tint_albedo=(0.45, 0.55, 0.45)
    )
    fern_nw = import_aaa_asset(
        os.path.join(mod_dir, "fern_02", "fern_02_1k.gltf"),
        "Fern_NW_Corner", col_props, target_height=0.62,
        location=(-3.75, 3.45, 0.0), rotation=(0, 0, math.radians(25)),
        tint_albedo=(0.42, 0.52, 0.42)
    )
    fern_sw = duplicate_aaa_asset(
        fern_nw, "Fern_SW_Corner", col_props,
        location=(-3.80, -3.25, 0.0), rotation=(0, 0, math.radians(115)), scale=(0.94, 0.94, 0.94)
    )

    # =========================================================================
    # 11. WEST WALL: CHIAROSCURO AYUSH OIL PORTRAIT + POLY HAVEN GOTHIC CONSOLE
    # =========================================================================
    ayush_root = make_parent_empty("Interactive_Portrait", location=(-4.42, 0.15, 2.08), col=col_props)
    ayush_frame = duplicate_aaa_asset(
        op_frame, "Ayush_FancyFrame", col_props,
        location=(-4.48, 0.15, 1.58), rotation=(0, 0, math.pi * 0.5), scale=(0.72, 0.72, 0.72)
    )
    ayush_canvas = create_plane("Ayush_Canvas", size=(1.12, 0.84), location=(-4.45, 0.15, 2.08),
                                rotation=(math.pi * 0.5, 0, math.pi * 0.5), mat=mats["ayush_portrait"], col=col_props)
    ayush_light = join_objects([
        create_cylinder("Ayush_LightTube", radius=0.016, depth=0.55, segments=14,
                        location=(-4.28, 0.15, 2.70), rotation=(math.pi * 0.5, 0, 0), mat=mats["brass"], col=col_props),
        create_box("Ayush_LightGlow", (0.016, 0.48, 0.014), location=(-4.28, 0.15, 2.68), mat=mats["warm_led"], col=col_props),
    ], "Ayush_GalleryLight", col=col_props)
    west_table = import_aaa_asset(
        os.path.join(mod_dir, "gothic_coffee_table", "gothic_coffee_table_1k.gltf"),
        "West_GothicConsole", col_props, target_height=0.68,
        location=(-3.82, 0.15, 0.0), rotation=(0, 0, math.pi * 0.5),
        decimate_ratio=0.35, tint_albedo=(0.24, 0.18, 0.17)
    )
    west_ammo = duplicate_aaa_asset(
        ammo_r, "West_ConsoleAmmo", col_props,
        location=(-3.80, 0.35, 0.68), rotation=(0, 0, math.radians(15)), scale=(0.85, 0.85, 0.85)
    )
    parent_group([ayush_frame, ayush_canvas, ayush_light, west_table, west_ammo], ayush_root)

    # =========================================================================
    # 12. SOUTH WALL: REAL POLY HAVEN CASTLE DOUBLE DOORS ("YOR // WAR ROOM")
    # =========================================================================
    door_root = make_parent_empty("Interactive_SouthDoors", location=(0.0, -4.05, 1.65), col=col_props)
    south_door = import_aaa_asset(
        os.path.join(mod_dir, "large_castle_door", "large_castle_door_1k.gltf"),
        "South_CastleDoubleDoors", col_props, target_height=2.92,
        location=(0.0, -4.08, 0.0), rotation=(0, 0, 0),
        tint_albedo=(0.26, 0.16, 0.15)
    )
    door_sign = join_objects([
        create_box("Door_SignNeonBar", (2.15, 0.03, 0.025), location=(0.0, -4.02, 3.04), mat=mats["neon_red"], col=col_props),
        create_3d_text_mesh("Door_SignText", "YOR // WAR ROOM", size=0.18, extrude=0.014, bevel_depth=0.002,
                            location=(0.0, -4.02, 3.26), rotation=(math.pi * 0.5, 0, math.pi),
                            mat=mats["neon_soft"], col=col_props),
        create_box("Door_SideNeonL", (0.026, 0.026, 2.95), location=(-1.18, -4.02, 1.48), mat=mats["neon_red"], col=col_props),
        create_box("Door_SideNeonR", (0.026, 0.026, 2.95), location=(1.18, -4.02, 1.48), mat=mats["neon_red"], col=col_props),
    ], "South_DoorMarquee", col=col_props)
    parent_group([south_door, door_sign], door_root)

    # Print total polygon count for 60 FPS sanity check
    total_polys = sum(len(o.data.polygons) for o in bpy.data.objects if o.type == 'MESH')
    total_meshes = sum(1 for o in bpy.data.objects if o.type == 'MESH')
    print(f"[STATS] room.glb -> meshes={total_meshes}, total_polys={total_polys}")

    # =========================================================================
    # 13. EXPORT OPTIMIZED AAA ROOM.GLB
    # =========================================================================
    glb_path = os.path.join(REPO_ROOT, "public", "models", "room.glb")
    export_glb(glb_path, export_apply=True, export_skins=False, export_lights=False)

    # =========================================================================
    # 14. PREVIEW RENDERS (HERO NORTH VIEW + EAST BOOKSHELF + WEST/SOUTH 360)
    # =========================================================================
    world = scene.world
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs["Color"].default_value = (0.028, 0.007, 0.009, 1.0)
        bg.inputs["Strength"].default_value = 0.65

    def add_light(name, ltype, loc, energy, color, size=1.4, rot=(0, 0, 0), shadow=False):
        ld = bpy.data.lights.new(name=name, type=ltype)
        ld.energy = energy
        ld.color = color
        ld.use_shadow = shadow
        if ltype == 'AREA':
            ld.size = size
        elif ltype == 'POINT':
            ld.shadow_soft_size = size
        lo = bpy.data.objects.new(name, ld)
        lo.location = loc
        lo.rotation_euler = rot
        col_lights.objects.link(lo)

    add_light("Eclipse_Rim", 'AREA', (-0.15, 3.6, 2.4), 340.0, (1.0, 0.14, 0.12), size=3.4, rot=(math.radians(74), 0, 0), shadow=True)
    add_light("Hero_WarmKey", 'AREA', (-1.0, -1.6, 2.3), 240.0, (1.0, 0.88, 0.72), size=2.0, rot=(math.radians(-48), 0, math.radians(-22)), shadow=True)
    add_light("Lantern_Pt", 'POINT', (2.58, 2.10, 1.12), 140.0, (1.0, 0.16, 0.10), size=0.18, shadow=False)
    add_light("Shelf_Wash", 'AREA', (2.8, -0.1, 2.5), 140.0, (1.0, 0.24, 0.20), size=2.6, rot=(0, math.radians(52), 0), shadow=False)
    add_light("West_Wash", 'AREA', (-2.8, 0.1, 2.5), 120.0, (1.0, 0.78, 0.60), size=2.0, rot=(0, math.radians(-52), 0), shadow=False)
    add_light("South_Wash", 'AREA', (0.0, -2.2, 2.5), 110.0, (1.0, 0.26, 0.24), size=2.4, rot=(math.radians(-62), 0, 0), shadow=False)

    preview_dir = os.path.join(REPO_ROOT, "scripts", "blender", "previews")
    render_preview(os.path.join(preview_dir, "room_aaa_hero.png"),
                   cam_pos=(0.0, -2.55, 1.48), target_pos=(0.0, 2.15, 1.32), lens=23.0)
    render_preview(os.path.join(preview_dir, "room_aaa_shelf.png"),
                   cam_pos=(0.45, -1.05, 1.55), target_pos=(4.30, -0.15, 1.52), lens=26.0)
    render_preview(os.path.join(preview_dir, "room_aaa_west_south.png"),
                   cam_pos=(1.85, 1.85, 1.65), target_pos=(-2.6, -2.4, 1.42), lens=24.0)


if __name__ == "__main__":
    build_room()
