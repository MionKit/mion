# @ts-runtypes createFriendlyText rt$default emits duplicate messages (upstream)

**Status:** todo — upstream `@ts-runtypes` bug found during the friendly-errors feasibility investigation
(mirrors the `formats-brandname-upstream.md` upstream-tracking pattern).
**Created:** 2026-07-22

## Problem

`@ts-runtypes/core`'s `createFriendlyText` renderer (`packages/ts-runtypes/src/enrich/createFriendlyText.ts`)
documents in its header (≈L11-13) that the exclusive `rt$default` mode yields **ONE message per field**. The
renderer does not honor that: `renderErrors` loops `for (const err of group.errors)` (≈L365) and
`resolveTemplate` returns the same `rt$default` template for each error (≈L334), so a value that fails 2+
constraints (e.g. `minLength` + `pattern`) under an `rt$default` node produces **N identical messages**, not one.

## Why it matters to mion

In the friendly-errors swap (mion Phase 8) `rt$default` is the natural stand-in for mion's composed
per-field handler (one message per field). Because the intended collapse does not happen, `rt$default` is a
weaker substitute than advertised — the duplicate-message emission has to be de-duplicated on the mion side
(or fixed upstream).

## Fix plan

1. File upstream against `ts-run-types`: `rt$default` should emit a single `FriendlyMessage` per field
   (dedupe by path when the resolved template is the `rt$default` catch-all), matching the documented contract.
   Alternatively, correct the header docs if per-error emission is intended.
2. Until fixed, dedupe `rt$default`-sourced messages by path in mion's Phase 8 renderer usage.
3. When upstream ships, drop the mion-side dedupe and note the version.
