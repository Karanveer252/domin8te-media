# Build, preview, regression and deploy pipeline: findings

State as of 2026-10-04 02:47. Everything is verified by reading or by read-only runs unless marked **inferred**. `serve.js` was modified by another process at 02:42:59 while I worked; I describe the current file.

## 1. Is `index.html` reproducible? No.

- **Generator:** `C:\Work\domin8te-build\copy\build_index.py` takes `deck.json [out]`. The default out is `C:/Work/domin8te-media/index.html` (line 10), so never run it without a second argument.
- **Safe dry run:** `cd C:\Work\domin8te-build\copy && python build_index.py deck-v2.1.json <temp path>`. I ran it fully in memory (patched `open`, no file written) and diffed against the site file with `?v=` tokens neutralised.
- **Result:** generated 56,711 bytes against 52,262 on site. A rebuild would change these seven things:
  1. Add the head-script `window.__PHONE` block (tpl 81-88).
  2. Add the `pfilm` class block (tpl 96-100), and change `classList.remove('js','film')` to include `'pfilm'`.
  3. Wrap the hero in `div.hero__box#heroBox` with `picture.hero__blur`, `picture.hero__mark` and `svg.snkc#snkc` (tpl 205-237). `index.html` 192-194 has the bare `<video id="heroVideo">` and `<canvas id="heroFilm">`.
  4. Add `svg.snk#snk` and `i.snk__tip#snkTip` (tpl 507-536).
  5. Add a third blank-gif `<source>` to the hero still `<picture>` (tpl 309 vs `index.html` 266).
  6. Change `index.html` 213 from `growth</em>.` to `growth.</em>`.
  7. Drop `srcset=… sizes=… loading="lazy"` from the social tiles (`index.html` 361, 541); `tile()` in `build_index.py` 70-71 never got them.
- Items 1-4 are the unshipped 2026-09-23 phone-film draft that `RESUME.md` lines 32 and 35 warn about ("do not rebuild index.html until that is decided").
- The deck is in sync with the site: the picker label is "Have something else on mind?" in both, so the held-back typo fix is not applied.

**Procedure for new sections** (project convention, `RESUME.md` lines 11, 31, 34):
1. Edit `C:\Work\domin8te-media\index.html` by hand.
2. Mirror the same markup into `copy\index.tpl.html`, with copy as `{{key}}` slots and tokens as `?v=0`.
3. Put the new strings in `copy\deck-v2.1.json`.
4. Re-run the dry run and diff: it must show exactly the seven hunks above and nothing new.

The template has two script-owned regions: `CHARGE:START/END` (540-542) and `WORKIDX:START/END` (554-556). Do not insert inside them.

## 2. `stamp.js` (`node C:\Work\domin8te-build\stamp.js`)

- **Hash:** sha256 of the file bytes, first 10 hex characters.
- **What it rewrites:** every `basename?v=[A-Za-z0-9]+` occurrence in `index.html` for the hard-coded `assets` array (lines 14-16): `site.css`, `v-editorial.css`, `site.js`, `sky.js`, `pfilm.js`, `phone.js`, `sky-a/b-still.jpg`, and the `cy-l*` webp/avif files.
- **Tokens inside JS are stamped first:** `hero-scrub.mp4`, `hero-poster.jpg`, `hero-data.json` in `site.js`; `sky-scrub.mp4` in `sky.js`; `cl-film.mp4` in `phone.js`.
- **A new css/js file needs two things:** a reference in `index.html` that already carries a token (for example `assets/dash.css?v=0`), and an entry in the `assets` array. A listed file with no token in the html makes it exit 1 with `no ?v= token found`.
- **New mp4s and posters:** simplest is to reference them in `index.html` markup (`src`, `data-src`, `poster`) with `?v=0` and add each to `assets`. If the URLs live inside a new JS file, add a block like lines 49-59 before the html loop, because stamping changes that file's hash.
- **Name-collision trap:** the regex matches by basename with no left boundary. A new file whose name ends in `site.js`, `site.css`, `sky.js`, `phone.js` or `pfilm.js` (for example `dash-site.js`) would get the wrong token.
- Mock webps and `ba-*.webp` are not tokened.

## 3. `serve.js` (launch config "site", port 8080, `.claude\launch.json`)

- **How it serves:** `C:/Work/domin8te-media` as is, `Cache-Control: no-store`, `/send.php` stubbed to `{"ok":true}`.
- **Range:** yes, since 02:42 today (lines 25-35), for `.mp4` only: 206 with `Content-Range`, 416 when out of bounds. Plain GETs still return 200 from `readFile`.
- **MIME map:** no `.avif`, `.ico` or `.webm`.
- **Injection:** it adds `/__preview/{cards,photos,workidx,feel,header}.js` to `<head>` only if those files exist in `C:\Work\domin8te-build\preview`. All five are `.off`, so nothing is injected now. `?bare=1` only hides those switcher bars; the site ignores it.
- **Other local servers have no Range:** `phone-gauntlet\root-serve.js` and `probe.js`'s built-in server. That is fine for the existing films (they are `fetch()`ed whole, `site.js` 1252, `sky.js` 140), but new `<video>` clips will not seek there.

## 4. `pack.ps1` and `deploy.js`

- **What ships:** every file under `C:\Work\domin8te-media` except `.impeccable`, `.claude`, `.gitignore`, `DESIGN.md`, `PRODUCT.md`, plus `-Also` paths. `-Also` entries are exact relative paths or folder prefixes with forward slashes; no wildcards.
- **New mp4s in `assets/` ship automatically.** So does any scratch file left there.
- **Run it with `&` directly in PowerShell.** A nested `powershell -File` silently dropped `-Also` once (`RESUME.md` line 37).
- **The v45 `-Also` list** (confirmed by diffing the zip against the folder): `email`, `assets/email`, `assets/cl-closed.webp`, `cl-lift`, `cl-mark`, `cl-mark-f`, `cl-mark-r`, `cl-open`, `cl-room` (all `.webp`), `assets/hero-blur-m.jpg`, `assets/hero-mark-m.jpg`, `assets/hero-scrub-m.mp4`, `assets/sky-a-m.webp`, `sky-a-ph`, `sky-b-m`, `sky-b-ph`.
- **Size:** v45 is 62 entries, 8,824,202 bytes. Mp4 does not compress, so expect about 44 MB.
- **`deploy.js`:** `ZIP` (line 21) and `ARCHIVE_NAME` (line 24) are hard-coded to v45; bump both. `upload` reads the whole zip and sends one TUS PATCH; `deploy` extracts over the live site. Old files are not removed (**inferred** from line 37).
- **Upload risk (inferred):** Node's fetch may time out on a slow uplink if the PATCH takes over about 5 minutes. The host's upload limit is unknown.
- **Backup:** `C:\Work\domin8te-git\sync.ps1` mirrors the site folder to GitHub, so the mp4s go there too (each under 50 MB is fine).

## 5. Regression tools

**Desktop proof** (`gauntlet\desktop-baseline.js` plus `desktop-compare.sh`). The v45 command line was not recorded, so this is reconstructed from the scripts and `RESUME.md` line 7:

```
ROOT='C:\Work\domin8te-archive\v45-before-dashboard-sections-20261004-0240' PORT=8091 node C:/Work/domin8te-build/phone-gauntlet/root-serve.js
cd C:/Work/domin8te-build/gauntlet
URL=http://localhost:8091/ OUT=<dir>/base  PORT=9341 node desktop-baseline.js
URL=http://localhost:8091/ OUT=<dir>/base2 PORT=9342 node desktop-baseline.js   # noise floor
URL=http://localhost:8080/ OUT=<dir>/cand  PORT=9343 node desktop-baseline.js   # candidate via serve.js
PATH="$PATH:/c/Program Files/Virtual Desktop Streamer" bash desktop-compare.sh <dir>/base <dir>/cand
```

- `ROOT` must use backslashes, or `root-serve.js` line 8 answers 403 to everything.
- `PORT` is Chrome's debugging port (`cdp.js` line 7), not the web port. `OUT` defaults to `gauntlet\shots`.
- `ffmpeg` is not on PATH; the only copy is `C:/Program Files/Virtual Desktop Streamer/ffmpeg.exe`.
- The snapshot folder exists; I did not check it against live.
- **Output:** 14 PNGs at 1440x900 per run: `d-hero-top`, `d-cloche-lifted`, `d-climb`, `d-cloud1-charging`, `d-cloud1-held`, `d-jobs-a`, `d-jobs-b`, `d-pair`, `d-cloud2-held`, `d-resolve`, `d-work`, `d-picker`, `d-contact`, `d-footer`.
- Moments are addressed with `window.__feel.at(seg,f)`, with `body.paused` set for the shot.
- The compare prints `same|CHANGED name ssim x` and `changed: N` to stdout only; the threshold is 0.995.
- **Time:** about 1 minute per run (from the `phone-gauntlet\deskcmp` timestamps).
- **Noise:** cloud moments scored 0.9938 live-vs-live, so judge against base-vs-base2.

**Allowed differences for this change set (inferred):**
- `d-climb` changes because of the dashboard beat.
- If the `pre` segment's length changes (420vh in `buildTimeline()`, `site.js` 254-257), `d-cloche-lifted` and `d-hero-top` shift too. Keep it at 420 to avoid that.
- `d-work`, `d-picker` or `d-contact` change only in the 60px strip above the section, if a new section is inserted directly before it.
- If the toggle sits in the fixed header, all 14 change slightly.
- In dark mode nothing else should change.

**If the pin length changes, update three places together:**
- `site.css` 294, `html.film .film{height:1970vh}`.
- `gauntlet\range.js`, which hard-codes `420+L1+500+L2+200` and feeds `copy-check.js`, `overflow.js` and `live-check.js`.
- `verify-live.js`, which compares that css height and `FEEL L1/L2` live against local.

**`probe.js` is stale; do not use it.**
- It targets v1 ids that no longer exist (`#film`, `#cloud`, `#hand`, `#loader`, `#vpath`…).
- The last `report-smoke.json` is `fatal: getComputedStyle … not of type 'Element'`.
- There is no `shots` branch; the real ones are smoke, flick, mobile, rm, audit, sizes, novideo, act, weight.
- It was meant to cover film state at 18 positions, band opacity under flick steps, four phone sizes, reduced motion (cold and live flip), and contrast under the band words.

**Run these instead:**
- `gauntlet\overflow.js` (`URL`, `W`, `H` env): horizontal overflow at five film positions.
- `gauntlet\form-check.js`: form shape and a stubbed submit.
- `gauntlet\picker-check.js`: six options, the "other" plan, the select prefill.
- `gauntlet\copy-check.js`: fit of the three film headlines.
- `phone-gauntlet\narrowcmp.js` (`URL`, `W`, `H`): story layout at 1000x800 and 800x1000, with the request list.
- `phone-gauntlet\functest.js` and `siteaudit.js`: phone checks.
- `node gauntlet\verify-live.js` after deploy. It hashes every `(href|src)="assets/…"` in the live html against local, so `data-src` is covered but `poster=` and `srcset` are not. The CDN re-encodes JPEG, so prefer webp posters.

`form-check`, `picker-check` and `copy-check` hard-code `http://localhost:8080/?bare=1`. None of these tools know the new sections; add shots for them.

## 6. Copy gate

The gate is `copy\check-deck.js`, not `gauntlet\copy-check.js` (which only measures fit).

- **Run:** `node C:\Work\domin8te-build\copy\check-deck.js C:\Work\domin8te-build\copy\deck-v2.1.json [--table]`. It exits 1 on failure and currently reports "PASS: no hard failures".
- **It only reads deck strings.** Copy typed straight into `index.html` is ungated, so add deck keys.

It forbids:
- Dash characters, and hyphens used as dashes.
- Banned words: leverage, seamless, unlock, robust, solution, elevate, transform, boost, journey, streamline, effortless, tailored, landscape, ROI and others.
- Banned vocabulary: chip, core, engine, current, power.
- More than one "AI" on the page.
- Questions in headlines.
- Mid-sentence capitals outside the proper-noun list. "Dashboard" is not on it.
- Any digit outside `work.demo.*`, and `%`, `$`, `£`, `€`.
- Claim words: guarantee, result(s), testimonial.
- Team words: team, experts, account manager.
- "Karan", location words, pricing/contract/package words, timelines.
- Promises that the owner never logs in or approves.
- A second use of "scroll" (cap 1, already used), "right" (cap 1), "all four" (cap 2).
- An "ongoing" promise outside hero, f5 and picker.
- `film.f4.panels` and `work.items` must keep exactly four keys.

## 7. `.htaccess` (`C:\Work\domin8te-media\.htaccess`)

| Files | Cache-Control |
|---|---|
| `.html` | `no-cache, must-revalidate` |
| `.css`, `.js` | `public, max-age=31536000, immutable` |
| `jpg`, `jpeg`, `png`, `webp`, `svg`, `ico`, `woff2`, `mp4`, `json` | `public, max-age=86400` |
| `xml`, `txt` | `max-age=3600` |
| `send.php` | `no-store` |

- **`.avif` is not listed.** Live serves `cy-l1.avif` as `Content-Type: text/plain` with no Cache-Control (checked with curl).
- **Live mp4:** `Accept-Ranges: bytes`, 206 on Range, `max-age=86400`, behind the `hcdn` edge. Mp4s cache for a day even with a token, so token every new clip URL; the edge has served a stale film before (`stamp.js` 18-21).