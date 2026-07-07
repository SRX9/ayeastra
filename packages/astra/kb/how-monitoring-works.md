---
slug: how-monitoring-works
title: How Monitoring Works
category: concepts
---
Under the hood, AyeAstra runs a continuous observe → detect → interpret pipeline.

## Sources
Each watched entity has monitored sources: pricing pages, changelogs, blogs, docs, job boards, review sites, and more. Sources are discovered automatically when you add an entity, and you can extend them.

## Snapshots and changes
The pipeline fetches each source on its cadence and stores a snapshot (HTML, text, screenshot, content hash). When a new snapshot differs from the last, a change record is created with the diff, a materiality rating, and extracted facts. Cosmetic changes (styling, typos) are archived but go no further.

## From change to signal
Material changes are classified by category, then interpreted against your business context: what does this mean for this org, given its positioning and priorities? If the result clears your relevance bar, it becomes a signal in your Feed with severity, confidence, and evidence attached.

## One world, many lenses
Observation is shared — a competitor's pricing page is fetched once, no matter how many customers watch it — but interpretation is private. Your signals, scores, and briefings are computed only for your org, from your context, and are never visible to anyone else.
