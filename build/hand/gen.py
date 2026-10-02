"""Generates the Domin8te hand line-art.

The hand is built in a canonical frame (wrist at origin, fingers pointing
up, thumb to the left = -x), then scaled, rotated and placed in the 600x420
viewBox so that a chosen anchor on the palm lands on the catch point.
Output: hand-test.html (3-state sheet), hand-zoom.html (2x), hand.svg.html
(the replacement <svg> markup).
"""
import math, sys

CATCH = (350.0, 206.0)

# ---------- vector helpers (SVG y-down coordinates) ----------
def dir_(a):            # unit vector for an angle in degrees, 0 = up, + = clockwise on screen
    r = math.radians(a); return (math.sin(r), -math.cos(r))
def perp(u):            # screen-right normal of an upward vector
    return (-u[1], u[0])
def add(a, b): return (a[0]+b[0], a[1]+b[1])
def sub(a, b): return (a[0]-b[0], a[1]-b[1])
def mul(a, k): return (a[0]*k, a[1]*k)
def mid(a, b): return ((a[0]+b[0])/2, (a[1]+b[1])/2)
def lerp(a, b, t): return (a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t)
def norm(a):
    l = math.hypot(*a); return (a[0]/l, a[1]/l) if l else (0, 0)
def rot(p, a):
    r = math.radians(a); c, s = math.cos(r), math.sin(r)
    return (p[0]*c - p[1]*s, p[0]*s + p[1]*c)

def split_cubic(p0, p1, p2, p3, t):
    a, b, c = lerp(p0, p1, t), lerp(p1, p2, t), lerp(p2, p3, t)
    d, e = lerp(a, b, t), lerp(b, c, t)
    f = lerp(d, e, t)
    return (p0, a, d, f), (f, e, c, p3)

def cubic_pt(p0, p1, p2, p3, t):
    a, b, c = lerp(p0, p1, t), lerp(p1, p2, t), lerp(p2, p3, t)
    return lerp(lerp(a, b, t), lerp(b, c, t), t)

# ---------- finger geometry ----------
class Finger:
    def __init__(self, base, angle, L, wb, wt, curl, h=0.36, k=0.62):
        self.B, self.angle, self.L, self.wb, self.wt, self.curl = base, angle, L, wb, wt, curl
        self.u0 = dir_(angle); self.u1 = dir_(angle + curl)
        self.n0 = perp(self.u0); self.n1 = perp(self.u1)
        um = dir_(angle + curl/2)
        self.T = add(base, mul(um, L))                 # tip centre
        self.TL = sub(self.T, mul(self.n1, wt/2))      # tip corners
        self.TR = add(self.T, mul(self.n1, wt/2))
        self.cL = sub(base, mul(self.n0, wb/2))        # base corners
        self.cR = add(base, mul(self.n0, wb/2))
        self.h = L*h; self.k = wt*k
    def side_up(self, S):        # S (near the base, right side) up to TR
        return [('C', add(S, mul(self.u0, self.h)), sub(self.TR, mul(self.u1, self.h)), self.TR)]
    def tip(self):               # TR -> TL over the fingertip
        return [('C', add(self.TR, mul(self.u1, self.k)), add(self.TL, mul(self.u1, self.k)), self.TL)]
    def side_down(self, S):      # TL down to S (left side)
        return [('C', sub(self.TL, mul(self.u1, self.h)), add(S, mul(self.u0, self.h)), S)]

def web(fa, fb, depth, gap):
    u = dir_((fa.angle + fb.angle)/2); n = perp(u)
    base = sub(mid(fa.cR, fb.cL), mul(u, depth))
    Wa = sub(base, mul(n, gap/2)); Wb = add(base, mul(n, gap/2))
    kk = gap*0.7
    return Wa, Wb, [('C', sub(Wa, mul(u, kk)), sub(Wb, mul(u, kk)), Wb)]

# ---------- the hand ----------
def build(P):
    F = []
    for name in ['index', 'middle', 'ring', 'pinky']:
        f = P['fingers'][name]
        F.append(Finger(f['base'], f['angle'], f['L'], f['wb'], f['wt'], f['curl'], P.get('side_h', .36), P.get('tip_k', .62)))
    idx, midf, ring, pink = F
    t = P['thumb']
    TH = Finger(t['base'], t['angle'], t['L'], t['wb'], t['wt'], t['curl'], P.get('thumb_h', .36), P.get('tip_k', .62))

    W1a, W1b, W1 = web(idx, midf, P['web_depth'], P['web_gap'])
    W2a, W2b, W2 = web(midf, ring, P['web_depth'], P['web_gap'])
    W3a, W3b, W3 = web(ring, pink, P['web_depth'], P['web_gap'])

    # forearm frame: f points away from the wrist, nf to the pinky (+x) side
    f = dir_(180 - P['forearm_bend']); nf = mul(perp(f), -1)
    ww = P['wrist_w']/2
    WR = mul(nf, ww); WL = mul(nf, -ww)
    Lf = P['forearm_len']
    ER = add(add(WR, mul(f, Lf)), mul(nf, P['forearm_flare']))
    EL = sub(add(WL, mul(f, Lf)), mul(nf, P['forearm_flare']))

    Wt = add(add(TH.B, mul(TH.n0, TH.wb/2)), mul(TH.u0, P['thumb_webout']))
    TBo = TH.cL

    dh = math.hypot(*sub(WR, pink.cR)); dt = math.hypot(*sub(WL, TBo)); dw = math.hypot(*sub(Wt, idx.cL))
    hyp = ('C', add(pink.cR, mul(dir_(180 - P['hyp_out']), dh*P['hyp_h1'])), sub(WR, mul(f, dh*P['hyp_h2'])), WR)
    tweb = ('C', sub(idx.cL, mul(idx.u0, dw*P['tweb_h1'])), sub(Wt, mul(TH.u0, dw*P['tweb_h2'])), Wt)
    # thenar: continue the thumb's outer edge (-u0), swung `then_out` degrees toward the wrist, into the forearm tangent
    then = ('C', add(TBo, mul(dir_(t['angle'] + 180 + P['then_out']), dt*P['then_h1'])), sub(WL, mul(f, dt*P['then_h2'])), WL)

    ov = P['overlap_t']
    hyp_first, hyp_rest = split_cubic(pink.cR, hyp[1], hyp[2], hyp[3], ov)
    tweb_first, tweb_rest = split_cubic(idx.cL, tweb[1], tweb[2], tweb[3], ov)

    # fingers: hyp split point -> over four fingers -> tweb split point (fill closes across the palm)
    fing = [('M', pink.cR)] if ov == 0 else [('M', hyp_first[3]), ('C', hyp_first[2], hyp_first[1], hyp_first[0])]
    fing += pink.side_up(pink.cR) + pink.tip() + pink.side_down(W3b)
    fing += [('C', W3[0][2], W3[0][1], W3a)]
    fing += ring.side_up(W3a) + ring.tip() + ring.side_down(W2b)
    fing += [('C', W2[0][2], W2[0][1], W2a)]
    fing += midf.side_up(W2a) + midf.tip() + midf.side_down(W1b)
    fing += [('C', W1[0][2], W1[0][1], W1a)]
    fing += idx.side_up(W1a) + idx.tip() + idx.side_down(idx.cL)
    if ov: fing += [('C', tweb_first[1], tweb_first[2], tweb_first[3])]

    body1 = [('M', ER), ('L', WR), ('C', hyp_rest[2], hyp_rest[1], hyp_rest[0])]
    body2 = [('M', tweb_first[3]), ('C', tweb_rest[1], tweb_rest[2], tweb_rest[3])]
    body2 += TH.side_up(Wt) + TH.tip() + TH.side_down(TBo)
    body2 += [then, ('L', EL)]

    # occluder polygon for the body (ground-coloured, inset 1 unit, no stroke)
    def samples(segs, start, n=7):
        pts, cur = [], start
        for s in segs:
            if s[0] == 'L':
                for i in range(1, n+1):
                    t_ = i/n; p = lerp(cur, s[1], t_); tg = norm(sub(s[1], cur))
                    pts.append(sub(p, mul(perp(tg), -1.0)))   # interior is screen-left of travel
                cur = s[1]
            elif s[0] == 'C':
                for i in range(1, n+1):
                    t_ = i/n; p = cubic_pt(cur, s[1], s[2], s[3], t_)
                    tg = norm(sub(cubic_pt(cur, s[1], s[2], s[3], min(1, t_+.01)), cubic_pt(cur, s[1], s[2], s[3], t_-.01)))
                    pts.append(sub(p, mul(perp(tg), -1.0)))
                cur = s[3]
        return pts
    occ = [ER] + samples(body1[1:], ER) + [pink.cR, idx.cL] + samples(body2[1:], tweb_first[3])

    rim = []
    for fg, S in ((pink, W3b), (ring, W2b), (midf, W1b), (idx, idx.cL)):
        rim += [('M', fg.TL)] + fg.side_down(S)
    rim_thumb = [('M', Wt)] + TH.side_up(Wt)

    knuckle_mid = mid(mid(idx.B, midf.B), mid(ring.B, pink.B))
    # anchor: in the ring/pinky gap, `anchor_along` units out from the web
    u34 = dir_((ring.angle + pink.angle)/2 + ring.curl*.3)
    anchor = add(mid(W3a, W3b), mul(u34, P.get('anchor_along', 30)))
    outlines = {}
    for name, fg, S in (('index', idx, idx.cL), ('middle', midf, W1b), ('ring', ring, W2b), ('pinky', pink, W3b)):
        outlines[name] = [('M', S)] + fg.side_up(S if name == 'pinky' else {'index': W1a, 'middle': W2a, 'ring': W3a}[name]) + fg.tip() + fg.side_down(S)
    outlines['pinky'] = [('M', pink.cR)] + pink.side_up(pink.cR) + pink.tip() + pink.side_down(W3b)
    outlines['thumb'] = [('M', Wt)] + TH.side_up(Wt) + TH.tip() + TH.side_down(TBo)
    return dict(fingers=fing, body1=body1, body2=body2, occ=occ, rim=rim, rim_thumb=rim_thumb,
                knuckle=knuckle_mid, anchor=anchor, F=F, TH=TH, Wt=Wt, outlines=outlines)

# ---------- placement ----------
def xf(P, p):
    return add(rot(mul(p, P.get('scale', 1)), P['rot']), P['pos'])

def solve_pos(P, geo):
    """Set P['pos'] so the anchor lands on CATCH + anchor_off."""
    P['pos'] = (0, 0)
    a = xf(P, geo['anchor'])
    off = P.get('anchor_off', (0, 0))
    P['pos'] = (CATCH[0] + off[0] - a[0], CATCH[1] + off[1] - a[1])

def place(P, segs):
    return [(s[0],) + tuple(xf(P, p) for p in s[1:]) for s in segs]

def fmt(p): return f"{p[0]:.1f} {p[1]:.1f}"
def to_d(segs):
    parts = []
    for s in segs:
        if s[0] == 'M': parts.append('M' + fmt(s[1]))
        elif s[0] == 'L': parts.append('L' + fmt(s[1]))
        elif s[0] == 'C': parts.append('C' + fmt(s[1]) + ' ' + fmt(s[2]) + ' ' + fmt(s[3]))
    return ' '.join(parts)

def trim_forearm(segs, xmax=600.0):
    out = list(segs)
    if out[0][0] == 'M' and out[1][0] == 'L':
        ER, WR = out[0][1], out[1][1]
        if ER[0] > xmax:
            t = (xmax - WR[0]) / (ER[0] - WR[0]); out[0] = ('M', lerp(WR, ER, t))
    if out[-1][0] == 'L':
        EL, WL = out[-1][1], out[-2][3]
        if EL[0] > xmax:
            t = (xmax - WL[0]) / (EL[0] - WL[0]); out[-1] = ('L', lerp(WL, EL, t))
    return out

def occ_d(P, pts, xmax=606.0):
    q = [xf(P, p) for p in pts]
    q = [(min(x, xmax), y) for x, y in q]
    return 'M' + 'L'.join(f"{x:.0f} {y:.0f}" for x, y in q) + 'Z'

def svg_markup(P, geo, sw=2.2, rim_w=2.4, thumb_rim=True):
    fing = to_d(place(P, geo['fingers']))
    b1 = to_d(trim_forearm(place(P, geo['body1'])))
    b2 = to_d(trim_forearm(place(P, geo['body2'])))
    occ = occ_d(P, geo['occ'])
    rim = to_d(place(P, geo['rim']))
    rimt = to_d(place(P, geo['rim_thumb']))
    lx, ly = P.get('light', (372, 214)); lrx, lry = P.get('light_r', (150, 100))
    thumb_rim_markup = f'\n          <g class="hand__rim" stroke="url(#infg)" stroke-width="{rim_w}" stroke-linecap="round"><path d="{rimt}"/></g>' if thumb_rim else ''
    return f'''<svg class="hand" id="hand" viewBox="0 0 600 420" aria-hidden="true" focusable="false">
        <defs>
          <radialGradient id="palmg" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#FFEBCF" stop-opacity=".42"/>
            <stop offset="100%" stop-color="#FFEBCF" stop-opacity="0"/>
          </radialGradient>
        </defs>
        <!-- line art: one continuous contour drawn as three open strokes that meet
             end-to-end where the fingers hinge. hand__fill = ground-coloured
             occluders so the line goes into the hand, as before. -->
        <g class="hand__body" fill="none" stroke-linejoin="round">
          <path class="hand__fill" d="{occ}"/>
          <g class="hand__edge" stroke-width="{sw}">
            <path d="{b1}"/>
            <path d="{b2}"/>
          </g>{thumb_rim_markup}
        </g>
        <g class="hand__fingers" fill="none" stroke-linejoin="round">
          <use class="hand__fill" href="#hand-f"/>
          <g class="hand__edge" stroke-width="{sw}">
            <path id="hand-f" d="{fing}"/>
          </g>
          <g class="hand__rim" stroke="url(#infg)" stroke-width="{rim_w}" stroke-linecap="round">
            <path d="{rim}"/>
          </g>
        </g>
        <ellipse class="hand__light" cx="{lx}" cy="{ly}" rx="{lrx}" ry="{lry}" fill="url(#palmg)"/>
        <g class="hand__fx" fill="none">
          <circle class="hand__ring hand__ring--catch" cx="350" cy="206" r="40" stroke="#FFF2DC" stroke-width="5"/>
          <circle class="hand__ring hand__ring--catch two" cx="350" cy="206" r="40" stroke="#FFC98A" stroke-width="3"/>
          <circle class="hand__ring hand__ring--launch" cx="350" cy="206" r="34" stroke="#FFF2DC" stroke-width="4.5"/>
          <circle class="hand__ring hand__ring--launch two" cx="350" cy="206" r="34" stroke="#C58BF0" stroke-width="2.8"/>
        </g>
      </svg>''', xf(P, geo['knuckle'])

# ---------- designs ----------
def design_G():
    return dict(
        fingers=dict(
            index=dict(base=(-40, -108), angle=-5, L=86, wb=26, wt=19, curl=-7),
            middle=dict(base=(-13, -113), angle=-1, L=95, wb=27, wt=20, curl=-7),
            ring=dict(base=(14, -110), angle=3, L=89, wb=26, wt=19, curl=-7),
            pinky=dict(base=(40, -100), angle=8, L=72, wb=23, wt=16, curl=-7),
        ),
        thumb=dict(base=(-50, -58), angle=-60, L=76, wb=27, wt=21, curl=12),
        web_gap=2.5, web_depth=8, thumb_webout=14,
        forearm_bend=6, wrist_w=66, forearm_len=260, forearm_flare=8,
        hyp_out=6, hyp_h1=.42, hyp_h2=.42,
        then_out=8, then_h1=.45, then_h2=.45,
        tweb_h1=.5, tweb_h2=.5,
        overlap_t=0.3, anchor_along=30, anchor_off=(0, 0),
        scale=1.2, rot=-58, pos=(0, 0),
    )

def design_H():
    P = design_G()
    P['fingers'] = dict(
        index=dict(base=(-40, -108), angle=-5, L=81, wb=27, wt=19.5, curl=-7),
        middle=dict(base=(-13, -113), angle=-1, L=89, wb=28, wt=20.5, curl=-7),
        ring=dict(base=(14, -110), angle=3, L=84, wb=27, wt=19.5, curl=-7),
        pinky=dict(base=(40, -100), angle=8, L=66, wb=24, wt=16.5, curl=-7),
    )
    P['thumb'] = dict(base=(-51, -62), angle=-54, L=80, wb=26, wt=19.5, curl=14)
    P.update(thumb_webout=14, then_out=24, then_h1=.5, then_h2=.42,
             forearm_bend=14, wrist_w=64, forearm_flare=8,
             hyp_out=5, hyp_h1=.4, hyp_h2=.4,
             overlap_t=0, anchor_along=34, scale=1.12, rot=-63)
    return P

DESIGNS = {'G': design_G, 'H': design_H}

# ---------- crossing checks ----------
RAY = [(350.0, 206.0), (618.0, 56.0), (900.0, -102.0)]
def bolt_pts(n=40):
    pts = []
    for (p0, p1, p2, p3) in (((-271, 831), (-271, 831), (18, 388), (232, 257)), ((232, 257), (286, 225), (318, 212), (350, 206))):
        for i in range(n+1):
            pts.append(cubic_pt(p0, p1, p2, p3, i/n))
    return pts

def seg_x(a, b, c, d):
    def cr(o, p, q): return (p[0]-o[0])*(q[1]-o[1]) - (p[1]-o[1])*(q[0]-o[0])
    d1, d2, d3, d4 = cr(c, d, a), cr(c, d, b), cr(a, b, c), cr(a, b, d)
    return (d1*d2 < 0) and (d3*d4 < 0)

def poly_cross(A, B):
    n = 0
    for i in range(len(A)-1):
        for j in range(len(B)-1):
            if seg_x(A[i], A[i+1], B[j], B[j+1]): n += 1
    return n

def outline_pts(P, segs, n=12):
    pts, cur = [], None
    for s in segs:
        if s[0] == 'M': cur = xf(P, s[1]); pts.append(cur)
        elif s[0] == 'C':
            c1, c2, p3 = xf(P, s[1]), xf(P, s[2]), xf(P, s[3])
            for i in range(1, n+1): pts.append(cubic_pt(cur, c1, c2, p3, i/n))
            cur = p3
    return pts

def crossings(P, geo):
    bolt = bolt_pts(); out = []
    for name, segs in geo['outlines'].items():
        pts = outline_pts(P, segs)
        out.append(f"{name}: bolt x{poly_cross(bolt, pts)} ray x{poly_cross(RAY, pts)}")
    occ = [xf(P, p) for p in geo['occ']]
    out.append(f"palm/arm: ray x{poly_cross(RAY, occ + [occ[0]])}")
    return '  '.join(out)

# ---------- diagnostics ----------
def diag(P, geo):
    A, T = P['rot'], P['pos']
    c = mul(rot(sub(CATCH, T), -A), 1/P.get('scale', 1))
    lines = [f"pos={T[0]:.0f},{T[1]:.0f}"]
    for name, fg in zip(['index', 'middle', 'ring', 'pinky', 'thumb'], geo['F'] + [geo['TH']]):
        d = sub(c, fg.B)
        along = d[0]*fg.u0[0] + d[1]*fg.u0[1]
        across = d[0]*fg.n0[0] + d[1]*fg.n0[1]
        lines.append(f"{name}: catch along={along:.0f}/{fg.L} across={across:+.0f} (half-width {fg.wb/2:.0f})")
    kx, ky = xf(P, geo['knuckle'])
    lines.append(f"knuckle mid -> ({kx:.0f},{ky:.0f})")
    b1 = trim_forearm(place(P, geo['body1'])); b2 = trim_forearm(place(P, geo['body2']))
    lines.append(f"forearm edges end at ({b1[0][1][0]:.0f},{b1[0][1][1]:.0f}) and ({b2[-1][1][0]:.0f},{b2[-1][1][1]:.0f}); wrist ({xf(P,(0,0))[0]:.0f},{xf(P,(0,0))[1]:.0f})")
    for name, pt in (('middle tip', geo['F'][1].T), ('pinky tip', geo['F'][3].T), ('pinky base', geo['F'][3].B),
                     ('index tip', geo['F'][0].T), ('thumb tip', geo['TH'].T), ('thumb web', geo['Wt'])):
        x, y = xf(P, pt); lines.append(f"{name} -> ({x:.0f},{y:.0f})")
    return '\n'.join(lines)

CSS = """
body{margin:0;background:#000;color:#888;font:12px/1.4 system-ui,sans-serif;--bg:#000}
.row{display:flex;gap:0;align-items:flex-start}
.cell{width:600px;padding:8px 8px 0;box-sizing:border-box;position:relative}
.cell small{position:absolute;left:14px;top:6px;color:#666;letter-spacing:.06em;text-transform:uppercase;font-size:10px}
.hand{width:100%;aspect-ratio:600/420;overflow:visible;display:block;position:relative;z-index:2}
.hand__edge{stroke:rgba(255,255,255,.34)}
.hand__fill{fill:var(--bg)}
.hand__fingers{transform-origin:var(--ox) var(--oy);transform:rotate(calc(var(--grip,0) * 3.2deg)) scale(calc(1 - .015 * var(--grip,0)))}
.hand__ring{opacity:0;transform-origin:350px 206px}
.hand__ring--catch{transform:scale(calc(1 + 9 * var(--cshk,0)));stroke-width:calc(5px / (1 + 7 * var(--cshk,0)));opacity:calc(var(--cbrk,0) * .45)}
.hand__ring--catch.two{transform:scale(calc(1 + 14 * var(--cshk,0)));stroke-width:calc(3px / (1 + 10 * var(--cshk,0)));opacity:calc(var(--cbrk,0) * .26)}
.hand__ring--launch{transform:scale(calc(1 + 11 * var(--lshk,0)));stroke-width:calc(4.5px / (1 + 8 * var(--lshk,0)));opacity:calc(var(--lbrk,0) * .45)}
.hand__ring--launch.two{transform:scale(calc(1 + 17 * var(--lshk,0)));stroke-width:calc(2.8px / (1 + 11 * var(--lshk,0)));opacity:calc(var(--lbrk,0) * .26)}
.hand__light{opacity:var(--hl,0)}
.hand__rim{opacity:var(--hl,0)}
.guide{position:absolute;inset:8px 8px 0;width:calc(100% - 16px);pointer-events:none;z-index:1}
"""

DEFS = """<svg width="0" height="0" aria-hidden="true" style="position:absolute">
  <defs>
    <linearGradient id="infg" x1="4%" y1="0%" x2="96%" y2="100%">
      <stop offset="0%" stop-color="#E5322B"/><stop offset="13%" stop-color="#F2912F"/>
      <stop offset="26%" stop-color="#F3CB3C"/><stop offset="40%" stop-color="#5CB246"/>
      <stop offset="55%" stop-color="#0FA3C2"/><stop offset="70%" stop-color="#2E5FA8"/>
      <stop offset="85%" stop-color="#7A3E97"/><stop offset="100%" stop-color="#D51C73"/>
    </linearGradient>
  </defs>
</svg>"""

# the bolt's real approach and exit, converted from world units to the hand's viewBox
LINE = """<svg class="guide" viewBox="0 0 600 420">
  <path d="M-271 831 C-271 831 18 388 232 257 C286 225 318 212 350 206" fill="none" stroke="url(#infg)" stroke-width="16" stroke-linecap="round" opacity=".18"/>
  <path d="M-271 831 C-271 831 18 388 232 257 C286 225 318 212 350 206" fill="none" stroke="url(#infg)" stroke-width="5" stroke-linecap="round"/>
  <path d="M350 206 C618 56 853 -126 1068 -247" fill="none" stroke="#C58BF0" stroke-width="3" stroke-linecap="round" opacity=".35" stroke-dasharray="6 8"/>
  <circle cx="350" cy="206" r="3.5" fill="#fff"/>
</svg>"""

def cell(label, markup, origin, state, line=False):
    st = {'unlit': '--hl:0;--grip:0', 'lit': '--hl:1;--grip:1;--cshk:.4;--cbrk:.7', 'held': '--hl:1;--grip:1'}[state]
    m = markup.replace('<svg class="hand" id="hand"', f'<svg class="hand" style="{st};--ox:{origin[0]:.0f}px;--oy:{origin[1]:.0f}px"')
    return f'<div class="cell"><small>{label}</small>{LINE if line else ""}{m}</div>'

def sheet(panels, path, cellw=600):
    rows = ''.join(f'<div class="row">{"".join(r)}</div>' for r in panels)
    css = CSS.replace('.cell{width:600px', f'.cell{{width:{cellw}px')
    html = f'<!doctype html><meta charset="utf-8"><title>hand test</title><style>{css}</style>{DEFS}{rows}'
    open(path, 'w', encoding='utf-8').write(html)

if __name__ == '__main__':
    key = sys.argv[1] if len(sys.argv) > 1 else 'G'
    root = 'C:/Work/domin8te-build/hand/'
    if key == 'sweep':
        # try rotations and anchor distances, print crossings only
        for rotv in (-52, -56, -60, -64):
            for along in (22, 30, 38):
                P = DESIGNS['G'](); P['rot'] = rotv; P['anchor_along'] = along
                geo = build(P); solve_pos(P, geo)
                wr = xf(P, (0, 0))
                print(f"rot {rotv} along {along}: wrist=({wr[0]:.0f},{wr[1]:.0f}) | {crossings(P, geo)}")
        sys.exit()
    P = DESIGNS[key]()
    geo = build(P)
    solve_pos(P, geo)
    m, o = svg_markup(P, geo)
    print(key, diag(P, geo))
    print(crossings(P, geo))
    row = [cell(f'{key} unlit', m, o, 'unlit'), cell(f'{key} lit + grip + shock', m, o, 'lit'),
           cell(f'{key} lit + held line', m, o, 'held', line=True)]
    sheet([row], root + 'hand-test.html')
    sheet([[cell(f'{key} unlit 2x + line', m, o, 'unlit', line=True)]], root + 'hand-zoom.html', cellw=1200)
    open(root + 'hand.svg.html', 'w', encoding='utf-8').write(m + '\n')
    print('origin', f'{o[0]:.0f}px {o[1]:.0f}px', 'bytes', len(m))
