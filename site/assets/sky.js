/* ============================================================
   The sky: the two cloud beats of the film, rendered in Blender
   and scrubbed by the scroll like the chip film.

   One film of 192 frames. Frames 0 to 95 are the first beat,
   "Feel the growth.", where the owner's noise used to be; 96 to
   191 the second, "Taking your time? They're taking your
   customers.", after the pair. site.js calls window.__sky(p) on
   every drawn frame with the world progress, and this file owns
   the layer's opacity and which frame shows.

   The decoder is the chip film's: the whole file is held in
   memory, WebCodecs decodes one group of pictures at a time from
   those bytes, the frame is painted through WebGL, and the video
   element stays as the fallback. It is a second copy of that code
   on purpose: the hero's player is deployed and measured, and this
   one keeps a smaller cache and never touches it.
   ============================================================ */
(function () {
'use strict';

var root = document.documentElement;
var layer = document.getElementById('sky');
var canvas = document.getElementById('skyFilm');
var video = document.getElementById('skyVideo');
if (!layer || !canvas || !video) return;

/* content token, stamped by stamp.js: a new film is a new URL */
var URL_ = 'assets/sky-scrub.mp4?v=31dea216b0';
var FPS = 30;

/* each beat fades in over a..b and out over c..d of the world's progress,
   and scrubs its frames along the track between.

   c is where the clouds begin to leave, and it has to agree with where
   site.js parks the scroll. The QMAP now spends its longest hold on the
   stretch where the words stand fully formed, and with c at .44 the last
   third of that hold was spent fading the picture out instead of holding
   it: 155vh of the dwell was a dissolve. c now sits at the end of each
   hold (.452 and .953), so the headline stays at full strength for the
   whole of it and leaves only once the scroll moves on. */
var BEATS = [
  { a: .285, b: .31,  c: .452, d: .466, map: [[.29, 0],   [.33, 45],   [.375, 75],  [.455, 95]] },
  { a: .875, b: .895, c: .953, d: .965, map: [[.875, 96], [.905, 156], [.945, 186], [.955, 191]] }
];

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v }
function smooth(p, e0, e1) {
  var t = clamp((p - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}
function track(keys, p) {
  var last = keys.length - 1;
  if (p <= keys[0][0]) return keys[0][1];
  if (p >= keys[last][0]) return keys[last][1];
  for (var i = 1; i <= last; i++) {
    if (p <= keys[i][0]) {
      var a = keys[i - 1], b = keys[i];
      return a[1] + (b[1] - a[1]) * ((p - a[0]) / (b[0] - a[0]));
    }
  }
  return keys[last][1];
}

/* ---------- the layer ---------- */

var shownOp = -1, shownBeat = -1, loading = false, videoReady = false, failed = false;
var idleAt = null;

function setOp(op, beat) {
  var q = Math.round(op * 200) / 200;
  if (q !== shownOp) {
    shownOp = q;
    layer.style.opacity = q.toFixed(3);
    layer.classList.toggle('on', q > 0);
  }
  if (beat !== shownBeat && beat >= 0) {
    shownBeat = beat;
    layer.setAttribute('data-beat', beat === 0 ? 'a' : 'b');
  }
}

function hide() {
  setOp(0, -1);
  dropFrames();
}

/* called by site.js with the world progress p and the scroll progress P;
   p of -1 means the film is off. pf, when given, is the progress the FRAMES
   follow instead of p: a feel may run the film ahead of the world (the
   slingshot plays the words out by itself once the scroll has set it off),
   while the layer's fades stay with the world's own progress. */
var hero = document.getElementById('hero');
window.__sky = function (p, P, pf) {
  if (p < 0) { hide(); return }
  if (pf === undefined) pf = p;
  var op = 0, frame = -1, beat = -1;
  for (var i = 0; i < BEATS.length; i++) {
    var B = BEATS[i];
    var o = smooth(p, B.a, B.b) * (1 - smooth(p, B.c, B.d));
    if (o > op) { op = o; beat = i; frame = Math.round(track(B.map, pf)) }
  }
  /* the film is fetched once the chip film has arrived, or once the reader
     is a few screens down, whichever comes first: never in the hero's way */
  if (!loading && (P > .12 || (hero && hero.classList.contains('video-ready')))) load();
  setOp(op, beat);
  if (op > 0 && frame >= 0) {
    if (idleAt !== null) { clearTimeout(idleAt); idleAt = null }
    want(frame);
  } else if (op === 0 && idleAt === null && FD && FD.kept.length) {
    /* let the decoded pictures go once the beat has been left for a moment */
    idleAt = setTimeout(function () { idleAt = null; dropFrames() }, 2500);
  }
};

/* for the scrub test: what is wanted and what is on screen */
window.__skyState = function () {
  var drawn = FD ? drawnFrame : (videoReady ? Math.round((video.currentTime || 0) * FPS) : -1);
  return { want: wantFrame, drawn: drawn, wc: !!FD, video: videoReady, failed: failed, op: shownOp, t: video.currentTime || 0, gopMs: FD && FD.groups > 2 ? Math.round(FD.slowMs / (FD.groups - 2)) : -1 };
};

function want(frame) {
  if (FD) filmFrame(frame);
  else if (videoReady) requestSeek(frame / FPS);
}

function fail() {
  failed = true;
  layer.classList.add('sky-failed');
}

/* ---------- loading ---------- */

function load() {
  if (loading) return;
  loading = true;
  if (!window.fetch || !window.ReadableStream) { fail(); return }
  var ctrl = new AbortController();
  var watchdog = setTimeout(function () { ctrl.abort() }, 30000);
  fetch(URL_, { signal: ctrl.signal }).then(function (res) {
    if (!res.ok || !res.body) throw new Error('sky');
    var reader = res.body.getReader(), chunks = [], got = 0;
    function pump() {
      return reader.read().then(function (step) {
        if (step.done) return;
        clearTimeout(watchdog);
        watchdog = setTimeout(function () { ctrl.abort() }, 30000);
        chunks.push(step.value);
        got += step.value.length;
        return pump();
      });
    }
    return pump().then(function () {
      clearTimeout(watchdog);
      var bytes = new Uint8Array(got), at = 0;
      for (var i = 0; i < chunks.length; i++) { bytes.set(chunks[i], at); at += chunks[i].length }
      if (!initFilmDecoder(bytes)) useVideoElement(bytes);
    });
  }).catch(fail);
}
/* a reader who never scrolls still gets the film in time for the first beat */
window.addEventListener('load', function () {
  setTimeout(function () { if (root.classList.contains('film')) load() }, 9000);
});

/* ---------- the video element, the fallback ---------- */

var seekBusy = false, pendingTime = null;
function useVideoElement(bytes) {
  video.src = URL.createObjectURL(new Blob([bytes], { type: 'video/mp4' }));
  video.load();
  video.addEventListener('loadeddata', function () {
    videoReady = true;
    layer.classList.add('video-ready');
  }, { once: true });
  video.addEventListener('error', function () { seekBusy = false; pendingTime = null; fail() });
  video.addEventListener('seeked', function () {
    seekBusy = false;
    if (pendingTime !== null) { var t = pendingTime; pendingTime = null; requestSeek(t) }
  });
}
function requestSeek(t) {
  if (!videoReady || !video.duration) return;
  t = clamp(t, 0, video.duration - .02);
  if (seekBusy) { pendingTime = t; return }
  if (Math.abs(video.currentTime - t) < .016) return;
  seekBusy = true;
  video.currentTime = t;
}

/* ---------- the painter ---------- */

var fctx = null, FG = null, glHooked = false;
var FD = null, wantFrame = -1, drawnFrame = -1, filmDir = 1, decoding = false, keepGops = 3;

function makePainter() {
  var opts = { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' };
  var gl = null;
  try { gl = canvas.getContext('webgl2', opts) || canvas.getContext('webgl', opts) } catch (e) { gl = null }
  if (gl) {
    try {
      var prog = gl.createProgram();
      [[gl.VERTEX_SHADER, 'attribute vec2 p;varying vec2 v;void main(){v=vec2(p.x*.5+.5,.5-p.y*.5);gl_Position=vec4(p,0.,1.);}'],
       /* enlarged, the frame is resampled with a Catmull-Rom kernel so the
          letters' edges stay crisp; at 1:1 or smaller a plain sample */
       [gl.FRAGMENT_SHADER,
        '#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n' +
        'uniform sampler2D t;uniform vec2 ts;uniform float bc;varying vec2 v;' +
        'vec4 w(float x){float x2=x*x,x3=x2*x;return vec4(-.5*x3+x2-.5*x,1.5*x3-2.5*x2+1.,-1.5*x3+2.*x2+.5*x,.5*x3-.5*x2);}' +
        'vec4 row(vec2 i,float y,vec4 wx){vec2 b=vec2(i.x-1.+.5,i.y+y+.5);' +
        'return texture2D(t,b*ts)*wx.x+texture2D(t,(b+vec2(1.,0.))*ts)*wx.y+texture2D(t,(b+vec2(2.,0.))*ts)*wx.z+texture2D(t,(b+vec2(3.,0.))*ts)*wx.w;}' +
        'void main(){if(bc<.5){gl_FragColor=texture2D(t,v);return;}' +
        'vec2 p=v/ts-.5;vec2 i=floor(p);vec2 f=p-i;vec4 wx=w(f.x),wy=w(f.y);' +
        'vec4 c=row(i,-1.,wx)*wy.x+row(i,0.,wx)*wy.y+row(i,1.,wx)*wy.z+row(i,2.,wx)*wy.w;' +
        'gl_FragColor=vec4(clamp(c.rgb,0.,1.),1.);}']
      ].forEach(function (s) {
        var sh = gl.createShader(s[0]);
        gl.shaderSource(sh, s[1]); gl.compileShader(sh); gl.attachShader(prog, sh);
      });
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('link');
      gl.useProgram(prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      var at = gl.getAttribLocation(prog, 'p');
      gl.enableVertexAttribArray(at);
      gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
      gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.uniform1i(gl.getUniformLocation(prog, 't'), 0);
      gl.viewport(0, 0, canvas.width, canvas.height);
      FG = { gl: gl, lost: false, ts: gl.getUniformLocation(prog, 'ts'), bc: gl.getUniformLocation(prog, 'bc') };
      if (!glHooked) {
        glHooked = true;
        canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); if (FG) FG.lost = true });
        canvas.addEventListener('webglcontextrestored', function () {
          FG = null;
          if (makePainter()) sizeCanvas(); else filmFallback();
        });
      }
      return true;
    } catch (e) { FG = null; return false }
  }
  try { fctx = canvas.getContext('2d', { alpha: false }) } catch (e) { fctx = null }
  return !!fctx;
}

function blit(frame) {
  if (FG) {
    if (FG.lost) return false;
    var gl = FG.gl;
    try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, frame) } catch (e) { filmFallback(); return false }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return true;
  }
  if (!fctx) return false;
  fctx.drawImage(frame, 0, 0, canvas.width, canvas.height);
  return true;
}

/* the canvas draws at the screen's own pixels (capped at 4K wide) */
function sizeCanvas() {
  if (!FD) return;
  var dpr = Math.min(2, window.devicePixelRatio || 1);
  var r = canvas.getBoundingClientRect();
  var w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
  if (!w || !h) return;
  if (w > 3840) { h = Math.round(h * 3840 / w); w = 3840 }
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h }
  if (FG && !FG.lost) {
    var gl = FG.gl;
    gl.viewport(0, 0, w, h);
    gl.uniform2f(FG.ts, 1 / FD.mp4.width, 1 / FD.mp4.height);
    gl.uniform1f(FG.bc, w > FD.mp4.width * 1.05 ? 1 : 0);
  }
  drawnFrame = -1;
  paintSoon();
}
var resizeAt;
window.addEventListener('resize', function () {
  clearTimeout(resizeAt);
  resizeAt = setTimeout(sizeCanvas, 150);
}, { passive: true });

/* ---------- the decoder ---------- */

/* a small MP4 reader for one H.264 track, the shape ffmpeg writes */
function parseMp4(u8) {
  var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  var u32 = function (o) { return dv.getUint32(o) };
  var str = function (o) { return String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]) };
  var out = { timescale: 0, width: 0, height: 0, codec: '', description: null, samples: [], gops: [] };
  var stts = null, ctts = null, stss = null, stsc = null, stsz = null, stco = null, found = false;

  function walk(start, end) {
    var o = start;
    while (o + 8 <= end) {
      var size = u32(o), type = str(o + 4), hdr = 8;
      if (size === 1) { size = dv.getUint32(o + 8) * 4294967296 + dv.getUint32(o + 12); hdr = 16 }
      if (size === 0) size = end - o;
      var b = o + hdr, e = o + size;
      if (type === 'moov' || type === 'mdia' || type === 'minf' || type === 'stbl') walk(b, e);
      else if (type === 'trak') { if (!found) walk(b, e) }
      else if (type === 'hdlr') { if (str(b + 8) === 'vide') found = true }
      else if (type === 'mdhd') out.timescale = u8[b] === 1 ? u32(b + 20) : u32(b + 12);
      else if (type === 'stsd') {
        var eb = b + 8, etype = str(eb + 4);
        if (etype === 'avc1' || etype === 'avc3') {
          out.width = dv.getUint16(eb + 32); out.height = dv.getUint16(eb + 34);
          var q = eb + 86, qe = eb + u32(eb);
          while (q + 8 <= qe) {
            var qs = u32(q), qt = str(q + 4);
            if (qt === 'avcC') {
              out.description = u8.slice(q + 8, q + qs);
              var hex = function (v) { return (v < 16 ? '0' : '') + v.toString(16) };
              out.codec = 'avc1.' + hex(u8[q + 9]) + hex(u8[q + 10]) + hex(u8[q + 11]);
            }
            q += qs || 8;
          }
        }
      }
      else if (type === 'stts') stts = b;
      else if (type === 'ctts') ctts = b;
      else if (type === 'stss') stss = b;
      else if (type === 'stsc') stsc = b;
      else if (type === 'stsz') stsz = b;
      else if (type === 'stco' || type === 'co64') stco = { at: b, wide: type === 'co64' };
      o = e;
    }
  }
  walk(0, u8.byteLength);
  if (!found || !stts || !stsc || !stsz || !stco || !out.description) throw new Error('mp4');

  var fixed = u32(stsz + 4), n = u32(stsz + 8), sizes = new Array(n), i, j, k;
  for (i = 0; i < n; i++) sizes[i] = fixed || u32(stsz + 12 + i * 4);
  var dts = new Array(n), t = 0, cnt = u32(stts + 4), p = stts + 8;
  for (i = 0, k = 0; i < cnt; i++, p += 8) {
    var c = u32(p), d = u32(p + 4);
    for (j = 0; j < c && k < n; j++, k++) { dts[k] = t; t += d }
  }
  var pts = new Array(n);
  if (ctts) {
    var signed = u8[ctts] === 1;
    cnt = u32(ctts + 4); p = ctts + 8;
    for (i = 0, k = 0; i < cnt; i++, p += 8) {
      var cc = u32(p), off = signed ? dv.getInt32(p + 4) : u32(p + 4);
      for (j = 0; j < cc && k < n; j++, k++) pts[k] = dts[k] + off;
    }
  } else for (k = 0; k < n; k++) pts[k] = dts[k];
  var key = new Uint8Array(n);
  if (stss) { cnt = u32(stss + 4); for (i = 0; i < cnt; i++) key[u32(stss + 8 + i * 4) - 1] = 1 }
  else for (k = 0; k < n; k++) key[k] = 1;
  var runs = [], sc = u32(stsc + 4);
  for (i = 0; i < sc; i++) runs.push([u32(stsc + 8 + i * 12), u32(stsc + 12 + i * 12)]);
  var nch = u32(stco.at + 4), offs = new Array(n);
  for (var ch = 0, s = 0; ch < nch && s < n; ch++) {
    var base = stco.wide ? dv.getUint32(stco.at + 8 + ch * 8) * 4294967296 + dv.getUint32(stco.at + 12 + ch * 8) : u32(stco.at + 8 + ch * 4);
    var per = runs[0][1];
    for (i = 0; i < runs.length; i++) if (runs[i][0] <= ch + 1) per = runs[i][1];
    for (j = 0; j < per && s < n; j++, s++) { offs[s] = base; base += sizes[s] }
  }
  var order = []; for (k = 0; k < n; k++) order.push(k);
  order.sort(function (a, b) { return pts[a] - pts[b] });
  var pidx = new Array(n); for (i = 0; i < n; i++) pidx[order[i]] = i;
  for (k = 0; k < n; k++) out.samples.push({ off: offs[k], size: sizes[k], dts: dts[k], pts: pts[k], key: key[k] === 1, index: pidx[k] });
  var g = -1;
  for (k = 0; k < n; k++) {
    if (key[k]) { g++; out.gops.push({ from: k, to: k, lo: pidx[k], hi: pidx[k] }) }
    var G = out.gops[g]; G.to = k; if (pidx[k] < G.lo) G.lo = pidx[k]; if (pidx[k] > G.hi) G.hi = pidx[k];
  }
  return out;
}

function initFilmDecoder(bytes) {
  if (!window.VideoDecoder || !window.EncodedVideoChunk || !canvas.getContext) return false;
  if (/[?&]scrub=video\b/.test(location.search)) return false;
  var mp4;
  try { mp4 = parseMp4(bytes) } catch (e) { return false }
  if (mp4.samples.length < 2 || !mp4.timescale) return false;
  var dec;
  try {
    dec = new VideoDecoder({
      output: function (frame) { if (FD && FD.sink) FD.sink(frame); else frame.close() },
      error: function () { filmFallback() }
    });
    dec.configure({
      codec: mp4.codec, description: mp4.description,
      codedWidth: mp4.width, codedHeight: mp4.height,
      hardwareAcceleration: 'prefer-software'
    });
  } catch (e) { return false }
  var n = mp4.samples.length, gopOf = new Array(n), byTs = {};
  for (var g = 0; g < mp4.gops.length; g++) {
    for (var i = mp4.gops[g].lo; i <= mp4.gops[g].hi; i++) gopOf[i] = g;
  }
  /* about sixteen frames stay decoded, never fewer groups than the pump asks for */
  keepGops = Math.max(4, Math.round(16 / (mp4.gops[0].hi - mp4.gops[0].lo + 1)));
  var scale = 1e6 / mp4.timescale;
  for (var k = 0; k < n; k++) byTs[Math.round(mp4.samples[k].pts * scale)] = mp4.samples[k].index;
  canvas.width = mp4.width; canvas.height = mp4.height;
  if (!FG && !fctx && !makePainter()) { try { dec.close() } catch (e) {} return false }
  FD = {
    dec: dec, mp4: mp4, bytes: bytes, scale: scale, byTs: byTs, gopOf: gopOf, n: n,
    cache: {}, kept: [], sink: null, groups: 0, slowMs: 0
  };
  layer.classList.add('wc');
  sizeCanvas();
  if (wantFrame >= 0) { paintFrame(); pumpDecoder() }
  return true;
}

/* one call per frame the scroll asks for */
function filmFrame(i) {
  i = clamp(i, 0, FD.n - 1);
  if (i !== wantFrame) {
    if (wantFrame >= 0) filmDir = i > wantFrame ? 1 : -1;
    wantFrame = i;
  }
  paintFrame();
  pumpDecoder();
}

function nearestFrame(want) {
  var gops = FD.mp4.gops, g = FD.gopOf[want], best = -1, bestD = 1e9;
  function look(k) {
    var frames = FD.cache[k];
    if (!frames) return;
    var lo = gops[k].lo, from = clamp(want, lo, gops[k].hi) - lo;
    for (var i = 0; from - i >= 0 || from + i < frames.length; i++) {
      var a = from - i, b = from + i, at = -1;
      if (a >= 0 && frames[a]) at = a;
      else if (b < frames.length && frames[b]) at = b;
      if (at < 0) continue;
      var d = Math.abs(lo + at - want);
      if (d < bestD) { bestD = d; best = lo + at }
      return;
    }
  }
  look(g);
  for (var d = 1; d <= 2 && bestD > 0; d++) { look(g - d); look(g + d) }
  return best;
}

function paintFrame() {
  if (!FD || wantFrame < 0) return;
  var i = nearestFrame(wantFrame);
  if (i < 0 || i === drawnFrame) return;
  /* only ever step toward the wanted frame, except across the two beats,
     where the picture changes wholesale anyway */
  if (drawnFrame >= 0 && Math.abs(i - drawnFrame) < 48) {
    if (wantFrame > drawnFrame ? (i <= drawnFrame || i > wantFrame) : (i >= drawnFrame || i < wantFrame)) return;
  }
  var g = FD.gopOf[i];
  if (!blit(FD.cache[g][i - FD.mp4.gops[g].lo])) return;
  drawnFrame = i;
  layer.classList.add('video-ready');
}

function pumpDecoder() {
  if (!FD || decoding || wantFrame < 0) return;
  var g = FD.gopOf[wantFrame];
  var want = [g, g + filmDir, g + 2 * filmDir, g - filmDir];
  for (var i = 0; i < want.length; i++) {
    var k = want[i];
    if (k < 0 || k >= FD.mp4.gops.length || FD.cache[k]) continue;
    decodeGop(k);
    return;
  }
}

function decodeGop(g) {
  var G = FD.mp4.gops[g], frames = new Array(G.hi - G.lo + 1), fd = FD;
  decoding = true;
  fd.cache[g] = frames;
  fd.sink = function (frame) {
    var idx = fd.byTs[frame.timestamp];
    if (idx === undefined || idx < G.lo || idx > G.hi || frames[idx - G.lo]) { frame.close(); return }
    frames[idx - G.lo] = frame;
    paintSoon();
  };
  var t0 = performance.now();
  function failGop() {
    fd.sink = null;
    if (fd.cache[g] === frames) delete fd.cache[g];
    closeFrames(frames);
    decoding = false;
    if (FD === fd) filmFallback();
  }
  try {
    for (var k = G.from; k <= G.to; k++) {
      var s = fd.mp4.samples[k];
      fd.dec.decode(new EncodedVideoChunk({
        type: s.key ? 'key' : 'delta',
        timestamp: Math.round(s.pts * fd.scale),
        data: fd.bytes.subarray(s.off, s.off + s.size)
      }));
    }
  } catch (e) { failGop(); return }
  fd.dec.flush().then(function () {
    fd.sink = null;
    if (FD !== fd) { closeFrames(frames); return }
    fd.kept.push(g);
    trimGops();
    decoding = false;
    var ms = performance.now() - t0;
    if (++fd.groups > 2) {
      fd.slowMs += ms;
      /* version 3 (2026-10-05, Karan: "most of the times the clouds animation doesn't
         load properly"): the cut to the video element came at 90ms a group, which a
         laptop decoding in software reaches, and the video element's seeks are far
         worse than a slow decode (a group is 8 frames: even 400ms keeps 20 a second) */
      if (fd.groups === 6 && fd.slowMs / 3 > 400) { filmFallback(); return }
    }
    paintFrame();
    pumpDecoder();
  }, failGop);
}

var paintRaf = null;
function paintSoon() {
  if (paintRaf !== null) return;
  paintRaf = requestAnimationFrame(function () { paintRaf = null; paintFrame() });
}

function closeFrames(frames) {
  for (var i = 0; i < frames.length; i++) if (frames[i]) frames[i].close();
}

function trimGops() {
  while (FD.kept.length > keepGops) {
    var here = FD.gopOf[wantFrame < 0 ? 0 : wantFrame], far = -1, at = -1;
    for (var i = 0; i < FD.kept.length; i++) {
      var d = Math.abs(FD.kept[i] - here);
      if (d > far) { far = d; at = i }
    }
    var g = FD.kept.splice(at, 1)[0];
    closeFrames(FD.cache[g]);
    delete FD.cache[g];
  }
}

function dropFrames() {
  if (!FD) return;
  for (var i = 0; i < FD.kept.length; i++) {
    var g = FD.kept[i];
    closeFrames(FD.cache[g]);
    delete FD.cache[g];
  }
  FD.kept = [];
  drawnFrame = -1;
}

/* anything the decoder cannot do, the video element still can */
function filmFallback() {
  if (!FD) return;
  var fd = FD;
  FD = null; decoding = false;
  try { fd.dec.close() } catch (e) {}
  for (var g in fd.cache) closeFrames(fd.cache[g]);
  layer.classList.remove('wc');
  useVideoElement(fd.bytes);
}

document.addEventListener('visibilitychange', function () {
  if (document.hidden) dropFrames();
});
})();
