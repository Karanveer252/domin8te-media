# -*- coding: utf-8 -*-
"""Version 3's cloud beats by day (Karan, 2026-10-05: "most of the times the clouds
animation doesn't load properly ... fix it"). The night film's clouds, made white,
cannot be made to look like day; this renders the same two beats in daylight.

build_sky_day.py = sky3d/build.py with this patch applied:
  cp ../sky3d/build.py build_sky_day.py && python patch_sky.py

What changes: the film is transparent (the page lays its own sky in under it, so the
film's sky and the page's are one colour by construction: compose.py), the world is
a soft blue sky that lights the clouds' shadow sides, the sun is a high noon key,
the words are heavy charcoal and orange with a gloss (the reference images), and the
render's own grade (bloom, vignette) is dropped: a day sky has none."""
import io

P = 'build_sky_day.py'
s = io.open(P, encoding='utf-8', newline='').read()
assert 'DAYSKY' not in s, 'already patched'

def rep(old, new, count=1):
    global s
    assert s.count(old) == count, (old[:60], s.count(old))
    s = s.replace(old, new)

rep('import bpy, bmesh, sys, os, math, random, time\n',
    'import bpy, bmesh, sys, os, math, random, time\nDAYSKY = True\n')
# fonts live with the night film
rep("FONT = os.path.join(HERE, 'fonts', arg('--font', 'bvp-400') + '.ttf')",
    "FONT = os.path.join(HERE, '..', 'sky3d', 'fonts', arg('--font', 'bvp-600') + '.ttf')")
# a transparent film, RGBA out
rep("scene.render.film_transparent = False", "scene.render.film_transparent = True")
rep("scene.render.image_settings.color_mode = 'RGB'", "scene.render.image_settings.color_mode = 'RGBA'")

# the world: a blue sky for everything but the camera
a = s.index('# ------------------------------------------------------------ world')
b = s.index('# ------------------------------------------------------------ camera')
s = s[:a] + '''# ------------------------------------------------------------ world: a day sky that lights the clouds (the camera sees through it: transparent film)
world = bpy.data.worlds.new('sky'); scene.world = world; world.use_nodes = True
wn = world.node_tree
for n in list(wn.nodes): wn.nodes.remove(n)
w_bg = wn.nodes.new('ShaderNodeBackground')
_sky = [float(x) for x in str(arg('--skycol', '.42,.62,1.0')).split(',')]
w_bg.inputs['Color'].default_value = (_sky[0], _sky[1], _sky[2], 1)
w_bg.inputs['Strength'].default_value = float(arg('--skyl', 1.0))
w_out = wn.nodes.new('ShaderNodeOutputWorld')
wn.links.new(w_bg.outputs['Background'], w_out.inputs['Surface'])

''' + s[b:]

# the words: charcoal and orange, glossy
rep("tb.inputs['Base Color'].default_value = (0.93, 0.89, 0.82, 1)\ntb.inputs['Roughness'].default_value = .58",
    "_tc = [float(x) for x in str(arg('--tcol', '.034,.040,.052')).split(',')]\n"
    "tb.inputs['Base Color'].default_value = (_tc[0], _tc[1], _tc[2], 1)\ntb.inputs['Roughness'].default_value = float(arg('--trough', .32))\n"
    "tb.inputs['Coat Weight'].default_value = float(arg('--tcoat', .5)); tb.inputs['Coat Roughness'].default_value = .18")
rep("ob_.inputs['Roughness'].default_value = .55",
    "ob_.inputs['Roughness'].default_value = float(arg('--trough', .32))\n"
    "ob_.inputs['Coat Weight'].default_value = float(arg('--tcoat', .5)); ob_.inputs['Coat Roughness'].default_value = .18")
rep("tb.inputs['Specular IOR Level'].default_value = .35", "tb.inputs['Specular IOR Level'].default_value = float(arg('--tspec', .35))")
rep("ob_.inputs['Specular IOR Level'].default_value = .3", "ob_.inputs['Specular IOR Level'].default_value = float(arg('--tspec', .35))")
# deeper letters, like the pictures'
rep("cu.extrude = 0.16 * sz / 2.9 + 0.08; cu.bevel_depth = 0.012 * sz",
    "cu.extrude = (0.16 * sz / 2.9 + 0.08) * float(arg('--exf', 2.2)); cu.bevel_depth = 0.016 * sz")

# no grade in the render: drop the compositor block
a = s.index('# ------------------------------------------------------------ the grade')
b = s.index('# ------------------------------------------------------------ go')
s = s[:a] + "scene.render.use_compositing = False\n\n" + s[b:]

io.open(P, 'w', encoding='utf-8', newline='').write(s)
print('patched', P)
