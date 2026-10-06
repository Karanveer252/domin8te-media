# The v3 cursor: a growth chart's rising line in the brand spectrum, ending in a solid arrowhead whose
# tip is the click point (top left, like any pointer). Drawn on a 64 grid, shown at 32px.
#   python make.py   -> cursor.svg, cursor.uri (the CSS url) and the hotspot
import math, urllib.parse
pts = [(57, 55), (40, 37), (29, 45), (13, 21)]          # the line, right to left, rising
tip = (5, 9)                                            # the arrowhead's point (the hotspot)
# the head: along the last leg, its base 15 back from the tip, 8.5 either side
lx, ly = pts[-1][0] - pts[-2][0], pts[-1][1] - pts[-2][1]; L = math.hypot(lx, ly); ux, uy = lx / L, ly / L
bx, by = tip[0] - ux * 17, tip[1] - uy * 17; nx, ny = -uy, ux
head = [tip, (bx + nx * 9, by + ny * 9), (bx - nx * 9, by - ny * 9)]
end = (bx + ux * 2, by + uy * 2)                        # the line runs into the head
line = 'M' + ' '.join('%.1f %.1f' % p for p in pts[:-1] + [end])
H = 'M' + ' '.join('%.1f %.1f' % p for p in head) + 'Z'
svg = f"""<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 64 64'>
<defs>
<linearGradient id='g' gradientUnits='userSpaceOnUse' x1='57' y1='55' x2='5' y2='9'><stop offset='0' stop-color='#FF5A3C'/><stop offset='.3' stop-color='#FFB13B'/><stop offset='.55' stop-color='#3FC36A'/><stop offset='.78' stop-color='#1AA7E0'/><stop offset='1' stop-color='#8A4DFF'/></linearGradient>
<filter id='s' x='-20%' y='-20%' width='140%' height='140%'><feGaussianBlur stdDeviation='1.6'/></filter>
</defs>
<g stroke-linecap='round' stroke-linejoin='round'>
<g transform='translate(1.2 2.4)' opacity='.32' filter='url(#s)'><path d='{line}' fill='none' stroke='#0E1420' stroke-width='9'/><path d='{H}' fill='#0E1420' stroke='#0E1420' stroke-width='5'/></g>
<path d='{line}' fill='none' stroke='#fff' stroke-width='10.5'/><path d='{H}' fill='#fff' stroke='#fff' stroke-width='6.5'/>
<path d='{line}' fill='none' stroke='#0E1420' stroke-width='7'/><path d='{H}' fill='#0E1420' stroke='#0E1420' stroke-width='3'/>
<path d='{line}' fill='none' stroke='url(#g)' stroke-width='4.4'/><path d='{H}' fill='url(#g)' stroke='url(#g)' stroke-width='.6'/>
<path d='{line}' fill='none' stroke='#fff' stroke-opacity='.45' stroke-width='1.2' transform='translate(-.5 -.9)'/>
</g></svg>"""
svg = ' '.join(svg.split())
open('cursor.svg', 'w').write(svg)
uri = 'data:image/svg+xml,' + urllib.parse.quote(svg, safe=" ='/:.,-()")
open('cursor.uri', 'w').write(uri)
print('hotspot', round(tip[0] / 2) + 0, round(tip[1] / 2), 'uri', len(uri))
