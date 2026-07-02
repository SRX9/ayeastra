---
name: react-doctor-web
description: React/Next.js code-health rules to follow when writing or editing code under apps/web. Distilled from react-doctor findings. Use whenever authoring or reviewing components, server code, lib helpers, dependencies, or env files in apps/web so new code stays above the react-doctor score threshold.
---

# react-doctor guardrails for `apps/web`

Apply these when writing/editing anything under `apps/web`. They mirror the
`react-doctor` rules this app is scored against. Goal: keep the score > 90 and
avoid re-introducing fixed findings.

## Verify with the tool
- Baseline / full scan: `cd apps/web && npx react-doctor@latest . --verbose`
- Fast pre-commit check on your diff: `npx react-doctor@latest --scope changed`
- Score only: `npx react-doctor@latest . --score`
- Treat findings as hypotheses: read the flagged code before "fixing" it. Fix the
  root cause, not the rule config. Don't suppress without evidence from the file.

## Performance rules (most common here)

**1. Cache `Intl.*` formatters — never construct per call (`js-hoist-intl`).**
`new Intl.NumberFormat/DateTimeFormat/Collator/...` allocates a lot. Construct at
**module scope**, not inside a function/component body.
- Fixed options → module-level `const`.
- Dynamic options (e.g. currency from Stripe) → a module-level `Map` cache keyed
  by the varying input. See `src/app/settings/billing/page.tsx` (`formatCurrency`).
- In a client component with dynamic input, `useMemo` is acceptable.
- Note: the rule is syntactic — a `new Intl.*` inside a function still flags even
  when you cache it. For genuinely per-call dynamic input this is a documented
  false positive; keep the cache.

**2. Build a `Map`/`Set` once instead of `.find()`/`.includes()` in a loop (`js-index-maps`).**
Repeated `array.find(...)` inside a loop is O(n·m). Build the index once before
the loop, then do O(1) `.get()`/`.has()`. Preserve original semantics (e.g. keep
"first match in array order" by only setting a key the first time you see it).
See `src/lib/billing.ts` (`pickCurrentSubscription`).

**3. One pass, not two (`js-combine-iterations`).**
`arr.filter(...).map(...)` (and similar chains) iterate twice. Use a single
`for...of` that pushes into a result array (or `reduce`). See `src/lib/team.ts`
(building `pending` invitations).

## Maintainability rules

**4. No unused files (`unused-file`).**
Delete components/modules not reachable from any entry point. If you create a
file, wire it into an import path or don't add it. (Removed: `components/loader.tsx`.)

**5. No unused dependencies (`unused-dependency`).**
Every entry in `package.json` `dependencies` must actually be imported by this
app. Don't add a dep "just in case"; remove it when the last import goes.

## Security rules (these are errors — highest score impact)

**6. Never commit real secrets in `.env*` files (`repository-secret-file`).**
The rule fires on any `.env*` file containing secret-looking values **that git
would track**.
- Real secrets live only in **gitignored** files: `.env.local` (Next.js loads it)
  or `.env` — both are covered by the repo's `.gitignore`. Confirm with
  `git check-ignore -v apps/web/.env.local`.
- Commit only redacted templates: `.env.example` with placeholder values
  (`sk_test_xxxx`, `user:password@host`). `*.example/*.sample/*.template` are skipped.
- If a secret ever lands in a tracked file: rotate it, remove it, purge history.
- Gotcha: react-doctor decides "tracked" via git. A missing/broken `.git` makes it
  flag ignored files too — ensure the repo is a valid git repo.

**7. Keep `next` patched (`no-vulnerable-react-server-components`).**
Next bundles the RSC runtime, so CVEs are fixed by bumping Next. Keep `next` on a
non-vulnerable release (this app is on `^16.2.6`+ for CVE-2026-23870). After
bumping, run `bun install` and re-scan.

## Quick pre-ship checklist for an `apps/web` change
- [ ] No `new Intl.*` inside a function/component (cache at module scope).
- [ ] No `.find()`/`.includes()` inside a loop over a growable list.
- [ ] No `.filter().map()` (or similar) double passes on hot paths.
- [ ] Any new file is imported somewhere; any new dep is actually used.
- [ ] Secrets only in gitignored env files; templates redacted.
- [ ] `bun run check-types` passes and `npx react-doctor@latest --scope changed` is clean.
