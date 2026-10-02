# -*- coding: utf-8 -*-
"""The template edits for the phone film, applied once (each is asserted, so
a second run fails loudly instead of doubling anything)."""
import io

p = 'C:/Work/domin8te-build/copy/index.tpl.html'
t = io.open(p, encoding='utf-8').read()
n0 = len(t)

# 1. the head gate: decide the phone film before first paint
old = """  try {
    var story = window.__GATES.some(function (q) { return matchMedia(q).matches });
    r.classList.add(story ? 'story' : 'film');
  } catch (e) { r.classList.add('story') }

  /* the film only makes sense if the script arrives to drive it */
  function check() {
    if (r.classList.contains('ready')) return;
    r.classList.remove('js', 'film');
    r.classList.add('story');
  }"""
new = """  /* the phone film (site.js, THE PHONE FILM AND ITS LINE): the story layout
     plus a scroll-driven cloche behind the hero and a line down the left
     edge. Decided here, before first paint, so the pinned hero's height
     exists from the start and nothing jumps when the script arrives. The
     primary input has to be a finger (a desktop window merely narrowed
     keeps the plain story), motion must not be reduced, and the layout
     needs sticky and clip, which the browsers without WebCodecs also lack. */
  window.__PHONE = '(hover: none) and (pointer: coarse) and (max-width: 1024px) and (prefers-reduced-motion: no-preference)';
  try {
    var story = window.__GATES.some(function (q) { return matchMedia(q).matches });
    r.classList.add(story ? 'story' : 'film');
    var c = navigator.connection, thin = !!(c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || '')));
    if (story && !thin && matchMedia(window.__PHONE).matches &&
        window.CSS && CSS.supports && CSS.supports('position', 'sticky') && CSS.supports('overflow-x', 'clip')) {
      r.classList.add('pfilm');
    }
  } catch (e) { r.classList.add('story') }

  /* the film only makes sense if the script arrives to drive it */
  function check() {
    if (r.classList.contains('ready')) return;
    r.classList.remove('js', 'film', 'pfilm');
    r.classList.add('story');
  }"""
assert old in t; t = t.replace(old, new)

# 2. the hero: a static box round the video and the canvas (on the desktop it
#    is unpositioned, so both still resolve against .hero__frame exactly as
#    today), plus the phone's two stills and the birth curl's svg
old = """    <div class="hero__frame" id="heroFrame">
      <video class="hero__video" id="heroVideo" muted playsinline preload="none"
             tabindex="-1" disablepictureinpicture></video>
      <canvas class="hero__film" id="heroFilm" aria-hidden="true"></canvas>
    </div>"""
new = """    <div class="hero__frame" id="heroFrame">
      <!-- .hero__box is a plain block on the desktop (unpositioned, so the
           video and the canvas keep resolving against .hero__frame as they
           always have). On the phone it is the picture: sized to the phone
           encode's aspect, placed and scaled by site.js. The two stills are
           the phone's blurred backdrop (over the film until the words have
           left) and the held mark (in case the film has not arrived). -->
      <div class="hero__box" id="heroBox">
        <video class="hero__video" id="heroVideo" muted playsinline preload="none"
               tabindex="-1" disablepictureinpicture></video>
        <canvas class="hero__film" id="heroFilm" aria-hidden="true"></canvas>
        <picture class="hero__blur"><source media="(hover: hover), (pointer: fine), (prefers-reduced-motion: reduce)" srcset="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=="><img id="heroBlur" src="assets/hero-blur-m.jpg?v=0000000000" width="360" height="416" alt="" decoding="async"></picture>
        <picture class="hero__mark"><source media="(hover: hover), (pointer: fine), (prefers-reduced-motion: reduce)" srcset="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=="><img id="heroMark" src="assets/hero-mark-m.jpg?v=0000000000" width="720" height="832" alt="" loading="lazy" decoding="async"></picture>
      </div>
      <!-- the line's birth: from the mark's left lobe to the left edge, drawn
           in the frame's own space so it stays with the pinned mark and then
           scrolls away with it (site.js sets the path and the colours) -->
      <svg class="snkc" id="snkc" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="snkGc" gradientUnits="userSpaceOnUse" spreadMethod="repeat" x1="0" y1="0" x2="0" y2="1000">
            <stop offset="0" stop-color="#E5322B"/><stop offset=".13" stop-color="#F2912F"/><stop offset=".26" stop-color="#F3CB3C"/><stop offset=".4" stop-color="#5CB246"/><stop offset=".55" stop-color="#0FA3C2"/><stop offset=".7" stop-color="#2E5FA8"/><stop offset=".85" stop-color="#7A3E97"/><stop offset="1" stop-color="#D51C73"/>
          </linearGradient>
          <linearGradient id="snkGlitc" gradientUnits="userSpaceOnUse" spreadMethod="repeat" x1="0" y1="0" x2="0" y2="1000">
            <stop offset="0" stop-color="#FF6A5E"/><stop offset=".13" stop-color="#FFAD52"/><stop offset=".26" stop-color="#FFDE55"/><stop offset=".4" stop-color="#86E070"/><stop offset=".55" stop-color="#3ED6ED"/><stop offset=".7" stop-color="#7AA6FF"/><stop offset=".85" stop-color="#C58BF0"/><stop offset="1" stop-color="#FF6FB4"/>
          </linearGradient>
          <path id="snkCurl" fill="none" d="M0 0"/>
        </defs>
        <g class="snk__g" id="snkCurlG">
          <use class="snk__case" href="#snkCurl"/>
          <use class="snk__glow" href="#snkCurl" stroke="url(#snkGlitc)"/>
          <use class="snk__body" href="#snkCurl" stroke="url(#snkGc)"/>
          <use class="snk__core" href="#snkCurl"/>
        </g>
      </svg>
    </div>"""
assert old in t; t = t.replace(old, new)

# 3. the still: never fetched by a phone that shows the film instead
old = """      <picture><source media="(orientation: landscape) and (min-width: 1025px) and (pointer: fine)" srcset="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=="><img class="still" src="assets/hero-still.jpg\""""
new = """      <picture><source media="(orientation: landscape) and (min-width: 1025px) and (pointer: fine)" srcset="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=="><source media="(hover: none) and (pointer: coarse) and (max-width: 1024px) and (prefers-reduced-motion: no-preference)" srcset="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=="><img class="still" src="assets/hero-still.jpg\""""
assert old in t; t = t.replace(old, new)

# 4. the page line: one svg over the whole film section, after the stage
old = """  <div class="charge" aria-hidden="true">"""
new = """  <!-- the phone's line (site.js, THE PHONE FILM AND ITS LINE): the thread
       that leaves the mark, runs down the left edge like a snake as the page
       is read, and draws the mark's loop at the end. Page space: the svg is
       the film section's full size and site.js writes the path, the loop and
       the gradient phase from measured positions. Hidden everywhere else. -->
  <svg class="snk" id="snk" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="snkG" gradientUnits="userSpaceOnUse" spreadMethod="repeat" x1="0" y1="0" x2="0" y2="1000">
        <stop offset="0" stop-color="#E5322B"/><stop offset=".13" stop-color="#F2912F"/><stop offset=".26" stop-color="#F3CB3C"/><stop offset=".4" stop-color="#5CB246"/><stop offset=".55" stop-color="#0FA3C2"/><stop offset=".7" stop-color="#2E5FA8"/><stop offset=".85" stop-color="#7A3E97"/><stop offset="1" stop-color="#D51C73"/>
      </linearGradient>
      <linearGradient id="snkGlit" gradientUnits="userSpaceOnUse" spreadMethod="repeat" x1="0" y1="0" x2="0" y2="1000">
        <stop offset="0" stop-color="#FF6A5E"/><stop offset=".13" stop-color="#FFAD52"/><stop offset=".26" stop-color="#FFDE55"/><stop offset=".4" stop-color="#86E070"/><stop offset=".55" stop-color="#3ED6ED"/><stop offset=".7" stop-color="#7AA6FF"/><stop offset=".85" stop-color="#C58BF0"/><stop offset="1" stop-color="#FF6FB4"/>
      </linearGradient>
      <path id="snkPath" fill="none" d="M0 0"/>
      <path id="snkLoop" fill="none" d="M0 0"/>
    </defs>
    <g class="snk__g snk__rail" id="snkRail">
      <use class="snk__case" href="#snkPath"/>
      <use class="snk__glow" href="#snkPath" stroke="url(#snkGlit)"/>
      <use class="snk__body" href="#snkPath" stroke="url(#snkG)"/>
      <use class="snk__core" href="#snkPath"/>
    </g>
    <g class="snk__g snk__loop" id="snkLoopG">
      <use class="snk__lglow" href="#snkLoop" stroke="url(#infg)"/>
      <use class="snk__lbody" href="#snkLoop" stroke="url(#snkG)"/>
      <use class="snk__lring" href="#snkLoop" stroke="url(#infg)"/>
    </g>
  </svg>
  <i class="snk__tip" id="snkTip" aria-hidden="true"></i>

  <div class="charge" aria-hidden="true">"""
assert old in t; t = t.replace(old, new)

io.open(p, 'w', encoding='utf-8', newline='\n').write(t)
print('template: %d -> %d chars' % (n0, len(t)))
