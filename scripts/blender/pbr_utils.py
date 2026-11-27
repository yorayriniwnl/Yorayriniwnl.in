import math
import os
import bpy
import bmesh
import numpy as np
from mathutils import Vector, Matrix, Euler


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1.0
    if scene.world is None:
        scene.world = bpy.data.worlds.new("World")
    return scene


def ensure_collection(name, parent=None):
    if name in bpy.data.collections:
        return bpy.data.collections[name]
    col = bpy.data.collections.new(name)
    if parent is None:
        bpy.context.scene.collection.children.link(col)
    else:
        parent.children.link(col)
    return col


def link_to_collection(obj, col):
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    col.objects.link(obj)


def set_smooth(obj, smooth=True):
    if obj.type != 'MESH' or not obj.data.polygons:
        return
    vals = [smooth] * len(obj.data.polygons)
    obj.data.polygons.foreach_set("use_smooth", vals)
    obj.data.update()


def add_bevel(obj, width=0.008, segments=2, angle_limit=math.radians(32)):
    mod = obj.modifiers.new(name="Bevel", type='BEVEL')
    mod.width = width
    mod.segments = segments
    mod.limit_method = 'ANGLE'
    mod.angle_limit = angle_limit
    mod.harden_normals = False
    return mod


def add_subsurf(obj, levels=2, render_levels=2):
    mod = obj.modifiers.new(name="Subsurf", type='SUBSURF')
    mod.levels = levels
    mod.render_levels = render_levels
    return mod


def apply_modifiers(obj, skip_types=('ARMATURE',)):
    if obj.type != 'MESH':
        return
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    for mod in list(obj.modifiers):
        if mod.type in skip_types:
            continue
        try:
            bpy.ops.object.modifier_apply(modifier=mod.name)
        except Exception as exc:
            print(f"[WARN] Could not apply modifier {mod.name} on {obj.name}: {exc}")


def triangulate_ngons(obj):
    if obj.type != 'MESH':
        return
    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)
    ngons = [f for f in bm.faces if len(f.verts) > 4]
    if ngons:
        bmesh.ops.triangulate(bm, faces=ngons)
        bm.to_mesh(me)
    bm.free()
    me.update()


def box_uv_project(obj, scale=1.0):
    if obj.type != 'MESH':
        return
    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)
    uv_layer = bm.loops.layers.uv.verify()
    for face in bm.faces:
        n = face.normal
        ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
        for loop in face.loops:
            co = loop.vert.co
            if az >= ax and az >= ay:
                u, v = co.x * scale, co.y * scale
            elif ax >= ay and ax >= az:
                u, v = co.y * scale, co.z * scale
            else:
                u, v = co.x * scale, co.z * scale
            loop[uv_layer].uv = (u, v)
    bm.to_mesh(me)
    bm.free()
    me.update()


def cylindrical_uv_project(obj, scale=1.5):
    if obj.type != 'MESH':
        return
    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)
    uv_layer = bm.loops.layers.uv.verify()
    if not bm.verts:
        bm.free()
        return
    center = sum((v.co for v in bm.verts), Vector((0, 0, 0))) / float(len(bm.verts))
    for face in bm.faces:
        us = []
        vs = []
        for loop in face.loops:
            rel = loop.vert.co - center
            ang = math.atan2(rel.y, rel.x)
            u = (ang / (2.0 * math.pi) + 0.5) * scale
            v = rel.z * scale
            us.append(u)
            vs.append(v)
        if max(us) - min(us) > scale * 0.5:
            us = [u + scale if u < scale * 0.5 else u for u in us]
        for loop, u, v in zip(face.loops, us, vs):
            loop[uv_layer].uv = (u, v)
    bm.to_mesh(me)
    bm.free()
    me.update()


def planar_uv_bounds(obj, axis='Y', flip_u=False, flip_v=False):
    if obj.type != 'MESH':
        return
    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)
    uv_layer = bm.loops.layers.uv.verify()
    xs = [v.co.x for v in bm.verts]
    ys = [v.co.y for v in bm.verts]
    zs = [v.co.z for v in bm.verts]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    min_z, max_z = min(zs), max(zs)
    dx = max(max_x - min_x, 1e-6)
    dy = max(max_y - min_y, 1e-6)
    dz = max(max_z - min_z, 1e-6)
    for face in bm.faces:
        for loop in face.loops:
            co = loop.vert.co
            if axis == 'Z':
                u = (co.x - min_x) / dx
                v = (co.y - min_y) / dy
            elif axis == 'X':
                u = (co.y - min_y) / dy
                v = (co.z - min_z) / dz
            else:
                u = (co.x - min_x) / dx
                v = (co.z - min_z) / dz
            if flip_u:
                u = 1.0 - u
            if flip_v:
                v = 1.0 - v
            loop[uv_layer].uv = (u, v)
    bm.to_mesh(me)
    bm.free()
    me.update()


def join_objects(objects, name, col=None):
    valid = [o for o in objects if o is not None and o.type == 'MESH']
    if not valid:
        return None
    bpy.ops.object.select_all(action='DESELECT')
    for o in valid:
        o.select_set(True)
    bpy.context.view_layer.objects.active = valid[0]
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    if len(valid) > 1:
        bpy.ops.object.join()
    joined = bpy.context.active_object
    joined.name = name
    if col is not None:
        link_to_collection(joined, col)
    return joined


def voxel_sculpt_join(objects, name, voxel_size=0.010, smooth_iters=10, smooth_factor=0.5,
                      decimate_ratio=0.30, mat=None, col=None, uv_scale=2.0):
    valid = [o for o in objects if o is not None and o.type == 'MESH']
    for o in valid:
        bm = bmesh.new()
        bm.from_mesh(o.data)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(o.data)
        bm.free()
        o.data.update()

    bpy.ops.object.select_all(action='DESELECT')
    for o in valid:
        o.select_set(True)
    bpy.context.view_layer.objects.active = valid[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if len(valid) > 1:
        bpy.ops.object.join()
    obj = bpy.context.active_object
    obj.name = name
    if col is not None:
        link_to_collection(obj, col)

    rem = obj.modifiers.new("VoxelRemesh", 'REMESH')
    rem.mode = 'VOXEL'
    rem.voxel_size = voxel_size
    rem.use_smooth_shade = True

    sm = obj.modifiers.new("OrganicSmooth", 'SMOOTH')
    sm.factor = smooth_factor
    sm.iterations = smooth_iters

    if decimate_ratio < 0.99:
        dec = obj.modifiers.new("GameDecimate", 'DECIMATE')
        dec.ratio = decimate_ratio

    apply_modifiers(obj)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()

    cylindrical_uv_project(obj, scale=uv_scale)
    set_smooth(obj, True)
    obj.data.materials.clear()
    if mat is not None:
        obj.data.materials.append(mat)
    return obj


def create_box(name, size, location=(0, 0, 0), rotation=(0, 0, 0), mat=None, col=None, bevel=0.0, uv_scale=1.0):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    sx, sy, sz = size
    for v in bm.verts:
        v.co.x *= sx
        v.co.y *= sy
        v.co.z *= sz
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    obj.location = location
    obj.rotation_euler = rotation
    if col is not None:
        col.objects.link(obj)
    else:
        bpy.context.scene.collection.objects.link(obj)
    if bevel > 0:
        add_bevel(obj, width=bevel, segments=2)
        apply_modifiers(obj)
    triangulate_ngons(obj)
    box_uv_project(obj, scale=uv_scale)
    set_smooth(obj, bevel > 0)
    if mat is not None:
        obj.data.materials.append(mat)
    return obj


def create_cylinder(name, radius, depth, segments=24, location=(0, 0, 0), rotation=(0, 0, 0),
                    radius2=None, cap_ends=True, mat=None, col=None, uv_scale=1.5):
    bm = bmesh.new()
    r2 = radius if radius2 is None else radius2
    bmesh.ops.create_cone(
        bm,
        cap_ends=cap_ends,
        cap_tris=True,
        segments=segments,
        radius1=radius,
        radius2=r2,
        depth=depth,
    )
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    obj.location = location
    obj.rotation_euler = rotation
    if col is not None:
        col.objects.link(obj)
    else:
        bpy.context.scene.collection.objects.link(obj)
    cylindrical_uv_project(obj, scale=uv_scale)
    set_smooth(obj, True)
    if mat is not None:
        obj.data.materials.append(mat)
    return obj


def create_lathe(name, profile_rz, segments=32, location=(0, 0, 0), rotation=(0, 0, 0),
                 mat=None, col=None, cap_bottom=True, cap_top=True, uv_scale=1.5):
    bm = bmesh.new()
    rings = []
    for r, z in profile_rz:
        ring = []
        for s in range(segments):
            ang = (2.0 * math.pi * s) / segments
            v = bm.verts.new((r * math.cos(ang), r * math.sin(ang), z))
            ring.append(v)
        rings.append(ring)
    for i in range(len(rings) - 1):
        r0 = rings[i]
        r1 = rings[i + 1]
        for s in range(segments):
            sn = (s + 1) % segments
            try:
                bm.faces.new((r0[s], r0[sn], r1[sn], r1[s]))
            except ValueError:
                pass
    if cap_bottom and profile_rz[0][0] > 1e-4:
        center_b = bm.verts.new((0.0, 0.0, profile_rz[0][1]))
        for s in range(segments):
            sn = (s + 1) % segments
            bm.faces.new((rings[0][sn], rings[0][s], center_b))
    if cap_top and profile_rz[-1][0] > 1e-4:
        center_t = bm.verts.new((0.0, 0.0, profile_rz[-1][1]))
        for s in range(segments):
            sn = (s + 1) % segments
            bm.faces.new((rings[-1][s], rings[-1][sn], center_t))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    obj.location = location
    obj.rotation_euler = rotation
    if col is not None:
        col.objects.link(obj)
    else:
        bpy.context.scene.collection.objects.link(obj)
    cylindrical_uv_project(obj, scale=uv_scale)
    set_smooth(obj, True)
    if mat is not None:
        obj.data.materials.append(mat)
    return obj


def create_sphere(name, radius=0.5, scale=(1, 1, 1), segments=24, rings=16, location=(0, 0, 0),
                  rotation=(0, 0, 0), mat=None, col=None, uv_scale=1.5):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=rings, radius=radius)
    for v in bm.verts:
        v.co.x *= scale[0]
        v.co.y *= scale[1]
        v.co.z *= scale[2]
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    obj.location = location
    obj.rotation_euler = rotation
    if col is not None:
        col.objects.link(obj)
    else:
        bpy.context.scene.collection.objects.link(obj)
    cylindrical_uv_project(obj, scale=uv_scale)
    set_smooth(obj, True)
    if mat is not None:
        obj.data.materials.append(mat)
    return obj


def create_capsule(name, p0, p1, r0, r1=None, segments=18, rings=6, mat=None, col=None, uv_scale=2.0):
    if r1 is None:
        r1 = r0
    v0 = Vector(p0)
    v1 = Vector(p1)
    diff = v1 - v0
    length = diff.length
    if length < 1e-5:
        return create_sphere(name, radius=r0, location=v0, mat=mat, col=col)
    profile = []
    for k in range(4):
        ang = -math.pi * 0.5 + (math.pi * 0.5) * (k / 3.0)
        r = max(0.0006, r0 * math.cos(ang))
        z = r0 * math.sin(ang)
        profile.append((r, z))
    for k in range(1, rings):
        t = k / float(rings)
        r = r0 * (1.0 - t) + r1 * t
        z = length * t
        profile.append((r, z))
    for k in range(4):
        ang = (math.pi * 0.5) * (k / 3.0)
        r = max(0.0006, r1 * math.cos(ang))
        z = length + r1 * math.sin(ang)
        profile.append((r, z))

    obj = create_lathe(name, profile, segments=segments, mat=mat, col=col,
                       cap_bottom=True, cap_top=True, uv_scale=uv_scale)
    obj.location = v0
    quat = Vector((0, 0, 1)).rotation_difference(diff.normalized())
    obj.rotation_euler = quat.to_euler()
    return obj


def create_3d_text_mesh(name, text, size=0.14, extrude=0.012, bevel_depth=0.002,
                        location=(0, 0, 0), rotation=(0, 0, 0), mat=None, col=None, align_x='CENTER'):
    curve = bpy.data.curves.new(name=f"{name}_Curve", type='FONT')
    curve.body = text
    curve.size = size
    curve.extrude = extrude
    curve.bevel_depth = bevel_depth
    curve.bevel_resolution = 1
    curve.align_x = align_x
    curve.align_y = 'CENTER'
    curve.space_character = 1.08
    obj = bpy.data.objects.new(name, curve)
    if col is not None:
        col.objects.link(obj)
    else:
        bpy.context.scene.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = rotation
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target='MESH')
    mesh_obj = bpy.context.active_object
    box_uv_project(mesh_obj, scale=2.0)
    if mat is not None:
        mesh_obj.data.materials.clear()
        mesh_obj.data.materials.append(mat)
    return mesh_obj


def create_hair_strand(name, pts, radii, segs=8, mat=None, col=None):
    """Create a curved tapered organic hair lock along 3D control points."""
    bm = bmesh.new()
    rings = []
    n = len(pts)
    for i, (pt, rad) in enumerate(zip(pts, radii)):
        p = Vector(pt)
        if i == 0:
            tan = (Vector(pts[1]) - p).normalized()
        elif i == n - 1:
            tan = (p - Vector(pts[-2])).normalized()
        else:
            tan = (Vector(pts[i + 1]) - Vector(pts[i - 1])).normalized()
        up = Vector((0, 0, 1)) if abs(tan.z) < 0.92 else Vector((1, 0, 0))
        side = tan.cross(up).normalized()
        ortho = side.cross(tan).normalized()
        ring = []
        for s in range(segs):
            ang = (2.0 * math.pi * s) / segs
            # Slightly flattened ribbon cross-section for sleek anime/realistic hair locks
            offset = side * (rad * 1.35 * math.cos(ang)) + ortho * (rad * 0.62 * math.sin(ang))
            ring.append(bm.verts.new(p + offset))
        rings.append(ring)
    for i in range(len(rings) - 1):
        r0, r1 = rings[i], rings[i + 1]
        for s in range(segs):
            sn = (s + 1) % segs
            bm.faces.new((r0[s], r0[sn], r1[sn], r1[s]))
    # Tip cap
    tip = bm.verts.new(Vector(pts[-1]))
    for s in range(segs):
        sn = (s + 1) % segs
        bm.faces.new((rings[-1][s], rings[-1][sn], tip))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    col.objects.link(obj)
    cylindrical_uv_project(obj, scale=4.0)
    set_smooth(obj, True)
    if mat is not None:
        obj.data.materials.append(mat)
    return obj


# ---------------------------------------------------------------------------
# High-Resolution Procedural NumPy PBR Image Generators (2K / 4K ready!)
# ---------------------------------------------------------------------------

def _tileable_fbm(res, octaves=4, seed=42, scale_x=4.0, scale_y=4.0):
    rng = np.random.default_rng(seed)
    y = np.linspace(0, 1, res, endpoint=False)
    x = np.linspace(0, 1, res, endpoint=False)
    xx, yy = np.meshgrid(x, y)
    acc = np.zeros((res, res), dtype=np.float32)
    amp = 0.5
    tot = 0.0
    for o in range(octaves):
        gx = max(2, int(round(scale_x * (2 ** o))))
        gy = max(2, int(round(scale_y * (2 ** o))))
        grid = rng.random((gy, gx)).astype(np.float32)
        fx = xx * gx
        fy = yy * gy
        ix0 = np.floor(fx).astype(np.int32) % gx
        iy0 = np.floor(fy).astype(np.int32) % gy
        ix1 = (ix0 + 1) % gx
        iy1 = (iy0 + 1) % gy
        tx = fx - np.floor(fx)
        ty = fy - np.floor(fy)
        tx = tx * tx * (3.0 - 2.0 * tx)
        ty = ty * ty * (3.0 - 2.0 * ty)
        v00 = grid[iy0, ix0]
        v10 = grid[iy0, ix1]
        v01 = grid[iy1, ix0]
        v11 = grid[iy1, ix1]
        val = (v00 * (1 - tx) + v10 * tx) * (1 - ty) + (v01 * (1 - tx) + v11 * tx) * ty
        acc += val * amp
        tot += amp
        amp *= 0.5
    return acc / max(tot, 1e-6)


def _height_to_normal(height, strength=2.5):
    gx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) * strength
    gy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) * strength
    nx = -gx
    ny = -gy
    nz = np.ones_like(height)
    inv_len = 1.0 / np.sqrt(nx * nx + ny * ny + nz * nz + 1e-8)
    rgb = np.stack([
        (nx * inv_len) * 0.5 + 0.5,
        (ny * inv_len) * 0.5 + 0.5,
        (nz * inv_len) * 0.5 + 0.5,
    ], axis=-1)
    return np.clip(rgb, 0.0, 1.0).astype(np.float32)


def _stamp_polyline(canvas, pts, width, value=1.0):
    n = canvas.shape[0]
    r = int(math.ceil(width + 2))
    for i in range(len(pts) - 1):
        (x0, y0), (x1, y1) = pts[i], pts[i + 1]
        seg = max(1, int(math.hypot(x1 - x0, y1 - y0) / max(0.7, width * 0.55)))
        for s in range(seg + 1):
            x = x0 + (x1 - x0) * s / seg
            y = y0 + (y1 - y0) * s / seg
            xi, yi = int(x), int(y)
            ys = np.arange(yi - r, yi + r + 1)
            xs = np.arange(xi - r, xi + r + 1)
            dy = ys[:, None] - y
            dx = xs[None, :] - x
            d = np.sqrt(dx * dx + dy * dy)
            a = np.clip(width - d + 0.5, 0.0, 1.0) * value
            sub = canvas[np.ix_(ys % n, xs % n)]
            canvas[np.ix_(ys % n, xs % n)] = np.maximum(sub, a)


def _scrollwork_mask(res=1024, seed=17, count=34, line_scale=1.0):
    rng = np.random.default_rng(seed)
    m = np.zeros((res, res), dtype=np.float32)
    sc = (res / 512.0) * line_scale
    for _ in range(count):
        cx, cy = rng.uniform(0, res, 2)
        size = rng.uniform(0.055, 0.13) * res
        turns = rng.uniform(1.4, 2.3)
        direction = rng.choice([-1.0, 1.0])
        a0 = rng.uniform(0, math.tau)
        pts = []
        steps = 96
        for s in range(steps):
            t = s / float(steps - 1)
            ang = a0 + direction * t * turns * math.tau
            rad = size * ((1.0 - t) ** 1.2) + 2.0 * sc
            pts.append((cx + math.cos(ang) * rad, cy + math.sin(ang) * rad))
        for i in range(0, steps - 12, 12):
            w = (2.6 * (1.0 - i / float(steps)) + 1.0) * sc
            _stamp_polyline(m, pts[i:i + 13], w)
        # Flowing acanthus stem with leaf flares
        ang = a0 + rng.uniform(-0.4, 0.4)
        x, y = pts[0]
        stem = [(x, y)]
        for s in range(26):
            ang += direction * 0.06 + rng.normal(0, 0.03)
            x += math.cos(ang) * size * 0.065
            y += math.sin(ang) * size * 0.065
            stem.append((x, y))
            if s % 7 == 3:
                la = ang + direction * 1.15
                leaf = [(x, y)]
                for _ in range(7):
                    la -= direction * 0.18
                    leaf.append((leaf[-1][0] + math.cos(la) * size * 0.055,
                                 leaf[-1][1] + math.sin(la) * size * 0.055))
                _stamp_polyline(m, leaf, 1.8 * sc)
        _stamp_polyline(m, stem, 2.0 * sc)
    return np.clip(m, 0.0, 1.0)


def array_to_packed_image(name, rgb_or_rgba, is_data=False):
    h, w, c = rgb_or_rgba.shape
    if c == 3:
        rgba = np.ones((h, w, 4), dtype=np.float32)
        rgba[:, :, :3] = rgb_or_rgba
    else:
        rgba = rgb_or_rgba.astype(np.float32)
    img = bpy.data.images.new(name=name, width=w, height=h, alpha=(c == 4), float_buffer=False)
    flat = np.ascontiguousarray(rgba[::-1, :, :]).ravel()
    img.pixels.foreach_set(flat)
    img.update()
    tex_cache = os.path.join(os.path.dirname(os.path.abspath(__file__)), "generated_tex")
    os.makedirs(tex_cache, exist_ok=True)
    # Save color/roughness as high-quality JPEG (or PNG for normals/alpha) to keep 2K-4K GLBs crisp AND web-fast
    if not is_data and c == 3:
        out_path = os.path.join(tex_cache, f"{name}.jpg")
        img.filepath_raw = out_path
        img.file_format = 'JPEG'
    else:
        out_path = os.path.join(tex_cache, f"{name}.png")
        img.filepath_raw = out_path
        img.file_format = 'PNG'
    bpy.context.scene.render.image_settings.quality = 92
    img.save()
    bpy.data.images.remove(img)
    loaded = bpy.data.images.load(out_path, check_existing=False)
    loaded.name = name
    loaded.colorspace_settings.name = 'Non-Color' if is_data else 'sRGB'
    loaded.pack()
    return loaded


def load_packed_image(filepath, name=None, is_data=False):
    abs_path = os.path.abspath(filepath)
    if not os.path.exists(abs_path):
        raise FileNotFoundError(f"Texture not found: {abs_path}")
    img = bpy.data.images.load(abs_path, check_existing=True)
    if name:
        img.name = name
    img.colorspace_settings.name = 'Non-Color' if is_data else 'sRGB'
    img.pack()
    return img


def gen_dark_wood_pbr(prefix="DarkWood", res=1024, seed=11, base_rgb=(0.055, 0.026, 0.018), planks=6):
    y = np.linspace(0, 1, res, endpoint=False)
    x = np.linspace(0, 1, res, endpoint=False)
    xx, yy = np.meshgrid(x, y)
    n1 = _tileable_fbm(res, octaves=5, seed=seed, scale_x=3, scale_y=18)
    n2 = _tileable_fbm(res, octaves=4, seed=seed + 7, scale_x=6, scale_y=36)
    rings = np.sin((xx * 18.0 + n1 * 4.5) * math.pi * 2.0) * 0.5 + 0.5
    grain = 0.55 * rings + 0.45 * n2
    plank_idx = np.floor(xx * planks)
    plank_var = 0.85 + 0.3 * np.sin(plank_idx * 12.9898 + seed)
    seam_x = np.abs((xx * planks) - np.round(xx * planks))
    seam_mask = np.clip(seam_x * 65.0, 0.0, 1.0)
    offset_y = (yy + (plank_idx % 2) * 0.5) % 1.0
    seam_y = np.abs((offset_y * 2.0) - np.round(offset_y * 2.0))
    seam_mask *= np.clip(seam_y * 90.0, 0.0, 1.0)

    tone = (0.62 + 0.55 * grain) * plank_var * (0.3 + 0.7 * seam_mask)
    albedo = np.stack([
        np.clip(base_rgb[0] * tone, 0.0, 1.0),
        np.clip(base_rgb[1] * tone, 0.0, 1.0),
        np.clip(base_rgb[2] * tone, 0.0, 1.0),
    ], axis=-1)
    height = np.clip(grain * 0.4 + seam_mask * 0.6, 0.0, 1.0)
    rough = np.clip(0.32 + (1.0 - grain) * 0.25 + (1.0 - seam_mask) * 0.35, 0.15, 0.92)
    rough_rgb = np.stack([rough, rough, rough], axis=-1)
    normal = _height_to_normal(height, strength=3.0)
    return {
        "albedo": array_to_packed_image(f"{prefix}_Albedo", albedo, is_data=False),
        "roughness": array_to_packed_image(f"{prefix}_Rough", rough_rgb, is_data=True),
        "normal": array_to_packed_image(f"{prefix}_Normal", normal, is_data=True),
    }


def gen_dark_wall_pbr(prefix="ObsidianWall", res=1024, seed=23, base_rgb=(0.036, 0.024, 0.028)):
    n1 = _tileable_fbm(res, octaves=5, seed=seed, scale_x=5, scale_y=5)
    n2 = _tileable_fbm(res, octaves=4, seed=seed + 13, scale_x=18, scale_y=18)
    h = 0.65 * n1 + 0.35 * n2
    tone = 0.72 + 0.52 * h
    albedo = np.stack([
        np.clip(base_rgb[0] * tone, 0.0, 1.0),
        np.clip(base_rgb[1] * tone, 0.0, 1.0),
        np.clip(base_rgb[2] * tone, 0.0, 1.0),
    ], axis=-1)
    rough = np.clip(0.68 + (1.0 - h) * 0.24, 0.45, 0.96)
    rough_rgb = np.stack([rough, rough, rough], axis=-1)
    normal = _height_to_normal(h, strength=2.0)
    return {
        "albedo": array_to_packed_image(f"{prefix}_Albedo", albedo, is_data=False),
        "roughness": array_to_packed_image(f"{prefix}_Rough", rough_rgb, is_data=True),
        "normal": array_to_packed_image(f"{prefix}_Normal", normal, is_data=True),
    }


def gen_leather_pbr(prefix="CrimsonLeather", res=1024, seed=31, base_rgb=(0.18, 0.022, 0.024), tufted=True):
    y = np.linspace(0, 1, res, endpoint=False)
    x = np.linspace(0, 1, res, endpoint=False)
    xx, yy = np.meshgrid(x, y)
    pebble = _tileable_fbm(res, octaves=4, seed=seed, scale_x=32, scale_y=32)
    creases = _tileable_fbm(res, octaves=4, seed=seed + 5, scale_x=8, scale_y=8)
    if tufted:
        u = (xx + yy) * 4.0
        v = (xx - yy) * 4.0
        du = np.abs(u - np.round(u)) * 2.0
        dv = np.abs(v - np.round(v)) * 2.0
        pillow = np.sqrt(np.clip(1.0 - 0.55 * (du * du + dv * dv), 0.05, 1.0))
        button = np.clip((du * du + dv * dv) * 14.0, 0.0, 1.0)
        h = np.clip(pillow * 0.72 * (0.4 + 0.6 * button) + pebble * 0.16 + creases * 0.12, 0.0, 1.0)
        ao = 0.44 + 0.56 * np.clip(pillow, 0.0, 1.0)
    else:
        h = np.clip(pebble * 0.55 + creases * 0.45, 0.0, 1.0)
        ao = 0.8 + 0.2 * creases
    tone = ao * (0.82 + 0.35 * pebble)
    albedo = np.stack([
        np.clip(base_rgb[0] * tone, 0.0, 1.0),
        np.clip(base_rgb[1] * tone, 0.0, 1.0),
        np.clip(base_rgb[2] * tone, 0.0, 1.0),
    ], axis=-1)
    rough = np.clip(0.26 + (1.0 - ao) * 0.32 + (1.0 - pebble) * 0.14, 0.16, 0.85)
    rough_rgb = np.stack([rough, rough, rough], axis=-1)
    normal = _height_to_normal(h, strength=3.8 if tufted else 1.8)
    return {
        "albedo": array_to_packed_image(f"{prefix}_Albedo", albedo, is_data=False),
        "roughness": array_to_packed_image(f"{prefix}_Rough", rough_rgb, is_data=True),
        "normal": array_to_packed_image(f"{prefix}_Normal", normal, is_data=True),
    }


def gen_brushed_metal_pbr(prefix="DarkSteel", res=1024, seed=41, base_rgb=(0.065, 0.068, 0.078), rough_base=0.28):
    streaks = _tileable_fbm(res, octaves=4, seed=seed, scale_x=4, scale_y=48)
    wear = _tileable_fbm(res, octaves=4, seed=seed + 3, scale_x=8, scale_y=8)
    h = 0.65 * streaks + 0.35 * wear
    tone = 0.82 + 0.36 * h
    albedo = np.stack([
        np.clip(base_rgb[0] * tone, 0.0, 1.0),
        np.clip(base_rgb[1] * tone, 0.0, 1.0),
        np.clip(base_rgb[2] * tone, 0.0, 1.0),
    ], axis=-1)
    rough = np.clip(rough_base + (0.5 - h) * 0.20, 0.12, 0.72)
    rough_rgb = np.stack([rough, rough, rough], axis=-1)
    normal = _height_to_normal(h, strength=1.5)
    return {
        "albedo": array_to_packed_image(f"{prefix}_Albedo", albedo, is_data=False),
        "roughness": array_to_packed_image(f"{prefix}_Rough", rough_rgb, is_data=True),
        "normal": array_to_packed_image(f"{prefix}_Normal", normal, is_data=True),
    }


def gen_ak_gold_filigree_pbr(prefix="AKGoldFiligree", res=1024, seed=55):
    """True baroque acanthus 24K gold scrollwork inlaid on blackened AK steel (matching painting.webp)."""
    scroll = _scrollwork_mask(res=res, seed=seed, count=42, line_scale=1.15)
    micro = _tileable_fbm(res, octaves=4, seed=seed + 9, scale_x=28, scale_y=28)
    y = np.linspace(0, 1, res, endpoint=False)
    x = np.linspace(0, 1, res, endpoint=False)
    xx, yy = np.meshgrid(x, y)
    # Fine baroque edge framing borders
    border = np.maximum(np.exp(-((yy - 0.05) * 32.0) ** 2), np.exp(-((yy - 0.95) * 32.0) ** 2))
    relief = np.clip(np.maximum(scroll * 1.25, border * 0.9), 0.0, 1.0)

    gold = np.array([0.98, 0.76, 0.26], dtype=np.float32)
    steel = np.array([0.045, 0.044, 0.048], dtype=np.float32)
    m = relief[:, :, None]
    albedo = steel * (1.0 - m) + gold * m * (0.88 + 0.22 * micro[:, :, None])
    rough = np.clip(0.42 * (1.0 - relief) + 0.14 * relief + (micro - 0.5) * 0.06, 0.10, 0.60)
    rough_rgb = np.stack([rough, rough, rough], axis=-1)
    normal = _height_to_normal(relief * 0.9 + micro * 0.1, strength=4.2)
    return {
        "albedo": array_to_packed_image(f"{prefix}_Albedo", np.clip(albedo, 0.0, 1.0), is_data=False),
        "roughness": array_to_packed_image(f"{prefix}_Rough", rough_rgb, is_data=True),
        "normal": array_to_packed_image(f"{prefix}_Normal", normal, is_data=True),
    }


def gen_damask_fabric_pbr(prefix="DamaskJacket", res=1024, seed=63):
    """Black tactical jacket fabric woven with crimson baroque damask medallions & swirls (painting.webp!)."""
    y = np.linspace(0, 1, res, endpoint=False)
    x = np.linspace(0, 1, res, endpoint=False)
    xx, yy = np.meshgrid(x, y)
    # Medallions + swirling red damask motifs
    motif = np.zeros((res, res), dtype=np.float32)
    for ox, oy in ((0.25, 0.25), (0.75, 0.75), (0.25, 0.75), (0.75, 0.25)):
        dx = ((xx - ox + 0.5) % 1.0) - 0.5
        dy = ((yy - oy + 0.5) % 1.0) - 0.5
        r = np.sqrt((dx * 1.2) ** 2 + dy ** 2)
        ang = np.arctan2(dy, dx)
        petals = 0.5 + 0.5 * np.cos(ang * 6.0)
        ring = np.clip(1.0 - np.abs(r - (0.11 + 0.045 * petals)) / 0.016, 0.0, 1.0)
        core = np.clip(1.0 - np.abs(r - 0.042) / 0.012, 0.0, 1.0)
        motif = np.maximum(motif, np.maximum(ring, core))
    swirl = _scrollwork_mask(res=res, seed=seed, count=22, line_scale=0.9) * 0.78
    pattern = np.clip(np.maximum(motif, swirl), 0.0, 1.0)

    weave = 0.5 * (np.sin(xx * math.pi * 128.0) * np.sin(yy * math.pi * 128.0) * 0.5 + 0.5)
    folds = _tileable_fbm(res, octaves=4, seed=seed + 4, scale_x=6, scale_y=6)
    base_black = np.array([0.026, 0.024, 0.028], dtype=np.float32)
    crimson_red = np.array([0.46, 0.032, 0.036], dtype=np.float32)
    m = pattern[:, :, None]
    albedo = (base_black * (1.0 - m) + crimson_red * m) * (0.76 + 0.40 * folds[:, :, None])
    h = np.clip(folds * 0.5 + pattern * 0.32 + weave * 0.18, 0.0, 1.0)
    rough = np.clip(0.82 - pattern * 0.16 + (1.0 - h) * 0.12, 0.52, 0.96)
    rough_rgb = np.stack([rough, rough, rough], axis=-1)
    normal = _height_to_normal(h, strength=2.2)
    return {
        "albedo": array_to_packed_image(f"{prefix}_Albedo", np.clip(albedo, 0.0, 1.0), is_data=False),
        "roughness": array_to_packed_image(f"{prefix}_Rough", rough_rgb, is_data=True),
        "normal": array_to_packed_image(f"{prefix}_Normal", normal, is_data=True),
    }


def gen_tactical_fabric_pbr(prefix="TacFabric", res=1024, seed=61, base_rgb=(0.042, 0.044, 0.052)):
    y = np.linspace(0, 1, res, endpoint=False)
    x = np.linspace(0, 1, res, endpoint=False)
    xx, yy = np.meshgrid(x, y)
    grid_x = (np.sin(xx * math.pi * 64.0) > 0.84).astype(np.float32)
    grid_y = (np.sin(yy * math.pi * 64.0) > 0.84).astype(np.float32)
    ripstop = np.maximum(grid_x, grid_y) * 0.22
    weave = 0.5 * (np.sin(xx * math.pi * 128.0) * np.sin(yy * math.pi * 128.0) * 0.5 + 0.5)
    folds = _tileable_fbm(res, octaves=4, seed=seed, scale_x=5, scale_y=5)
    h = np.clip(folds * 0.62 + ripstop + weave * 0.16, 0.0, 1.0)
    tone = 0.78 + 0.42 * h
    albedo = np.stack([
        np.clip(base_rgb[0] * tone, 0.0, 1.0),
        np.clip(base_rgb[1] * tone, 0.0, 1.0),
        np.clip(base_rgb[2] * tone, 0.0, 1.0),
    ], axis=-1)
    rough = np.clip(0.76 + (1.0 - h) * 0.18, 0.55, 0.96)
    rough_rgb = np.stack([rough, rough, rough], axis=-1)
    normal = _height_to_normal(h, strength=1.5)
    return {
        "albedo": array_to_packed_image(f"{prefix}_Albedo", albedo, is_data=False),
        "roughness": array_to_packed_image(f"{prefix}_Rough", rough_rgb, is_data=True),
        "normal": array_to_packed_image(f"{prefix}_Normal", normal, is_data=True),
    }


def gen_rain_glass_pbr(prefix="RainGlass", res=1024, seed=71):
    y = np.linspace(0, 1, res, endpoint=False)
    x = np.linspace(0, 1, res, endpoint=False)
    xx, yy = np.meshgrid(x, y)
    rng = np.random.default_rng(seed)
    height = np.zeros((res, res), dtype=np.float32)
    for _ in range(150):
        cx = rng.random()
        cy = rng.random()
        streak_len = rng.uniform(0.06, 0.26)
        w = rng.uniform(0.0020, 0.0052)
        dx = np.minimum(np.abs(xx - cx), 1.0 - np.abs(xx - cx))
        dy = (yy - cy) % 1.0
        trail = np.exp(-((dx / w) ** 2)) * np.clip(1.0 - dy / streak_len, 0.0, 1.0) * (dy < streak_len)
        head = np.exp(-(((dx / (w * 1.45)) ** 2) + ((np.minimum(dy, 1.0 - dy) / (w * 1.8)) ** 2)))
        height = np.maximum(height, trail * 0.45 + head * 0.95)
    mist = _tileable_fbm(res, octaves=4, seed=seed + 9, scale_x=24, scale_y=24)
    rough = np.clip(0.14 + mist * 0.14 - height * 0.12, 0.02, 0.34)
    rough_rgb = np.stack([rough, rough, rough], axis=-1)
    normal = _height_to_normal(height * 0.9 + mist * 0.06, strength=2.6)
    return {
        "roughness": array_to_packed_image(f"{prefix}_Rough", rough_rgb, is_data=True),
        "normal": array_to_packed_image(f"{prefix}_Normal", normal, is_data=True),
    }


def gen_rug_pbr(prefix="TacticalRug", res=1024, seed=81):
    y = np.linspace(0, 1, res, endpoint=False)
    x = np.linspace(0, 1, res, endpoint=False)
    xx, yy = np.meshgrid(x, y)
    weave = _tileable_fbm(res, octaves=4, seed=seed, scale_x=48, scale_y=48)
    edge = np.minimum(np.minimum(xx, 1.0 - xx), np.minimum(yy, 1.0 - yy))
    border_outer = ((edge > 0.05) & (edge < 0.085)).astype(np.float32)
    border_inner = ((edge > 0.105) & (edge < 0.12)).astype(np.float32)
    red_band = np.clip(border_outer + border_inner * 0.7, 0.0, 1.0)
    dark = np.array([0.015, 0.010, 0.012], dtype=np.float32)
    crimson = np.array([0.24, 0.022, 0.024], dtype=np.float32)
    albedo = (dark * (1.0 - red_band[:, :, None]) + crimson * red_band[:, :, None]) * (0.74 + 0.48 * weave[:, :, None])
    rough = np.clip(0.86 + (1.0 - weave) * 0.12, 0.72, 0.98)
    rough_rgb = np.stack([rough, rough, rough], axis=-1)
    normal = _height_to_normal(weave * 0.8 + red_band * 0.2, strength=2.4)
    return {
        "albedo": array_to_packed_image(f"{prefix}_Albedo", np.clip(albedo, 0.0, 1.0), is_data=False),
        "roughness": array_to_packed_image(f"{prefix}_Rough", rough_rgb, is_data=True),
        "normal": array_to_packed_image(f"{prefix}_Normal", normal, is_data=True),
    }


def gen_fur_detail_pbr(prefix="FurDetail", res=1024, seed=91):
    """High-res directional double-coat fur strands PBR map."""
    strands = _tileable_fbm(res, octaves=5, seed=seed, scale_x=64, scale_y=10)
    clumps = _tileable_fbm(res, octaves=4, seed=seed + 11, scale_x=20, scale_y=5)
    h = np.clip(strands * 0.65 + clumps * 0.35, 0.0, 1.0)
    tone = 0.74 + 0.36 * h
    albedo = np.stack([tone, tone, tone], axis=-1)
    rough = np.clip(0.76 + (1.0 - h) * 0.20, 0.56, 0.96)
    rough_rgb = np.stack([rough, rough, rough], axis=-1)
    normal = _height_to_normal(h, strength=1.8)
    return {
        "albedo": array_to_packed_image(f"{prefix}_Albedo", np.clip(albedo, 0.0, 1.0), is_data=False),
        "roughness": array_to_packed_image(f"{prefix}_Rough", rough_rgb, is_data=True),
        "normal": array_to_packed_image(f"{prefix}_Normal", normal, is_data=True),
    }


def make_pbr_material(
    name,
    base_color=(0.1, 0.1, 0.1, 1.0),
    metallic=0.0,
    roughness=0.5,
    albedo_img=None,
    roughness_img=None,
    normal_img=None,
    normal_strength=0.6,
    emission_color=None,
    emission_strength=0.0,
    emission_img=None,
    alpha=1.0,
    transmission=0.0,
    coat_weight=0.0,
    coat_roughness=0.1,
    sheen_weight=0.0,
    uv_scale=(1.0, 1.0),
    double_sided=False,
    use_vertex_color=False,
):
    mat = bpy.data.materials.new(name=name)
    nt = mat.node_tree
    nt.nodes.clear()
    mat.use_backface_culling = not double_sided

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    out.location = (560, 0)
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (200, 0)
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    if len(base_color) == 3:
        base_color = (base_color[0], base_color[1], base_color[2], 1.0)
    bsdf.inputs["Base Color"].default_value = base_color
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Alpha"].default_value = alpha
    if "Transmission Weight" in bsdf.inputs:
        bsdf.inputs["Transmission Weight"].default_value = transmission
    if "Coat Weight" in bsdf.inputs:
        bsdf.inputs["Coat Weight"].default_value = coat_weight
        bsdf.inputs["Coat Roughness"].default_value = coat_roughness
    if "Sheen Weight" in bsdf.inputs:
        bsdf.inputs["Sheen Weight"].default_value = sheen_weight

    mapping = None
    if uv_scale != (1.0, 1.0):
        tc = nt.nodes.new("ShaderNodeTexCoord")
        tc.location = (-820, 0)
        mapping = nt.nodes.new("ShaderNodeMapping")
        mapping.location = (-600, 0)
        mapping.inputs["Scale"].default_value = (uv_scale[0], uv_scale[1], 1.0)
        nt.links.new(tc.outputs["UV"], mapping.inputs["Vector"])

    def add_tex(img, y_pos):
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = img
        tex.location = (-360, y_pos)
        if mapping is not None:
            nt.links.new(mapping.outputs["Vector"], tex.inputs["Vector"])
        return tex

    if use_vertex_color and albedo_img is not None:
        tex = add_tex(albedo_img, 280)
        vcol = nt.nodes.new("ShaderNodeVertexColor")
        vcol.layer_name = "Color"
        vcol.location = (-360, 480)
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type = 'RGBA'
        mix.blend_type = 'MULTIPLY'
        mix.inputs[0].default_value = 1.0
        mix.location = (-60, 340)
        rgba_in = [inp for inp in mix.inputs if inp.type == 'RGBA']
        rgba_out = [outp for outp in mix.outputs if outp.type == 'RGBA']
        nt.links.new(tex.outputs["Color"], rgba_in[0])
        nt.links.new(vcol.outputs["Color"], rgba_in[1])
        nt.links.new(rgba_out[0], bsdf.inputs["Base Color"])
    elif use_vertex_color:
        vcol = nt.nodes.new("ShaderNodeVertexColor")
        vcol.layer_name = "Color"
        vcol.location = (-180, 260)
        nt.links.new(vcol.outputs["Color"], bsdf.inputs["Base Color"])
    elif albedo_img is not None:
        tex = add_tex(albedo_img, 260)
        nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])

    if roughness_img is not None:
        tex = add_tex(roughness_img, -40)
        nt.links.new(tex.outputs["Color"], bsdf.inputs["Roughness"])

    if normal_img is not None:
        tex = add_tex(normal_img, -340)
        nmap = nt.nodes.new("ShaderNodeNormalMap")
        nmap.location = (-40, -340)
        nmap.inputs["Strength"].default_value = normal_strength
        nt.links.new(tex.outputs["Color"], nmap.inputs["Color"])
        nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])

    if emission_img is not None:
        tex = add_tex(emission_img, 580)
        nt.links.new(tex.outputs["Color"], bsdf.inputs["Emission Color"])
        bsdf.inputs["Emission Strength"].default_value = emission_strength if emission_strength > 0 else 1.0
    elif emission_color is not None and emission_strength > 0.0:
        if len(emission_color) == 3:
            emission_color = (emission_color[0], emission_color[1], emission_color[2], 1.0)
        bsdf.inputs["Emission Color"].default_value = emission_color
        bsdf.inputs["Emission Strength"].default_value = emission_strength

    return mat


def export_glb(filepath, export_apply=True, export_skins=True, export_lights=False):
    os.makedirs(os.path.dirname(os.path.abspath(filepath)), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=os.path.abspath(filepath),
        export_format='GLB',
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
        export_tangents=True,
        export_materials='EXPORT',
        export_image_format='JPEG',
        export_image_quality=84,
        export_apply=export_apply,
        export_skins=export_skins,
        export_lights=export_lights,
    )
    size_kb = os.path.getsize(filepath) / 1024.0
    print(f"[EXPORT] {filepath} ({size_kb:.1f} KB)")


def render_preview(filepath, cam_pos, target_pos, lens=28.0, res=(1280, 720), samples=32, exposure=0.42):
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE'
    scene.eevee.taa_render_samples = samples
    scene.render.resolution_x = res[0]
    scene.render.resolution_y = res[1]
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.exposure = exposure

    cam_data = bpy.data.cameras.new("PreviewCam")
    cam_data.lens = lens
    cam_data.clip_start = 0.05
    cam_data.clip_end = 120.0
    cam_obj = bpy.data.objects.new("PreviewCam", cam_data)
    scene.collection.objects.link(cam_obj)
    cam_obj.location = Vector(cam_pos)
    direction = Vector(target_pos) - Vector(cam_pos)
    cam_obj.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    scene.camera = cam_obj

    os.makedirs(os.path.dirname(os.path.abspath(filepath)), exist_ok=True)
    scene.render.filepath = os.path.abspath(filepath)
    bpy.ops.render.render(write_still=True)

    bpy.data.objects.remove(cam_obj, do_unlink=True)
    bpy.data.cameras.remove(cam_data, do_unlink=True)
    print(f"[PREVIEW] Rendered {filepath} ({res[0]}x{res[1]})")


def create_plane(name, size=(1.0, 1.0), location=(0, 0, 0), rotation=(0, 0, 0), mat=None, col=None):
    """Create a clean 2-triangle quad plane with exact [0..1] UVs facing +Z before rotation."""
    sx, sy = size
    hx, hy = sx * 0.5, sy * 0.5
    me = bpy.data.meshes.new(name + "_Mesh")
    bm = bmesh.new()
    v0 = bm.verts.new((-hx, -hy, 0.0))
    v1 = bm.verts.new((hx, -hy, 0.0))
    v2 = bm.verts.new((hx, hy, 0.0))
    v3 = bm.verts.new((-hx, hy, 0.0))
    f = bm.faces.new((v0, v1, v2, v3))
    uv_layer = bm.loops.layers.uv.verify()
    uvs = ((0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0))
    for loop, uv in zip(f.loops, uvs):
        loop[uv_layer].uv = uv
    bmesh.ops.triangulate(bm, faces=[f])
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    obj.location = Vector(location)
    obj.rotation_euler = Euler(rotation, 'XYZ')
    if mat is not None:
        obj.data.materials.append(mat)
    if col is not None:
        col.objects.link(obj)
    else:
        bpy.context.scene.collection.objects.link(obj)
    return obj


def load_image_packed(filepath, colorspace="sRGB"):
    img = bpy.data.images.load(os.path.abspath(filepath), check_existing=True)
    img.colorspace_settings.name = colorspace
    try:
        img.pack()
    except Exception:
        pass
    return img


def load_polyhaven_pbr(tex_dir, name_prefix, tint=(1.0, 1.0, 1.0), metallic=0.0, rough_mult=1.0,
                       normal_strength=1.0, uv_repeat=(1.0, 1.0), coat_weight=0.0):
    """Load real 1K/2K Poly Haven CC0 scanned PBR maps (diff/nor/rough) into a Principled BSDF material."""
    def find_file(stem):
        for ext in ("jpg", "png"):
            p = os.path.join(tex_dir, f"{stem}.{ext}")
            if os.path.exists(p):
                return p
        return None

    mat = bpy.data.materials.new(name=name_prefix)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    out.location = (640, 0)
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (260, 0)
    bsdf.inputs["Metallic"].default_value = metallic
    if coat_weight > 0 and "Coat Weight" in bsdf.inputs:
        bsdf.inputs["Coat Weight"].default_value = coat_weight
        bsdf.inputs["Coat Roughness"].default_value = 0.22
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    tc = nt.nodes.new("ShaderNodeTexCoord")
    tc.location = (-960, 0)
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.location = (-740, 0)
    mp.inputs["Scale"].default_value = (uv_repeat[0], uv_repeat[1], 1.0)
    nt.links.new(tc.outputs["UV"], mp.inputs["Vector"])

    def load_img(path, colorspace):
        img = bpy.data.images.load(os.path.abspath(path), check_existing=True)
        img.colorspace_settings.name = colorspace
        try:
            img.pack()
        except Exception:
            pass
        return img

    diff_p = find_file("diff")
    if diff_p:
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = load_img(diff_p, "sRGB")
        tex.location = (-440, 280)
        nt.links.new(mp.outputs["Vector"], tex.inputs["Vector"])
        if tint != (1.0, 1.0, 1.0):
            mix = nt.nodes.new("ShaderNodeMix")
            mix.data_type = 'RGBA'
            mix.blend_type = 'MULTIPLY'
            mix.inputs[0].default_value = 1.0
            mix.location = (-80, 280)
            rgba_in = [i for i in mix.inputs if i.type == 'RGBA']
            rgba_out = [o for o in mix.outputs if o.type == 'RGBA']
            nt.links.new(tex.outputs["Color"], rgba_in[0])
            rgba_in[1].default_value = (tint[0], tint[1], tint[2], 1.0)
            nt.links.new(rgba_out[0], bsdf.inputs["Base Color"])
        else:
            nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])

    rough_p = find_file("rough")
    if rough_p:
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = load_img(rough_p, "Non-Color")
        tex.location = (-440, -20)
        nt.links.new(mp.outputs["Vector"], tex.inputs["Vector"])
        if abs(rough_mult - 1.0) > 0.01:
            math_n = nt.nodes.new("ShaderNodeMath")
            math_n.operation = 'MULTIPLY'
            math_n.use_clamp = True
            math_n.inputs[1].default_value = rough_mult
            math_n.location = (-80, -20)
            nt.links.new(tex.outputs["Color"], math_n.inputs[0])
            nt.links.new(math_n.outputs["Value"], bsdf.inputs["Roughness"])
        else:
            nt.links.new(tex.outputs["Color"], bsdf.inputs["Roughness"])

    nor_p = find_file("nor")
    if nor_p:
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = load_img(nor_p, "Non-Color")
        tex.location = (-440, -340)
        nt.links.new(mp.outputs["Vector"], tex.inputs["Vector"])
        nmap = nt.nodes.new("ShaderNodeNormalMap")
        nmap.location = (-80, -340)
        nmap.inputs["Strength"].default_value = normal_strength
        nt.links.new(tex.outputs["Color"], nmap.inputs["Color"])
        nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])

    return mat


def import_aaa_asset(filepath, name, col, target_height=None, target_width=None,
                     location=(0, 0, 0), rotation=(0, 0, 0), decimate_ratio=1.0,
                     keep_only_names=None, override_mat=None, tint_albedo=None):
    """Import a Poly Haven / Khronos glTF asset, normalize pivot to bottom-center (Z=0),
    decimate if needed for 60 FPS, optionally tint or override material, and return a clean parent/mesh."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(filepath))
    new_objs = list(set(bpy.data.objects) - before)

    # Filter submeshes if requested (e.g. extract only the Chess Knight from chess_set!)
    non_meshes = [o for o in new_objs if o.type != 'MESH']
    meshes = [o for o in new_objs if o.type == 'MESH']
    if keep_only_names is not None:
        keep_set = set(keep_only_names)
        kept = []
        for o in meshes:
            if o.name not in keep_set:
                bpy.data.objects.remove(o, do_unlink=True)
            else:
                kept.append(o)
        meshes = kept

    if not meshes:
        for o in non_meshes:
            bpy.data.objects.remove(o, do_unlink=True)
        return None

    # Bake world transforms into each mesh and unparent from glTF empties
    bpy.context.view_layer.update()
    for m in meshes:
        mw = m.matrix_world.copy()
        m.parent = None
        m.matrix_world = mw
        if m.data.users > 1:
            m.data = m.data.copy()
        if decimate_ratio < 0.99 and len(m.data.polygons) > 600:
            mod = m.modifiers.new("Decimate", 'DECIMATE')
            mod.ratio = decimate_ratio
            bpy.ops.object.select_all(action='DESELECT')
            m.select_set(True)
            bpy.context.view_layer.objects.active = m
            bpy.ops.object.modifier_apply(modifier=mod.name)

    # Clean up leftover empties from glTF hierarchy
    for o in non_meshes:
        bpy.data.objects.remove(o, do_unlink=True)

    # Join all kept meshes into one draw-call-efficient object
    bpy.ops.object.select_all(action='DESELECT')
    for m in meshes:
        m.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    obj.name = name
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    # Compute world bounding box -> move bottom-center to origin (0,0,0)
    verts = obj.data.vertices
    if len(verts) > 0:
        xs = [v.co.x for v in verts]
        ys = [v.co.y for v in verts]
        zs = [v.co.z for v in verts]
        cx = 0.5 * (min(xs) + max(xs))
        cy = 0.5 * (min(ys) + max(ys))
        min_z = min(zs)
        w = max(xs) - min(xs)
        h = max(zs) - min(zs)
        for v in verts:
            v.co.x -= cx
            v.co.y -= cy
            v.co.z -= min_z
        obj.data.update()

        scale = 1.0
        if target_height is not None and h > 1e-4:
            scale = target_height / h
        elif target_width is not None and w > 1e-4:
            scale = target_width / w
        if abs(scale - 1.0) > 1e-4:
            obj.scale = (scale, scale, scale)
            bpy.ops.object.select_all(action='DESELECT')
            obj.select_set(True)
            bpy.context.view_layer.objects.active = obj
            bpy.ops.object.transform_apply(scale=True)

    # Pack all imported textures & optionally tint or override materials
    if override_mat is not None:
        obj.data.materials.clear()
        obj.data.materials.append(override_mat)
    else:
        for idx, mat in enumerate(list(obj.data.materials)):
            if mat is None:
                continue
            mat_copy = mat.copy()
            mat_copy.name = f"{name}_Mat_{idx}"
            obj.data.materials[idx] = mat_copy
            if mat_copy.use_nodes:
                nt = mat_copy.node_tree
                for n in nt.nodes:
                    if n.type == 'TEX_IMAGE' and n.image is not None:
                        try:
                            n.image.pack()
                        except Exception:
                            pass
                if tint_albedo is not None:
                    bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
                    if bsdf:
                        bc = bsdf.inputs["Base Color"]
                        mix = nt.nodes.new("ShaderNodeMix")
                        mix.data_type = 'RGBA'
                        mix.blend_type = 'MULTIPLY'
                        mix.inputs[0].default_value = 1.0
                        rgba_in = [i for i in mix.inputs if i.type == 'RGBA']
                        rgba_out = [o for o in mix.outputs if o.type == 'RGBA']
                        rgba_in[1].default_value = (tint_albedo[0], tint_albedo[1], tint_albedo[2], 1.0)
                        if bc.is_linked:
                            src_sock = bc.links[0].from_socket
                            nt.links.remove(bc.links[0])
                            nt.links.new(src_sock, rgba_in[0])
                        else:
                            rgba_in[0].default_value = tuple(bc.default_value)
                        nt.links.new(rgba_out[0], bc)

    obj.rotation_mode = 'XYZ'
    obj.location = Vector(location)
    obj.rotation_euler = Euler(rotation, 'XYZ')
    link_to_collection(obj, col)
    bpy.context.view_layer.update()
    return obj


def duplicate_aaa_asset(src_obj, name, col, location=(0, 0, 0), rotation=(0, 0, 0), scale=(1.0, 1.0, 1.0)):
    """Create a lightweight instanced duplicate sharing mesh & materials (huge GLB size & VRAM savings!)."""
    dup = src_obj.copy()
    dup.name = name
    dup.rotation_mode = 'XYZ'
    dup.location = Vector(location)
    dup.rotation_euler = Euler(rotation, 'XYZ')
    dup.scale = Vector(scale)
    col.objects.link(dup)
    bpy.context.view_layer.update()
    return dup
