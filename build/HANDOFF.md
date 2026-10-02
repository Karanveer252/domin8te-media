# Domin8te Media website: handoff for a new chat

**Superseded on 2026-09-16.** The live site is now v5 "Editorial" (dot-grid black, Be Vietnam Pro, orange accent, generated from a copy deck). Read `C:\Work\domin8te-build\RESUME.md` first; it is the current checkpoint. The deploy procedure in "Workflow for any change" below is still the one to use (zip name is now `domin8te-v5.zip`; run `impeccable live-server stop` before zipping if live mode was on). Everything else below describes v3 and is history.

Paste this whole file into a new chat (or say "read C:\Work\domin8te-build\HANDOFF.md").
State as of 2026-09-14. The site is live and verified. Nothing is half-finished.

## What it is

- **Live:** https://domin8temedia.com, hosted on Hostinger (account `u206384584`).
- **Audience:** restaurant and cafe owners. Domin8te Media runs AI-assisted marketing for them.
- **Build:** a cinematic one-page scroll film in plain HTML, CSS and JS. There is no framework and no build step.
- **Current version:** v3, the "chip hero" build.

## Where things live

| Path | What |
|---|---|
| `C:\Work\domin8te-media` | **The deploy folder.** Only files that ship: `index.html`, `.htaccess`, `robots.txt`, `send.php` (lead form mailer), `sitemap.xml`, `assets/` |
| `assets/site.css`, `assets/site.js` | All styling and all behaviour |
| `assets/hero-scrub.mp4` | Scroll-scrubbed chip video (4,401,169 bytes, 289 frames, 1920x1080) |
| `assets/hero-data.json` | Trace paths, camera and timing for the live pulses drawn over the video |
| `assets/hero-poster.jpg`, `hero-still.jpg`, `og.jpg` | The video's first frame, the phone still, and the share image |
| `C:\Work\domin8te-build` | Scratch work, test harness, video pipeline. **Never ships.** |
| `C:\Work\domin8te-build\video` | Chip video cleanup: `frames/` (source), `depulse.py`, `clean/` (cleaned frames), tracking scripts |
| `C:\Work\domin8te-archive` | Snapshots taken before each replace: `v1-navy-*`, `v2-friction-20260913-0738`, `v3-chiphero-20260913-1130` |
| `C:\Users\kvsd1\Downloads\Chip Hero C - Chip Exits.mp4` | The original chip video |
| `C:\Work\skills\10k-websites-skill\10k-websites\` | Reference skill: scrub pipeline, ffmpeg recipes, deploy notes. Not installed as a skill, so read it from disk. |

## How the page works

- **Two modes:**
  - **Film mode** (`html.film`) is desktop. `.film` is 1830vh tall with a sticky stage.
  - **Story mode** is the default, for phones and for `prefers-reduced-motion`: a designed still page, no scrub.
- **Order:** loader, then the film, then `#work` (4 showcase panels), `#try` (press and hold), `#contact` (the close and the lead form).
- **Film sequence:** chip video, then the handoff to the vector world, where the bolt (the "snake") travels diagonally through the cloud, the four service panels and the hand, and ends in the infinity mark and wordmark. There is friction (slowdown) at the cloud, the hand and "Handed to You".
- **Captions:** each `.band` has `data-a` / `data-b` (its film progress range). `--k` on `.band__in` scrubs its entrance.
- **Hero:**
  - Scroll maps to video time (`VTIME` in site.js). The video plays out, then crossfades into the site's bolt at the exact point where the video's snake leaves the logo.
  - A canvas draws live pulses along the traces: `PULSE_SPEED`, `PULSE_LEN`, `EMERGE` in site.js.
  - Moving the mouse speeds the pulses up about 6x (quick to rise, slow to settle).
  - The pulses fade to zero at the handoff.
- **Headline style (every caption):**
  - Font is Inter Tight.
  - Bold white first line.
  - A cyan (`--cyan:#27B6F6`) keyword (`.hi`) with a hand-drawn double underline. The `.swoosh` SVG is injected by `splitTitles()` in site.js.
  - Light italic for `.it` / `.ln--i`.
  - Each band has its own entrance effect via `data-fx`: blur, punch, part, grid, scatter, drift or rise.
- **Band copy:**
  1. Transform Your / Marketing Strategy / with the Power of AI (plus the sub line)
  2. Watch the Core / Fire Up / and Reach Every Channel
  3. Cut Straight / Through the Noise / of Running a Restaurant
  4. One by One, / Services Switch On / as the Current Arrives
  5. Four Services, / One System / on the Same Core
  6. Handed to You, / Done and Running / Every Single Week
  7. Where It Ends / Is Where It Started

## Decisions: do not undo

1. **Hero copy is word for word from Karan's reference image.** That covers the headline and the sub line "Boost your campaign performance, increase ROI, and unlock data-driven insights with our advanced AI marketing solutions." Do not reword it, even though it breaks the copy gate below.
2. **Copy gate for all other text:**
   - No em dashes.
   - None of these words: leverage, seamless, empower, unlock, robust, actionable, data-driven, solutions.
3. **No pricing and no FAQ.** They were dropped on purpose. The page ends on the wordmark, one line and the lead form.
4. **No client work is published.** The showcase panels are in-house examples. Never invent client names, logos or results. A comment in `index.html` marks where real screenshots go.
5. **Phones get the designed still version, not the scrub.**

## Workflow for any change

1. **Snapshot first:** copy `C:\Work\domin8te-media` to `C:\Work\domin8te-archive\v4-<label>-<YYYYMMDD-HHMM>`.
2. **Edit** files in `C:\Work\domin8te-media`.
3. **Test** (Chrome driven headless, no installs needed), from `C:\Work\domin8te-build`:
   - `node probe.js smoke` (or `shots`, `flick`, `mobile`, `rm`, `audit`). Writes `report-<task>.json` and `shots/`. Read the JSON; console output gets truncated.
   - `node hero-test.js` checks the video scrub, pulses, mouse boost and handoff.
   - `PS=.05,.2,.4 W=1440 H=900 node caption-test.js` screenshots captions at given film progress values.
   - Check at 1440x810, 1440x900, 2560x1080 and 1024x768 at minimum.
4. **Restamp cache tokens:** run `node C:\Work\domin8te-build\stamp.js`.
   - css/js are cached for a year as immutable, so changed files must get new `?v=` tokens.
   - **Always do this before zipping.**
5. **Zip** the deploy folder to `C:\Work\domin8te-v4.zip` with Python `zipfile`.
   - Contents: `.htaccess`, `index.html`, `robots.txt`, `send.php`, `sitemap.xml`, `assets/*`.
   - Use ZIP_STORED for .mp4/.jpg and ZIP_DEFLATED for the rest.
6. **Deploy** with the Hostinger connector:
   1. `hosting_generateUploadURLV1` with `{username: "u206384584", domain: "domin8temedia.com"}`. It returns an upload URL plus two auth tokens (they expire, so fetch fresh ones each time).
   2. Upload with `curl.exe` (TUS) to `<url>/<zip name>?override=true`:
      - First a POST with headers `X-Auth`, `X-Auth-Rest`, `Tus-Resumable: 1.0.0`, `Upload-Length: <bytes>`, `Upload-Offset: 0`. Expect 201.
      - Then a PATCH with the same auth headers, `Content-Type: application/offset+octet-stream`, `Upload-Offset: 0` and `--data-binary @<zip>`. Expect 204.
   3. `hosting_deployStaticSiteArchiveV1` with `{username, domain, archive_path: "<zip name>"}`.
7. **Verify live:**
   - sha256 of the live `index.html`, `site.css`, `site.js`, `hero-scrub.mp4` and `hero-data.json` must match the local files.
   - Run `URL=https://domin8temedia.com node live-hero.js`.
   - Confirm `https://domin8temedia.com/<zip name>` returns 404.

## Gotchas already hit

- **JPG hashes never match live.** Hostinger's CDN resizes and recompresses JPGs. Compare them visually, not by hash.
- **The Hostinger connector drops.** Symptoms are "connection invalidated", "Connection closed" and rate limits. Wait about 60s and retry. If it stays broken, reconnect it in Settings → Connectors.
- **PowerShell `Start-Sleep` is blocked** in the agent. Use a background bash `sleep`.
- **Swoosh underline:** don't add `vector-effect:non-scaling-stroke`. It breaks the `pathLength` dash animation and the line turns into broken dashes.
- **Caption widths are tuned per band** (`--w` on each band). Longer text wraps or collides with the service panels, so re-check band 05 in particular.
- **The hero column scales with the type** (`--hs`), so ultra-wide screens don't wrap the headline into 5 lines.
- **Don't save stray carriage returns in Python scripts.** One corrupted a path line in `depulse.py` once.

## Known small loose ends (optional)

- A faint glow remains in a few spots of the de-pulsed video.
- The contrast audit flags a few low samples where thin traces or the chip sit behind text. They read fine visually.
- The video is 4.4 MB. First-time visitors see the video's first frame and a loading ring while it streams.

## More history

- Memory files: `C:\Users\kvsd1\.claude\projects\C--Work-domin8te-media\memory\`
- Full transcript of the building session: `C:\Users\kvsd1\.claude\projects\C--Work-domin8te-media\31a98cc3-2a20-4662-8796-1b752cf653e5.jsonl`
- Original design brief: `C:\Work\domin8te-build\design-package.md`

## Also carry over (from the earlier chat)

- **The spec in force** is `C:\Work\domin8te-build\brief-one-scroll.md`: the "Cinematic One-Scroll Agency Site" prompt, saved word for word. It replaced the first long brief (a 13-section React/GSAP landing page with pricing, an FAQ and a cloud transition at every section). Don't go back to that one.
- **Directions Karan already rejected, so don't drift back to them:**
  - v1: ivory background, cyan bolt, conventional sections. Verdict: "completely not what I wanted".
  - A navy multi-section page with a gold "Zeus" canvas bolt. Verdict: "this is shit".
  - What went wrong both times: too much was built before one screen was agreed, and it was judged from still screenshots instead of watching it move.
- **Working agreement:**
  - Make one change at a time and show it locally.
  - Nothing goes live until Karan says "deploy".
  - For anything new or big, agree the one screen first. Offer two or three directions if it's unclear.
- **Budget:** free generation credits only. Before any paid image or video run with the `generate` skill (`C:\Work\skills\generate-skill`), quote the cost and wait for a yes.
  - Keys stay in its `.env`.
  - Never describe the logo or a face in text. Pass the real file from `C:\Work\images`.
- **Business facts:**
  - Contact email: karanhelps@domin8temedia.com.
  - No city or location anywhere on the site.
- **Emergency takedown:** `C:\Work\domin8te-offline.zip`, deployed the same way as a normal build.
  - It returns 503 with `Retry-After` and a "Back shortly" page, which search engines treat as temporary.
  - Before deploying it, snapshot the live build to the archive.
- **Hostinger bot protection:** it can put a challenge page in front of automated browsers on the live domain. If a live headless test can't find page elements, suspect that page first. Don't try to get past it; confirm with curl and hashes instead.

## What I want in this chat

[write your next change here]
