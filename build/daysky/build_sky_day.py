# -*- coding: utf-8 -*-
"""The two cloud beats of the film, built headless in Blender 4.5 (Karan, 2026-09-17:
"realistic clouds ... in a really big text size ... when the clouds form").

  blender -b --python-exit-code 1 -P build.py -- --beat a --still 0,48,95 [--scale .5] [--samples 32] [--name look1]
  blender -b --python-exit-code 1 -P build.py -- --beat a --anim [--start 0 --end 95] [--samples 96]
  blender -b --python-exit-code 1 -P build.py -- --beat b --still 95 --notext --out C:/x/sky-b-still   (the story still)

Each beat is 96 frames the page scrubs with the scroll: black sky, wisps gather
into a cumulus bank (the noise displacement relaxes, the density threshold falls,
the bank grows), the words rise out of the cloud tops and rest there while the
clouds keep billowing. Beat a says "Feel the growth."; beat b "Taking your time?
They're taking your customers." Monochrome clouds on black, a warm key from the
front left, a backlight for the silver linings, cream letters: the site's palette."""
import bpy, bmesh, sys, os, math, random, time
DAYSKY = True
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(name, default=None):
    if name in argv:
        i = argv.index(name)
        return argv[i + 1] if i + 1 < len(argv) and not argv[i + 1].startswith('--') else True
    return default

BEAT = arg('--beat', 'a')
N = 96
FPS = 30
W, H = 1920, 1080
# --phone: the beat composed for a phone held upright (2026-10-03): a portrait
# frame, a longer lens, and the words stacked so they can be set big
PHONE = bool(arg('--phone'))
if PHONE:
    W, H = 1080, int(arg('--ph', 1440))
SEED = int(arg('--seed', {'a': 7, 'b': 23}[BEAT]))   # --seed: another cloud layout (the phone's frames)
rng = random.Random(SEED)
NOTEXT = bool(arg('--notext'))
FONT = os.path.join(HERE, '..', 'sky3d', 'fonts', arg('--font', 'bvp-600') + '.ttf')
SCALE = float(arg('--scale', 1))

# the words, with their sizes (Blender text size; the frame is 27 units wide at the words)
TEXTS = {
    'a': [('Feel the growth.', float(arg('--tsize', 3.3)))],
    'b': [('Taking your time?', float(arg('--tsize', 2.3))), ('They\u2019re taking your customers.', float(arg('--tsize2', 1.4)))],
}[BEAT]
if PHONE:
    TEXTS = {
        'a': [('Feel the', float(arg('--tsize', 3.0))), ('growth.', float(arg('--tsize', 3.0)))],
        'b': [('Taking', float(arg('--tsize', 2.6))), ('your time?', float(arg('--tsize', 2.6))),
              ('They\u2019re taking', float(arg('--tsize2', 1.45))), ('your customers.', float(arg('--tsize2', 1.45)))],
    }[BEAT]
# the words set in the site's accent orange (#FF5B1F): "growth", and in the
# second beat's answer line "taking" and "customers"; the question line stays cream
ACCENT_WORDS = {'a': {0: ['growth']}, 'b': {1: ['taking', 'customers']}}[BEAT]
if PHONE:
    ACCENT_WORDS = {'a': {1: ['growth']}, 'b': {2: ['taking'], 3: ['customers']}}[BEAT]
_acc = [float(x) for x in str(arg('--accent', '1.0,0.107,0.0144')).split(',')]
EMIT = float(arg('--emit', 0.0))
TEXT_Y = 30.0                      # depth of the words, inside the main bank
Z_END = float(arg('--zend', {'a': 1.4, 'b': 0.8}[BEAT]))  # where the words come to rest (their baseline)
Z_START = -11.5                    # below the frame, then buried in the bank
PITCH = float(arg('--pitch', -1.5))
DS = float(arg('--ds', 10.0))       # density scale
ER = float(arg('--erode', .45))
AMB = float(arg('--amb', .15))
KEY = float(arg('--key', 9.0))
RIM = float(arg('--rim', 3.0))
FILL = float(arg('--fill', 3000))
ANISO = float(arg('--aniso', .4))

def smooth(x, a, b):
    t = min(1.0, max(0.0, (x - a) / (b - a))) if b != a else (1.0 if x >= b else 0.0)
    return t * t * (3 - 2 * t)
def lerp(a, b, t): return a + (b - a) * t
def ease_out(t): return 1 - (1 - t) ** 3

# ------------------------------------------------------------ scene
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
# exact pixels: the percentage is a whole number, and 83% of 1920 is 1593, not 1600
scene.render.resolution_x, scene.render.resolution_y = round(W * SCALE), round(H * SCALE)
scene.render.resolution_percentage = 100
scene.render.fps = FPS
scene.frame_start, scene.frame_end = 0, N - 1
scene.render.film_transparent = True
scene.render.use_motion_blur = False
prefs = bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type = 'OPTIX'
prefs.get_devices()
for d in prefs.devices:
    d.use = d.type in ('OPTIX', 'CPU')
cy = scene.cycles
cy.device = 'GPU'
cy.samples = int(arg('--samples', 32))
cy.use_adaptive_sampling = True
cy.adaptive_threshold = float(arg('--athr', 0.03))
cy.use_denoising = True
cy.denoiser = 'OPTIX'
cy.denoising_use_gpu = True
cy.max_bounces = 12
cy.diffuse_bounces = 2
cy.glossy_bounces = 2
cy.transmission_bounces = 0
cy.volume_bounces = int(arg('--vb', 5))
cy.volume_step_rate = float(arg('--vstep', 1.4))
cy.volume_max_steps = 1024
cy.caustics_reflective = False
cy.caustics_refractive = False
cy.sample_clamp_direct = 0
cy.sample_clamp_indirect = 8
cy.use_light_tree = True
scene.render.use_persistent_data = True
scene.view_settings.view_transform = 'AgX'
scene.view_settings.look = arg('--look', 'AgX - Medium High Contrast')
scene.view_settings.exposure = float(arg('--exp', .3))
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.image_settings.color_depth = '8'
scene.render.image_settings.compression = 40

def link(ob):
    scene.collection.objects.link(ob)
    return ob

# ------------------------------------------------------------ world: a day sky that lights the clouds (the camera sees through it: transparent film)
world = bpy.data.worlds.new('sky'); scene.world = world; world.use_nodes = True
wn = world.node_tree
for n in list(wn.nodes): wn.nodes.remove(n)
w_bg = wn.nodes.new('ShaderNodeBackground')
_sky = [float(x) for x in str(arg('--skycol', '.42,.62,1.0')).split(',')]
w_bg.inputs['Color'].default_value = (_sky[0], _sky[1], _sky[2], 1)
w_bg.inputs['Strength'].default_value = float(arg('--skyl', 1.0))
w_out = wn.nodes.new('ShaderNodeOutputWorld')
wn.links.new(w_bg.outputs['Background'], w_out.inputs['Surface'])

# ------------------------------------------------------------ camera
cam = bpy.data.cameras.new('cam'); cam.lens = float(arg('--plens', 58)) if PHONE else 40; cam.sensor_width = 36; cam.sensor_fit = 'HORIZONTAL'; cam.clip_end = 600
cob = link(bpy.data.objects.new('cam', cam)); scene.camera = cob

# ------------------------------------------------------------ lights
def sun(name, toward, energy, color, angle):
    l = bpy.data.lights.new(name, 'SUN'); l.energy = energy; l.color = color; l.angle = math.radians(angle)
    ob = link(bpy.data.objects.new(name, l))
    ob.rotation_euler = Vector(toward).normalized().to_track_quat('-Z', 'Y').to_euler()
    return ob
sun('key', (0.42, 0.30, -0.86), KEY, (1.0, 0.955, 0.90), 1.6)     # front left, high: lit tops and faces
sun('rim', (-0.25, -0.80, -0.55), RIM, (1.0, 0.98, 0.95), 2.5)    # behind, right: silver linings
fl = bpy.data.lights.new('fill', 'AREA'); fl.shape = 'SQUARE'; fl.size = 90; fl.energy = FILL; fl.color = (0.80, 0.86, 1.0)
fob = link(bpy.data.objects.new('fill', fl)); fob.location = (0, 34, 52); fob.rotation_euler = (0, 0, 0)

# ------------------------------------------------------------ the banks: sphere clusters, remeshed into one skin each
def bank(name, center, half_w, depth, towers, tall, r):
    cx, cy, cz = center
    bm = bmesh.new()
    def sph(x, y, z, sx, sy, sz):
        g = bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=12, radius=1.0)
        bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=g['verts'])
        bmesh.ops.translate(bm, vec=(x - cx, y - cy, z - cz), verts=g['verts'])
    n_base = int(towers * 1.6)
    for i in range(n_base):
        u = (i + .5) / n_base
        edge = 1 - abs(u - .5) * 2
        s = lerp(.5, 1, edge ** .6)
        sph(cx + lerp(-half_w, half_w, u) + r.uniform(-.8, .8), cy + r.uniform(-depth * .3, depth * .3),
            cz - 1.2 + r.uniform(-.6, .6), 4.4 * s, depth * .5 * s, 2.7 * s)
    for i in range(towers):
        u = (i + .5) / towers
        edge = 1 - abs(u - .5) * 2
        x = cx + lerp(-half_w * .92, half_w * .92, u) + r.uniform(-1.4, 1.4)
        y = cy + r.uniform(-depth * .35, depth * .35)
        h = tall * lerp(.3, 1, edge ** .8) * r.uniform(.7, 1.15)
        z = cz - .4; rad = r.uniform(2.6, 3.5)
        while rad > .9 and z < cz + h:
            sph(x + r.uniform(-.7, .7), y + r.uniform(-.7, .7), z, rad * r.uniform(.9, 1.15), rad * r.uniform(.8, 1.05), rad * .82)
            z += rad * .62; rad *= r.uniform(.74, .86)
        # small puffs around the top of the tower: the cauliflower heads
        for k in range(r.randint(3, 6)):
            pr = r.uniform(.9, 1.7); ang = r.uniform(0, 6.283)
            sph(x + math.cos(ang) * r.uniform(1.0, 2.6), y + math.sin(ang) * r.uniform(.8, 2.0), z - rad * .5 + r.uniform(-.8, .6), pr * 1.15, pr, pr * .9)
    me = bpy.data.meshes.new(name + '_raw'); bm.to_mesh(me); bm.free()
    raw = link(bpy.data.objects.new(name + '_raw', me)); raw.location = center
    md = raw.modifiers.new('rm', 'REMESH'); md.mode = 'VOXEL'; md.voxel_size = 0.4; md.use_smooth_shade = True
    dg = bpy.context.evaluated_depsgraph_get()
    skin = bpy.data.meshes.new_from_object(raw.evaluated_get(dg))
    ob = link(bpy.data.objects.new(name, skin)); ob.location = center
    ob.hide_render = True; ob.hide_viewport = True
    bpy.data.objects.remove(raw)
    return ob

# the displacement noise, colour so each axis warps on its own
tex = bpy.data.textures.new('warp', 'CLOUDS')
tex.cloud_type = 'COLOR'; tex.noise_basis = 'IMPROVED_PERLIN'; tex.noise_scale = float(arg('--wscale', 2.0)); tex.noise_depth = 4; tex.noise_type = 'SOFT_NOISE'

def cloud(name, mesh_ob, seed_off):
    vol = bpy.data.volumes.new(name)
    vob = link(bpy.data.objects.new(name, vol))
    m2v = vob.modifiers.new('m2v', 'MESH_TO_VOLUME')
    m2v.object = mesh_ob
    m2v.resolution_mode = 'VOXEL_SIZE'
    m2v.voxel_size = float(arg('--voxel', .16))
    for k, v in (('use_fill_volume', True), ('interior_band_width', float(arg('--band', 3.0))), ('density', 1.0)):
        if hasattr(m2v, k): setattr(m2v, k, v)
    disp = vob.modifiers.new('warp', 'VOLUME_DISPLACE')
    disp.texture = tex; disp.texture_map_mode = 'LOCAL'; disp.strength = 1.0
    disp.texture_mid_level = (0.5, 0.5, 0.5); disp.texture_sample_radius = 1.0
    vob.location = (seed_off, 0, 0)   # a different slice of the noise per bank
    return vob, disp

# ------------------------------------------------------------ the volume shader
mat = bpy.data.materials.new('cumulus'); mat.use_nodes = True
nt = mat.node_tree
for n in list(nt.nodes): nt.nodes.remove(n)
vi = nt.nodes.new('ShaderNodeVolumeInfo')
tc = nt.nodes.new('ShaderNodeTexCoord')
def noise_term(scale, detail, rough, lac, amp, name):
    n = nt.nodes.new('ShaderNodeTexNoise'); n.noise_dimensions = '4D'; n.name = name
    n.inputs['Scale'].default_value = scale; n.inputs['Detail'].default_value = detail
    n.inputs['Roughness'].default_value = rough; n.inputs['Lacunarity'].default_value = lac
    sub = nt.nodes.new('ShaderNodeMath'); sub.operation = 'SUBTRACT'; sub.inputs[1].default_value = .5
    mul = nt.nodes.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'; mul.inputs[1].default_value = amp
    nt.links.new(tc.outputs['Object'], n.inputs['Vector'])
    nt.links.new(n.outputs['Fac'], sub.inputs[0]); nt.links.new(sub.outputs[0], mul.inputs[0])
    return n, mul
noise, t1 = noise_term(float(arg('--nscale', .9)), 6, .62, 2.1, float(arg('--erode', .6)), 'n1')      # the billows
noise2, t2 = noise_term(float(arg('--nscale2', 3.0)), 4, .55, 2.3, float(arg('--erode2', .28)), 'n2')  # the cauliflower grain
n_add = nt.nodes.new('ShaderNodeMath'); n_add.operation = 'ADD'
n_field = nt.nodes.new('ShaderNodeMath'); n_field.operation = 'ADD'
ramp = nt.nodes.new('ShaderNodeMapRange'); ramp.interpolation_type = 'SMOOTHSTEP'; ramp.clamp = True
ramp.inputs['To Min'].default_value = 0; ramp.inputs['To Max'].default_value = 1
n_pow = nt.nodes.new('ShaderNodeMath'); n_pow.operation = 'POWER'; n_pow.inputs[1].default_value = float(arg('--edgepow', 1.8))
n_mult = nt.nodes.new('ShaderNodeMath'); n_mult.operation = 'MULTIPLY'; n_mult.inputs[1].default_value = 1.0   # formation
n_ds = nt.nodes.new('ShaderNodeMath'); n_ds.operation = 'MULTIPLY'; n_ds.inputs[1].default_value = DS
pv = nt.nodes.new('ShaderNodeVolumePrincipled')
pv.inputs['Color'].default_value = (1, 1, 1, 1)
pv.inputs['Anisotropy'].default_value = ANISO
pv.inputs['Absorption Color'].default_value = (1, 1, 1, 1)
out = nt.nodes.new('ShaderNodeOutputMaterial')
L = nt.links.new
L(t1.outputs[0], n_add.inputs[0]); L(t2.outputs[0], n_add.inputs[1])
L(vi.outputs['Density'], n_field.inputs[0]); L(n_add.outputs[0], n_field.inputs[1])
L(n_field.outputs[0], ramp.inputs['Value'])
L(ramp.outputs['Result'], n_pow.inputs[0]); L(n_pow.outputs[0], n_mult.inputs[0])
L(n_mult.outputs[0], n_ds.inputs[0]); L(n_ds.outputs[0], pv.inputs['Density'])
L(pv.outputs['Volume'], out.inputs['Volume'])
THR = ramp.inputs['From Min']; SOFT = ramp.inputs['From Max']; MULT = n_mult.inputs[1]; NW = noise.inputs['W']; NW2 = noise2.inputs['W']

# ------------------------------------------------------------ the banks of this beat
if BEAT == 'a':
    banks = [
        ('main', (0.0, 31.0, -4.2), 17.0, 12.0, 10, 5.4),
        ('far',  (9.0, 62.0, 9.0), 13.0, 8.0, 7, 3.0),
        ('near', (-11.0, 20.0, -10.5), 6.5, 6.0, 4, 2.8),
    ]
else:
    banks = [
        ('main', (0.5, 31.0, -4.4), 17.5, 12.0, 11, 5.2),
        ('far',  (-10.0, 70.0, 12.0), 13.0, 8.0, 7, 3.0),
        ('near', (11.0, 20.5, -10.5), 6.5, 6.0, 4, 2.6),
    ]
grown = []   # (mesh object, displace modifier, center)
for i, (nm, center, hw, dp, tw, tall) in enumerate(banks):
    mob = bank(nm, center, hw, dp, tw, tall, rng)
    vob, disp = cloud(nm + '_vol', mob, i * 37.0 + SEED)
    vob.data.materials.append(mat)
    grown.append((mob, disp, center))

# ------------------------------------------------------------ the words
tmat = bpy.data.materials.new('letters'); tmat.use_nodes = True
tb = tmat.node_tree.nodes['Principled BSDF']
_tc = [float(x) for x in str(arg('--tcol', '.034,.040,.052')).split(',')]
tb.inputs['Base Color'].default_value = (_tc[0], _tc[1], _tc[2], 1)
tb.inputs['Roughness'].default_value = float(arg('--trough', .32))
tb.inputs['Coat Weight'].default_value = float(arg('--tcoat', .5)); tb.inputs['Coat Roughness'].default_value = .18
tb.inputs['Specular IOR Level'].default_value = float(arg('--tspec', .35))
omat = bpy.data.materials.new('accent'); omat.use_nodes = True
ob_ = omat.node_tree.nodes['Principled BSDF']
ob_.inputs['Base Color'].default_value = (_acc[0], _acc[1], _acc[2], 1)
ob_.inputs['Roughness'].default_value = float(arg('--trough', .32))
ob_.inputs['Coat Weight'].default_value = float(arg('--tcoat', .5)); ob_.inputs['Coat Roughness'].default_value = .18
ob_.inputs['Specular IOR Level'].default_value = float(arg('--tspec', .35))
if EMIT > 0:
    ob_.inputs['Emission Color'].default_value = (_acc[0], _acc[1], _acc[2], 1)
    ob_.inputs['Emission Strength'].default_value = EMIT
words = link(bpy.data.objects.new('words', None))
words.location = (0, TEXT_Y, Z_START)
if not NOTEXT:
    font = bpy.data.fonts.load(FONT)
    lines = list(TEXTS)
    # the phone sets its stacked lines tight, like the page's own headlines
    LH, GAP = (float(arg('--plh', .84)), float(arg('--pgap', .12))) if PHONE else (1.0, .55)
    heights = [sz * LH for _, sz in lines]
    total = sum(heights) + GAP * (len(lines) - 1)
    for j, (body, sz) in enumerate(lines):
        cu = bpy.data.curves.new('t%d' % j, 'FONT')
        cu.body = body; cu.font = font; cu.size = sz
        cu.align_x = 'CENTER'; cu.align_y = 'BOTTOM_BASELINE'
        cu.extrude = (0.16 * sz / 2.9 + 0.08) * float(arg('--exf', 2.2)); cu.bevel_depth = 0.016 * sz; cu.bevel_resolution = 3
        cu.resolution_u = 10; cu.fill_mode = 'BOTH'
        cu.materials.append(tmat)
        cu.materials.append(omat)
        tob = link(bpy.data.objects.new('t%d' % j, cu))
        for w in ACCENT_WORDS.get(j, []):
            at = body.find(w)
            assert at >= 0, w
            for ci in range(at, at + len(w)):
                cu.body_format[ci].material_index = 1
        tob.parent = words
        tob.rotation_euler = (math.radians(90), 0, 0)
        # baseline of line j from the group's origin: line 0 highest
        base = total - sum(heights[:j + 1]) - GAP * j
        tob.location = (0, 0, base)

# ------------------------------------------------------------ animation: one key per frame, linear
def key(id_, path, f, idx=-1):
    id_.keyframe_insert(data_path=path, frame=f, index=idx)
for f in range(N):
    t = f / (N - 1)
    form = smooth(t, 0.0, 0.62)
    body = smooth(t, 0.0, 0.42)
    for mob, disp, center in grown:
        s = lerp(0.84, 1.0, form)
        mob.scale = (s, s, s); key(mob, 'scale', f)
        disp.strength = lerp(2.6, float(arg('--warp', 1.2)), form); key(disp, 'strength', f)
    THR.default_value = lerp(0.7, float(arg('--thr', .18)), form); key(THR, 'default_value', f)
    SOFT.default_value = THR.default_value + lerp(0.4, float(arg('--soft', .16)), form); key(SOFT, 'default_value', f)
    MULT.default_value = body; key(MULT, 'default_value', f)
    NW.default_value = SEED * 0.13 + 0.55 * t; key(NW, 'default_value', f)
    NW2.default_value = SEED * 0.31 + 0.9 * t; key(NW2, 'default_value', f)
    rise = ease_out(smooth(t, 0.30, 0.76))
    words.location = (0, TEXT_Y, lerp(Z_START, Z_END, rise)); key(words, 'location', f)
    cob.location = (0, lerp(-1.0, 3.2, smooth(t, 0, 1)), lerp(0.8, 1.5, t))
    cob.rotation_euler = (math.radians(90 + PITCH + 0.6 * t), 0, math.radians(lerp(0.4, -0.4, t)))
    key(cob, 'location', f); key(cob, 'rotation_euler', f)
for id_ in list(bpy.data.objects) + [nt]:
    ad = getattr(id_, 'animation_data', None)
    if ad and ad.action:
        for fc in ad.action.fcurves:
            for kp in fc.keyframe_points: kp.interpolation = 'LINEAR'

scene.render.use_compositing = False

# ------------------------------------------------------------ go
if arg('--save'):
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'sky-%s.blend' % BEAT))
    print('SAVED')
if arg('--still'):
    name = arg('--name', 'test')
    for f in [int(x) for x in str(arg('--still')).split(',')]:
        scene.frame_set(f)
        out_ = arg('--out')
        scene.render.filepath = (out_ if os.path.isabs(out_) else os.path.join(HERE, out_)) if out_ else os.path.join(HERE, 'test', '%s-%s-f%03d' % (name, BEAT, f))
        t0 = time.time()
        bpy.ops.render.render(write_still=True)
        print('STILL', BEAT, f, '%.1fs' % (time.time() - t0), scene.render.filepath)
if arg('--anim'):
    a, b = int(arg('--start', 0)), int(arg('--end', N - 1))
    scene.frame_start, scene.frame_end = a, b
    outdir = os.path.join(HERE, 'out', BEAT); os.makedirs(outdir, exist_ok=True)
    scene.render.filepath = os.path.join(outdir, 'f')
    scene.render.use_file_extension = True
    t0 = time.time()
    bpy.ops.render.render(animation=True)
    print('ANIM', BEAT, a, b, '%.0fs' % (time.time() - t0))
