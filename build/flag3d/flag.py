# -*- coding: utf-8 -*-
"""Version 2 of the hero film: the flag. Built headless in Blender 4.5, like cloche3d/build.py.

Karan, 2026-10-05: "make a version 2 ... i want like a flag on a pole with my logo on it and then the
logo should continue this same animation as the website currently".

  blender -b --python-exit-code 1 -P flag.py -- --still 0,60,120,174,216,250,288 [--samples 32] [--scale .5]
  blender -b --python-exit-code 1 -P flag.py -- --anim [--start 0 --end 288] [--samples 64]
  blender -b --python-exit-code 1 -P flag.py -- --export     (hero-data.json)
  add --phone for the portrait film the phone page plays (exr-phone/, the line leaves to snake-phone.json)

The story: night. A black satin flag flies from a tall steel pole over the warm lights of a town far
below; the brand's infinity is on it as glowing piping. As the reader scrolls the camera closes in, the
infinity peels off the cloth from its left loop to its right, lifts toward the camera and turns to face
it while the flag falls out of focus behind; then it does exactly what the cloche film's infinity does:
it unravels head first into the line that leaves the top right, the night goes dark, and the line's
tail holds on the path the page's own line continues from.

The same 289 frames and the same beats as the cloche film, so the page's scroll keys (site.js VT_KEYS)
are unchanged: the headline is up for frames 0 to about 60, "Meet." arrives near frame 140 while the
infinity is lifting, the infinity holds facing the camera 174 to 216, unravels 216 to 276. The flag's
ripples repeat every 24 frames, so frames 0 to 23 loop for a page that wants the flag alive at rest."""
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
PHONE = bool(arg('--phone'))
if PHONE:
    W, H = 1080, 1620
rng = random.Random(7)

def smooth(x, a, b):
    t = min(1.0, max(0.0, (x - a) / (b - a))) if b != a else (1.0 if x >= b else 0.0)
    return t * t * (3 - 2 * t)
def lerp(a, b, t): return a + (b - a) * t
def ease_io(t): return t * t * (3 - 2 * t)

# ------------------------------------------------------------ scene and render (as the cloche film)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.render.resolution_x, scene.render.resolution_y = W, H
scene.render.resolution_percentage = int(float(arg('--scale', 1)) * 100)
scene.render.fps = FPS
scene.frame_start, scene.frame_end = 0, N - 1
scene.render.film_transparent = False
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
cy.max_bounces = 8
cy.diffuse_bounces = 3
cy.glossy_bounces = 4
cy.transmission_bounces = 2
cy.caustics_reflective = False
cy.caustics_refractive = False
cy.blur_glossy = 1.0
cy.sample_clamp_direct = 30
cy.sample_clamp_indirect = 3
cy.use_light_tree = True
scene.render.use_persistent_data = True
scene.view_settings.view_transform = 'AgX'
scene.view_settings.look = 'AgX - Punchy'

# ------------------------------------------------------------ helpers
def new_mat(name, base=(0.05, 0.05, 0.06), metallic=0.0, rough=0.5, spec=0.5, coat=0.0, coat_rough=0.03):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*base, 1)
    b.inputs['Metallic'].default_value = metallic
    b.inputs['Roughness'].default_value = rough
    b.inputs['Specular IOR Level'].default_value = spec
    b.inputs['Coat Weight'].default_value = coat
    b.inputs['Coat Roughness'].default_value = coat_rough
    return m

def link(ob):
    scene.collection.objects.link(ob)
    return ob

def lathe(name, prof, segs=96, mat=None, subsurf=1):
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

def emit_mat(name, color, strength):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt_ = m.node_tree
    for n_ in list(nt_.nodes): nt_.nodes.remove(n_)
    o = nt_.nodes.new('ShaderNodeOutputMaterial'); em = nt_.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = (*color, 1); em.inputs['Strength'].default_value = strength
    nt_.links.new(em.outputs[0], o.inputs[0])
    return m, em.inputs['Strength']

# ------------------------------------------------------------ the ribbon (the cloche film's, unchanged)
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
lit = nt.nodes.new('ShaderNodeHueSaturation'); lit.inputs['Saturation'].default_value = 1.15
nt.links.new(angf.outputs[0], ramp.inputs['Fac'])
nt.links.new(ramp.outputs['Color'], b.inputs['Base Color'])
nt.links.new(ramp.outputs['Color'], lit.inputs['Color'])
nt.links.new(lit.outputs['Color'], b.inputs['Emission Color'])
b.inputs['Roughness'].default_value = 0.3
b.inputs['Specular IOR Level'].default_value = 0.5
b.inputs['Coat Weight'].default_value = 0.05
b.inputs['Subsurface Weight'].default_value = 0.25
b.inputs['Subsurface Radius'].default_value = (0.2, 0.2, 0.2)
b.inputs['Subsurface Scale'].default_value = 0.3
RIB_STR = b.inputs['Emission Strength']
RIB_E0, RIB_E1 = float(arg('--ribe0', 5.0)), 9.0

# ------------------------------------------------------------ the beats, in frames (t = 1.8 + f/30)
F_PUSH_END = 96                    # the camera closes in on the flag
F_PEEL0, PEEL_DELAY, PEEL_DUR = 78, 26, 34   # the infinity comes off the cloth, left loop first
F_LIFT0, F_LIFT1 = 96, 182         # it lifts to the camera, turns to face it and grows
F_UNR0, F_UNR1 = 216, 276          # it unravels into the line (the cloche film's numbers)
F_PULL0, F_PULL1 = 228, 276
F_DIM0, F_DIM1 = 234, 282

# ------------------------------------------------------------ the world: X right, Y away from the camera, Z up
# the pole stands at the origin; the flag flies to +X
POLE_TOP = 4.75
FW, FH = 3.6, 2.4                  # the flag, hoist to fly and top to foot
F_TOP = 4.55
F_BOT = F_TOP - FH
HOIST_X = 0.085
FLY_ROT = math.radians(float(arg('--rot', 32)))
U_C, V_C, S_LOGO = 1.98, 1.2, 0.8   # the infinity's centre on the cloth and its half width

def flag_xyz(u, v, f):
    """the cloth at hoist distance u and height v (both in metres) on frame f. Every ripple's
    period divides 24 frames, so the flag's motion repeats exactly every 24 frames"""
    u = np.asarray(u, dtype=float); v = np.asarray(v, dtype=float)
    s = np.clip(u / FW, 0, 1)
    amp = s ** 0.95
    w = 2 * math.pi / 24 * (f + 12)   # +12: the phase of the cycle where the infinity reads best opens the film
    p1 = 2 * math.pi * u / 2.6 - w + 0.45 * v
    p2 = 2 * math.pi * u / 1.25 - 2 * w + 1.9 * v + 1.0
    p3 = 2 * math.pi * u / 0.62 - 3 * w - 2.6 * v + 2.0
    y = amp * (0.5 * np.sin(p1) + 0.15 * np.sin(p2) + (0.03 + 0.03 * s) * np.sin(p3))
    x = HOIST_X + u * (1 - 0.06 * s) - 0.15 * amp * np.cos(p1)
    z = F_BOT + v - 0.13 * s * s + 0.08 * amp * np.sin(2 * math.pi * u / 1.7 - 2 * w + 0.8 * v)
    # the wind takes the flag off to the right and away from the camera, so its folds turn to the light
    ca, sa = math.cos(FLY_ROT), math.sin(FLY_ROT)
    return np.stack([x * ca - y * sa, x * sa + y * ca, z], axis=-1)

def flag_frame(u, v, f, e=0.01):
    """the cloth's point, its unit normal toward the camera, and its along and up directions"""
    p = flag_xyz(u, v, f)
    du = flag_xyz(u + e, v, f) - flag_xyz(u - e, v, f)
    dv = flag_xyz(u, v + e, f) - flag_xyz(u, v - e, f)
    n = np.cross(dv, du)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    flip = n[..., 1] > 0
    n[flip] *= -1                                   # toward the camera, which looks along +Y
    du /= np.linalg.norm(du, axis=-1, keepdims=True)
    dv /= np.linalg.norm(dv, axis=-1, keepdims=True)
    return p, n, du, dv

# ------------------------------------------------------------ materials
m_satin = bpy.data.materials.new('satin'); m_satin.use_nodes = True
bs = m_satin.node_tree.nodes['Principled BSDF']
bs.inputs['Base Color'].default_value = (0.008, 0.008, 0.01, 1)
bs.inputs['Roughness'].default_value = 0.42
bs.inputs['Specular IOR Level'].default_value = 0.5
bs.inputs['Sheen Weight'].default_value = 1.0
bs.inputs['Sheen Roughness'].default_value = 0.4
bs.inputs['Sheen Tint'].default_value = (0.75, 0.78, 0.9, 1)
bs.inputs['Coat Weight'].default_value = 0.08
bs.inputs['Coat Roughness'].default_value = 0.2
m_steel = new_mat('steel', base=(0.62, 0.62, 0.64), metallic=1.0, rough=0.2)
m_gold = new_mat('gold', base=(0.95, 0.7, 0.38), metallic=1.0, rough=0.16)
m_rope = new_mat('rope', base=(0.05, 0.045, 0.04), rough=0.7)

# ------------------------------------------------------------ the pole
pole = lathe('pole', [(0.0, -16.0), (0.07, -16.0), (0.07, POLE_TOP - 0.06), (0.06, POLE_TOP), (0.0, POLE_TOP)],
             segs=48, mat=m_steel, subsurf=0)
collar = lathe('collar', [(0.0, POLE_TOP - 0.02), (0.085, POLE_TOP - 0.02), (0.09, POLE_TOP + 0.03), (0.06, POLE_TOP + 0.06), (0.0, POLE_TOP + 0.06)],
               segs=48, mat=m_gold, subsurf=1)
bpy.ops.mesh.primitive_uv_sphere_add(radius=0.13, segments=48, ring_count=24, location=(0, 0, POLE_TOP + 0.18))
finial = bpy.context.object; finial.name = 'finial'; finial.data.materials.append(m_gold)
for p in finial.data.polygons: p.use_smooth = True
# the halyard: two lines down the pole from the top to the cloth's corners and on down out of frame
hal = poly_curve('halyard', [(0.055, -0.04, POLE_TOP - 0.05), (0.06, -0.04, F_TOP + 0.02), (0.06, -0.04, F_BOT - 0.02), (0.06, -0.04, -16)])
hal.data.bevel_depth = 0.007; hal.data.materials.append(m_rope)

# ------------------------------------------------------------ the flag: one mesh, a shape key per frame
NUF, NVF = 132, 88
us_ = np.linspace(0, FW, NUF); vs_ = np.linspace(0, FH, NVF)
UU, VV = np.meshgrid(us_, vs_, indexing='xy')
bm = bmesh.new()
rest = flag_xyz(UU, VV, 0).reshape(-1, 3)
vts = [bm.verts.new(tuple(p)) for p in rest]
for j in range(NVF - 1):
    for i in range(NUF - 1):
        a = j * NUF + i
        bm.faces.new((vts[a], vts[a + 1], vts[a + NUF + 1], vts[a + NUF]))
me = bpy.data.meshes.new('flag'); bm.to_mesh(me); bm.free()
for p in me.polygons: p.use_smooth = True
flag = link(bpy.data.objects.new('flag', me))
me.materials.append(m_satin)
sol = flag.modifiers.new('sol', 'SOLIDIFY'); sol.thickness = 0.012; sol.offset = 0
want = None
if arg('--still') is not None and not arg('--anim') and not arg('--save'):
    want = set(int(x) for x in str(arg('--still')).split(','))
flag.shape_key_add(name='basis', from_mix=False)
for f in range(N):
    if want is not None and f not in want: continue
    kb = flag.shape_key_add(name='f%03d' % f, from_mix=False)
    kb.data.foreach_set('co', flag_xyz(UU, VV, f).reshape(-1).astype(np.float32))
    kb.value = 0.0; kb.keyframe_insert('value', frame=max(0, f - 1))
    kb.value = 1.0; kb.keyframe_insert('value', frame=f)
    kb.value = 0.0; kb.keyframe_insert('value', frame=f + 1)
    if f == 0:
        kb.value = 1.0; kb.keyframe_insert('value', frame=0)
if me.shape_keys.animation_data and me.shape_keys.animation_data.action:
    for fc in me.shape_keys.animation_data.action.fcurves:
        for kp in fc.keyframe_points: kp.interpolation = 'CONSTANT'

# ------------------------------------------------------------ the town below, far out of focus
BULBS = []
for k in range(36):
    warm = rng.random() < 0.85
    col = (1.0, rng.uniform(0.46, 0.6), rng.uniform(0.18, 0.28)) if warm else (0.7, 0.8, 1.0)
    depth = rng.uniform(60, 130)
    side = rng.uniform(-45, 65)
    # a town on the low ground: a band along the foot of the frame, a few taller lights above it
    z = rng.uniform(-6.5, -2.6) if rng.random() < 0.85 else rng.uniform(-2.6, -0.4)
    rad_ = rng.uniform(0.18, 0.5) * depth / 60
    s0 = rng.uniform(10, 34) * (0.6 if not warm else 1.0)
    mb, sb = emit_mat('bulb', col, s0)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=rad_, segments=16, ring_count=8, location=(side, depth, z))
    bo = bpy.context.object; bo.name = 'bulb'; bo.data.materials.append(mb)
    bo.visible_shadow = False
    BULBS.append((sb, s0))

# ------------------------------------------------------------ the night: black to the camera, a dim cool sky for reflections
world = bpy.data.worlds.new('w'); scene.world = world; world.use_nodes = True
wn = world.node_tree
for n_ in list(wn.nodes): wn.nodes.remove(n_)
wout = wn.nodes.new('ShaderNodeOutputWorld')
wtc = wn.nodes.new('ShaderNodeTexCoord')
wsep = wn.nodes.new('ShaderNodeSeparateXYZ'); wn.links.new(wtc.outputs['Generated'], wsep.inputs['Vector'])
wgr = wn.nodes.new('ShaderNodeValToRGB')
wgr.color_ramp.elements[0].position = 0.45; wgr.color_ramp.elements[0].color = (0.02, 0.012, 0.007, 1)
wgr.color_ramp.elements[1].position = 0.8; wgr.color_ramp.elements[1].color = (0.012, 0.018, 0.034, 1)
wn.links.new(wsep.outputs['Z'], wgr.inputs['Fac'])
bg_env = wn.nodes.new('ShaderNodeBackground'); bg_env.inputs['Strength'].default_value = 1.0
wn.links.new(wgr.outputs['Color'], bg_env.inputs['Color'])
# to the camera the sky is the page's black with the faintest warm haze of the town at its foot
cgr = wn.nodes.new('ShaderNodeValToRGB')
cgr.color_ramp.elements[0].position = 0.46; cgr.color_ramp.elements[0].color = (0.0075, 0.0045, 0.003, 1)
cgr.color_ramp.elements[1].position = 0.56; cgr.color_ramp.elements[1].color = (0.0028, 0.0028, 0.0034, 1)
wn.links.new(wsep.outputs['Z'], cgr.inputs['Fac'])
bg_cam = wn.nodes.new('ShaderNodeBackground'); wn.links.new(cgr.outputs['Color'], bg_cam.inputs['Color'])
CAM_BG = bg_cam.inputs['Strength']
lp = wn.nodes.new('ShaderNodeLightPath')
wmix = wn.nodes.new('ShaderNodeMixShader')
wn.links.new(lp.outputs['Is Camera Ray'], wmix.inputs['Fac'])
wn.links.new(bg_env.outputs[0], wmix.inputs[1]); wn.links.new(bg_cam.outputs[0], wmix.inputs[2])
wn.links.new(wmix.outputs[0], wout.inputs['Surface'])
ENV_STR = bg_env.inputs['Strength']; ENV_E0 = 1.0

# ------------------------------------------------------------ light: a warm key from the town's side, a cool moon behind
FC = Vector((HOIST_X + FW * 0.5, 0, F_BOT + FH * 0.5))
L_key = area('key', (-8.5, -3.0, 7.0), FC, 5, float(arg('--key', 4200)), (1.0, 0.76, 0.52), shape='DISK')
L_moon = area('moon', (8.0, 9.0, 9.5), FC, 4, float(arg('--moon', 5200)), (0.6, 0.72, 1.0), shape='DISK')
L_under = area('under', (3.0, -5.0, -3.5), FC, 8, float(arg('--under', 1300)), (1.0, 0.55, 0.28))
L_fill = area('fill', (7.0, -11.0, 2.5), FC, 6, 220, (0.8, 0.86, 1.0))
L_glint = area('glint', (-2.2, -5.0, 6.5), (0, 0, 3.5), 0.6, 160, (1.0, 0.9, 0.78), shape='RECTANGLE', sy=4.0)
LIGHTS = [L_key, L_moon, L_under, L_fill, L_glint]
LIGHT_E = [l.data.energy for l in LIGHTS]

# ------------------------------------------------------------ camera
cam_d = bpy.data.cameras.new('cam'); cam_d.lens = float(arg('--lens', 90 if PHONE else 60)); cam_d.sensor_width = 36; cam_d.sensor_fit = 'HORIZONTAL'
cam_d.dof.use_dof = True; cam_d.dof.aperture_fstop = float(arg('--fstop', 0.8)); cam_d.dof.aperture_blades = 0
cam_d.clip_end = 600
cam = link(bpy.data.objects.new('cam', cam_d)); scene.camera = cam
aim = link(bpy.data.objects.new('aim', None))
cam_d.dof.focus_object = aim
trc = cam.constraints.new('TRACK_TO'); trc.target = aim; trc.track_axis = 'TRACK_NEGATIVE_Z'; trc.up_axis = 'UP_Y'

# where the infinity comes to rest, facing the camera, in front of the flag
MEET = Vector((float(arg('--mx', 1.55)), float(arg('--my', -4.6)), float(arg('--mz', 2.95))))
A0 = Vector((1.35, 0.9, 3.3)) if not PHONE else Vector((1.05, 0.6, 3.15))
D0, D1, D2, D3 = 14.2, 13.2, 12.6, 19.0
if PHONE:
    D0, D1, D2, D3 = float(arg('--pd0', 13.0)), float(arg('--pd1', 12.2)), float(arg('--pd2', 11.4)), 17.0
SX = float(arg('--sx', -0.205)) if not PHONE else 0.0
SY0, SY1, SY2 = (0.02, 0.02, -0.02) if not PHONE else (-0.1, -0.08, -0.04)

def cam_pose(dist, elev_deg, az_deg, a):
    e = math.radians(elev_deg); z = math.radians(az_deg)
    d = Vector((math.sin(z), math.cos(z), 0))
    return (a - d * dist * math.cos(e) + Vector((0, 0, dist * math.sin(e)))), a

for f in range(N):
    k1 = ease_io(smooth(f, 24, F_PUSH_END))   # still for the first 24 frames, so they loop
    k2 = ease_io(smooth(f, F_LIFT0, F_LIFT1))
    k3 = ease_io(smooth(f, F_PULL0, F_PULL1))
    a = A0.lerp(MEET, k2)
    a = a + Vector((0, 0, 0.9 * k3))
    dist = lerp(lerp(lerp(D0, D1, k1), D2, k2), D3, k3)
    elev = lerp(lerp(lerp(-5.0, -4.0, k1), -1.5, k2), 7.0, k3)
    az = lerp(lerp(-4.0, -2.0, k1), 1.0, k2)
    c, a2 = cam_pose(dist, elev, az, a)
    cam.location = c; cam.keyframe_insert('location', frame=f)
    aim.location = a2; aim.keyframe_insert('location', frame=f)
    cam_d.shift_x = SX; cam_d.keyframe_insert('shift_x', frame=f)
    cam_d.shift_y = lerp(lerp(SY0, SY1, k2), SY2, k3); cam_d.keyframe_insert('shift_y', frame=f)
linear(cam); linear(aim); linear(cam_d)

# ------------------------------------------------------------ geometry nodes tube (the cloche film's)
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

R_ON, R_MEET = 0.05, 0.16          # the piping on the cloth, the risen ribbon (the cloche film's RIB_R1)
S_MEET = 0.9 * 1.28                # the risen ribbon's half width (the cloche film's RIB_W0 * GROW)

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
subj_depth = (MEET - cam_pos).dot(fwd_f)
LINE_DEPTH = subj_depth * 0.92
snake_w = [unproject(x, y, LINE_DEPTH) for x, y in snake]
px_world = ((unproject(1000, 500, LINE_DEPTH) - unproject(0, 500, LINE_DEPTH)).length) / 1000
EXIT_R_TOP, EXIT_R_TAIL = 8.5 * px_world / 2, 3.2 * px_world / 2
snake_np = np.array([[p.x, p.y, p.z] for p in snake_w])[::-1]
tangent = (snake_np[0] - snake_np[3]); tangent /= np.linalg.norm(tangent)
up_w = np.array(up_f)
RAIL = {}

def on_cloth(f):
    """the infinity as piping on the cloth at frame f: points, and the pose of its centre"""
    uu = U_C + loop_u[:, 0] * S_LOGO
    vv = V_C + loop_u[:, 1] * S_LOGO
    p, n, _, _ = flag_frame(uu, vv, f)
    pts_ = p + n * (R_ON + 0.012 + loop_u[:, 2:3] * S_LOGO * 0.22)
    c, cn, cu, cv = flag_frame(np.array([U_C]), np.array([V_C]), f)
    return pts_, Vector(c[0]), Vector(cn[0]), Vector(cu[0]), Vector(cv[0])

def free_pose(f):
    """the risen infinity's centre, axes and size at frame f: off the cloth, then to MEET facing the camera"""
    # it leaves from the flag's mean plane, not from whichever fold it sits on, so it can never
    # turn edge-on while it comes away
    sr = U_C / FW
    xl, zl = HOIST_X + U_C * (1 - 0.06 * sr), F_BOT + V_C - 0.13 * sr * sr
    ca, sa = math.cos(FLY_ROT), math.sin(FLY_ROT)
    c_on = Vector((xl * ca, xl * sa, zl))
    x_on, y_on, n_on = Vector((ca, sa, 0)), Vector((0, 0, 1)), Vector((sa, -ca, 0))
    e1 = ease_io(smooth(f, F_PEEL0, F_PEEL0 + 34))
    k = ease_io(smooth(f, F_LIFT0, F_LIFT1))
    kt = ease_io(smooth(f, F_PEEL0 + 8, F_LIFT1 - 10))
    right, up, fwd = cam_basis(min(f, F_PULL0))
    start = c_on + n_on * (0.8 * e1)
    C = start.lerp(MEET, k)
    # a slow breath once it has arrived, so the hold is not a frozen frame
    C = C + up * (0.05 * math.sin(2 * math.pi * f / 48.0) * smooth(f, F_LIFT1 - 20, F_LIFT1))
    X = ((1 - kt) * x_on + kt * right).normalized()
    Y = ((1 - kt) * y_on + kt * up).normalized()
    Y = (Y - X * Y.dot(X)).normalized()
    scale = lerp(S_LOGO, S_MEET, k)
    depth = lerp(0.22, 1.0, k)
    return C, X, Y, scale, depth

def risen(f):
    C, X, Y, scale, depth = free_pose(f)
    Xn, Yn, Cn = np.array(X), np.array(Y), np.array(C)
    Zn = np.cross(Xn, Yn)
    return Cn + loop_u[:, 0:1] * scale * Xn + loop_u[:, 1:2] * scale * Yn + loop_u[:, 2:3] * scale * depth * Zn

def ribbon_state(f):
    k_grow = ease_io(smooth(f, F_LIFT0, F_LIFT1))
    radius = lerp(R_ON, R_MEET, k_grow)
    if f < F_PEEL0:
        pts_, *_ = on_cloth(f)
        return pts_[:-1], np.full(NU - 1, R_ON)
    if f < F_UNR0:
        att, *_ = on_cloth(f)
        fr = risen(f)
        # the peel runs from the left loop's tip to the right loop's tip
        side = (loop_u[:, 0] + 1) / 2
        t0 = F_PEEL0 + PEEL_DELAY * side
        w = np.clip((f - t0) / PEEL_DUR, 0, 1)
        w = (w * w * (3 - 2 * w))[:, None]
        pts_ = att * (1 - w) + fr * w
        rad = R_ON + (radius - R_ON) * w[:, 0]
        return pts_[:-1], rad[:-1]
    # ---- the exit: the cloche film's, line for line ----
    loop = risen(f)
    scale = S_MEET
    total = cumL[-1] * scale
    k = smooth(f, F_UNR0, F_UNR1) ** 1.35
    k = k * k * (3 - 2 * k) if k < 1 else 1.0
    coil = loop + up_w * (0.45 * k)
    d_sn = snake_np[-1] - snake_np[-4]; d_sn /= np.linalg.norm(d_sn)
    def exit_path(ustar, coil_pts):
        p3 = np.array([np.interp(ustar, u, coil_pts[:, kk]) for kk in range(3)])
        du = 0.006
        pa = np.array([np.interp((ustar - du) % 1.0, u, coil_pts[:, kk]) for kk in range(3)])
        pb = np.array([np.interp((ustar + du) % 1.0, u, coil_pts[:, kk]) for kk in range(3)])
        t_in = pb - pa; t_in /= (np.linalg.norm(t_in) + 1e-9)
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
    if 'Lb1' not in RAIL:
        RAIL['Lb1'] = exit_path(1.0, risen(F_UNR0) + up_w * 0.45)[2]
    Lb1 = RAIL['Lb1']
    Pp = k * (total + Lb1)
    ustar = min(1.0, Pp / total)
    slide = max(0.0, Pp - total)
    path, pc, bez_len = exit_path(ustar, coil)
    def from_bottom(dv):
        dv = np.clip(np.asarray(dv, dtype=float), 0, pc[-1])
        return np.stack([np.interp(pc[-1] - dv, pc, path[:, kk]) for kk in range(3)], axis=-1)
    on_rope = u <= ustar
    dist_up = (ustar - u) * total + slide
    pts_ = np.where(on_rope[:, None], from_bottom(dist_up), coil)
    thin = smooth(f, F_UNR0 + 4, F_UNR1 - 4)
    r_line = np.where(u < 0.82, EXIT_R_TOP, EXIT_R_TOP + (EXIT_R_TAIL - EXIT_R_TOP) * ((u - 0.82) / 0.18))
    rad = R_MEET * (1 - thin) + r_line * thin
    cap = np.maximum(rad, 1e-4) / total
    e_head = np.clip(u / np.maximum(cap, 1e-6), 0, 1)
    e_tail = np.clip((1 - u) / np.maximum(cap, 1e-6), 0, 1)
    c_on = smooth(ustar * total, 0.45, 1.1)
    prof = np.sqrt(1 - (1 - e_head) ** 2) * np.sqrt(1 - (1 - e_tail) ** 2)
    rad = rad * (1 - c_on + c_on * prof)
    rad = np.maximum(rad, rad.max() * 0.02)
    return pts_, rad

RIB_GN = tube_group('ribbon_gn', m_rib)
for f in range(N):
    if want is not None and f not in want: continue
    pts_, rad = ribbon_state(f)
    closed = f < F_PEEL0
    if not closed and f < F_UNR0:
        # while peeling the loop is still whole: keep it cyclic
        closed = True
    ob = poly_curve('rib%03d' % f, pts_, closed=closed)
    for i, p in enumerate(ob.data.splines[0].points): p.radius = float(rad[i])
    ob.modifiers.new('gn', 'NODES').node_group = RIB_GN
    ob.visible_shadow = False
    ob.hide_render = True
    ob.keyframe_insert('hide_render', frame=max(0, f - 1))
    ob.hide_render = False; ob.keyframe_insert('hide_render', frame=f)
    ob.hide_render = True; ob.keyframe_insert('hide_render', frame=f + 1)
    if f == 0:
        ob.hide_render = False; ob.keyframe_insert('hide_render', frame=0)

# ------------------------------------------------------------ the glow, the dim and the hold
for f in range(N):
    dim = ease_io(smooth(f, F_DIM0, F_DIM1))
    RIB_STR.default_value = lerp(RIB_E0, RIB_E1, ease_io(smooth(f, F_PEEL0 - 30, F_LIFT0 + 20))); RIB_STR.keyframe_insert('default_value', frame=f)
    ENV_STR.default_value = lerp(ENV_E0, 0.0, dim); ENV_STR.keyframe_insert('default_value', frame=f)
    CAM_BG.default_value = lerp(1.0, 0.0, dim); CAM_BG.keyframe_insert('default_value', frame=f)
    for L, e0 in zip(LIGHTS, LIGHT_E):
        L.data.energy = lerp(e0, 0.0, dim); L.data.keyframe_insert('energy', frame=f)
    for sb, s0 in BULBS:
        sb.default_value = lerp(s0, 0.0, dim); sb.keyframe_insert('default_value', frame=f)
linear(m_rib.node_tree); linear(world.node_tree)
for L in LIGHTS: linear(L.data)
for m in bpy.data.materials:
    if m.name.startswith('bulb'): linear(m.node_tree)

# ------------------------------------------------------------ output: scene-linear EXR, graded by grade.py
scene.render.image_settings.file_format = 'OPEN_EXR'
scene.render.image_settings.color_depth = '16'
scene.render.image_settings.exr_codec = 'DWAA'
scene.render.image_settings.color_mode = 'RGB'
scene.render.use_compositing = False

if arg('--export'):
    rows = [[1.0, 0.0, 0.0, round(1 - ease_io(smooth(f, F_DIM0, F_DIM1)), 2)] for f in range(N)]
    json.dump({'t0': 1.8, 'fps': FPS, 'cam': rows, 'traces': []}, open(os.path.join(HERE, 'hero-data.json'), 'w'))
    print('EXPORTED', len(rows), 'frames, no traces')
if arg('--tail'):
    from bpy_extras.object_utils import world_to_camera_view as w2c
    fr = int(arg('--tail')); pts_, rad = ribbon_state(fr); scene.frame_set(fr)
    for j in (0, 50, 200, 300, 350, 380, 390, 399):
        v = w2c(scene, cam, Vector(pts_[j]))
        print('TAIL', j, 'px (%.0f, %.0f)' % (v.x * W, (1 - v.y) * H), 'r %.4f' % rad[j])
if arg('--where'):
    # where the pole, the flag and the infinity land on screen at a few frames (layout check)
    from bpy_extras.object_utils import world_to_camera_view as w2c
    for fr in (0, 60, 120, 174, 216):
        scene.frame_set(fr)
        def px(p):
            v = w2c(scene, cam, Vector(p)); return '(%.0f%%, %.0f%%)' % (v.x * 100, (1 - v.y) * 100)
        c, X, Y, s, _ = free_pose(fr)
        print('WHERE', fr, 'pole', px((0, 0, 3.0)), 'pole top', px((0, 0, POLE_TOP)), 'flag fly',
              px(tuple(flag_xyz(FW, FH / 2, fr))), 'logo', px(tuple(flag_xyz(U_C, V_C, fr))), 'risen', px(tuple(c)))
if arg('--save'):
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'scene.blend'))
if arg('--still') is not None:
    os.makedirs(os.path.join(HERE, 'test'), exist_ok=True)
    for fs in str(arg('--still')).split(','):
        f = int(fs)
        name = (arg('--name') + '-' if arg('--name') else '') + ('p' if PHONE else '') + 'f%03d' % f
        scene.frame_set(f)
        scene.render.filepath = os.path.join(HERE, 'test', name + '.exr')
        bpy.ops.render.render(write_still=True)
        print('WROTE', scene.render.filepath)
if arg('--anim'):
    scene.frame_start = int(arg('--start', 0)); scene.frame_end = int(arg('--end', N - 1))
    EXR = 'render/exr-phone' if PHONE else 'render/exr'
    os.makedirs(os.path.join(HERE, EXR), exist_ok=True)
    scene.render.filepath = os.path.join(HERE, EXR, 'f')
    bpy.ops.render.render(animation=True)
    print('ANIM DONE')
