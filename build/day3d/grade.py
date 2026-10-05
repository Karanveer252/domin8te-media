# -*- coding: utf-8 -*-
"""Grade the scene-linear EXR frames into the film's PNGs: bloom, vignette,
AgX view transform. Runs in Blender's compositor without rendering, so a
change here costs seconds, not a re-render.

  blender -b --python-exit-code 1 -P grade.py -- --in test/f000.exr --out test/f000.png [--bloom .25 --thresh 1.0 --size .35 --vig .55 --exp 0]
  blender -b --python-exit-code 1 -P grade.py -- --seq exr --out out [--start 0 --end 288]
"""
import bpy, sys, os, glob
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(name, default=None):
    if name in argv:
        i = argv.index(name)
        return argv[i + 1] if i + 1 < len(argv) and not argv[i + 1].startswith('--') else True
    return default
HERE = os.path.dirname(os.path.abspath(__file__))
BLOOM = float(arg('--bloom', 0.25)); THRESH = float(arg('--thresh', 1.0)); SIZE = float(arg('--size', 0.35))
VIG = float(arg('--vig', 0.55)); EXP = float(arg('--exp', 0.0)); LOOK = arg('--look', 'AgX - Punchy')
W, H = int(arg('--w', 1920)), int(arg('--h', 1080))   # --w/--h for the phone's portrait frames

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.resolution_x, scene.render.resolution_y = W, H
scene.render.resolution_percentage = 100
scene.view_settings.view_transform = 'AgX'
scene.view_settings.look = LOOK
scene.view_settings.exposure = EXP
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_depth = '8'
scene.render.image_settings.color_mode = 'RGBA'   # day: the alpha goes on to cream.py
scene.render.image_settings.compression = 40
scene.use_nodes = True
scene.render.use_compositing = True
ct = scene.node_tree
for n in list(ct.nodes): ct.nodes.remove(n)

def set_in(node, names, value):
    """4.5 moved most node options into sockets; take whichever exists"""
    for nm in names:
        if nm in node.inputs:
            try: node.inputs[nm].default_value = value; return nm
            except Exception: pass
        if hasattr(node, nm):
            try: setattr(node, nm, value); return nm
            except Exception: pass
    return None

img = ct.nodes.new('CompositorNodeImage')
glare = ct.nodes.new('CompositorNodeGlare')
try: glare.glare_type = 'BLOOM'
except Exception: glare.glare_type = 'FOG_GLOW'
glare.quality = 'HIGH'
print('GLARE inputs:', [(s.name, getattr(s, 'default_value', None)) for s in glare.inputs])
set_in(glare, ['Threshold', 'threshold'], THRESH)
set_in(glare, ['Strength', 'strength'], BLOOM)
set_in(glare, ['Size', 'size'], SIZE)
set_in(glare, ['Saturation', 'saturation'], 1.0)
set_in(glare, ['Highlights Smoothness', 'smoothness'], 0.15)
VSIZE = float(arg('--vsize', 1.35)); VBLUR = int(arg('--vblur', 380))
ell = ct.nodes.new('CompositorNodeEllipseMask')
set_in(ell, ['Width', 'width'], VSIZE); set_in(ell, ['Height', 'height'], VSIZE)
blur = ct.nodes.new('CompositorNodeBlur'); blur.filter_type = 'GAUSS'
if 'Size' in blur.inputs:
    try: blur.inputs['Size'].default_value = (VBLUR, VBLUR)
    except Exception:
        try: blur.inputs['Size'].default_value = VBLUR
        except Exception: pass
else:
    blur.size_x = VBLUR; blur.size_y = VBLUR; blur.use_relative = False
vmix = ct.nodes.new('CompositorNodeMixRGB'); vmix.blend_type = 'MULTIPLY'; vmix.inputs['Fac'].default_value = VIG
# a touch of haze: the far corners never go to pure black (scene-linear add)
LIFT = float(arg('--lift', 0.0))
lift = ct.nodes.new('CompositorNodeMixRGB'); lift.blend_type = 'ADD'; lift.inputs['Fac'].default_value = 1.0
lift.inputs[2].default_value = (LIFT, LIFT, LIFT * 1.15, 1)
comp = ct.nodes.new('CompositorNodeComposite')
ct.links.new(img.outputs['Image'], glare.inputs['Image'])
ct.links.new(ell.outputs['Mask'], blur.inputs['Image'])
ct.links.new(glare.outputs['Image'], vmix.inputs[1])
ct.links.new(blur.outputs['Image'], vmix.inputs[2])
ct.links.new(vmix.outputs['Image'], lift.inputs[1])
sa = ct.nodes.new('CompositorNodeSetAlpha')
ct.links.new(lift.outputs['Image'], sa.inputs['Image']); ct.links.new(img.outputs['Alpha'], sa.inputs['Alpha'])
ct.links.new(sa.outputs['Image'], comp.inputs['Image'])

if arg('--in'):
    src = os.path.join(HERE, arg('--in')) if not os.path.isabs(arg('--in')) else arg('--in')
    im = bpy.data.images.load(src)
    img.image = im
    scene.render.resolution_x, scene.render.resolution_y = im.size[0], im.size[1]
    out = arg('--out'); out = os.path.join(HERE, out) if not os.path.isabs(out) else out
    scene.render.filepath = out
    bpy.ops.render.render(write_still=True)
    print('GRADED', out)
else:
    seq = os.path.join(HERE, arg('--seq', 'exr'))
    files = sorted(glob.glob(os.path.join(seq, 'f*.exr')))
    im = bpy.data.images.load(files[0]); im.source = 'SEQUENCE'
    # the image user's frame_start is 1-based: scene frame 0 must read f0000, not f0001
    img.image = im; img.frame_duration = len(files); img.frame_start = 1; img.frame_offset = 0
    img.use_auto_refresh = True
    outdir = os.path.join(HERE, arg('--out', 'out'))
    os.makedirs(outdir, exist_ok=True)
    a, b = int(arg('--start', 0)), int(arg('--end', len(files) - 1))
    scene.frame_start, scene.frame_end = a, b
    scene.render.filepath = os.path.join(outdir, 'f')
    scene.render.use_file_extension = True
    bpy.ops.render.render(animation=True)
    print('GRADED SEQ', a, b)
