import math
import os
import sys
import bpy
from mathutils import Vector, Euler

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "..", ".."))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

from pbr_utils import reset_scene, render_preview


def import_glb(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(path))
    after = set(bpy.data.objects)
    new_objs = list(after - before)
    roots = [o for o in new_objs if o.parent is None]
    return roots, new_objs


def render_4k_master():
    scene = reset_scene()
    models_dir = os.path.join(REPO_ROOT, "public", "models")

    # 1. Import all 3 new AAA Blender 5.2 GLBs (Poly Haven Room + Mixamo YA Operator + Tactical Husky)
    import_glb(os.path.join(models_dir, "room.glb"))

    op_roots, _ = import_glb(os.path.join(models_dir, "operator.glb"))
    # Parent Mixamo YA Operator to a placement Empty so Idle root keyframes don't reset his location!
    op_holder = bpy.data.objects.new("Operator_Placement", None)
    scene.collection.objects.link(op_holder)
    op_holder.location = Vector((-0.52, -1.85, 0.0))
    op_holder.rotation_euler = Euler((0, 0, math.radians(-16)), 'XYZ')
    for r in op_roots:
        r.parent = op_holder

    hk_roots, _ = import_glb(os.path.join(models_dir, "husky.glb"))
    hk_holder = bpy.data.objects.new("Husky_Placement", None)
    scene.collection.objects.link(hk_holder)
    hk_holder.location = Vector((0.58, 2.02, 0.41))
    hk_holder.rotation_euler = Euler((0, 0, math.radians(20)), 'XYZ')
    for r in hk_roots:
        r.parent = hk_holder

    # 2. Load real Poly Haven Studio HDRI into Blender World + Cinematic Crimson/Warm Key Lights
    world = scene.world
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld")
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs["Strength"].default_value = 0.22
    hdri_path = os.path.join(REPO_ROOT, "public", "textures", "warroom_env.hdr")
    if os.path.exists(hdri_path):
        env = nt.nodes.new("ShaderNodeTexEnvironment")
        env.image = bpy.data.images.load(hdri_path, check_existing=True)
        nt.links.new(env.outputs["Color"], bg.inputs["Color"])
    else:
        bg.inputs["Color"].default_value = (0.03, 0.008, 0.010, 1.0)
    nt.links.new(bg.outputs["Background"], out.inputs["Surface"])

    def add_light(name, ltype, loc, energy, color, size=1.4, rot=(0, 0, 0), cast_shadow=False):
        ld = bpy.data.lights.new(name=name, type=ltype)
        ld.energy = energy
        ld.color = color
        ld.use_shadow = cast_shadow
        if ltype == 'AREA':
            ld.size = size
        elif ltype == 'POINT':
            ld.shadow_soft_size = size
        lo = bpy.data.objects.new(name, ld)
        lo.location = loc
        lo.rotation_euler = rot
        scene.collection.objects.link(lo)

    add_light("Eclipse_Rim", 'AREA', (-0.15, 3.6, 2.4), 360.0, (1.0, 0.14, 0.12), size=3.4, rot=(math.radians(74), 0, 0), cast_shadow=True)
    add_light("Hero_WarmKey", 'AREA', (-1.2, -2.5, 2.4), 260.0, (1.0, 0.88, 0.72), size=2.0, rot=(math.radians(-46), 0, math.radians(-24)), cast_shadow=True)
    add_light("GoldAK_BackKey", 'AREA', (-0.4, -3.2, 2.1), 190.0, (1.0, 0.90, 0.72), size=1.4, rot=(math.radians(-58), 0, math.radians(-10)), cast_shadow=False)
    add_light("Lantern_Glow", 'POINT', (2.58, 2.10, 1.12), 145.0, (1.0, 0.16, 0.10), size=0.18, cast_shadow=False)
    add_light("Portrait_Spot", 'AREA', (-2.95, 3.2, 2.9), 95.0, (1.0, 0.80, 0.60), size=1.2, rot=(math.radians(65), 0, 0), cast_shadow=False)
    add_light("Poster_Spot", 'AREA', (2.68, 3.2, 2.7), 90.0, (1.0, 0.25, 0.22), size=1.2, rot=(math.radians(65), 0, 0), cast_shadow=False)
    add_light("Shelf_Wash", 'AREA', (2.8, -0.1, 2.5), 115.0, (1.0, 0.24, 0.20), size=2.4, rot=(0, math.radians(52), 0), cast_shadow=False)

    # 3. Render True 4K (3840x2160) Over-the-Shoulder 3rd-Person AAA Showcase!
    preview_only = "--preview-only" in sys.argv
    if not preview_only:
        out_dir = os.path.join(REPO_ROOT, "public", "renders")
        render_preview(
            os.path.join(out_dir, "warroom-hero-4k.png"),
            cam_pos=(0.32, -3.72, 1.62),
            target_pos=(-0.05, 1.95, 1.30),
            lens=24.0,
            res=(3840, 2160),
            samples=48,
            exposure=0.42,
        )
    render_preview(
        os.path.join(REPO_ROOT, "scripts", "blender", "previews", "assembled_aaa_3p_check.png"),
        cam_pos=(0.32, -3.72, 1.62),
        target_pos=(-0.05, 1.95, 1.30),
        lens=24.0,
        res=(1280, 720),
        samples=32,
        exposure=0.42,
    )


if __name__ == "__main__":
    render_4k_master()
