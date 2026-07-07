---
slug: severity-and-confidence
title: Severity & Confidence
category: concepts
---
Every signal carries two independent ratings: severity (how much it matters) and confidence (how sure the engine is). Keeping them separate is deliberate — a rumor of a huge move is high severity, low confidence; a confirmed trivial change is the reverse.

## Severity
- **Critical** — act now: a move that directly threatens a priority or position.
- **High** — matters this week: material competitive movement in an area you care about.
- **Notable** — worth knowing: real change, lower stakes.

Severity is scored deterministically against your business context — entity tier, category weight, segment relevance, and your stated priorities — plus your org's learned adjustments from feedback. That's why the same event can be critical for one company and notable for another.

## Confidence
Confidence (high / medium / low) reflects evidence quality: how directly the captured change supports the finding, corroboration across sources, and extraction certainty. Many signals include a "what would change this assessment" note — the specific evidence that would raise or lower confidence.

## Alert routing
Severity drives delivery: in Settings → Context you choose which channels (email, Slack) fire for critical, high, and notable signals. Critical alerts are the ones designed to interrupt you.
