# Phase 3.2 — Workflow Layer (Missions, Board Mode, Reports)

Activates the `missions` primitive and the executive-cadence artifacts — the layer that presupposes trust and multi-team adoption (PRD: "earned first"). Gate: 50%+ of Business/Enterprise orgs using action tracking, 2+ departments consuming briefings in expansion accounts.

## The bar

These workflows exist today as analysts assembling decks from tool exports. SOTA is **intelligence organized around the decision, not the source**: a mission is a standing question ("defend against PayBridge," "launch in Brazil") that filters the entire engine through its lens; board artifacts assemble themselves from a quarter of evidence. Nothing here is a new pipeline — it's new lenses over signals/insights/actions/outcomes that already exist.

## Mission Rooms

Activate the dormant `missions` table (goal, entity_ids, owner, kpis, status).

- **Create:** from a template ("defend against X" / "enter market Y" / "watch launch Z") or free-form; picks entities + signal categories + optionally a priority link. Frontier task expands the goal into a watch spec (what to look for, leading indicators) shown for edit.
- **The room:** filtered live feed (mission-relevant signals via entity + category + grounding attachment), mission brief (auto-refreshed synthesis: situation, recent developments, open actions, outlook), mission actions (scoped action list), members.
- **Cadence:** optional mission section merged into the weekly briefing per member — never a separate briefing stream (the Monday artifact stays singular; the lesson from module design holds).
- **Close-out:** on completion, an auto-drafted retrospective (what we watched, what happened, actions/outcomes) — institutional memory that survives turnover, the north-star promise made tangible.

## Board Mode

Quarterly executive artifact, auto-assembled: competitive landscape shifts (quarter over quarter, from the archive) · strategic signal highlights with evidence · actions/outcomes recap (Phase 2.2 data) · validated-pattern outlook (fusion engine, track records cited) · coverage/confidence honesty block. Rendered as web + boardroom-grade PDF export. Assembled from existing scored objects — selection + synthesis + the same QA gate as briefings, quarterly scope.

## Reports Builder

Composable blocks over the existing object model: entity timeline block · diff gallery · signal digest (filtered) · pricing history table · battlecard excerpt · pattern/insight block. Saved layouts, org-shareable, export (PDF/markdown). Every block carries its evidence chips — a report is a curated view, never new unevidenced prose. Custom briefing scheduling (additional audiences/cadences, e.g. a sales-Friday cut) reuses briefing-engine section selection with a different budget profile.

## Build checklist

1. Mission CRUD + templates + goal-expansion task + room surface (feed filter + brief + actions).
2. Mission briefing section + close-out retrospective generator.
3. Board Mode assembler + PDF render.
4. Reports builder blocks + layouts + export.
5. Entitlement gating (Enterprise features per pricing) — billing add-on items as anticipated.

## Acceptance

- A mission created from template surfaces relevant signals within its first week and renders a coherent auto-brief (design-partner validated).
- Board Mode on a seeded quarter passes the "would we present this?" test with zero uncited claims (same mechanical checks as briefings).
- PRD Phase-3 exit metrics instrumented: mission/action usage per org, departments consuming briefings, memory cited as switching cost (CS log).
