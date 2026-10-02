# Domin8te client portal

The working Domin8te client portal in its final design, **18H Scenes** (chosen on 28 September 2026). The app (`src/`) is version 16, the working MVP: five areas for a restaurant or café owner, Home, Work, Results, Updates and Billing, plus Settings, Help and Sign in, reliable in every loading, empty, failing and slow state (see "Revision 2"). 18H dresses it in clear liquid glass over the website's dot grid, with a choice in Settings between that grid and a sky that changes with each page; see "The design: 18H Scenes". Every other design built on the way (01 to 15, 16's own look, 16A to 16J, 17A to 17E, 18A to 18G) was retired to `C:\Work\domin8te-archive\portal-retired-20260928`, whose MANIFEST.md lists what moved and how to put it back.

It is built from static HTML, CSS and plain JavaScript, with no framework and no runtime dependencies, so it runs from a file, from `node serve.js`, or from any static host, Hostinger included. Everything you see is **demo data**. The data comes from named fixtures and is labelled on screen by an isolated "Preview mode: demo data" control (never part of the sidebar), and no integration is live.

## Run it

- Open `../versions/v18h.html` in a browser, or run `node serve.js` in `portal/` and open http://localhost:4173/ (it opens `versions/v18h.html`).
- Demo situations: `?demo=bayleaf` (default: busy full-service account), `?demo=cornerbean` (website and local search only, nothing waiting), `?demo=google-down` (the Google source fails), `?demo=slow` (two-second responses, to see the loading states). The "Preview mode" chip in the bottom corner (on a phone: the Preview chip in the top bar, or the account menu), or Alt+Shift+P from any page, opens the same switcher and a "Reset the demo" button. Switching happens in place: nothing reloads, you stay on the page you were on, and it works with no server running.
- Other switches: `?theme=dark` or `?theme=light`, `?scene=scenes` or `?scene=static`, `?side=rail` or `?side=full`. Light and Static are the defaults; dark and Scenes appear only when the client chooses them in Settings, and both choices are remembered. Preview tools: `?glass=0..100`, `?dots=0..100`, `?motion=0..100`, `?prism=1|0`, `?home=a|b|c` (see "The design").
- Routes: `#/home`, `#/work` (or `#/work/website`, `/social`, `/advertising`, `/local`), `#/results?days=7|30|90`, `#/updates?service=…`, `#/billing`, `#/settings` (`#/settings/sources` jumps to connected accounts), `#/help`, `#/sign-in`.

## Commands

Run these from this folder (`npm install` once if you want the pinned TypeScript; a global `tsc` also works):

| Command | What it does |
|---|---|
| `npm run build` | Builds 18H: `src/` and `variants/18h-scenes` inlined into the single file `../versions/v18h.html` (styles, scripts and brand marks), with the design-system card marker. `node tools/build.js v16` builds the plain original. Edit `src/` and `variants/`, never the output. |
| `npm run lint` | House rules: no em dashes, no `href="#"`, no "Submit", no lorem ipsum, no "SEO" in client copy, no inline handlers, no secrets or passwords, every button has a type, every image has alt text. Also runs `node --check` on every script. |
| `npm run typecheck` | `tsc --checkJs` over `src/` and `variants/` (JSDoc types, no emit). |
| `npm test` | Unit tests: tenant isolation, unknown tenants, strip totals, partial data, hidden services, no invented percentages, approvals and their audit record, comments required for changes, failing sources, insight and summary agreeing with the figures, required emails, messages and requests, the Clerk boundary, fixture weekdays, severities, the all-caught-up facts, in-place situation switching, the shell (no demo control in the sidebar, one badge style), WCAG contrast of every text colour on every ground in both themes (18H's beige and near-black included, at its default glass and at 100%), and the Liquid glass slider. |
| `npm run smoke` | Opens 53 routes and scenarios in headless Chrome (every page in every demo situation, the glass slider, Scenes and Static) and checks titles, finished loading, no script errors, no "undefined" or "NaN", and hidden services really hidden. |
| `npm run a11y` | axe-core 4.10.2 (WCAG 2.0, 2.1 and 2.2, A and AA) on 23 page, theme, sidebar, ground and width combinations. It downloads axe once into the temp folder. |
| `npm run sweep` | The error sweep (126 cases): every page on both grounds in both themes, the demo situations, phone and tablet widths, 22 client flows clicked through step by step (approve, request changes, message, settings, theme, Scenes and Static, ranges, filters, invoices, demo situations, sign out and in, the glass dock) and page changes made while the portal starts. Fails on any script error, failed step, crash screen (even for a moment) or wrong final page. |
| `npm run shots -- <name> <route> <width> <height> [query]` | Screenshots into `../shots/v18h-<name>.png` (`tools/still.js` renders with the GPU and holds the world's motion at a moment). Pass the route without the leading slash (`home`, not `/home`), because Git Bash rewrites `/home` into a Windows path. |
| `npm run check` | All of the above, in order. |

## How it is put together

```
src/
  index.html            shell: skip link, sidebar, phone top bar and tab bar, main, dialog, toasts
  styles.css            tokens (light on html, dark on html[data-theme="dark"]), layout, components
  lib/time.js           dates as the business's wall-clock time
  lib/format.js         plain-English dates, due dates, numbers, lists
  data/demo-fixtures.js DEVELOPMENT DATA ONLY: two fictional tenants and four scenarios
  data/dashboard-data.js the data layer and integration boundary (Clerk, Stripe, Resend, portal API)
  ui/components.js      reusable pieces: MetricCard, ActionNeededItem, ServiceCard, UpdateCard,
                        StatusBadge, InvoiceRow, EmptyState, ErrorState, skeletons, notices
  ui/charts.js          the one chart: this period solid, the previous period dashed, with a table
  ui/dialogs.js         approvals, outside-page explainers, messages and requests, confirm, toasts
  ui/pages.js           Home, Work, Results, Updates, Billing, Settings, Help, Sign in, Not found
  app.js                routing, theme, sidebar, account menu, badges, focus management
variants/18h-scenes/    the final design: its layers, settings and script (see "The design")
variants/shared/        the glass engine and dock (liquid), heavy glass, the living flow
tests/                  node:test suites, run in a sandbox with instant timers
tools/                  build, lint, smoke, a11y, sweep, shots and still, sheet, png, glass
```

The scripts are classic scripts that share one namespace, `window.D8`, so the portal also works when opened straight from the file system. Each page asks the data layer, never the fixtures. Every section loads on its own through one loader (`section()` in `ui/pages.js`): a shimmering placeholder, then its content, an empty state or a specific error with Try again. After 10 seconds it says the load is taking longer than usual instead of spinning for ever, and still shows the answer if it arrives. A refresh keeps the current figures on screen, dimmed, and if it fails they stay with a note saying so. A failing source only fails the sections that depend on it, and a page that fails to draw shows a "This page could not be shown" screen with a way back to Home, never a blank.

## Data rules (what Dashboard Manager must keep true)

- Every figure is computed from stored daily series. The strip, the Results page, the "What changed" insight and the assistant's summary all read the same numbers, and a test checks that they agree.
- Missing data stays missing. A metric that cannot be compared says why ("Figures start on 1 Jul, so this is not compared yet", "No ads ran in the previous 30 days") instead of showing a percentage. A metric that is not connected yet says "Not connected yet".
- Progress is counted from defined milestones ("3 of 5 done"). There are no progress percentages anywhere.
- Every source shows when it last updated and its health in plain words: Connected, Delayed (older than 26 hours), Needs reconnecting, or Not loading. A disconnected source shows a reconnect action.
- "Last verified" under the greeting is the latest time Dashboard Manager fetched and checked figures from a connected source. It is not a time anyone typed in.
- The AI summary on Results is labelled "Written by the Domin8te assistant", sits in its own dashed box, and only restates figures that appear on the page.
- The assistant never approves, publishes, spends, changes billing, changes permissions or connects accounts. Those are client actions, and each one is either recorded with an audit line or sent to the provider's own page.

## Tenant isolation

- Every call goes through one function that checks the session's tenant. An unknown tenant gets "We could not find your account", with no fallback to another tenant and no sample data from another client.
- Demo persistence is keyed by tenant (`d8.v16.demo.<tenantId>`), so approvals, messages and settings from one fixture never show up in another.
- There is no client-facing "view as" or impersonation feature. The demo switcher only picks which fictional fixture to load in development and disappears in live mode (`MODE = 'live'`).
- Nothing internal reaches the page: no agent logs, prompts, webhook payloads, integration secrets or other clients' records.

## Going live

The interface does not change when the data source does. Set `MODE` to `'live'` in `dashboard-data.js` and replace the fixture reads in `connect()` with calls to a small portal API. That API can run on Hostinger (a Node app or a PHP endpoint) or anywhere else. Nothing here depends on Vercel.

| Area | Boundary in the code | Live behaviour |
|---|---|---|
| Sign-in (Clerk) | `D8.auth` | Clerk's email-link sign-in, invitations, verification, password resets and sessions. The tenant comes from the user's Clerk organisation and the API verifies it on every request. Domin8te never creates, stores or emails passwords. |
| Billing (Stripe) | `D8.integrations.resolve('billing-portal' / 'invoice')` | The API creates a Stripe Billing Portal session or returns the invoice's hosted URL, and the button goes there. The portal never changes billing itself. It only shows Stripe's state (past due, retry date, grace period) and routes the client to Stripe. |
| Notifications (Resend) | Settings, "Email notifications" | Operational emails only: weekly update, approvals waiting, new invoice, website change published, and the required "Important account actions" category, which cannot be switched off. Sign-in emails come from Clerk, never Resend. |
| Connected accounts | `D8.integrations.resolve('connect-…')` | Each provider's own OAuth page. The client connects the account, not the agency or the assistant. |
| Appearance | `client.saveAppearance`, `account.appearance` | The client's look (light or dark, Scenes or Static) is saved with the signed-in user (`PUT /api/settings/appearance`) and returned with the account, so it follows them to every device; the device keeps a copy that is applied before the first paint. |
| Portal data | `connect(session)` | Proposed endpoints, one per data-layer method: `GET /api/account`, `/api/attention`, `/api/strip?days=`, `/api/work`, `/api/insight`, `/api/updates`, `/api/results?days=`, `/api/billing`, `/api/settings`, `/api/messages`; `POST /api/approvals/:id/decision` (stores the decision with who, when and the comment), `POST /api/messages`, `POST /api/requests`, `PUT /api/settings/notifications`, `POST /api/refresh`. Every one is scoped to the verified tenant on the server. |

**On the website, as it stands.** The site is on Hostinger and deploys as a zip unpacked over `public_html`, so `versions/v18h.html` put in the zip as `dashboard/index.html` would serve at domin8temedia.com/dashboard without touching the rest of the site (the routes are after `#`, so no server rules are needed). But it would be the demo: sample data, no real sign-in, the preview tools on screen. Before any public link: hide the preview tools (the glass dock, the Preview mode chip) in the client build, mark the page `noindex` and keep it out of `robots.txt`, ideally behind a password, and self-host the typeface. A real launch needs the rows above: Clerk sign-in, the portal API with tenant isolation, and the connections.

Secrets (Stripe, Clerk and Resend keys) live only on the server. The browser code holds none, and `npm run lint` fails if a key or password pattern appears in `src/`.

## Decisions where the brief left room, or where it conflicted with something else

- **"Waiting for you"** instead of "Waiting for client": the person reading it is the client.
- **"Local search"** instead of "SEO": owners care about calls, directions and bookings, not the acronym.
- **No invoice amounts in the demo.** Pricing is not public, and the amount and PDF live on Stripe's invoice page. The live build can show Stripe's amounts once they come from Stripe.
- **Dark mode only by choice.** The brief makes light the default and allows dark. The portal ignores the operating system's dark setting and switches only when the client picks Dark in Settings.
- **No assistant chat on Home.** Home is for "what needs me and what changed". The assistant appears only as the labelled summary on Results, and Help routes questions to the account team.
- **Visits and post views instead of visitors and reach.** Those counts add up correctly over any date range. Unique visitors and reach do not, so summing them would overstate the figures.
- **Charts only for bookings and website visits.** Every other metric is a number with its comparison. That keeps Results readable, and each chart has a table version.
- **Outside pages explain themselves in the demo.** Stripe, Clerk and Instagram buttons open a short dialog saying what would open and that it is not connected. No button links nowhere, and none pretends to succeed.
- **A fixed demo clock** (Thursday 24 September 2026, 15:10, moving forward in real time, and resuming after the last recorded action so a reload never makes new records look older). This keeps "Due tomorrow" and "updated 2 hours ago" true to the fixture.
- **Weekdays corrected.** 24 September 2026 is a Thursday. The v16 fixtures were corrected throughout and a test guards them. Directions 01 to 15 still say "Wednesday 24 September", which only matters if one of them is revived.
- **Preview mode sits apart from the product.** The review asked for the demo switcher to leave the sidebar. The brief also says demo data must never pass as live. So the control moved to an isolated, dashed "Preview mode: demo data" chip plus a keyboard shortcut, and it disappears in live mode.
- **Severity chips sit after the title, not above it.** The brand book says nothing sits above a heading, so the chip that says "Urgent", "Needs your approval", "Needs reconnecting" or "Please confirm" follows the title on the same line.
- **Rail labels on hover, and under the icon on touch screens.** With a mouse, the collapsed rail shows icons and a glass label on hover or keyboard focus. Tablets have no hover, so there the rail keeps a small label under each icon.
- **Motion never hides content.** Entrances slide a few pixels; nothing fades in from invisible, because a paused background tab would leave it invisible. Reduced motion turns movement off, and reduced transparency turns the glass solid.
- **Metric and work cards are whole-card links** (to Results, and to that service's Work section), which is why they lift under the pointer. Cards that go nowhere do not lift.
- **Payment problems do not blur the portal.** Billing shows the failed payment, the retry date and the date services continue until, while Home, Work, Results and Updates keep working.

## Revision 2: reliability first, then the glass shell

A review of the first build found two failures and twenty design improvements. What was wrong, and what changed:

- **"All caught up" led to a network error.** The demo switcher used links that reloaded the whole page, and the local preview server stops when a working session ends, so the reload found nothing. Situations now switch in place (`D8.data.switchScenario`), keep the page you are on, and work from a file or with no server. A test covers it, and the smoke run opens every page in every situation.
- **Work, Billing and Settings sat on "Loading".** Nothing limited how long a section could wait, and browsers slow timers in background tabs. Every section now gives up after 10 seconds with a specific message and Try again, the demo's simulated delay is skipped while a tab is hidden, and a page that throws shows a safe screen instead of a blank.

The design system, as tokens in `styles.css`:

| Layer | Light | Dark (chosen in Settings only) |
|---|---|---|
| Ground | warm neutral `#F4F1EC`, with faint amber and lavender light at the edges and a calm centre | graphite blue-black `#101217`, with dim warm and indigo light |
| Glass | white at 64% (cards) or 80% (sidebar, bars, dialogs), 20px blur at 135% saturation, a white highlight edge, a soft cool shadow | `#1D2029` at 66% or 84%, an 8% white edge, deeper shadows |
| Severity | urgent red `#A8231B`, approval indigo `#4338A8`, connection stone `#5E5446`, confirmation amber `#875300`, each on its own 12 to 16% tint, always with an icon and a word | the same four, lightened and tested on the dark glass |
| Buttons | orange only for the urgent action; indigo glass for approvals; solid ink for the main action of a form or dialog; plain glass for everything else; 44px high (40px small), with a glossy top edge | same roles |
| Motion | 160 to 220ms, ease-out: the sidebar width and its labels, the sliding capsule behind the current page, a 2px lift on cards that are links, a gentle shimmer while loading | same |

A test composites every text colour over the glass, over the ambient light and over the base, and checks WCAG AA in both themes.

## The design: 18H Scenes (final)

Chosen on 28 September 2026. `node tools/build.js` builds it into `../versions/v18h.html`. It is self-contained in `variants/18h-scenes`: `variant.json` sets everything (no base), and the layers it was built from sit beside it, in the order the build applies them, each with its selectors already written for 18H.

| File | Layer |
|---|---|
| `variant.css` | a map of the layers (the build reads it first) |
| `1-16j-flow.css`, `1-16j-flow.js` | 16J Flow: heavy clear glass (with `shared/heavy.css`) and the liquid rail |
| `2-18d-flow.css`, `2-18d-flow.js` | 18D Flow: the fixed panel with labels, the drop beside labels (its current of colour is unused) |
| `3-18f-skylight.css`, `3-18f-skylight.js` | 18F Skylight: the skies of Scenes and their inks, one drop of liquid for the whole panel, the horizontal team mark, the Prism rims switch, the Home sky switch |
| `4-18f-skylight-results.css` | the Results sky, the northern lights (its generator is in the archive, `v16/tools/aurora`) |
| `5-18h-scenes.css`, `variant.js` | the dot grid (Static) with the website's pointer motion, the dot sliders, Scenes and Static in Settings |
| `inject.html` | 18F's world (Scenes needs its pieces) and a start-of-body script that sets `html[data-scene]` before the first paint |

`tools/build.js` includes every stylesheet beside `variant.css` after it and every script beside `variant.js` before it, in name order, each script in its own block. The shared layers: `shared/liquid.css` and `liquid.js` (a lens for every glass element drawn for its own size, the glass dock with its slider, the prism switch; `tools/glass.js` scales every glass fill and blur with the slider), `shared/heavy.css` and `shared/flow.css` (the fixed panel, `html[data-page]`, the world's transitions and the reduced-motion and forced-colours rules).

- **Static, the default ground.** The website's dot grid (a dot every 28px, solid to 1px and gone by 1.6px; near-black at 11% on #F4F1EC, warm white at 9.5% on #0A0A0A after dark), drawn by the body's background so it scrolls with the page. With a fine pointer a canvas takes over, painting the same dots, and runs the site's own field code: the dots part round the pointer, spring home and join up while they move, and the loop stops when nothing moves. Touch, reduced motion and forced colours keep the still dots. Every page reads as 18F's Work did: dark words on the beige, 18D's clear glass; light words after dark. The rims of glass that only has the ground behind it are softened (`rim` 4 in the lens specs) so single dots do not fold into dashes.
- **Scenes.** 18F Skylight exactly: seven skies whose hour and weather change with the page, light words over the deep skies with frosted cards, the Home sky switch in the dock. Every dot rule is written for `html:not([data-scene="scenes"])`, so none applies on Scenes.
- **Remembered.** Every combination of light or dark and Scenes or Static is kept on the device (applied before the first paint) and with the account (`saveAppearance`, returned as `account.appearance` and applied as soon as the account arrives, so it follows the client to any device; the account wins over the device, a choice made on the device before is carried into the account, and `?theme=` or `?scene=` sets the look for one visit without saving it).
- **The choice.** A fieldset `variant.js` puts right above Light and Dark whenever Settings' Appearance card is drawn (the theme picker's own cards). Stored as `d8.18h.scene` and set before the first paint; `?scene=` for one visit; a toast confirms it ("Scenes on.", "Static on.").
- **Preview tools, not the client's portal.** The glass dock: Liquid glass (0 to 100%, 75% as designed), Dot visibility and Dot animation (0 to 100 with the website at 50; they start at 50 and 20), Prism rims, and on Scenes the Home sky switch. The Preview mode chip switches the demo situation.

Fixed while finalizing: a page chosen while the portal was still starting flashed the sign-in page and lost the choice, or drew the page before the account arrived and flashed the crash screen (`app.ready` and `app.wanted` in `src/app.js`: nothing is drawn until the session and the account are known, and the page chosen meanwhile opens then); an address with no page of its own marked the root with its raw name, so Scenes styled Page not found without Home's light words (it is marked `notFound` now).

## Known limits

- Clerk, Stripe, Resend, the provider connections and the portal API are boundaries only. Nothing is connected, by design.
- The demo keeps its state in this browser's local storage. The live build writes to the API instead.
- Chart tooltips follow the mouse. Keyboard and screen-reader users get the same figures in the table under each chart.
- The look (light or dark, Scenes or Static) is kept on the device and with the account. In the demo the account lives in this browser too, so a second device starts from the defaults until the portal API stores it with the user.
- The typeface loads from Google Fonts; self-host it before going live (the website self-hosts its own face).
- The glass dock and the Preview mode chip are preview tools; a client build hides them.
