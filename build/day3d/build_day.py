# -*- coding: utf-8 -*-
"""Version 3: the cloche film by DAY (Karan, 2026-10-05, from his "grokbot" reference images: a sunlit
white kitchen, white marble, a white plate, a glassy rainbow infinity, the page's cream at the end).
A copy of cloche3d/build.py (made by patch_day.py) with the same choreography, frames and line hand-off;
only the world, materials and light change, and the ending dissolves the kitchen into the cream instead
of dimming it.

The cloche hero film, built headless in Blender 4.5 (Karan's pick: concept 4).

  blender -b --python-exit-code 1 -P build.py -- --still 0,90,180 [--samples 32] [--scale .5] [--name x]
  blender -b --python-exit-code 1 -P build.py -- --anim [--start 0 --end 288] [--samples 96]
  blender -b --python-exit-code 1 -P build.py -- --export   (hero-data.json: camera rows, no traces)
  blender -b --python-exit-code 1 -P build.py -- --save     (cloche3d/scene.blend)

Frame i of the film is old frame 55+i: video time 1.8 s + i/30, 289 frames.
The story: a closed chrome cloche on a black plate at a kitchen pass, rainbow light
leaking from under its rim; push in; the cloche lifts and tilts away on a breath of
steam, revealing the glowing infinity; the cloche leaves the top of frame; the infinity
lifts, turns to face us and grows; it unravels head first up the rail into the line
that leaves the top right; the kitchen goes dark; the line's tail holds on the exact
path the page's SVG bolt continues from (video/snake343.json)."""
import bpy, bmesh, sys, os, json, math, random
import numpy as np
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.dirname(HERE)
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(name, default=None):
    if name in argv:
        i = argv.index(name)
        return argv[i + 1] if i + 1 < len(argv) and not argv[i + 1].startswith('--') else True
    return default

N = 289
FPS = 30
W, H = 1920, 1080
# --phone: the same film composed for a phone held upright (2026-10-03): a
# portrait frame, a longer lens, the cloche centred, and the rope leaving down
# and to the left, where the phone page's line takes it on
PHONE = bool(arg('--phone'))
if PHONE:
    W, H = 1080, 1620
rng = random.Random(11)
BL_DATA = os.path.join(os.path.dirname(bpy.app.binary_path), '4.5', 'datafiles', 'studiolights', 'world')

def smooth(x, a, b):
    t = min(1.0, max(0.0, (x - a) / (b - a))) if b != a else (1.0 if x >= b else 0.0)
    return t * t * (3 - 2 * t)
def lerp(a, b, t): return a + (b - a) * t
def ease_io(t): return t * t * (3 - 2 * t)

# ------------------------------------------------------------ scene reset
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.render.resolution_x, scene.render.resolution_y = W, H
scene.render.resolution_percentage = int(float(arg('--scale', 1)) * 100)
scene.render.fps = FPS
scene.frame_start, scene.frame_end = 0, N - 1
scene.render.film_transparent = True   # by day the camera's background is laid on the page's cream afterwards (cream.py)
scene.render.use_motion_blur = False

prefs = bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type = 'OPTIX'
prefs.get_devices()
for d in prefs.devices:
    d.use = d.type in ('OPTIX', 'CPU')
cy = scene.cycles
cy.device = 'GPU'
cy.samples = int(arg('--samples', 64))
cy.use_adaptive_sampling = True
cy.adaptive_threshold = 0.01
cy.use_denoising = True
cy.denoiser = 'OPTIX'
cy.denoising_use_gpu = True
cy.max_bounces = 10
cy.diffuse_bounces = 3
cy.glossy_bounces = 6
cy.transmission_bounces = 8
cy.transparent_max_bounces = 24
cy.volume_bounces = 1
cy.volume_step_rate = float(arg('--vstep', 2.0))
cy.volume_max_steps = 256
cy.caustics_reflective = False
cy.caustics_refractive = False
cy.blur_glossy = 1.0
cy.sample_clamp_direct = 30
cy.sample_clamp_indirect = 3
cy.use_light_tree = True
scene.render.use_persistent_data = True   # keep the static scene's BVH between animation frames
scene.view_settings.view_transform = 'AgX'
scene.view_settings.look = 'AgX - Punchy'

# ------------------------------------------------------------ helpers
def new_mat(name, base=(0.05, 0.05, 0.06), metallic=0.0, rough=0.5, spec=0.5, coat=0.0, coat_rough=0.03,
            emit=None, estr=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*base, 1)
    b.inputs['Metallic'].default_value = metallic
    b.inputs['Roughness'].default_value = rough
    b.inputs['Specular IOR Level'].default_value = spec
    b.inputs['Coat Weight'].default_value = coat
    b.inputs['Coat Roughness'].default_value = coat_rough
    if emit is not None:
        b.inputs['Emission Color'].default_value = (*emit, 1)
        b.inputs['Emission Strength'].default_value = estr
    return m

def link(ob):
    scene.collection.objects.link(ob)
    return ob

def box(name, sx, sy, sz, at=(0, 0, 0), mat=None, rot=0.0, bevel=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=bm.verts)
    bmesh.ops.translate(bm, vec=(0, 0, sz / 2), verts=bm.verts)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = link(bpy.data.objects.new(name, me))
    ob.location = at; ob.rotation_euler = (0, 0, rot)
    if mat: me.materials.append(mat)
    if bevel > 0:
        md = ob.modifiers.new('bv', 'BEVEL'); md.width = bevel; md.segments = 3; md.limit_method = 'ANGLE'
        for p in me.polygons: p.use_smooth = True
        ob.modifiers.new('wn', 'WEIGHTED_NORMAL')
    return ob

def lathe(name, prof, segs=96, mat=None, subsurf=1, closed_top=False):
    """a surface of revolution about z from a (r, z) profile, first point first"""
    bm = bmesh.new()
    rings = []
    for k in range(segs):
        a = 2 * math.pi * k / segs
        ca, sa = math.cos(a), math.sin(a)
        rings.append([bm.verts.new((r * ca, r * sa, z)) for r, z in prof])
    n = len(prof)
    for k in range(segs):
        A, B = rings[k], rings[(k + 1) % segs]
        for i in range(n - 1):
            if prof[i][0] < 1e-6 and prof[i + 1][0] < 1e-6: continue
            bm.faces.new((A[i], B[i], B[i + 1], A[i + 1]))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    ob = link(bpy.data.objects.new(name, me))
    if mat: me.materials.append(mat)
    if subsurf:
        md = ob.modifiers.new('ss', 'SUBSURF'); md.levels = subsurf; md.render_levels = subsurf
    return ob

def poly_curve(name, pts, closed=False):
    cu = bpy.data.curves.new(name, 'CURVE'); cu.dimensions = '3D'
    sp = cu.splines.new('POLY'); sp.points.add(len(pts) - 1)
    for i, p in enumerate(pts): sp.points[i].co = (p[0], p[1], p[2], 1)
    sp.use_cyclic_u = closed
    return link(bpy.data.objects.new(name, cu))

def resample(pts, step):
    pts = np.asarray(pts, dtype=float)
    seg = np.linalg.norm(np.diff(pts, axis=0), axis=1)
    cum = np.concatenate([[0], np.cumsum(seg)])
    L = cum[-1]
    n = max(2, int(L / step) + 1)
    s = np.linspace(0, L, n)
    return np.stack([np.interp(s, cum, pts[:, k]) for k in range(3)], axis=1), L

def linear(idblock):
    ad = idblock.animation_data
    if ad and ad.action:
        for fc in ad.action.fcurves:
            for kp in fc.keyframe_points: kp.interpolation = 'LINEAR'

def area(name, at, aim, size, energy, color=(1, 1, 1), shape='SQUARE', sy=None):
    ld = bpy.data.lights.new(name, 'AREA'); ld.energy = energy; ld.color = color
    ld.shape = shape; ld.size = size
    if sy: ld.size_y = sy
    lo = link(bpy.data.objects.new(name, ld))
    lo.location = at
    lo.rotation_euler = (Vector(aim) - Vector(at)).to_track_quat('-Z', 'Y').to_euler()
    return lo

# ------------------------------------------------------------ the camera's frame of reference
AZ = math.radians(70)                          # the camera looks along DIR, a little from the left
DIR = Vector((math.cos(AZ), math.sin(AZ), 0))  # into the picture, on the ground
RIGHT = Vector((DIR.y, -DIR.x, 0))             # to the right of the picture, on the ground
def at(depth, side, z):
    """a point `depth` into the picture and `side` to the right of the plate's centre"""
    p = DIR * depth + RIGHT * side
    return (p.x, p.y, z)

# ------------------------------------------------------------ materials
# dark marble: near-black stone with a few soft grey veins and a polished coat
m_marble = new_mat('marble', base=(0.012, 0.012, 0.013), rough=0.3, spec=0.5, coat=0.2, coat_rough=0.25)
nt = m_marble.node_tree; bsdf = nt.nodes['Principled BSDF']
tc = nt.nodes.new('ShaderNodeTexCoord')
nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 0.9; nz.inputs['Detail'].default_value = 8; nz.inputs['Roughness'].default_value = 0.62
wave = nt.nodes.new('ShaderNodeTexWave'); wave.wave_type = 'BANDS'; wave.bands_direction = 'DIAGONAL'
wave.inputs['Scale'].default_value = 0.22; wave.inputs['Distortion'].default_value = 4.5; wave.inputs['Detail'].default_value = 4; wave.inputs['Detail Roughness'].default_value = 0.5
nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
mixv = nt.nodes.new('ShaderNodeMix'); mixv.data_type = 'VECTOR'; mixv.inputs['Factor'].default_value = 0.6
nt.links.new(tc.outputs['Object'], mixv.inputs[4]); nt.links.new(nz.outputs['Color'], mixv.inputs[5])
nt.links.new(mixv.outputs[1], wave.inputs['Vector'])
vr = nt.nodes.new('ShaderNodeValToRGB')
vr.color_ramp.elements[0].position = 0.0; vr.color_ramp.elements[0].color = (0.36, 0.355, 0.35, 1)
vr.color_ramp.elements[1].position = 0.03; vr.color_ramp.elements[1].color = (0.82, 0.81, 0.79, 1)
e = vr.color_ramp.elements.new(0.012); e.color = (0.6, 0.595, 0.59, 1)
nt.links.new(wave.outputs['Fac'], vr.inputs['Fac'])
nt.links.new(vr.outputs['Color'], bsdf.inputs['Base Color'])
rr = nt.nodes.new('ShaderNodeMapRange'); rr.inputs['To Min'].default_value = 0.1; rr.inputs['To Max'].default_value = 0.26
nt.links.new(nz.outputs['Fac'], rr.inputs['Value']); nt.links.new(rr.outputs['Result'], bsdf.inputs['Roughness'])

m_plate = new_mat('plate', base=(0.84, 0.83, 0.81), rough=0.16, spec=0.5, coat=0.7, coat_rough=0.05)
m_chrome = new_mat('chrome', base=(0.93, 0.93, 0.94), metallic=1.0, rough=0.07, spec=0.5)
m_copper = new_mat('copper', base=(0.9, 0.5, 0.32), metallic=1.0, rough=0.34)
m_iron = new_mat('iron', base=(0.25, 0.24, 0.23), metallic=0.8, rough=0.35)
m_wall = new_mat('wall', base=(0.6, 0.54, 0.47), rough=0.85, spec=0.3)
m_steel = new_mat('steel', base=(0.55, 0.55, 0.56), metallic=1.0, rough=0.28)

def bulb_mat(strength):
    m = bpy.data.materials.new('bulb'); m.use_nodes = True
    nt_ = m.node_tree
    for n_ in list(nt_.nodes): nt_.nodes.remove(n_)
    o = nt_.nodes.new('ShaderNodeOutputMaterial'); em = nt_.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = (1.0, 0.56, 0.24, 1); em.inputs['Strength'].default_value = strength
    nt_.links.new(em.outputs[0], o.inputs[0])
    return m, em.inputs['Strength']

# the ribbon: brand spectrum along the stroke (same as the chip film)
SPEC = [(0.0, '#D51C73'), (.07, '#E5322B'), (.19, '#F2912F'), (.30, '#F3CB3C'), (.42, '#5CB246'),
        (.56, '#0FA3C2'), (.69, '#2E5FA8'), (.84, '#7A3E97'), (1.0, '#D51C73')]
def hexrgb(h):
    h = h.lstrip('#'); return tuple(((int(h[i:i + 2], 16) / 255) ** 2.2) for i in (0, 2, 4))
m_rib = bpy.data.materials.new('ribbon'); m_rib.use_nodes = True
nt = m_rib.node_tree; b = nt.nodes['Principled BSDF']
uc = nt.nodes.new('ShaderNodeAttribute'); uc.attribute_name = 'uc'
us = nt.nodes.new('ShaderNodeAttribute'); us.attribute_name = 'us'
ang = nt.nodes.new('ShaderNodeMath'); ang.operation = 'ARCTAN2'
nt.links.new(us.outputs['Fac'], ang.inputs[0]); nt.links.new(uc.outputs['Fac'], ang.inputs[1])
angd = nt.nodes.new('ShaderNodeMath'); angd.operation = 'DIVIDE'; angd.inputs[1].default_value = 2 * math.pi
nt.links.new(ang.outputs[0], angd.inputs[0])
angf = nt.nodes.new('ShaderNodeMath'); angf.operation = 'FRACT'
nt.links.new(angd.outputs[0], angf.inputs[0])
ramp = nt.nodes.new('ShaderNodeValToRGB'); ramp.color_ramp.interpolation = 'LINEAR'
els = ramp.color_ramp.elements
els[0].position = SPEC[0][0]; els[0].color = (*hexrgb(SPEC[0][1]), 1)
els[1].position = SPEC[-1][0]; els[1].color = (*hexrgb(SPEC[-1][1]), 1)
for pos, col in SPEC[1:-1]:
    e = els.new(pos); e.color = (*hexrgb(col), 1)
lit = nt.nodes.new('ShaderNodeHueSaturation'); lit.inputs['Saturation'].default_value = float(arg('--rsat', 1.7))
nt.links.new(angf.outputs[0], ramp.inputs['Fac'])
nt.links.new(ramp.outputs['Color'], b.inputs['Base Color'])
nt.links.new(ramp.outputs['Color'], lit.inputs['Color'])
nt.links.new(lit.outputs['Color'], b.inputs['Emission Color'])
b.inputs['Roughness'].default_value = 0.3
b.inputs['Specular IOR Level'].default_value = 0.5
b.inputs['Coat Weight'].default_value = 0.6
b.inputs['Coat Roughness'].default_value = 0.04
b.inputs['Transmission Weight'].default_value = float(arg('--trans', 0.15))
b.inputs['IOR'].default_value = 1.45
b.inputs['Subsurface Weight'].default_value = 0.25
b.inputs['Subsurface Radius'].default_value = (0.2, 0.2, 0.2)
b.inputs['Subsurface Scale'].default_value = 0.3
RIB_STR = b.inputs['Emission Strength']
RIB_E0, RIB_E1 = float(arg('--ribe', 2.0)), float(arg('--ribe1', 1.4))
RIB_STR.default_value = RIB_E0

# ------------------------------------------------------------ the pass
counter = box('counter', 80, 70, 0.9, at=(0, 0, -0.9), mat=m_marble)
counter.location = at(5.0, 0, -0.9)
counter.rotation_euler = (0, 0, AZ - math.pi / 2)

# the plate: a black glazed dish with a wide flat rim that shows outside the dome
PLATE_Z = 0.035
RIM_Z = 0.1
plate = lathe('plate', [(0.0, PLATE_Z)] + [(r_, PLATE_Z) for r_ in (0.15, 0.35, 0.55, 0.75, 0.95, 1.08)] +
              [(1.16, 0.042), (1.25, 0.058), (1.36, 0.078), (1.48, 0.092), (1.58, 0.099), (1.72, RIM_Z), (1.95, RIM_Z),
               (2.07, 0.103), (2.12, 0.098), (2.13, 0.085), (2.09, 0.07), (1.8, 0.05), (1.2, 0.02), (1.15, 0.0), (0.5, 0.0), (0.0, 0.0)],
              segs=160, mat=m_plate, subsurf=2)

# the cloche: chrome dome with a rolled lip and a knob; it hinges on its back rim
LIP_R = 1.64
dome = []
for k in range(0, 25):
    a = (k / 24) * math.pi / 2
    dome.append((1.6 * math.cos(a), 0.07 + 1.4 * math.sin(a) ** 0.92))
cloche = lathe('cloche_shell', [(1.62, 0.0), (1.69, 0.012), (1.72, 0.04), (1.69, 0.068), (1.63, 0.075)] + dome[1:] + [(0.0, 1.47)],
               segs=128, mat=m_chrome, subsurf=2)
sol = cloche.modifiers.new('sol', 'SOLIDIFY'); sol.thickness = 0.025; sol.offset = -1
cloche.modifiers.move(1, 0)
knob = lathe('cloche_knob', [(0.0, 1.46), (0.085, 1.46), (0.06, 1.53), (0.055, 1.58), (0.13, 1.63), (0.17, 1.7),
                             (0.15, 1.78), (0.09, 1.82), (0.0, 1.83)], segs=64, mat=m_chrome, subsurf=2)
pivot = link(bpy.data.objects.new('cloche', None))
chrome_col = bpy.data.collections.new('chrome'); scene.collection.children.link(chrome_col)
for _o in (cloche, knob):
    chrome_col.objects.link(_o)
    _o.parent = pivot
    _o.location = (-DIR.x * LIP_R, -DIR.y * LIP_R, 0.0)

# ------------------------------------------------------------ the kitchen behind, out of focus
wall = box('wall', 60, 0.3, 14, mat=m_wall)
wall.location = at(17.2, 0, -3.0); wall.rotation_euler = (0, 0, AZ - math.pi / 2)
m_wood = new_mat('wood', base=(0.36, 0.22, 0.12), rough=0.5)
m_glass = new_mat('bottle', base=(0.86, 0.85, 0.82), rough=0.2, spec=0.5, coat=0.5, coat_rough=0.1)
m_glass2 = new_mat('bottle2', base=(0.78, 0.74, 0.68), rough=0.25, spec=0.5, coat=0.4, coat_rough=0.1)
shelf = box('shelf', 26, 0.7, 0.09, mat=m_wood)
shelf.location = at(16.4, 4.0, 1.25); shelf.rotation_euler = (0, 0, AZ - math.pi / 2)
for k in range(22):
    side = -7.5 + k * 1.05 + rng.uniform(-0.25, 0.25)
    h = rng.uniform(0.75, 1.3); r = rng.uniform(0.14, 0.2)
    h = h * 0.38; r = r * 1.9
    bt = lathe('bottle', [(0.0, 0.0), (r * 0.55, 0.0), (r * 0.9, h * 0.45), (r, h), (r * 0.94, h), (r * 0.5, h * 0.12), (0.0, h * 0.12)],
               segs=32, mat=m_glass if rng.random() < 0.6 else m_glass2, subsurf=1)
    bt.location = at(16.4, side, 1.34)
RAIL_Z = 2.75
rail = poly_curve('rail', [at(11.5, -9, RAIL_Z), at(11.5, 14, RAIL_Z)])
rail.data.bevel_depth = 0.035; rail.data.materials.append(m_iron)
PANS = []
for k, side in enumerate([1.6, 3.1, 4.5, 6.1, 7.6, 9.3, 11.2]):
    r = rng.uniform(0.4, 0.6)
    depth = 11.5 + rng.uniform(-0.2, 0.2)
    pan = lathe('pan', [(0.0, 0.0), (r * 0.9, 0.0), (r, 0.05), (r * 1.02, r * 0.55), (r * 1.06, r * 0.6),
                        (r * 0.99, r * 0.57), (r * 0.94, 0.06), (0.0, 0.06)], segs=64, mat=m_copper, subsurf=1)
    hang_z = RAIL_Z - 0.18 - r * 1.25
    pan.location = at(depth, side, hang_z)
    pan.rotation_euler = (-math.pi / 2, 0, AZ - math.pi / 2 + rng.uniform(-0.5, 0.5))
    handle = box('handle', 0.07, 0.04, r * 1.1, mat=m_copper, bevel=0.012)
    handle.location = at(depth, side, hang_z + r * 0.95)
    handle.rotation_euler = (0, 0, AZ - math.pi / 2)
    hook = poly_curve('hook', [at(depth, side, hang_z + r * 2.05), at(depth, side, RAIL_Z)])
    hook.data.bevel_depth = 0.012; hook.data.materials.append(m_iron)
    PANS.append(pan); PANS.append(handle)
# warm practicals for bokeh, in several sizes
BULBS = []
for side, depth, z, rad_, s0 in [(0.6, 14.0, 2.3, 0.22, 40), (4.2, 14.6, 2.15, 0.16, 55), (8.0, 13.8, 2.35, 0.26, 36), (11.6, 15.0, 2.1, 0.12, 60),
                                 (2.6, 16.2, 0.9, 0.18, 30), (6.2, 16.5, 0.6, 0.1, 50), (9.6, 16.0, 1.0, 0.2, 28), (-3.0, 16.0, 0.8, 0.12, 14),
                                 (13.4, 15.2, 1.9, 0.24, 30), (5.2, 16.6, 2.2, 0.08, 60), (-1.2, 15.4, 2.6, 0.14, 14)]:
    mb, sb = bulb_mat(s0)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=rad_, segments=24, ring_count=12, location=at(depth, side, z))
    bo = bpy.context.object; bo.name = 'bulb'; bo.data.materials.append(mb)
    bo.hide_render = True; bo.hide_viewport = True

# ------------------------------------------------------------ light and world
# the world is a warm dark gradient for reflections and black to the camera: no studio HDRI
world = bpy.data.worlds.new('w'); scene.world = world; world.use_nodes = True
wn = world.node_tree
for n_ in list(wn.nodes): wn.nodes.remove(n_)
wout = wn.nodes.new('ShaderNodeOutputWorld')
wtc = wn.nodes.new('ShaderNodeTexCoord')
wsep = wn.nodes.new('ShaderNodeSeparateXYZ'); wn.links.new(wtc.outputs['Generated'], wsep.inputs['Vector'])
wgr = wn.nodes.new('ShaderNodeValToRGB')
wgr.color_ramp.elements[0].position = 0.45; wgr.color_ramp.elements[0].color = (0.5, 0.48, 0.45, 1)
wgr.color_ramp.elements[1].position = 0.75; wgr.color_ramp.elements[1].color = (1.0, 0.97, 0.93, 1)
wn.links.new(wsep.outputs['Z'], wgr.inputs['Fac'])
bg_env = wn.nodes.new('ShaderNodeBackground'); bg_env.inputs['Strength'].default_value = 1.0
wn.links.new(wgr.outputs['Color'], bg_env.inputs['Color'])
BG = [float(x) for x in str(arg('--bg', '0.86,0.83,0.79')).split(',')]
bg_cam = wn.nodes.new('ShaderNodeBackground'); bg_cam.inputs['Color'].default_value = (*BG, 1)
lp = wn.nodes.new('ShaderNodeLightPath')
wmix = wn.nodes.new('ShaderNodeMixShader')
wn.links.new(lp.outputs['Is Camera Ray'], wmix.inputs['Fac'])
wn.links.new(bg_env.outputs[0], wmix.inputs[1]); wn.links.new(bg_cam.outputs[0], wmix.inputs[2])
wn.links.new(wmix.outputs[0], wout.inputs['Surface'])
ENV_STR = bg_env.inputs['Strength']; ENV_E0 = 1.0

# reflection cards: seen only by glossy rays, so the chrome mirrors a warm kitchen
CARDS = []
def card(name, sx, sy, loc, look, strength, color, stripes=False, disk=False, soft=False):
    bm = bmesh.new()
    if disk:
        bmesh.ops.create_circle(bm, cap_ends=True, segments=48, radius=sx / 2)
    else:
        bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=0.5, calc_uvs=True)
        bmesh.ops.scale(bm, vec=(sx, sy, 1), verts=bm.verts)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = link(bpy.data.objects.new(name, me))
    ob.location = loc
    ob.rotation_euler = (Vector(look) - Vector(loc)).to_track_quat('Z', 'Y').to_euler()
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt_ = m.node_tree
    for n_ in list(nt_.nodes): nt_.nodes.remove(n_)
    o = nt_.nodes.new('ShaderNodeOutputMaterial'); em = nt_.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = (*color, 1); em.inputs['Strength'].default_value = strength
    if stripes:
        tco = nt_.nodes.new('ShaderNodeTexCoord'); wv = nt_.nodes.new('ShaderNodeTexWave')
        wv.inputs['Scale'].default_value = 3.0; wv.inputs['Distortion'].default_value = 1.5
        mr = nt_.nodes.new('ShaderNodeMapRange'); mr.inputs['To Min'].default_value = 0.15
        mul = nt_.nodes.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'; mul.inputs[1].default_value = strength
        nt_.links.new(tco.outputs['Generated'], wv.inputs['Vector']); nt_.links.new(wv.outputs['Fac'], mr.inputs['Value'])
        nt_.links.new(mr.outputs['Result'], mul.inputs[0]); nt_.links.new(mul.outputs[0], em.inputs['Strength'])
        CARDS.append((mul.inputs[1], strength, nt_))
    elif soft:
        tco = nt_.nodes.new('ShaderNodeTexCoord'); sub = nt_.nodes.new('ShaderNodeVectorMath'); sub.operation = 'SUBTRACT'
        sub.inputs[1].default_value = (0.5, 0.5, 0.0)
        ln = nt_.nodes.new('ShaderNodeVectorMath'); ln.operation = 'LENGTH'
        mr = nt_.nodes.new('ShaderNodeMapRange'); mr.interpolation_type = 'SMOOTHSTEP'
        mr.inputs['From Min'].default_value = 0.05; mr.inputs['From Max'].default_value = 0.5
        mr.inputs['To Min'].default_value = 1.0; mr.inputs['To Max'].default_value = 0.0
        mul = nt_.nodes.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'; mul.inputs[1].default_value = strength
        nt_.links.new(tco.outputs['UV'], sub.inputs[0]); nt_.links.new(sub.outputs[0], ln.inputs[0])
        nt_.links.new(ln.outputs['Value'], mr.inputs['Value']); nt_.links.new(mr.outputs['Result'], mul.inputs[0])
        nt_.links.new(mul.outputs[0], em.inputs['Strength'])
        CARDS.append((mul.inputs[1], strength, nt_))
    else:
        CARDS.append((em.inputs['Strength'], strength, nt_))
    nt_.links.new(em.outputs[0], o.inputs[0])
    me.materials.append(m)
    ob.light_linking.receiver_collection = chrome_col
    ob.visible_camera = False; ob.visible_diffuse = False; ob.visible_shadow = False
    ob.visible_transmission = False; ob.visible_volume_scatter = False
    return ob
card('lamp_a', 1.3, 1.3, at(-1.2, -1.6, 5.6), (0, 0, 0.8), 18, (1.0, 0.97, 0.92), disk=True)
card('lamp_b', 1.0, 1.0, at(-0.4, 1.8, 6.0), (0, 0, 0.8), 14, (1.0, 0.96, 0.9), disk=True)
pass   # no room card by day: its soft edge falls to black, and the bright world lights the chrome instead
card('rim_l', 0.7, 4.5, at(2.6, -3.3, 1.6), (0, 0, 0.9), 7, (1.0, 0.97, 0.93))
card('rim_r', 0.5, 3.8, at(1.8, 3.6, 1.8), (0, 0, 0.9), 5, (1.0, 0.97, 0.93))

# dark cards beside and behind the camera, seen only in reflections, so the chrome has dark bands
# to draw it (a product shot's black flags); by night the dark room did that
m_neg = new_mat('neg', base=(0.015, 0.015, 0.016), rough=0.9)
def neg_card(name, sx, sy, loc, look):
    bm_ = bmesh.new(); bmesh.ops.create_grid(bm_, x_segments=1, y_segments=1, size=0.5)
    bmesh.ops.scale(bm_, vec=(sx, sy, 1), verts=bm_.verts)
    me_ = bpy.data.meshes.new(name); bm_.to_mesh(me_); bm_.free()
    ob_ = link(bpy.data.objects.new(name, me_)); ob_.location = loc
    ob_.rotation_euler = (Vector(look) - Vector(loc)).to_track_quat('Z', 'Y').to_euler()
    me_.materials.append(m_neg)
    ob_.visible_camera = False; ob_.visible_diffuse = False; ob_.visible_shadow = False; ob_.visible_transmission = False
neg_card('neg_l', 7, 4.5, at(-6.5, -7.5, 2.4), (0, 0, 0.8))
neg_card('neg_r', 6, 3.5, at(-5.0, 7.0, 1.8), (0, 0, 0.8))
TUNG = (1.0, 0.95, 0.88)
L_key = area('key', at(-5.5, -4.5, 7.5), (0, 0, 0.7), 9, float(arg('--key', 3200)), TUNG, shape='DISK')
L_strip = area('strip', at(-1.0, 0.4, 7.0), (0, 0, 0.8), 6.5, 450, (1.0, 0.97, 0.92), shape='RECTANGLE', sy=1.0)
L_rim = area('rim', at(5.0, 2.2, 2.2), (0, 0, 1.2), 2.5, 1300, (1.0, 0.95, 0.88))
L_wallglow = area('wallglow', at(12.5, 4.5, 0.6), at(17.0, 4.5, 2.2), 10, float(arg('--wall', 2600)), (1.0, 0.93, 0.84))
L_fill = area('fill', at(-9, 2.5, 2.0), (0, 0, 0.6), 6, 300, (0.96, 0.97, 1.0))
L_pans = area('pans', at(8.0, -6.0, 4.0), at(11.5, 5.0, 1.9), 6, 1600, (1.0, 0.9, 0.8))
pans_col = bpy.data.collections.new('pans'); scene.collection.children.link(pans_col)
for _p in PANS:
    for _c in list(_p.users_collection): _c.objects.unlink(_p)
    pans_col.objects.link(_p)
L_pans.light_linking.receiver_collection = pans_col
LIGHTS = [L_key, L_strip, L_rim, L_wallglow, L_fill, L_pans]
for _l in (L_key, L_rim, L_wallglow, L_fill): _l.visible_glossy = False
L_window = area('window', at(6.0, -12.0, 6.5), (0, 0, 0.6), 12, float(arg('--window', 6000)), (1.0, 0.98, 0.95), shape='RECTANGLE', sy=7)
LIGHTS.append(L_window)
LIGHT_E = [l.data.energy for l in LIGHTS]

# ------------------------------------------------------------ camera
cam_d = bpy.data.cameras.new('cam'); cam_d.lens = float(arg('--plens', 112)) if PHONE else 60; cam_d.sensor_width = 36; cam_d.sensor_fit = 'HORIZONTAL'
cam_d.dof.use_dof = True; cam_d.dof.aperture_fstop = float(arg('--fstop', 0.6)); cam_d.dof.aperture_blades = 0
cam_d.clip_end = 400
cam = link(bpy.data.objects.new('cam', cam_d)); scene.camera = cam
aim = link(bpy.data.objects.new('aim', None))
cam_d.dof.focus_object = aim
trc = cam.constraints.new('TRACK_TO'); trc.target = aim; trc.track_axis = 'TRACK_NEGATIVE_Z'; trc.up_axis = 'UP_Y'

def cam_pose(dist, elev_deg, az_off, aimz):
    e = math.radians(elev_deg); a = AZ + math.radians(az_off)
    d = Vector((math.cos(a), math.sin(a), 0))
    return (-d.x * dist * math.cos(e), -d.y * dist * math.cos(e), aimz + dist * math.sin(e)), (0, 0, aimz)

# the story's beats in frames (t = 1.8 + f/30)
F_REST = 12
F_OPEN0, F_OPEN1 = 20, 100        # the cloche lifts and tilts
F_GONE0, F_GONE1 = 85, 205        # the cloche leaves the top of frame
F_LIFT0, F_LIFT1 = 132, 216       # the infinity lifts, turns and grows
F_UNR0, F_UNR1 = 216, 276
F_PULL0, F_PULL1 = 228, 276
F_DIM0, F_DIM1 = 234, 282
F_PUSH_END = 150

REST_DIST, PUSH_DIST, PULL_DIST = float(arg('--d0', 14.8)), float(arg('--d1', 13.2)), 20.0
SX0, SX1, SX2 = float(arg('--sx0', -0.212)), float(arg('--sx1', -0.19)), -0.16
SY0, SY1, SY2 = 0.045, 0.03, -0.02
if PHONE:
    SX0, SX1, SX2 = float(arg('--psx', 0.0)), float(arg('--psx', 0.0)), float(arg('--psx', 0.0))
    SY0, SY1, SY2 = float(arg('--psy0', -0.08)), float(arg('--psy1', -0.06)), float(arg('--psy2', -0.04))
for f in range(N):
    k1 = ease_io(smooth(f, F_REST, F_PUSH_END))
    k2 = ease_io(smooth(f, F_PULL0, F_PULL1))
    k3 = ease_io(smooth(f, F_LIFT0, F_LIFT1))
    dist = lerp(lerp(REST_DIST, PUSH_DIST, k1), PULL_DIST, k2)
    elev = lerp(lerp(11.0, 10.0, k1) + 2.5 * k3, 15.0, k2)
    az_off = lerp(lerp(0, 3, k1), -2, k2)
    aimz = lerp(lerp(0.72, 0.92, k1) + 0.75 * k3, 1.9, k2)
    c, a = cam_pose(dist, elev, az_off, aimz)
    cam.location = c; cam.keyframe_insert('location', frame=f)
    aim.location = a; aim.keyframe_insert('location', frame=f)
    cam_d.shift_x = lerp(lerp(SX0, SX1, k1), SX2, k2); cam_d.keyframe_insert('shift_x', frame=f)
    cam_d.shift_y = lerp(lerp(SY0, SY1, k1), SY2, k2); cam_d.keyframe_insert('shift_y', frame=f)
linear(cam); linear(aim); linear(cam_d)

# the cloche: seated a hair above the rim so the glow leaks out; its front lifts on the back-rim
# hinge, then it rises away up and to the right, part in frame while the mark rises
pivot.rotation_mode = 'AXIS_ANGLE'
for f in range(N):
    o = ease_io(smooth(f, F_OPEN0, F_OPEN1))
    g = smooth(f, F_GONE0, F_GONE1) ** 1.5
    hinge = DIR * LIP_R
    p = hinge + DIR * (0.3 * o + 1.8 * g) + RIGHT * (2.2 * g)
    rise = RIM_Z + 0.03 + 0.4 * o + 6.8 * g
    tilt = math.radians(26 * o + 12 * g)
    pivot.location = (p.x, p.y, rise); pivot.keyframe_insert('location', frame=f)
    pivot.rotation_axis_angle = (-tilt, RIGHT.x, RIGHT.y, 0.0); pivot.keyframe_insert('rotation_axis_angle', frame=f)
linear(pivot)
# once it has left the shot the cloche is switched off, so it can never shadow or hide the line
for _o in (cloche, knob):
    _o.hide_render = False; _o.keyframe_insert('hide_render', frame=205)
    _o.hide_render = True; _o.keyframe_insert('hide_render', frame=206)
    _o.hide_render = False; _o.keyframe_insert('hide_render', frame=0)

# ------------------------------------------------------------ steam
# soft wisps: curved sheets that face the camera, their pattern animated in the shader
# (noise scrolling up the sheet), so the steam is smooth and grain-free at any sample count
m_steam = bpy.data.materials.new('steam'); m_steam.use_nodes = True
m_steam.blend_method = 'BLEND' if hasattr(m_steam, 'blend_method') else None
nt = m_steam.node_tree
for n_ in list(nt.nodes): nt.nodes.remove(n_)
out = nt.nodes.new('ShaderNodeOutputMaterial')
def node_math(op, a, b=None):
    n_ = nt.nodes.new('ShaderNodeMath'); n_.operation = op
    for i, v in enumerate((a, b)):
        if v is None: continue
        if hasattr(v, 'node'): nt.links.new(v, n_.inputs[i])
        else: n_.inputs[i].default_value = v
    return n_.outputs[0]
T = nt.nodes.new('ShaderNodeValue'); T.name = 'T'
A = nt.nodes.new('ShaderNodeValue'); A.name = 'A'
uvn = nt.nodes.new('ShaderNodeUVMap')
sep = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(uvn.outputs['UV'], sep.inputs['Vector'])
seed = nt.nodes.new('ShaderNodeAttribute'); seed.attribute_name = 'seed'; seed.attribute_type = 'OBJECT'
U, V = sep.outputs['X'], sep.outputs['Y']
# the pattern rises: sample noise at (v*1.4 + seed, u*2.2 - T*0.55)
cmb = nt.nodes.new('ShaderNodeCombineXYZ')
nt.links.new(node_math('ADD', node_math('MULTIPLY', V, 1.4), seed.outputs['Fac']), cmb.inputs['X'])
nt.links.new(node_math('SUBTRACT', node_math('MULTIPLY', U, 2.2), node_math('MULTIPLY', T.outputs[0], 0.55)), cmb.inputs['Y'])
nt.links.new(node_math('MULTIPLY', seed.outputs['Fac'], 3.1), cmb.inputs['Z'])
nz1 = nt.nodes.new('ShaderNodeTexNoise'); nz1.inputs['Scale'].default_value = 1.8; nz1.inputs['Detail'].default_value = 3
nz1.inputs['Roughness'].default_value = 0.5; nz1.inputs['Distortion'].default_value = 2.2
nt.links.new(cmb.outputs[0], nz1.inputs['Vector'])
wisp = nt.nodes.new('ShaderNodeMapRange'); wisp.interpolation_type = 'SMOOTHSTEP'
wisp.inputs['From Min'].default_value = 0.4; wisp.inputs['From Max'].default_value = 0.8
nt.links.new(nz1.outputs['Fac'], wisp.inputs['Value'])
# soft across the sheet, fading in at the base and out toward the top
acr = node_math('POWER', node_math('SUBTRACT', 1.0, node_math('ABSOLUTE', node_math('SUBTRACT', node_math('MULTIPLY', V, 2.0), 1.0))), 1.8)
base = nt.nodes.new('ShaderNodeMapRange'); base.interpolation_type = 'SMOOTHSTEP'
base.inputs['From Min'].default_value = 0.0; base.inputs['From Max'].default_value = 0.06
nt.links.new(U, base.inputs['Value'])
top = nt.nodes.new('ShaderNodeMapRange'); top.interpolation_type = 'SMOOTHSTEP'
top.inputs['From Min'].default_value = 0.2; top.inputs['From Max'].default_value = 0.95
top.inputs['To Min'].default_value = 1.0; top.inputs['To Max'].default_value = 0.0
nt.links.new(U, top.inputs['Value'])
alpha = node_math('MULTIPLY', node_math('MULTIPLY', wisp.outputs['Result'], acr),
                  node_math('MULTIPLY', node_math('MULTIPLY', base.outputs['Result'], top.outputs['Result']), A.outputs[0]))
alpha = node_math('MINIMUM', alpha, 1.0)
tr = nt.nodes.new('ShaderNodeBsdfTransparent')
em = nt.nodes.new('ShaderNodeEmission'); em.inputs['Color'].default_value = (1.0, 0.98, 0.96, 1); em.inputs['Strength'].default_value = 0.35
tl = nt.nodes.new('ShaderNodeBsdfTranslucent'); tl.inputs['Color'].default_value = (1.0, 0.95, 0.9, 1)
lit = nt.nodes.new('ShaderNodeAddShader'); nt.links.new(em.outputs[0], lit.inputs[0]); nt.links.new(tl.outputs[0], lit.inputs[1])
emw = nt.nodes.new('ShaderNodeEmission'); emw.inputs['Color'].default_value = (1.0, 0.96, 0.92, 1)
nt.links.new(node_math('MULTIPLY', alpha, 0.9), emw.inputs['Strength'])
mix = nt.nodes.new('ShaderNodeAddShader')
nt.links.new(tr.outputs[0], mix.inputs[0]); nt.links.new(emw.outputs[0], mix.inputs[1])
nt.links.new(mix.outputs[0], out.inputs['Surface'])
STEAM_EM = em.inputs['Strength']

def wisp_sheet(name, start, rise, lean, sway, width0, width1, seedv):
    """a ribbon from `start` rising `rise`, leaning right by `lean`, with an S of `sway`,
    widening from width0 to width1, facing the camera's side"""
    n = 48
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new('UVMap')
    rows = []
    for i in range(n + 1):
        t = i / n
        c = Vector(start) + Vector((0, 0, rise * t)) + RIGHT * (lean * t * t + sway * math.sin(t * math.pi * 1.3))
        w = width0 + (width1 - width0) * t
        rows.append((bm.verts.new(c - RIGHT * w / 2), bm.verts.new(c + RIGHT * w / 2), t))
    for i in range(n):
        a0, a1, ta = rows[i]; b0, b1, tb = rows[i + 1]
        f_ = bm.faces.new((a0, a1, b1, b0))
        for loop, (uu, vv) in zip(f_.loops, ((ta, 0), (ta, 1), (tb, 1), (tb, 0))):
            loop[uvl].uv = (uu, vv)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    ob = link(bpy.data.objects.new(name, me))
    me.materials.append(m_steam)
    ob['seed'] = seedv
    ob.visible_shadow = False
    return ob

WISPS = []
for k, (side, depth, rise, lean, sway, w0, w1) in enumerate([
        (-1.25, 0.95, 2.6, 0.6, 0.3, 0.35, 1.2), (1.15, 0.95, 2.9, 0.9, -0.3, 0.35, 1.3), (0.1, 1.55, 2.4, 0.7, 0.25, 0.4, 1.2),
        (-1.4, -1.0, 2.2, 0.5, -0.25, 0.3, 1.0), (1.35, -1.05, 2.5, 0.8, 0.3, 0.3, 1.1)]):
    WISPS.append(wisp_sheet('wisp%d' % k, at(depth, side, RIM_Z + 0.02), rise, lean, sway, w0, w1, k * 1.37 + 0.4))
STEAM_AMT = float(arg('--steam', 0.8))
for f in range(N):
    T.outputs[0].default_value = f / FPS
    T.outputs[0].keyframe_insert('default_value', frame=f)
    amt = 0.12 + STEAM_AMT * smooth(f, F_OPEN0 - 4, F_OPEN0 + 30) - (0.12 + STEAM_AMT) * smooth(f, 110, 180)
    amt *= 1 - smooth(f, F_DIM0 - 10, F_DIM0 + 20)
    A.outputs[0].default_value = max(0.0, amt)
    A.outputs[0].keyframe_insert('default_value', frame=f)
linear(m_steam.node_tree)

# ------------------------------------------------------------ geometry nodes tube
def tube_group(name, mat):
    ng = bpy.data.node_groups.new(name, 'GeometryNodeTree')
    ng.interface.new_socket('Geometry', in_out='INPUT', socket_type='NodeSocketGeometry')
    ng.interface.new_socket('Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
    n_in = ng.nodes.new('NodeGroupInput'); n_out = ng.nodes.new('NodeGroupOutput')
    spp = ng.nodes.new('GeometryNodeSplineParameter')
    tau = ng.nodes.new('ShaderNodeMath'); tau.operation = 'MULTIPLY'; tau.inputs[1].default_value = 2 * math.pi
    ng.links.new(spp.outputs['Factor'], tau.inputs[0])
    prev = n_in.outputs['Geometry']
    for nm, op in (('uc', 'COSINE'), ('us', 'SINE')):
        tr_ = ng.nodes.new('ShaderNodeMath'); tr_.operation = op
        ng.links.new(tau.outputs[0], tr_.inputs[0])
        st = ng.nodes.new('GeometryNodeStoreNamedAttribute'); st.data_type = 'FLOAT'; st.domain = 'POINT'
        st.inputs['Name'].default_value = nm
        ng.links.new(prev, st.inputs['Geometry'])
        val = [s_ for s_ in st.inputs if s_.name == 'Value' and s_.enabled][0]
        ng.links.new(tr_.outputs[0], val)
        prev = st.outputs['Geometry']
    circ = ng.nodes.new('GeometryNodeCurvePrimitiveCircle'); circ.inputs['Resolution'].default_value = 24
    circ.inputs['Radius'].default_value = 1.0
    c2m = ng.nodes.new('GeometryNodeCurveToMesh'); c2m.inputs['Fill Caps'].default_value = True
    ng.links.new(st.outputs['Geometry'], c2m.inputs['Curve'])
    ng.links.new(circ.outputs['Curve'], c2m.inputs['Profile Curve'])
    radn = ng.nodes.new('GeometryNodeInputRadius'); ng.links.new(radn.outputs['Radius'], c2m.inputs['Scale'])
    sm = ng.nodes.new('GeometryNodeSetShadeSmooth'); ng.links.new(c2m.outputs['Mesh'], sm.inputs['Geometry'])
    mt = ng.nodes.new('GeometryNodeSetMaterial'); mt.inputs['Material'].default_value = mat
    ng.links.new(sm.outputs['Geometry'], mt.inputs['Geometry'])
    ng.links.new(mt.outputs['Geometry'], n_out.inputs['Geometry'])
    return ng

# ------------------------------------------------------------ the infinity
th = np.linspace(0, 2 * math.pi, 1200, endpoint=False) + math.pi / 2
pts = np.column_stack([np.sin(th), np.sin(th) * np.cos(th), 0.115 * np.cos(th)])
LOOP, _ = resample(np.vstack([pts, pts[:1]]), 0.004)
NU = 400
u = np.linspace(0, 1, NU)
cumL = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(LOOP, axis=0), axis=1))])
loop_u = np.stack([np.interp(u * cumL[-1], cumL, LOOP[:, k]) for k in range(3)], axis=1)

RIB_W0, RIB_R0 = 0.9, 0.12
GROW, RIB_R1 = 1.28, 0.16

def cam_basis(f):
    scene.frame_set(f)
    m = cam.matrix_world
    right = Vector((m[0][0], m[1][0], m[2][0])).normalized()
    up = Vector((m[0][1], m[1][1], m[2][1])).normalized()
    fwd = -Vector((m[0][2], m[1][2], m[2][2])).normalized()
    return right, up, fwd

snake = json.load(open(os.path.join(BUILD, 'video', 'snake-phone.json' if PHONE else 'snake343.json')))['pts']
scene.frame_set(N - 1)
bpy.context.view_layer.update()
right_f, up_f, fwd_f = cam_basis(N - 1)
CAM_M = cam.matrix_world.copy()
tr_, br_, bl_, tl_ = [CAM_M.to_3x3() @ v for v in cam_d.view_frame(scene=scene)]
cam_pos = CAM_M.translation.copy()
def unproject(px, py, depth):
    fx, fy = px / W, 1 - py / H
    d = bl_ + (br_ - bl_) * fx + (tl_ - bl_) * fy
    return cam_pos + d * (depth / d.dot(fwd_f))
subj_depth = (Vector((0, 0, 0.8)) - cam_pos).dot(fwd_f)
LINE_DEPTH = subj_depth * 0.92
snake_w = [unproject(x, y, LINE_DEPTH) for x, y in snake]
px_world = ((unproject(1000, 500, LINE_DEPTH) - unproject(0, 500, LINE_DEPTH)).length) / 1000
EXIT_R_TOP, EXIT_R_TAIL = 8.5 * px_world / 2, 3.2 * px_world / 2
snake_np = np.array([[p.x, p.y, p.z] for p in snake_w])[::-1]
snake_len = np.linalg.norm(np.diff(snake_np, axis=0), axis=1).sum()
tangent = (snake_np[0] - snake_np[3]); tangent /= np.linalg.norm(tangent)
up_w = np.array(up_f)

RAIL = {}
def L_step(total): return total / (NU * 1.5)
def rail(total_len, target):
    extra = max(0.5, total_len - snake_len)
    s = np.linspace(extra, 0, 120, endpoint=False)[:, None]
    ext = snake_np[0] + tangent * s + up_w * 0.35 * (s ** 2) / max(extra, 1e-6)
    p0 = snake_np[-1]; tan_t = snake_np[-1] - snake_np[-4]; tan_t /= np.linalg.norm(tan_t)
    p2 = np.asarray(target, dtype=float)
    p1 = p0 + tan_t * (np.linalg.norm(p2 - p0) * 0.45)
    t = np.linspace(0, 1, 80)[1:, None]
    tailrun = (1 - t) ** 2 * p0 + 2 * (1 - t) * t * p1 + t ** 2 * p2
    path = np.vstack([ext, snake_np, tailrun])
    pc = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(path, axis=0), axis=1))])
    line_len = pc[len(ext) + len(snake_np) - 1]      # measured along the bent lead-in, so the tail lands on the snake's end
    rs, _ = resample(path, L_step(total_len))
    cum = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(rs, axis=0), axis=1))])
    RAIL['line'] = line_len
    return rs, cum, cum[-1] - line_len

def ribbon_state(f):
    k_lift = ease_io(smooth(f, F_LIFT0, F_LIFT1))
    k_turn = ease_io(smooth(f, F_LIFT0 + 20, F_LIFT1 - 10))
    k_grow = ease_io(smooth(f, F_LIFT0 + 10, F_LIFT1))
    right, up, fwd = cam_basis(min(f, F_PULL0))
    fwd_g = Vector((fwd.x, fwd.y, 0)).normalized()
    # at rest the mark leans up 35 degrees on the plate so both loops read; lifted, it faces the camera
    LEAN = math.radians(35)
    X0, Y0 = RIGHT.copy(), (DIR * math.cos(LEAN) + Vector((0, 0, 1)) * math.sin(LEAN)).normalized()
    X = ((1 - k_turn) * X0 + k_turn * right).normalized()
    Y = ((1 - k_turn) * Y0 + k_turn * up).normalized()
    Y = (Y - X * Y.dot(X)).normalized()
    scale = RIB_W0 * lerp(1, GROW, k_grow)
    hz = lerp(PLATE_Z + RIB_R0 + 0.03 + 0.5 * RIB_W0 * math.sin(LEAN), PLATE_Z + 1.75, k_lift)
    centre = Vector((0, 0, hz)) - fwd_g * (0.5 * k_lift) - RIGHT * (0.2 * k_lift)
    Xn, Yn, C = np.array(X), np.array(Y), np.array(centre)
    Zn = np.cross(Xn, Yn)
    loop = C + loop_u[:, 0:1] * scale * Xn + loop_u[:, 1:2] * scale * Yn + loop_u[:, 2:3] * scale * Zn
    radius = lerp(RIB_R0, RIB_R1, k_grow)
    if f < F_UNR0:
        return loop[:-1], np.full(NU - 1, radius)      # closed: a cyclic spline, no ends, no seam
    # ---- the exit ----
    total = cumL[-1] * scale                                   # the rope's length
    k = smooth(f, F_UNR0, F_UNR1) ** 1.35                      # slow start, gathering speed
    k = k * k * (3 - 2 * k) if k < 1 else 1.0
    coil = loop + up_w * (0.45 * k)                            # the coil drifts up as it unwinds
    d_sn = snake_np[-1] - snake_np[-4]; d_sn /= np.linalg.norm(d_sn)     # the snake's direction at its tail
    if 'Lb1' not in RAIL:
        RAIL['Lb1'] = None
    def exit_path(ustar, coil_pts):
        """head first: an off-frame lead, the snake, then a cubic from the snake's tail down
        to the rope's exit point on the coil, arriving along the coil's own tangent"""
        p3 = np.array([np.interp(ustar, u, coil_pts[:, kk]) for kk in range(3)])
        du = 0.006
        pa = np.array([np.interp((ustar - du) % 1.0, u, coil_pts[:, kk]) for kk in range(3)])
        pb = np.array([np.interp((ustar + du) % 1.0, u, coil_pts[:, kk]) for kk in range(3)])
        t_in = pb - pa; t_in /= (np.linalg.norm(t_in) + 1e-9)             # +u direction at the exit point
        p0 = snake_np[-1]
        dist = np.linalg.norm(p3 - p0)
        p1 = p0 + d_sn * (0.42 * dist)
        p2 = p3 - t_in * (0.22 * dist)
        tt = np.linspace(0, 1, 160)[1:, None]
        bez = (1 - tt) ** 3 * p0 + 3 * (1 - tt) ** 2 * tt * p1 + 3 * (1 - tt) * tt ** 2 * p2 + tt ** 3 * p3
        lead_len = total + 6.0
        sl = np.linspace(lead_len, 0, 200, endpoint=False)[:, None]
        lead = snake_np[0] + tangent * sl + up_w * 0.35 * (sl ** 2) / lead_len
        path = np.vstack([lead, snake_np, bez])
        pc = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(path, axis=0), axis=1))])
        bez_len = pc[-1] - pc[len(lead) + len(snake_np) - 1]
        return path, pc, bez_len
    if RAIL['Lb1'] is None:
        RAIL['Lb1'] = exit_path(1.0, loop + up_w * 0.45)[2]      # the cubic's length once the coil is gone
    Lb1 = RAIL['Lb1']
    Pp = k * (total + Lb1)                                     # rope pulled past the exit point, then slid up
    ustar = min(1.0, Pp / total)
    slide = max(0.0, Pp - total)
    path, pc, bez_len = exit_path(ustar, coil)
    def from_bottom(dv):
        """arc distance up from the path's bottom end -> world point(s)"""
        dv = np.clip(np.asarray(dv, dtype=float), 0, pc[-1])
        return np.stack([np.interp(pc[-1] - dv, pc, path[:, kk]) for kk in range(3)], axis=-1)
    on_rope = u <= ustar
    dist_up = (ustar - u) * total + slide
    pts_ = np.where(on_rope[:, None], from_bottom(dist_up), coil)
    # thickness: one radius for the whole rope at any moment, thinning into the page line's profile
    thin = smooth(f, F_UNR0 + 4, F_UNR1 - 4)
    r_line = np.where(u < 0.82, EXIT_R_TOP, EXIT_R_TOP + (EXIT_R_TAIL - EXIT_R_TOP) * ((u - 0.82) / 0.18))
    rad = radius * (1 - thin) + r_line * thin
    # rope ends: hemispherical caps as wide as the tube, so the split shows no notch
    # the ends stay flat and overlapping while the head is still retracing the gap it left
    # (so the split is invisible), then round into hemispheres once it is clear of the coil
    cap = np.maximum(rad, 1e-4) / total
    e_head = np.clip(u / np.maximum(cap, 1e-6), 0, 1)
    e_tail = np.clip((1 - u) / np.maximum(cap, 1e-6), 0, 1)
    c_on = smooth(ustar * total, 0.45, 1.1)
    prof = np.sqrt(1 - (1 - e_head) ** 2) * np.sqrt(1 - (1 - e_tail) ** 2)
    rad = rad * (1 - c_on + c_on * prof)
    rad = np.maximum(rad, rad.max() * 0.02)
    return pts_, rad

RIB_GN = tube_group('ribbon_gn', m_rib)
want = None
if arg('--still') is not None and not arg('--anim') and not arg('--save'):
    want = set(int(x) for x in str(arg('--still')).split(','))
for f in range(N):
    if want is not None and f not in want: continue      # stills only build the ribbons they show
    pts_, rad = ribbon_state(f)
    ob = poly_curve('rib%03d' % f, pts_, closed=f < F_UNR0)
    for i, p in enumerate(ob.data.splines[0].points): p.radius = float(rad[i])
    ob.modifiers.new('gn', 'NODES').node_group = RIB_GN
    ob.hide_render = True
    ob.keyframe_insert('hide_render', frame=max(0, f - 1))
    ob.hide_render = False; ob.keyframe_insert('hide_render', frame=f)
    ob.hide_render = True; ob.keyframe_insert('hide_render', frame=f + 1)
    if f == 0:
        ob.hide_render = False; ob.keyframe_insert('hide_render', frame=0)

# ------------------------------------------------------------ the dim and the hold
for f in range(N):
    RIB_STR.default_value = lerp(RIB_E0, RIB_E1, ease_io(smooth(f, F_OPEN0, F_OPEN1))); RIB_STR.keyframe_insert('default_value', frame=f)
# the kitchen stays whole in the render; the ending dissolves it into the cream afterwards (end.py),
# with the line laid back over it from a second pass that renders the ribbon alone: --ribbon-only
# makes every other surface a holdout, so the ribbon comes out on a clear, clean alpha
RIBBON_ONLY = bool(arg('--ribbon-only'))
if RIBBON_ONLY:
    for ob_ in scene.objects:
        if ob_.type in ('MESH', 'CURVE') and not ob_.name.startswith('rib'):
            ob_.is_holdout = True
linear(m_rib.node_tree); linear(world.node_tree)
for L in LIGHTS: linear(L.data)
for m in bpy.data.materials:
    if m.name.startswith('bulb'): linear(m.node_tree)

# ------------------------------------------------------------ output: scene-linear EXR, graded by grade.py
scene.render.image_settings.file_format = 'OPEN_EXR'
scene.render.image_settings.color_depth = '16'
scene.render.image_settings.exr_codec = 'DWAA'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.use_compositing = False

# ------------------------------------------------------------ run
if arg('--export'):
    rows = [[1.0, 0.0, 0.0, round(1 - ease_io(smooth(f, F_DIM0, F_DIM1)), 2)] for f in range(N)]
    json.dump({'t0': 1.8, 'fps': FPS, 'cam': rows, 'traces': []}, open(os.path.join(HERE, 'hero-data.json'), 'w'))
    print('EXPORTED', len(rows), 'frames, no traces')
if arg('--hit'):
    # what does the camera see first along the handoff path? (debug)
    fr = int(arg('--hit')); scene.frame_set(fr); bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    M = cam.matrix_world.copy(); cp = M.translation.copy()
    tr2, br2, bl2, tl2 = [M.to_3x3() @ v for v in cam_d.view_frame(scene=scene)]
    for i in (0, 5, 10, 15, 30):
        px, py = snake[i]
        d = (bl2 + (br2 - bl2) * (px / W) + (tl2 - bl2) * (1 - py / H)).normalized()
        target = unproject(px, py, LINE_DEPTH)
        o = cp.copy(); hits = []
        for _k in range(12):
            ok, loc, nrm, idx, obj, mtx = scene.ray_cast(dg, o, d)
            if not ok: break
            hits.append('%s@%.1f%s' % (obj.name, (loc - cp).length, '' if obj.visible_camera and not obj.hide_render else '(inv)'))
            o = loc + d * 0.01
        print('HIT', i, (round(px), round(py)), 'line at %.2f' % (target - cp).length, hits)
if arg('--tail'):
    from bpy_extras.object_utils import world_to_camera_view as w2c
    fr = int(arg('--tail')); pts_, rad = ribbon_state(fr); scene.frame_set(fr)
    for j in (0, 50, 200, 300, 350, 380, 390, 399):
        v = w2c(scene, cam, Vector(pts_[j]))
        print('TAIL', j, 'px (%.0f, %.0f)' % (v.x * W, (1 - v.y) * H), 'r %.4f' % rad[j])
    print('TAIL total', RAIL.get('travel'), 'snake_len %.3f' % snake_len, 'loop len %.3f' % (cumL[-1] * RIB_W0 * GROW))
if arg('--save'):
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'scene.blend'))
if arg('--still') is not None:
    for fs in str(arg('--still')).split(','):
        f = int(fs)
        name = (arg('--name') + '-' if arg('--name') else '') + 'f%03d' % f
        scene.frame_set(f)
        scene.render.filepath = os.path.join(HERE, 'test', name + '.exr')
        bpy.ops.render.render(write_still=True)
        print('WROTE', scene.render.filepath)
if arg('--anim'):
    scene.frame_start = int(arg('--start', 0)); scene.frame_end = int(arg('--end', N - 1))
    EXR = ('render/exr-rib' if RIBBON_ONLY else 'render/exr') + ('-phone' if PHONE else '')
    os.makedirs(os.path.join(HERE, EXR), exist_ok=True)
    scene.render.filepath = os.path.join(HERE, EXR, 'f')
    bpy.ops.render.render(animation=True)
    print('ANIM DONE')
