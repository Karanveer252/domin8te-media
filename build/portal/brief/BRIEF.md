# Domin8te client portal: product brief (distilled from Karan's review, 2026-09-24)

Domin8te Media is a done-for-you digital studio for independent restaurants and cafes. It runs four jobs for the owner every week: the website, social media, advertising (on the owner's own budget) and local search (Google visibility). One small studio, studio voice ("we"), never a big agency.

There are three products that share data but must never feel like one interface:

1. **Client portal** (this round): for restaurant owners who want three answers: What is happening? What changed? What do you need from me?
2. **Agency operations console**: a separate, data-dense workspace for the studio (clients, work queue, requests, approvals, integration health, billing operations, exceptions, automation activity, internal audit log). Built after a direction is chosen; it inherits the chosen world at higher density.
3. **Hermes, the internal automation**: never visible to clients. No prompts, agents, webhooks, retries, models or orchestration in the portal. The AI that clients meet is a scoped **Assistant**, never an "admin".

## Client portal

Navigation: Home · Work & requests · Results · Files & approvals · Billing · Help. Settings and notification preferences live under the profile menu.

Client Home hierarchy, in this order:

1. **Needs you** (the "what we need from you" queue). First whenever something requires the owner: approve content, upload a menu or photo, answer a question, fix a disconnected account, update a failed payment, confirm hours. Every item has one obvious action. No scavenger hunts.
2. **Current work**: one card per service (Website, Social media, Advertising, Local search). Each answers: What was completed? What is being worked on? What happens next? Who owns the next step? When is it expected? Never one project milestone for four parallel services.
3. **Recent results**: three to five meaningful outcomes. Each shows the comparison period, the data source, the last-updated time and one plain-English sentence ("Calls from Google increased 18% compared with the previous 30 days").
4. **Upcoming**: next launch or delivery, scheduled posts and campaigns, approval deadlines, meetings, known delays or dependencies.
5. **Recent activity**: a readable timeline (completed work, requests, comments, approvals, files, billing events). The client-friendly audit log; the technical security log stays internal.

Also on the client side: an **Account readiness** checklist (replaces one-time onboarding; hides when complete, returns when something disconnects), **connection health** per source (Connected · Updating · Stale · Disconnected, never credentials or error dumps), **request templates** (Update menu, Change hours, Promote an event, Add a special offer, Replace photos, Update website content, Launch an ad, Report an incorrect listing), a **deliverables calendar**, **proactive status messages** (Request received, Work started, Waiting for client, Delayed with reason, Completed, Approval required), a small **help centre**, and the **Assistant**.

The Assistant (version one) only explains metrics, answers questions from approved account information, summarises project status, helps create a request and points to the right page. It does not publish, change ad budgets, send external communications, alter billing, sign anything or change connected accounts. Every message shows who answered: **Assistant**, **Account team** (a human) or **System** (a notification). No digital ventriloquism.

Decisions that were removed: no "Hermes as admin"; no blurred dashboard after a failed payment (billing, invoices, support, history, contracts and approved files stay accessible; affected services pause after a grace period); no Basic/Advanced switch (progressive "View details" instead); "Message your account team", never "the owner"; notification categories instead of one switch (billing and security messages cannot be turned off); no client-facing technical audit log; no separate chat/ticket/approval inboxes (one shared work timeline); no built-in e-signature; no competitor tracking yet. Client-facing "SEO" is called **Local search** (or Google visibility).

## Data states the design must survive

Loading, empty, no data yet, stale data, partial data, disconnected account, permission denied, payment retry, restricted service, failed automation, recovery or retry. This round shows the states that fit the home screen: a failed payment in the queue, a disconnected Instagram, a stale result, statuses that are waiting on the client.

## Design direction (from the brief)

A monitor interface, not a marketing website: calm and highly readable; light, neutral surfaces with one restrained brand accent (this round also explores dark, because Karan's references are mostly dark); the rainbow infinity mark used selectively, never sprayed over every card; minimal jargon; strong status hierarchy with clear non-colour status indicators; mobile-friendly for owners checking it between actual fires; WCAG 2.2 AA.

## Assumptions taken for this round (Karan's own recommendations, plus two gaps filled)

- The first mockup is the client portal home; the ops console follows the pick, as two representative screens.
- Progressive "View details" disclosure replaces Basic/Advanced.
- Grace period after a failed payment: 14 days (the demo says "services continue until 6 Oct").
- Integrations in the mockup: Google Business Profile, website analytics, booking widget, Meta ads, Facebook page, Instagram.
- The Assistant stays informational; the prototype shows it answering a question and drafting nothing else.
- Both light and dark are explored; the pick decides.
