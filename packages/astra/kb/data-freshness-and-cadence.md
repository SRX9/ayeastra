---
slug: data-freshness-and-cadence
title: Data Freshness & Cadence
category: concepts
---
How current is what you're seeing? Short answer: sources are checked continuously on per-source cadences, and anything material reaches your Feed shortly after detection.

## Fetch cadence
Fast-moving sources (pricing pages, changelogs) are checked more often than slow ones (about pages). The menu bar's status indicator shows the watch pipeline's health at a glance.

## Detection to Feed
When a change is detected it flows through classification and scoring within the pipeline's normal processing time. Critical alerts route immediately to your configured channels; everything else appears in the Feed and rolls up into the daily digest and weekly briefing.

## Timestamps everywhere
Every snapshot, change, and signal is timestamped at detection — the date on a signal card is when the change was caught, and the underlying evidence records exactly when each page version was fetched. If a competitor changed something before you started watching them, the archive starts at your first snapshot; the baseline briefing captures that starting state.
