/* THE PHONE'S CLOCHE FILM (2026-10-03)

   The opening of the desktop film, rendered again for a phone held upright
   (cloche3d/build.py --phone): the cloche on the pass, the lid lifting on a
   breath of steam, the neon mark rising, and the mark unwinding into a rope
   that leaves the frame down and to the left, where the page's line takes it
   on. phone.js asks for a frame as the reader scrolls; this file owns the
   film: it fetches it once the page has loaded (a still of the first frame
   stands in until then), decodes one group of pictures at a time with
   WebCodecs, and paints the frame on a canvas. Where WebCodecs is missing
   the video element seeks instead, and if neither can play, the still stays.

   It is the decoder of sky.js, cut down: a 2D canvas instead of WebGL (the
   picture is shown at its own size, so no resampling filter is needed). */
(function () {
  'use strict';

  window.__pfilm = function (url, canvas, video, onFrame) {
    var FD = null, wantFrame = -1, drawnFrame = -1, dir = 1, decoding = false, keepGops = 4;
    var ctx = null, loading = false, failed = false, videoReady = false, seekBusy = false, pendingTime = null;
    var FPS = 30, paintRaf = null;

    function clamp(v, a, b) { return v < a ? a : v > b ? b : v }

    function load() {
      if (loading) return;
      loading = true;
      if (!window.fetch || !window.ReadableStream) { failed = true; return }
      fetch(url).then(function (res) {
        if (!res.ok) throw new Error('film');
        return res.arrayBuffer();
      }).then(function (buf) {
        var bytes = new Uint8Array(buf);
        if (!initDecoder(bytes)) useVideo(bytes);
      }).catch(function () { failed = true });
    }

    /* ---- the video element, the fallback ---- */
    function useVideo(bytes) {
      video.src = URL.createObjectURL(new Blob([bytes], { type: 'video/mp4' }));
      video.load();
      video.addEventListener('loadeddata', function () { videoReady = true; if (wantFrame >= 0) seek(wantFrame / FPS); onFrame('video') }, { once: true });
      video.addEventListener('error', function () { failed = true });
      video.addEventListener('seeked', function () {
        seekBusy = false;
        if (pendingTime !== null) { var t = pendingTime; pendingTime = null; seek(t) }
      });
    }
    function seek(t) {
      if (!videoReady || !video.duration) return;
      t = clamp(t, 0, video.duration - .02);
      if (seekBusy) { pendingTime = t; return }
      if (Math.abs(video.currentTime - t) < .016) return;
      seekBusy = true;
      video.currentTime = t;
    }

    /* ---- a small MP4 reader for one H.264 track, the shape ffmpeg writes ---- */
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
      for (k = 0; k < n; k++) out.samples.push({ off: offs[k], size: sizes[k], pts: pts[k], key: key[k] === 1, index: pidx[k] });
      var g = -1;
      for (k = 0; k < n; k++) {
        if (key[k]) { g++; out.gops.push({ from: k, to: k, lo: pidx[k], hi: pidx[k] }) }
        var G = out.gops[g]; G.to = k; if (pidx[k] < G.lo) G.lo = pidx[k]; if (pidx[k] > G.hi) G.hi = pidx[k];
      }
      return out;
    }

    function initDecoder(bytes) {
      if (!window.VideoDecoder || !window.EncodedVideoChunk || !canvas.getContext) return false;
      var mp4;
      try { mp4 = parseMp4(bytes) } catch (e) { return false }
      if (mp4.samples.length < 2 || !mp4.timescale) return false;
      try { ctx = canvas.getContext('2d', { alpha: false }) } catch (e) { ctx = null }
      if (!ctx) return false;
      var dec;
      try {
        dec = new VideoDecoder({
          output: function (frame) { if (FD && FD.sink) FD.sink(frame); else frame.close() },
          error: function () { fallback() }
        });
        dec.configure({ codec: mp4.codec, description: mp4.description, codedWidth: mp4.width, codedHeight: mp4.height });
      } catch (e) { return false }
      var n = mp4.samples.length, gopOf = new Array(n), byTs = {};
      for (var g = 0; g < mp4.gops.length; g++) for (var i = mp4.gops[g].lo; i <= mp4.gops[g].hi; i++) gopOf[i] = g;
      keepGops = Math.max(4, Math.round(16 / (mp4.gops[0].hi - mp4.gops[0].lo + 1)));
      var scale = 1e6 / mp4.timescale;
      for (var k = 0; k < n; k++) byTs[Math.round(mp4.samples[k].pts * scale)] = mp4.samples[k].index;
      canvas.width = mp4.width; canvas.height = mp4.height;
      FD = { dec: dec, mp4: mp4, bytes: bytes, scale: scale, byTs: byTs, gopOf: gopOf, n: n, cache: {}, kept: [], sink: null };
      if (wantFrame >= 0) { paint(); pump() }
      return true;
    }

    function nearest(want) {
      var gops = FD.mp4.gops, g = FD.gopOf[want], best = -1, bestD = 1e9;
      function look(k) {
        var frames = FD.cache[k];
        if (!frames) return;
        for (var i = 0; i < frames.length; i++) {
          if (!frames[i]) continue;
          var d = Math.abs(gops[k].lo + i - want);
          if (d < bestD) { bestD = d; best = gops[k].lo + i }
        }
      }
      look(g);
      for (var d = 1; d <= 2 && bestD > 0; d++) { look(g - d); look(g + d) }
      return best;
    }

    function paint() {
      if (!FD || wantFrame < 0) return;
      var i = nearest(wantFrame);
      if (i < 0 || i === drawnFrame) return;
      /* only ever step toward the wanted frame */
      if (drawnFrame >= 0 && (wantFrame > drawnFrame ? (i <= drawnFrame || i > wantFrame) : (i >= drawnFrame || i < wantFrame))) return;
      var g = FD.gopOf[i];
      try { ctx.drawImage(FD.cache[g][i - FD.mp4.gops[g].lo], 0, 0, canvas.width, canvas.height) } catch (e) { return }
      if (drawnFrame < 0) onFrame('canvas');
      drawnFrame = i;
    }
    function paintSoon() { if (paintRaf === null) paintRaf = requestAnimationFrame(function () { paintRaf = null; paint() }) }

    function pump() {
      if (!FD || decoding || wantFrame < 0) return;
      var g = FD.gopOf[wantFrame], list = [g, g + dir, g + 2 * dir, g - dir];
      for (var i = 0; i < list.length; i++) {
        var k = list[i];
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
      function failGop() {
        fd.sink = null;
        if (fd.cache[g] === frames) delete fd.cache[g];
        close(frames);
        decoding = false;
        if (FD === fd) fallback();
      }
      try {
        for (var k = G.from; k <= G.to; k++) {
          var s = fd.mp4.samples[k];
          fd.dec.decode(new EncodedVideoChunk({ type: s.key ? 'key' : 'delta', timestamp: Math.round(s.pts * fd.scale), data: fd.bytes.subarray(s.off, s.off + s.size) }));
        }
      } catch (e) { failGop(); return }
      fd.dec.flush().then(function () {
        fd.sink = null;
        if (FD !== fd) { close(frames); return }
        fd.kept.push(g);
        while (fd.kept.length > keepGops) {
          var here = fd.gopOf[wantFrame < 0 ? 0 : wantFrame], far = -1, at = -1;
          for (var i = 0; i < fd.kept.length; i++) { var d = Math.abs(fd.kept[i] - here); if (d > far) { far = d; at = i } }
          var gg = fd.kept.splice(at, 1)[0];
          close(fd.cache[gg]); delete fd.cache[gg];
        }
        decoding = false;
        paint();
        pump();
      }, failGop);
    }

    function close(frames) { if (frames) for (var i = 0; i < frames.length; i++) if (frames[i]) frames[i].close() }

    function fallback() {
      if (!FD) return;
      var fd = FD;
      FD = null; decoding = false; drawnFrame = -1;
      try { fd.dec.close() } catch (e) {}
      for (var g in fd.cache) close(fd.cache[g]);
      onFrame('lost');
      useVideo(fd.bytes);
    }

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden || !FD) return;
      for (var i = 0; i < FD.kept.length; i++) { close(FD.cache[FD.kept[i]]); delete FD.cache[FD.kept[i]] }
      FD.kept = []; drawnFrame = -1;
    });

    return {
      load: load,
      want: function (i) {
        i = Math.round(i);
        if (FD) {
          i = clamp(i, 0, FD.n - 1);
          if (i !== wantFrame) { if (wantFrame >= 0) dir = i > wantFrame ? 1 : -1; wantFrame = i }
          paint(); pump();
        } else {
          wantFrame = i;
          if (videoReady) seek(i / FPS);
        }
      },
      failed: function () { return failed }
    };
  };
})();
