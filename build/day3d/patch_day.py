# Turns a fresh copy of cloche3d/build.py into build_day.py: the cloche film by day (version 3).
# usage: cp ../cloche3d/build.py build_day.py && python patch_day.py
import io
p = 'build_day.py'
s = io.open(p, encoding='utf-8').read()
R = [
('"""The cloche hero film, built headless in Blender 4.5 (Karan\'s pick: concept 4).',
 '"""Version 3: the cloche film by DAY (Karan, 2026-10-05, from his "grokbot" reference images: a sunlit\nwhite kitchen, white marble, a white plate, a glassy rainbow infinity, the page\'s cream at the end).\nA copy of cloche3d/build.py (made by patch_day.py) with the same choreography, frames and line hand-off;\nonly the world, materials and light change, and the ending dissolves the kitchen into the cream instead\nof dimming it.\n\nThe cloche hero film, built headless in Blender 4.5 (Karan\'s pick: concept 4).'),
("cy.transmission_bounces = 2", "cy.transmission_bounces = 8\ncy.transparent_max_bounces = 24"),
("vr.color_ramp.elements[0].position = 0.0; vr.color_ramp.elements[0].color = (0.05, 0.048, 0.046, 1)",
 "vr.color_ramp.elements[0].position = 0.0; vr.color_ramp.elements[0].color = (0.36, 0.355, 0.35, 1)"),
("vr.color_ramp.elements[1].position = 0.03; vr.color_ramp.elements[1].color = (0.011, 0.011, 0.012, 1)",
 "vr.color_ramp.elements[1].position = 0.03; vr.color_ramp.elements[1].color = (0.82, 0.81, 0.79, 1)"),
("e = vr.color_ramp.elements.new(0.012); e.color = (0.034, 0.033, 0.032, 1)",
 "e = vr.color_ramp.elements.new(0.012); e.color = (0.6, 0.595, 0.59, 1)"),
("rr.inputs['To Min'].default_value = 0.26; rr.inputs['To Max'].default_value = 0.46",
 "rr.inputs['To Min'].default_value = 0.1; rr.inputs['To Max'].default_value = 0.26"),
("m_plate = new_mat('plate', base=(0.008, 0.008, 0.009), rough=0.3, spec=0.5, coat=0.3, coat_rough=0.3)",
 "m_plate = new_mat('plate', base=(0.84, 0.83, 0.81), rough=0.16, spec=0.5, coat=0.7, coat_rough=0.05)"),
("m_chrome = new_mat('chrome', base=(0.93, 0.93, 0.94), metallic=1.0, rough=0.035, spec=0.5)",
 "m_chrome = new_mat('chrome', base=(0.93, 0.93, 0.94), metallic=1.0, rough=0.07, spec=0.5)"),
("m_wall = new_mat('wall', base=(0.03, 0.022, 0.017), rough=0.8, spec=0.3)",
 "m_wall = new_mat('wall', base=(0.6, 0.54, 0.47), rough=0.85, spec=0.3)"),
("m_iron = new_mat('iron', base=(0.05, 0.05, 0.05), metallic=0.8, rough=0.4)",
 "m_iron = new_mat('iron', base=(0.25, 0.24, 0.23), metallic=0.8, rough=0.35)"),
("m_wood = new_mat('wood', base=(0.03, 0.018, 0.01), rough=0.55)",
 "m_wood = new_mat('wood', base=(0.36, 0.22, 0.12), rough=0.5)"),
("m_glass = new_mat('bottle', base=(0.04, 0.05, 0.03), rough=0.07, spec=0.7)",
 "m_glass = new_mat('bottle', base=(0.86, 0.85, 0.82), rough=0.2, spec=0.5, coat=0.5, coat_rough=0.1)"),
("m_glass2 = new_mat('bottle2', base=(0.09, 0.04, 0.015), rough=0.07, spec=0.7)",
 "m_glass2 = new_mat('bottle2', base=(0.78, 0.74, 0.68), rough=0.25, spec=0.5, coat=0.4, coat_rough=0.1)"),
# the dark bottles become white bowls and cups on the open shelf
("    bt = lathe('bottle', [(0.0, 0.0), (r, 0.0), (r, h * 0.62), (r * 0.45, h * 0.78), (r * 0.3, h * 0.84), (r * 0.3, h), (0.0, h)],",
 "    h = h * 0.38; r = r * 1.9\n    bt = lathe('bottle', [(0.0, 0.0), (r * 0.55, 0.0), (r * 0.9, h * 0.45), (r, h), (r * 0.94, h), (r * 0.5, h * 0.12), (0.0, h * 0.12)],"),
# no night bulbs in daylight
("    BULBS.append((sb, s0))", "    bo.hide_render = True; bo.hide_viewport = True"),
# world: bright for reflections; to the camera, the page's cream (calibrated with --bg)
("wgr.color_ramp.elements[0].position = 0.45; wgr.color_ramp.elements[0].color = (0.004, 0.003, 0.002, 1)",
 "wgr.color_ramp.elements[0].position = 0.45; wgr.color_ramp.elements[0].color = (0.5, 0.48, 0.45, 1)"),
("wgr.color_ramp.elements[1].position = 0.75; wgr.color_ramp.elements[1].color = (0.09, 0.05, 0.022, 1)",
 "wgr.color_ramp.elements[1].position = 0.75; wgr.color_ramp.elements[1].color = (1.0, 0.97, 0.93, 1)"),
("bg_cam = wn.nodes.new('ShaderNodeBackground'); bg_cam.inputs['Color'].default_value = (0.003, 0.0025, 0.002, 1)",
 "BG = [float(x) for x in str(arg('--bg', '0.86,0.83,0.79')).split(',')]\nbg_cam = wn.nodes.new('ShaderNodeBackground'); bg_cam.inputs['Color'].default_value = (*BG, 1)"),
# the chrome's reflection cards: window light, not tungsten
("card('lamp_a', 1.3, 1.3, at(-1.2, -1.6, 5.6), (0, 0, 0.8), 14, (1.0, 0.68, 0.36), disk=True)",
 "card('lamp_a', 1.3, 1.3, at(-1.2, -1.6, 5.6), (0, 0, 0.8), 18, (1.0, 0.97, 0.92), disk=True)"),
("card('lamp_b', 1.0, 1.0, at(-0.4, 1.8, 6.0), (0, 0, 0.8), 12, (1.0, 0.66, 0.34), disk=True)",
 "card('lamp_b', 1.0, 1.0, at(-0.4, 1.8, 6.0), (0, 0, 0.8), 14, (1.0, 0.96, 0.9), disk=True)"),
("card('room', 34, 16, at(-17.0, 0, 3.5), (0, 0, 1.2), 0.55, (0.6, 0.3, 0.13), soft=True)",
 "pass   # no room card by day: its soft edge falls to black, and the bright world lights the chrome instead"),
("card('rim_l', 0.7, 4.5, at(2.6, -3.3, 1.6), (0, 0, 0.9), 5, (1.0, 0.74, 0.46))",
 "card('rim_l', 0.7, 4.5, at(2.6, -3.3, 1.6), (0, 0, 0.9), 7, (1.0, 0.97, 0.93))"),
("card('rim_r', 0.5, 3.8, at(1.8, 3.6, 1.8), (0, 0, 0.9), 3, (1.0, 0.7, 0.42))",
 "card('rim_r', 0.5, 3.8, at(1.8, 3.6, 1.8), (0, 0, 0.9), 5, (1.0, 0.97, 0.93))"),
("TUNG = (1.0, 0.78, 0.55)", "TUNG = (1.0, 0.95, 0.88)"),
("L_key = area('key', at(-5.5, -4.5, 7.5), (0, 0, 0.7), 9, 900, TUNG, shape='DISK')",
 "L_key = area('key', at(-5.5, -4.5, 7.5), (0, 0, 0.7), 9, float(arg('--key', 2600)), TUNG, shape='DISK')"),
("L_strip = area('strip', at(-1.0, 0.4, 7.0), (0, 0, 0.8), 6.5, 260, (1.0, 0.82, 0.62), shape='RECTANGLE', sy=1.0)",
 "L_strip = area('strip', at(-1.0, 0.4, 7.0), (0, 0, 0.8), 6.5, 700, (1.0, 0.97, 0.92), shape='RECTANGLE', sy=1.0)"),
("L_rim = area('rim', at(5.0, 2.2, 2.2), (0, 0, 1.2), 2.5, 1100, (1.0, 0.72, 0.45))",
 "L_rim = area('rim', at(5.0, 2.2, 2.2), (0, 0, 1.2), 2.5, 1300, (1.0, 0.95, 0.88))"),
("L_wallglow = area('wallglow', at(12.5, 4.5, 0.6), at(17.0, 4.5, 2.2), 10, 3800, (1.0, 0.55, 0.26))",
 "L_wallglow = area('wallglow', at(12.5, 4.5, 0.6), at(17.0, 4.5, 2.2), 10, float(arg('--wall', 3500)), (1.0, 0.93, 0.84))"),
("L_fill = area('fill', at(-9, 2.5, 2.0), (0, 0, 0.6), 6, 120, (0.85, 0.88, 1.0))",
 "L_fill = area('fill', at(-9, 2.5, 2.0), (0, 0, 0.6), 6, 900, (0.96, 0.97, 1.0))"),
("L_pans = area('pans', at(8.0, -6.0, 4.0), at(11.5, 5.0, 1.9), 6, 1500, (1.0, 0.6, 0.32))",
 "L_pans = area('pans', at(8.0, -6.0, 4.0), at(11.5, 5.0, 1.9), 6, 1600, (1.0, 0.9, 0.8))"),
("RIB_E0, RIB_E1 = float(arg('--ribe', 9.0)), 9.0", "RIB_E0, RIB_E1 = float(arg('--ribe', 4.5)), float(arg('--ribe1', 5.0))"),
("b.inputs['Coat Weight'].default_value = 0.05\n",
 "b.inputs['Coat Weight'].default_value = 0.6\nb.inputs['Coat Roughness'].default_value = 0.04\nb.inputs['Transmission Weight'].default_value = float(arg('--trans', 0.3))\nb.inputs['IOR'].default_value = 1.45\n"),
("em = nt.nodes.new('ShaderNodeEmission'); em.inputs['Color'].default_value = (1.0, 0.96, 0.92, 1); em.inputs['Strength'].default_value = 0.7",
 "em = nt.nodes.new('ShaderNodeEmission'); em.inputs['Color'].default_value = (1.0, 0.98, 0.96, 1); em.inputs['Strength'].default_value = 0.35"),
("    EXR = 'exr-phone' if PHONE else 'exr'", "    EXR = 'render/exr-phone' if PHONE else 'render/exr'"),
("LIGHT_E = [l.data.energy for l in LIGHTS]",
 "L_window = area('window', at(6.0, -12.0, 6.5), (0, 0, 0.6), 12, float(arg('--window', 7000)), (1.0, 0.98, 0.95), shape='RECTANGLE', sy=7)\nLIGHTS.append(L_window)\nLIGHT_E = [l.data.energy for l in LIGHTS]"),
# the ending: the kitchen dissolves into the page's cream. Every surface but the ribbon fades to
# transparent, so the camera sees the cream world; lights and reflections stay on for the ribbon
("""for f in range(N):
    dim = ease_io(smooth(f, F_DIM0, F_DIM1))
    RIB_STR.default_value = lerp(RIB_E0, RIB_E1, ease_io(smooth(f, F_OPEN0, F_OPEN1))); RIB_STR.keyframe_insert('default_value', frame=f)
    ENV_STR.default_value = lerp(ENV_E0, 0.0, dim); ENV_STR.keyframe_insert('default_value', frame=f)
    for L, e0 in zip(LIGHTS, LIGHT_E):
        L.data.energy = lerp(e0, 0.0, dim); L.data.keyframe_insert('energy', frame=f)
    for sb, s0 in BULBS:
        sb.default_value = lerp(s0, 0.0, dim); sb.keyframe_insert('default_value', frame=f)""",
"""for f in range(N):
    RIB_STR.default_value = lerp(RIB_E0, RIB_E1, ease_io(smooth(f, F_OPEN0, F_OPEN1))); RIB_STR.keyframe_insert('default_value', frame=f)
# the kitchen stays whole in the render; the ending dissolves it into the cream afterwards (end.py),
# with the line laid back over it from a second pass that renders the ribbon alone: --ribbon-only
# makes every other surface a holdout, so the ribbon comes out on a clear, clean alpha
RIBBON_ONLY = bool(arg('--ribbon-only'))
if RIBBON_ONLY:
    for ob_ in scene.objects:
        if ob_.type in ('MESH', 'CURVE') and not ob_.name.startswith('rib'):
            ob_.is_holdout = True"""),
]
for a, b in R:
    assert a in s, 'MISSING: ' + a[:70]
    s = s.replace(a, b, 1)
io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('patched', len(R))

# ---- second round (2026-10-05): contrast for the chrome, and a transparent camera background ----
s = io.open(p, encoding='utf-8').read()
R2 = [
("scene.render.film_transparent = False", "scene.render.film_transparent = True   # by day the camera's background is laid on the page's cream afterwards (cream.py)"),
("scene.render.image_settings.color_mode = 'RGB'", "scene.render.image_settings.color_mode = 'RGBA'"),
("float(arg('--wall', 3500))", "float(arg('--wall', 2600))"),
("L_fill = area('fill', at(-9, 2.5, 2.0), (0, 0, 0.6), 6, 900, (0.96, 0.97, 1.0))", "L_fill = area('fill', at(-9, 2.5, 2.0), (0, 0, 0.6), 6, 300, (0.96, 0.97, 1.0))"),
("6.5, 700, (1.0, 0.97, 0.92), shape='RECTANGLE', sy=1.0)", "6.5, 450, (1.0, 0.97, 0.92), shape='RECTANGLE', sy=1.0)"),
("float(arg('--key', 2600))", "float(arg('--key', 3200))"),
("float(arg('--window', 7000))", "float(arg('--window', 6000))"),
("TUNG = (1.0, 0.95, 0.88)",
 "# dark cards beside and behind the camera, seen only in reflections, so the chrome has dark bands\n# to draw it (a product shot's black flags); by night the dark room did that\nm_neg = new_mat('neg', base=(0.015, 0.015, 0.016), rough=0.9)\ndef neg_card(name, sx, sy, loc, look):\n    bm_ = bmesh.new(); bmesh.ops.create_grid(bm_, x_segments=1, y_segments=1, size=0.5)\n    bmesh.ops.scale(bm_, vec=(sx, sy, 1), verts=bm_.verts)\n    me_ = bpy.data.meshes.new(name); bm_.to_mesh(me_); bm_.free()\n    ob_ = link(bpy.data.objects.new(name, me_)); ob_.location = loc\n    ob_.rotation_euler = (Vector(look) - Vector(loc)).to_track_quat('Z', 'Y').to_euler()\n    me_.materials.append(m_neg)\n    ob_.visible_camera = False; ob_.visible_diffuse = False; ob_.visible_shadow = False; ob_.visible_transmission = False\nneg_card('neg_l', 7, 4.5, at(-6.5, -7.5, 2.4), (0, 0, 0.8))\nneg_card('neg_r', 6, 3.5, at(-5.0, 7.0, 1.8), (0, 0, 0.8))\nTUNG = (1.0, 0.95, 0.88)"),
]
for a, b in R2:
    assert a in s, 'MISSING2: ' + a[:70]
    s = s.replace(a, b, 1)
io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('patched round 2', len(R2))

# ---- third round: a vivid ribbon, and the ribbon-only pass's own folder ----
s = io.open(p, encoding='utf-8').read()
R3 = [
("lit = nt.nodes.new('ShaderNodeHueSaturation'); lit.inputs['Saturation'].default_value = 1.15",
 "lit = nt.nodes.new('ShaderNodeHueSaturation'); lit.inputs['Saturation'].default_value = float(arg('--rsat', 1.7))"),
("float(arg('--ribe', 4.5)), float(arg('--ribe1', 5.0))", "float(arg('--ribe', 2.0)), float(arg('--ribe1', 1.4))"),
("float(arg('--trans', 0.3))", "float(arg('--trans', 0.15))"),
("    EXR = 'render/exr-phone' if PHONE else 'render/exr'",
 "    EXR = ('render/exr-rib' if RIBBON_ONLY else 'render/exr') + ('-phone' if PHONE else '')"),
]
for a, b in R3:
    assert a in s, 'MISSING3: ' + a[:70]
    s = s.replace(a, b, 1)
io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('patched round 3', len(R3))
