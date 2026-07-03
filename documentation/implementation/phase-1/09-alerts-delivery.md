# 09 — Alerts & Delivery (Phase 1)

Routes intelligence into the channels where the team already works — Slack and email — on the PRD cadence: CRITICAL/HIGH immediately, NOTABLE daily, INFO weekly. Workflow embedding is moat #3; an alert users learn to ignore is worse than no alert.

## The bar

Monitoring tools blast every change to every channel until muted. SOTA is **severity-honest routing**: immediate interrupts are rare and always worth it (scoring engine guarantees CRITICAL rarity by construction), everything else batches politely, and the alert itself is actionable in-channel (feedback, assign, snooze without leaving Slack). Deliverability engineering (idempotent sends, retries, real failure states) is table stakes done properly.

## Routing (`signal.route`, after every signal persist)

| Severity | Route |
|---|---|
| CRITICAL | Immediate: Slack + email to configured targets |
| HIGH | Immediate: Slack (email only if org opted in) |
| NOTABLE | Daily digest (8:00 org TZ) |
| INFO | Weekly briefing only — never its own notification |

Guards, in order: org routing config (from Intelligence Plan / Settings) → quiet hours (immediate → next 8:00, CRITICAL exempt) → family-dedup window (no two alerts for the same entity+category within 24h; later ones fold into the digest) → per-user mute rules (scoring-engine mute offers land here). Every routed item = a `deliveries` row; sends are driven off that table only.

## Channels

### Email (Cloudflare Email Service + react-email)
- Sends go through an `EmailProvider` interface (mirror of collection's `FetchProvider`); Cloudflare Email Service is the Phase-1 implementation (REST API from `delivery.send`). It's a young sending product and the Monday briefing is a flagship promise — monitor bounce/complaint rates from day 1; Resend/Postmark slot in behind the interface if inbox placement disappoints.
- Alert template: severity chip, finding, why-it-matters, evidence link, diff thumbnail for pricing; deep link to signal.
- Digest template: grouped by entity, ranked, three-line items.
- Domain auth (SPF/DKIM/DMARC) from day 1 + domain warm-up; alerts/briefings are transactional, from a subdomain (`intel.ayeastra.com`) to protect root-domain reputation.

### Slack (OAuth app, not bare webhooks)
- Org connects via OAuth during onboarding stage 5 or Settings; channel choice per route (alerts channel, briefing channel).
- Alert = Block Kit message: severity, finding, why-it-matters (truncated), evidence button, and action buttons: **Useful / Not useful / Assign / Snooze**.
- Interactivity endpoint (signed-secret verified): button presses write `feedback` / `actions` / snooze state and update the message in place ("✓ marked useful"). Feedback friction ≈ zero — this is where the scoring loop's training data comes from.
- Slack down / token revoked → mark org's Slack degraded, fall back to email, surface a Settings banner. Never drop intelligence silently.

## Delivery mechanics

- `delivery.send` job consumes `deliveries` rows; idempotency key = `deliver:{deliveryId}`; retries with backoff; exhausted → `failed` + dead letter + Settings-visible status.
- Batch jobs (`digest.daily`, briefing delivery) build one artifact per org, then fan out per-channel delivery rows.
- Every send emits `cost_events` (email sends) and structured logs with `deliveryId` — "did the CEO get Monday's briefing?" is a query, not an investigation.

## Build checklist

1. `deliveries` flow + `delivery.send` + retries/dead-letter.
2. Cloudflare Email Service setup (domain auth, warm-up) + `EmailProvider` interface + alert/digest/briefing email templates.
3. Slack OAuth app + Block Kit templates + interactivity endpoint (feedback/assign/snooze writes).
4. `signal.route` guards (config, quiet hours, family-dedup, mutes) + `digest.daily`.
5. Settings: routing matrix editor, channel health, delivery history.

## Acceptance

- CRITICAL signal → Slack + email within 60s of signal persist (measured on seed org).
- Same signal family twice in a day → one interrupt, second folds into digest.
- Slack buttons write feedback/action rows and update the message; revoked token degrades to email with visible banner.
- Replayed `delivery.send` never double-sends (idempotency proven in test).
