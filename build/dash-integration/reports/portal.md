# Console/dashboard LIGHT look: source of truth and website mapping

The website's dark ground is already the dashboard's Static/Dark look, so the toggle only needs a light block. All values below were read from source; contrast ratios were computed with the WCAG formula; anything marked "inferred" was not verified.

## 1. Sources

- **Console source:** `C:\Work\domin8te-build\portal\console\console.css` (base tokens L6-37; the "dashboard's look" skin L429-560; dark L631-687) and `console-fx.js` (dot canvas).
- **Dashboard source:** `portal\v16\src\styles.css` (light L19-102, dark L107+) and `portal\v16\variants\18h-scenes\5-18h-scenes.css` (Static dot ground L17-37, L59-68).
- **Built pages match source:** `domin8te-media\console\index.html` contains `--bg: #F4F1EC`, both `--dots` strings, the button glow, `DOT = 23`, and `SPRING = 54, DAMP = 0.34`. `dashboard\index.html` contains `--g-dot: 23px`, `--g-ink: 10, 10, 10`, `--g-a: 0.11`.

## 2. Light tokens (console.css unless noted)

| Thing | Value | Line |
|---|---|---|
| Page bg | `#F4F1EC` | L7; dashboard `--p-bg`, 5-18h-scenes.css L18 |
| Dot | `radial-gradient(circle, rgba(10,10,10,.11) 1px, rgba(10,10,10,0) 1.6px)`, tile `23px 23px` | L447, L451 |
| Ink / ink-2 / ink-3 | `#1D1A16` / `#4A443D` / `#6B645B` (dashboard: `#534C44` / `#655E55`) | L12-14; styles.css L42-44 |
| Hairlines | `rgba(94,72,50,.14)` / `rgba(94,72,50,.26)`; hover `rgba(94,72,50,.06)` | L15-17 |
| Surfaces | `#FFFFFF` / `#F1EDE7` / `#E6E0D7` | L9-11 |
| Card (skin) | glass `rgba(255,255,255,.52)`, edge `.67px solid rgba(255,255,255,.76)`, opaque fallback `#FBFAF8` | L436, L439, L462, L572 |
| Card radius | 28px panels, 20px rows/items, 18px board cards | L445-446, L546 |
| Card shadow | simple: `0 1px 2px rgba(40,30,20,.05), 0 8px 24px -14px rgba(40,30,20,.25)`; glass version is a long inset stack ending `0 14px 34px -14px rgba(24,28,48,.3)` | L34; L442 |
| Accent | `#FF5B1F`, hover `#FF7440`; orange for text `--accent-ink: #AE3A0B` | L18-19, L499 |
| Focus | `:focus-visible { outline: 2px solid #AE3A0B; outline-offset: 2px }`; inputs `border-color: rgba(174,58,11,.55); box-shadow: 0 0 0 3px rgba(255,91,31,.16)`. Dashboard uses `--p-focus: #1D1A16` | L30, L46, L159; styles.css L81, L214 |
| Font | `"Schibsted Grotesk"` from Google Fonts, 400/500/600/700 | L35; styles.css L96 |

**Primary button (L498):**
- `background-color: var(--accent)`
- `background-image: var(--glass-hi), linear-gradient(rgba(255,255,255,.42), rgba(255,255,255,0) 55%)`, where `--glass-hi` is `radial-gradient(240px at 22% -40%, rgba(255,255,255,.42), rgba(255,255,255,0) 62%)` (L440)
- `box-shadow: inset 0 1px 0 rgba(255,255,255,.65), inset 0 -10px 16px -12px rgba(120,30,0,.4), 0 10px 22px -10px rgba(255,91,31,.65)`
- label `#1D1A16`, weight 650, 15px, pill 999px

**Font differs from the website.** The site self-hosts Be Vietnam Pro 200/400/600/800i (v-editorial.css L3-6, L39-40). Do not import Schibsted; keep the site's type.

**Dark equivalents (L632-648):**
- Console dark is blue-black: `--bg: #101217`, ink `#F1EFEA` / `#C9C5BE` / `#A29E97`, lines `rgba(255,255,255,.08)` / `.16`, accent `#FF6F33`, accent-ink `#FFA57F`.
- Console dark dot is `rgba(237,234,228,.095)`, byte-identical to the website's `--dots` (v-editorial.css L61).
- Dashboard Static/Dark is `--p-bg: #0A0A0A`, `--g-ink: 237,234,228`, `--g-a: .095` (5-18h-scenes.css L30-37), which is the website's ground exactly.

## 3. Pointer-follow dots: canvas 2D in both

**Console (`console-fx.js`):**
- A still CSS dot layer sits on `body::before` (fixed, z-index -1). With a mouse, canvas `.fx-dots` is inserted as the first child of body and `html.dots-live` hides the CSS dots (console.css L451-453; JS L278-285).
- It runs only when `(hover: hover) and (pointer: fine)`, no reduced motion, tab visible, and not Scenes (L20-21, L303-308). DPR is capped at 1.5.
- Constants (L65-72): `DOT=23`, `REACH=150`, `SPRING=54`, `DAMP=0.34`, motion 10%, highlight 100%.
- Ink is `'10,10,10'` at `A=0.11` in light, `'237,234,228'` at `0.095` in dark (`readInk`, L83-87).
- At these settings dots near the pointer go to full ink and grow from 2px to 2.2px radius; neighbour lines are 0.7px (L232-245).

**Website (`assets/site.js`):**
- Same architecture: `Field`, canvases `.dots--page` and `.dots--film`, `html.dots-live` (L2047-2063; v-editorial.css L86-90).
- Colours are hardcoded at L1825: `var GRID_INK = '237,234,228', GRID_A = .095;`. They are used in `makeSprite` (L1843-1845), `makeTile` (L1857), `paint` (L1977, peak alpha .42) and `gridLine` (L1990).
- Physics is its own: `SPRING = 18, DAMP = .82`, `REACH = 150` (L1826-1827). `DOT` is read once from `--dot` (L1824).

**Toggle hook (inferred from reading, not run):** set `GRID_INK='10,10,10'; GRID_A=.11`, rebuild `sprite = makeSprite(...)`, then call `gridResize()` (L1998-2003). `Field.size` rebuilds the tile and `paint` clears the whole canvas each frame. Keep the site's physics and its 28px pitch; the portal's 23px was a portal-only request (5-18h-scenes.css L24).

## 4. Mapping: website token to light value

Dark values are from `html[data-v="editorial"]` in v-editorial.css L17-64. Suggested selector: `html[data-v="editorial"][data-theme="light"]`. It outranks the base block and mirrors the portal, which sets `html[data-theme]` before first paint (console.html L14).

| Website token | Dark | Light | Portal source |
|---|---|---|---|
| `--bg` | `#0A0A0A` | `#F4F1EC` | `--bg` |
| `--raise` | `#0E0E0D` | `#FBFAF8` (or `#FFFFFF`) | L572 / `--surface` |
| `--raise-2` | `#131312` | `#F1EDE7` | `--surface-2` |
| `--line` | `rgba(237,234,228,.12)` | `rgba(94,72,50,.14)` | `--line` |
| `--line-2` | `rgba(237,234,228,.24)` | `rgba(94,72,50,.26)` | `--line-2` |
| `--ink` | `#EDEAE4` | `#1D1A16` | `--ink` |
| `--ink-2` (body text) | `#8F8C86` | `#4A443D` | `--ink-2` |
| `--ink-3` | `#86837D` | `#6B645B` | `--ink-3` |
| `--muted-line` | `#5E5B56` | `#8A8176` | dashboard `--p-control`, styles.css L47 |
| `--acc` (fills only) | `#FF5B1F` | `#FF5B1F` | unchanged |
| `--acc-hover` | `#FF7A45` | `#FF7440` | L499 |
| new `--acc-ink` | `var(--acc)` | `#AE3A0B` | `--accent-ink` |
| `--btn-ink` | `#0A0A0A` | `#1D1A16` | L498 |
| `--ghost-line` | `rgba(237,234,228,.32)` | `rgba(29,26,22,.32)` | inferred |
| `--focus` | `#EDEAE4` | `#1D1A16` | dashboard `--p-focus` |
| `--bad` / `--good` | `#FF9090` / `#9BD8A8` | `#A8231B` / `#176240` | L28, L24 |
| `--dots` | ink 237,234,228 at .095 | `radial-gradient(circle,rgba(10,10,10,.11) 1px,rgba(10,10,10,0) 1.6px)` | L447 |
| `--dot`, `--r-*`, `--f-*`, sizes | unchanged | unchanged | keep the site's sharp corners and type |

**Things outside the token block that also need flipping:**
- `color-scheme:dark` on `html` (site.css L71) and `<meta name="theme-color" content="#000000">` (index.html L8).
- Scrollbar colours `rgba(237,234,228,…)` (v-editorial.css L66, L100); the console uses `rgba(94,72,50,.28)` (L41).
- Link underline colour (L101) and textarea hover border (L498).
- Header progress track (L254) and dashboard-pill hover (L855).

**Hardcoded dark that a token swap will miss in v-editorial.css:**
- Header backdrop gradient `#0A0A0A` (L215).
- Fades to `rgba(10,10,10,…)` at L1037, L1151, L1159-1160, L1204, L1215, L1217.
- Black drop shadows `rgba(0,0,0,.8)` (L550, L705, L778); on cream use the console `--shadow` (L34).
- Suggest adding `--bg-rgb: 10,10,10` (light `244,241,236`) so these gradients follow the theme.

**The film stage is baked dark (inferred risk).** It has its own ground, `--film-bg:#030508` (site.css L15, L316, L323), and its videos are rendered on black. Light mode should recolour the page ground only and leave the stage dark.

## 5. Contrast (computed)

| Pair | Ratio | Verdict |
|---|---|---|
| `#FF5B1F` on `#F4F1EC` | 2.75 | fails, even for large text |
| `#AE3A0B` on cream / on white | 5.47 / 6.16 | passes AA |
| `#C2410C` on cream | 4.60 | large text only |
| `#1D1A16` on cream | 15.38 | passes |
| `#4A443D` on cream | 8.53 | passes |
| `#6B645B` on cream | 5.18 | passes |
| `#1D1A16` on `#FF5B1F` (button label) | 5.59 | passes |
| white on `#FF5B1F` | 3.10 | fails for body text |
| site's dark `#8F8C86` / `#86837D` on cream | 2.98 / 3.35 | must be remapped |

**What the portal does for orange on light:** it never sets `#FF5B1F` as text. Orange is fill only (button, status dot), always with a dark label.
- Links and active icons use `#AE3A0B` (console.css L45, L77, L145).
- Chips use `#9A3108` / `#9A3510` on a 13-14% orange tint (L20-21, L519).
- Chart lines use `#C2410C` (styles.css L83).
- 18H Static uses `#7A2805` for accent ink (5-18h-scenes.css L78; 8.74:1).

**Website rules that set orange as text and need `--acc-ink` in light:**
- L119 `.hl--hero .ln--2` and L123 `.hl .acc` are display-size 800 italic. `#C2410C` stays visibly orange but only clears the 3:1 large-text bar; `#AE3A0B` is the safe choice.
- L1088 `.pan__head` is a 12px label and must use `#AE3A0B`.
- L604 and L1174 sit over the sky footage and can stay `#FF5B1F`.
- Borders and fills at L452, L548 and L734 can stay orange.

**Two further risks:**
- Weight-200 headlines will look thinner dark-on-cream than light-on-black. Contrast is fine; do not change the type.
- The rainbow `--climb` / `--spec` line (site.css L35-36) has a yellow `#F3CB3C` stretch at roughly 1.4:1 on cream (my estimate). Keep the snake over dark ground or give it a dark casing.