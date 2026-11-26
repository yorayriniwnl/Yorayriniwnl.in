"""Shared Blender helpers for the YOR war room assets.

Run the build scripts with the `bpy` Python module (Blender 5.x):
    python art/build_operator.py out/operator.glb

Every asset is generated from code so it can be rebuilt and tuned. Materials
carry stable names; the three.js runtime upgrades them by name (sheen cloth,
clearcoat leather, emissive neon) so the look is authored in one place.
"""
from __future__ import annotations

import math
import random
from typing import Iterable, Sequence

import bpy  # noqa: I001  (bpy must load before bmesh)
import bmesh
import numpy as np
from mathutils import Matrix, Quaternion, Vector

TAU = math.tau


# ---------------------------------------------------------------- scene ----
def reset() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.curves, bpy.data.metaballs):
        for item in list(block):
            block.remove(item)


def link(obj: bpy.types.Object, parent: bpy.types.Object | None = None) -> bpy.types.Object:
    if obj.name not in bpy.context.scene.collection.objects:
        bpy.context.scene.collection.objects.link(obj)
    if parent is not None:
        obj.parent = parent
    return obj


def select_only(*objs: bpy.types.Object) -> None:
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    if objs:
        bpy.context.view_layer.objects.active = objs[0]


def empty(name: str, loc=(0, 0, 0), parent=None) -> bpy.types.Object:
    o = bpy.data.objects.new(name, None)
    o.location = loc
    return link(o, parent)


# ------------------------------------------------------------ materials ----
_materials: dict[str, bpy.types.Material] = {}


def mat(name: str, color=(0.5, 0.5, 0.5), metal=0.0, rough=0.6, emission=None, strength=1.0, alpha=1.0) -> bpy.types.Material:
    """Principled material. `name` is the runtime contract key."""
    if name in _materials:
        return _materials[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Metallic"].default_value = metal
    bsdf.inputs["Roughness"].default_value = rough
    if emission is not None:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1)
        bsdf.inputs["Emission Strength"].default_value = strength
    if alpha < 1:
        bsdf.inputs["Alpha"].default_value = alpha
    _materials[name] = m
    return m


def set_mat(obj: bpy.types.Object, material: bpy.types.Material) -> bpy.types.Object:
    obj.data.materials.clear()
    obj.data.materials.append(material)
    return obj


# --------------------------------------------------------------- meshes ----
def from_bmesh(name: str, bm: bmesh.types.BMesh, material=None, parent=None, smooth=True) -> bpy.types.Object:
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    if smooth:
        me.shade_smooth()
    o = bpy.data.objects.new(name, me)
    link(o, parent)
    if material is not None:
        set_mat(o, material)
    return o


def from_pydata(name, verts, faces, material=None, parent=None, smooth=True) -> bpy.types.Object:
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces])
    me.validate()
    if smooth:
        me.shade_smooth()
    o = bpy.data.objects.new(name, me)
    link(o, parent)
    if material is not None:
        set_mat(o, material)
    return o


def apply_modifiers(obj: bpy.types.Object) -> bpy.types.Object:
    select_only(obj)
    for mod in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return obj


def subsurf(obj, levels=2, apply=True):
    m = obj.modifiers.new("sub", "SUBSURF")
    m.levels = levels
    m.render_levels = levels
    if apply:
        apply_modifiers(obj)
    return obj


def bevel(obj, width=0.004, segments=2, apply=True, angle=math.radians(35)):
    m = obj.modifiers.new("bevel", "BEVEL")
    m.width = width
    m.segments = segments
    m.limit_method = "ANGLE"
    m.angle_limit = angle
    m.harden_normals = False
    if apply:
        apply_modifiers(obj)
    return obj


def solidify(obj, thickness=0.004, offset=1.0, apply=True):
    m = obj.modifiers.new("solid", "SOLIDIFY")
    m.thickness = thickness
    m.offset = offset
    if apply:
        apply_modifiers(obj)
    return obj


def remesh(obj, voxel=0.01, apply=True):
    m = obj.modifiers.new("remesh", "REMESH")
    m.mode = "VOXEL"
    m.voxel_size = voxel
    m.adaptivity = 0.0
    if apply:
        apply_modifiers(obj)
    obj.data.shade_smooth()
    return obj


def decimate(obj, ratio=0.5, apply=True):
    m = obj.modifiers.new("dec", "DECIMATE")
    m.ratio = ratio
    if apply:
        apply_modifiers(obj)
    return obj


def smooth_corrective(obj, iterations=6, factor=0.5, apply=True):
    m = obj.modifiers.new("smooth", "SMOOTH")
    m.iterations = iterations
    m.factor = factor
    if apply:
        apply_modifiers(obj)
    return obj


def box(name, loc, size, material=None, parent=None, bevel_w=0.0, segs=2, rot=(0, 0, 0)) -> bpy.types.Object:
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    o = from_bmesh(name, bm, material, parent, smooth=False)
    o.location = loc
    o.rotation_euler = rot
    if bevel_w > 0:
        bevel(o, bevel_w, segs, angle=math.radians(60))
        o.data.shade_smooth()
        o.data.shade_auto_smooth(angle=math.radians(40)) if hasattr(o.data, "shade_auto_smooth") else None
    return o


def cylinder(name, loc, radius, depth, material=None, parent=None, verts=24, rot=(0, 0, 0), bevel_w=0.0, cap=True):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=cap, cap_tris=False, segments=verts, radius1=radius, radius2=radius, depth=depth)
    o = from_bmesh(name, bm, material, parent, smooth=True)
    o.location = loc
    o.rotation_euler = rot
    if bevel_w > 0:
        bevel(o, bevel_w, 2, angle=math.radians(60))
    autosmooth(o)
    return o


def sphere(name, loc, radius, material=None, parent=None, seg=24, rings=16, scale=(1, 1, 1)):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=radius)
    bmesh.ops.scale(bm, vec=Vector(scale), verts=bm.verts)
    o = from_bmesh(name, bm, material, parent)
    o.location = loc
    return o


def torus(name, loc, major, minor, material=None, parent=None, seg=48, ring=12, rot=(0, 0, 0), scale=(1, 1, 1)):
    verts, faces = [], []
    for i in range(seg):
        a = TAU * i / seg
        for j in range(ring):
            b = TAU * j / ring
            r = major + minor * math.cos(b)
            verts.append((r * math.cos(a) * scale[0], r * math.sin(a) * scale[1], minor * math.sin(b) * scale[2]))
    for i in range(seg):
        for j in range(ring):
            a = i * ring + j
            b = ((i + 1) % seg) * ring + j
            c = ((i + 1) % seg) * ring + (j + 1) % ring
            d = i * ring + (j + 1) % ring
            faces.append((a, b, c, d))
    o = from_pydata(name, verts, faces, material, parent)
    o.location = loc
    o.rotation_euler = rot
    return o


def autosmooth(obj, angle=40):
    obj.data.shade_smooth()
    mod = obj.modifiers.new("autosmooth", "NODES") if False else None  # kept simple: split sharp edges instead
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    sharp = [e for e in bm.edges if e.is_manifold and e.calc_face_angle(0) > math.radians(angle)]
    bmesh.ops.split_edges(bm, edges=sharp)
    bm.to_mesh(obj.data)
    bm.free()
    return obj


def tube(name, points: Sequence[Sequence[float]], radii, material=None, parent=None, sides=10, caps=True, flatten=1.0, twist_up=(0, 0, 1)):
    """Swept tube along a polyline with per-point radius (scalar or (rx, ry))."""
    pts = [Vector(p) for p in points]
    n = len(pts)
    if not isinstance(radii, (list, tuple)) or (isinstance(radii, tuple) and len(radii) == 2 and not isinstance(radii[0], (list, tuple))):
        radii = [radii] * n  # scalar or constant (rx, ry) ellipse
    verts, faces = [], []
    up = Vector(twist_up)
    prev_side = None
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized()
        side = t.cross(up)
        if side.length < 1e-4:
            side = t.cross(Vector((1, 0, 0)))
        side.normalize()
        if prev_side is not None and side.dot(prev_side) < 0:
            side = -side
        prev_side = side
        norm = side.cross(t).normalized()
        r = radii[i]
        rx, ry = (r, r * flatten) if not isinstance(r, (list, tuple)) else r
        for k in range(sides):
            a = TAU * k / sides
            verts.append(p + side * math.cos(a) * rx + norm * math.sin(a) * ry)
    for i in range(n - 1):
        for k in range(sides):
            a = i * sides + k
            b = i * sides + (k + 1) % sides
            faces.append((a, b, b + sides, a + sides))
    if caps:
        c0 = len(verts)
        verts.append(pts[0])
        c1 = len(verts)
        verts.append(pts[-1])
        for k in range(sides):
            faces.append((c0, (k + 1) % sides, k))
            base = (n - 1) * sides
            faces.append((c1, base + k, base + (k + 1) % sides))
    return from_pydata(name, verts, faces, material, parent)


def catmull(points, samples=8):
    """Catmull-Rom resample of a polyline (keeps end points)."""
    P = [Vector(p) for p in points]
    if len(P) < 3:
        return P
    P = [P[0] + (P[0] - P[1])] + P + [P[-1] + (P[-1] - P[-2])]
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for s in range(samples):
            t = s / samples
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(P[-2])
    return out


def text_mesh(name, body, loc, size, material=None, parent=None, rot=(math.pi / 2, 0, 0), extrude=0.0008, align="CENTER", font=None):
    cu = bpy.data.curves.new(name, "FONT")
    cu.body = body
    cu.size = size
    cu.extrude = extrude
    cu.align_x = align
    cu.align_y = "CENTER"
    if font is not None:
        cu.font = font
    o = bpy.data.objects.new(name, cu)
    link(o)
    o.location = loc
    o.rotation_euler = rot
    select_only(o)
    bpy.ops.object.convert(target="MESH")
    o = bpy.context.view_layer.objects.active
    if material is not None:
        set_mat(o, material)
    if parent is not None:
        o.parent = parent  # location is interpreted in parent space
        o.matrix_parent_inverse = Matrix.Identity(4)
    return o


# ------------------------------------------------------------ metaballs ----
META_K = 1 / 0.56  # element radius -> isolated surface radius at threshold 0.6, stiffness 2


class Meta:
    """A metaball family converted to a remeshed, smooth surface.

    All sizes are *surface* radii / half extents of an isolated element.
    Neighbouring elements blend and swell slightly, like padded fabric.
    """

    def __init__(self, name: str, resolution=0.012, threshold=0.6):
        self.mb = bpy.data.metaballs.new(name)
        self.mb.resolution = resolution
        self.mb.render_resolution = resolution
        self.mb.threshold = threshold
        self.obj = bpy.data.objects.new(name, self.mb)
        link(self.obj)

    def ball(self, co, radius, stiffness=2.0, negative=False):
        e = self.mb.elements.new()
        e.type = "BALL"
        e.co = co
        e.radius = radius * META_K
        e.stiffness = stiffness
        e.use_negative = negative
        return e

    def ellipsoid(self, co, extents, rot=None, stiffness=2.0, negative=False):
        e = self.mb.elements.new()
        e.type = "ELLIPSOID"
        e.co = co
        m = max(extents)
        e.radius = m * META_K * 1.06
        e.size_x, e.size_y, e.size_z = (x / m for x in extents)
        if rot is not None:
            e.rotation = rot
        e.stiffness = stiffness
        e.use_negative = negative
        return e

    def capsule(self, a, b, radius, stiffness=2.0, negative=False):
        a, b = Vector(a), Vector(b)
        d = b - a
        e = self.mb.elements.new()
        e.type = "CAPSULE"
        e.co = (a + b) / 2
        e.radius = radius * META_K
        e.size_x = d.length / 2
        e.rotation = Vector((1, 0, 0)).rotation_difference(d.normalized())
        e.stiffness = stiffness
        e.use_negative = negative
        return e

    def limb(self, pts, radii, stiffness=2.0, step=0.025):
        """Chain of balls along a smooth curve: gives tapering limbs."""
        curve = catmull(pts, 12)
        lengths = [0.0]
        for i in range(1, len(curve)):
            lengths.append(lengths[-1] + (curve[i] - curve[i - 1]).length)
        total = lengths[-1]
        count = max(2, int(total / step))
        for s in range(count + 1):
            d = total * s / count
            j = max(0, min(len(curve) - 2, next((k for k in range(len(lengths) - 1) if lengths[k + 1] >= d), len(curve) - 2)))
            f = (d - lengths[j]) / max(1e-6, lengths[j + 1] - lengths[j])
            p = curve[j].lerp(curve[j + 1], f)
            u = s / count
            seg = u * (len(radii) - 1)
            k = min(int(seg), len(radii) - 2)
            r = radii[k] + (radii[k + 1] - radii[k]) * (seg - k)
            self.ball(p, r, stiffness)

    def to_mesh(self, name=None, material=None, parent=None, voxel=None):
        base = self.obj.name
        select_only(self.obj)
        bpy.ops.object.convert(target="MESH")
        o = bpy.context.view_layer.objects.active
        o.name = name or base
        if voxel:
            remesh(o, voxel)
        o.data.shade_smooth()
        if material is not None:
            set_mat(o, material)
        if parent is not None:
            o.parent = parent
        return o


# ------------------------------------------------------- vertex sculpting ----
def mesh_coords(obj) -> np.ndarray:
    n = len(obj.data.vertices)
    co = np.empty(n * 3, dtype=np.float64)
    obj.data.vertices.foreach_get("co", co)
    return co.reshape(n, 3)


def set_coords(obj, co: np.ndarray) -> None:
    obj.data.vertices.foreach_set("co", co.astype(np.float64).ravel())
    obj.data.update()


def mesh_normals(obj) -> np.ndarray:
    n = len(obj.data.vertices)
    no = np.empty(n * 3, dtype=np.float64)
    obj.data.vertices.foreach_get("normal", no)
    return no.reshape(n, 3)


def value_noise3(p: np.ndarray, seed=0) -> np.ndarray:
    """Cheap smooth 3D value noise in [-1, 1] for N x 3 points."""
    rng = np.random.default_rng(seed)
    table = rng.uniform(-1, 1, 4096)
    perm = rng.permutation(4096)
    pi = np.floor(p).astype(np.int64)
    pf = p - pi
    w = pf * pf * (3 - 2 * pf)

    def h(ix, iy, iz):
        return table[perm[(ix * 73856093 ^ iy * 19349663 ^ iz * 83492791) & 4095]]

    out = 0
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                wx = w[:, 0] if dx else 1 - w[:, 0]
                wy = w[:, 1] if dy else 1 - w[:, 1]
                wz = w[:, 2] if dz else 1 - w[:, 2]
                out = out + wx * wy * wz * h(pi[:, 0] + dx, pi[:, 1] + dy, pi[:, 2] + dz)
    return out


def fbm(p: np.ndarray, octaves=4, seed=0) -> np.ndarray:
    total, amp, freq = 0, 0.5, 1.0
    for o in range(octaves):
        total = total + amp * value_noise3(p * freq, seed + o * 17)
        amp *= 0.5
        freq *= 2.03
    return total


def segment_param(co: np.ndarray, a, b):
    a, b = np.array(a), np.array(b)
    ab = b - a
    t = np.clip(((co - a) @ ab) / (ab @ ab), 0, 1)
    proj = a + t[:, None] * ab
    dist = np.linalg.norm(co - proj, axis=1)
    return t, dist


# -------------------------------------------------------------- textures ----
def image_from_array(name: str, rgba: np.ndarray) -> bpy.types.Image:
    h, w = rgba.shape[:2]
    img = bpy.data.images.new(name, w, h, alpha=True)
    img.pixels.foreach_set(np.flipud(rgba).astype(np.float32).ravel())
    img.pack()
    return img


def textured_mat(name, image, color_mult=(1, 1, 1), metal=0.0, rough=0.6, normal=None, normal_strength=1.0, emission_image=None, emission_strength=1.0, mr_image=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    if image is not None:
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = image
        nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Metallic"].default_value = metal
    bsdf.inputs["Roughness"].default_value = rough
    if mr_image is not None:
        mr = nt.nodes.new("ShaderNodeTexImage")
        mr.image = mr_image
        mr.image.colorspace_settings.name = "Non-Color"
        sep = nt.nodes.new("ShaderNodeSeparateColor")
        nt.links.new(mr.outputs["Color"], sep.inputs["Color"])
        nt.links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
        nt.links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
    if normal is not None:
        nt_tex = nt.nodes.new("ShaderNodeTexImage")
        nt_tex.image = normal
        nt_tex.image.colorspace_settings.name = "Non-Color"
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nm.inputs["Strength"].default_value = normal_strength
        nt.links.new(nt_tex.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    if emission_image is not None:
        et = nt.nodes.new("ShaderNodeTexImage")
        et.image = emission_image
        nt.links.new(et.outputs["Color"], bsdf.inputs["Emission Color"])
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    _materials[name] = m
    return m


def uv_project(obj, method="smart", angle=66, island_margin=0.003, cube_size=0.25):
    select_only(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    if method == "smart":
        bpy.ops.uv.smart_project(angle_limit=math.radians(angle), island_margin=island_margin)
    else:
        bpy.ops.uv.cube_project(cube_size=cube_size)
    bpy.ops.object.mode_set(mode="OBJECT")
    return obj


def box_uv_world(obj, scale=1.0):
    """Triplanar-style box UVs in object space (scaled metres), robust for tiling textures."""
    me = obj.data
    if not me.uv_layers:
        me.uv_layers.new(name="UVMap")
    uv = me.uv_layers.active.data
    co = mesh_coords(obj)
    for poly in me.polygons:
        n = poly.normal
        ax = np.argmax(np.abs([n.x, n.y, n.z]))
        for li in poly.loop_indices:
            v = co[me.loops[li].vertex_index]
            if ax == 0:
                u, w = v[1], v[2]
            elif ax == 1:
                u, w = v[0], v[2]
            else:
                u, w = v[0], v[1]
            uv[li].uv = (u * scale, w * scale)
    return obj


# ---------------------------------------------------------------- joins ----
def join(objs: list, name: str) -> bpy.types.Object:
    objs = [o for o in objs if o is not None]
    select_only(*objs)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    o.name = name
    o.data.name = name
    return o


def apply_transforms(obj):
    select_only(obj)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return obj


def bake_parent_transforms(objs):
    for o in objs:
        mw = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = mw
        apply_transforms(o)


def export_glb(path: str, objs: Iterable[bpy.types.Object] | None = None, animations=False):
    if objs is not None:
        select_only(*list(objs))
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=objs is not None,
        export_apply=True,
        export_yup=True,
        export_animations=animations,
        export_materials="EXPORT",
        export_image_format="AUTO",
        export_vertex_color="ACTIVE",
        export_extras=True,
        export_lights=False,
        export_cameras=False,
    )


def stats(objs=None):
    objs = objs or [o for o in bpy.context.scene.objects if o.type == "MESH"]
    tris = 0
    for o in objs:
        if o.type != "MESH":
            continue
        o.data.calc_loop_triangles()
        tris += len(o.data.loop_triangles)
    return tris


# ------------------------------------------------------- loft / union ----
def loft(name, sections, ring=40, material=None, parent=None, power=2.2, caps=True):
    """Loft superellipse cross-sections. sections: [(center Vector, half_x, half_y)] stacked along Z-ish."""
    verts, faces = [], []
    for c, ax, ay in sections:
        for k in range(ring):
            a = TAU * k / ring
            ca, sa = math.cos(a), math.sin(a)
            x = math.copysign(abs(ca) ** (2 / power), ca) * ax
            y = math.copysign(abs(sa) ** (2 / power), sa) * ay
            verts.append(Vector(c) + Vector((x, y, 0)))
    n = len(sections)
    for i in range(n - 1):
        for k in range(ring):
            a = i * ring + k
            b = i * ring + (k + 1) % ring
            faces.append((a, b, b + ring, a + ring))
    if caps:
        c0 = len(verts)
        verts.append(Vector(sections[0][0]))
        c1 = len(verts)
        verts.append(Vector(sections[-1][0]))
        for k in range(ring):
            faces.append((c0, (k + 1) % ring, k))
            base = (n - 1) * ring
            faces.append((c1, base + k, base + (k + 1) % ring))
    return from_pydata(name, verts, faces, material, parent)


def limb_tube(name, pts, radii, samples=10, sides=20, flatten=1.0, material=None, parent=None):
    """Smooth limb: Catmull-Rom path with interpolated radius profile."""
    path = catmull(pts, samples)
    rr = np.interp(np.linspace(0, len(radii) - 1, len(path)), np.arange(len(radii)), radii)
    return tube(name, path, [float(r) for r in rr], material, parent, sides, True, flatten)


def union(name, objs, voxel=0.006, smooth_iter=3, material=None, parent=None):
    for p in objs:
        apply_transforms(p)  # mesh coords == world coords for later sculpting
    o = join(objs, name)
    remesh(o, voxel)
    if smooth_iter:
        smooth_corrective(o, smooth_iter, 0.6)
    if material is not None:
        set_mat(o, material)
    if parent is not None:
        o.parent = parent
    return o
