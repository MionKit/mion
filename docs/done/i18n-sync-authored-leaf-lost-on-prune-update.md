---
type: bug
spec: mini-plan
status: SHIPPED
created: 2026-08-01
shipped: 2026-08-02
---

# i18n mirror sync loses an authored leaf under a prune → update sequence

## Shipped

Root cause was not the prunes at all (they only kept the file carcass-free —
the shrinker keeps them because dropping events shifts the rng stream). The
real trigger: `bravo` was DROPPED from the source, its `type` message authored
in T while off-source, then RE-ADDED with a different type (pattern-format
string → plain string). At `updateT` the mirror merge keyed field carry-over
on the @rtIds child id (`childTypeChanged` → `replaceChildOp`), so the id
change carcassed the WHOLE bravo subtree (authored leaf inside) and
re-scaffolded it blank — T3's "lost or carcassed".

Fix in [merge.go](../../ts-go-runtypes/internal/enrichment/mirror/merge.go):
a **friendly-family** field (source-language mirror and every locale file)
whose child id changed but whose STRUCTURAL TEMPLATE did not (same
rt$items/rt$keys/rt$values/rt$slots skeleton) now MERGES in place — the
authored rt$label and still-declared error keys survive, and the rt$errors
descent carcasses exactly the constraint keys the new type dropped.

**Decisions logged:**

- **Family split.** Mock mirrors KEEP the whole-field replace on any id
  change: their kind-specific config rides RESERVED keys (pool/min/max) the
  merge never drops, so an in-place merge would leave a stale number-range
  config silently riding a string field (the A4 hazard,
  `TestMerge_MockChildTypeChanged_StillReplaces`). The friendly family has a
  granular constraint protocol (`mergeErrorsNode` + `knownConstraintKeys`),
  which is what makes the in-place merge sound there.
- **Template gate.** A child-type change that ALSO changes the structural
  template (string → array grows rt$items) still replaces whole — there is no
  positionwise merge across templates
  (`TestMerge_FriendlyChildTypeChanged_TemplateChangeReplaces`).
- **Doctrine update.** `TestExample_ChangeFieldType_parksOldValueInCarcass`
  pinned the old whole-field-carcass behavior for friendly mirrors and was
  rewritten to the new contract (label lives on; key-level carcasses only);
  the website's friendly-type page section was trued up to match.
- **Pins.** Go: the three merge tests above. JS: the shrunk sequence replays
  verbatim as a deterministic regression
  ([i18nRegression.test.ts](../../packages/ts-runtypes/test/fuzz/enrich/i18nRegression.test.ts),
  seed 0x26e88c65, 12 events — note the lane's default MAXCMDS of 10 silently
  truncates this sequence, which is why a bare replay var did not reproduce at
  first).

## Symptom

The i18n fuzz lane (400-sequence soak, `pnpm rtx core fuzz i18n` family)
fails its T3 oracle after 17 sequences and auto-shrinks to a 12-event
reproducer:

```
[T3] updateT (step 11): authored leaf bravo.type (FZT_10) lost or carcassed

srcDropField → addExtraArm → clearTodo → authorLeaf → srcAddField → checkT
→ srcDropField → srcAddField → pruneT → srcAddField → pruneT → updateT

Replay: RT_FUZZ_I18N_REPLAY=0x26e88c65   (base seed 0x118a10ca)
```

An authored translation leaf survives the first prune but is lost (or left
carcassed) when a later `updateT` reconciles after the second
`srcAddField → pruneT` round. CI never sees this — the default lane runs 6
sequences; the bug needs the deeper soak to surface.

## Provenance

Pre-existing: the i18n lane does not consume the fuzz type generator at
all (its corpus is self-contained), so this is independent of the
format/negation generator work that ran the soak — the only new ingredient
was running 400 sequences.

## Fix plan

1. Replay `RT_FUZZ_I18N_REPLAY=0x26e88c65` against
   `test/fuzz/enrich/i18nFuzz.integration.test.ts` and capture the mirror
   file state at steps 9–12 (before/after each prune and the final
   updateT).
2. The suspect window: `pruneT` twice in a row with a `srcAddField`
   between — check whether the second prune records the authored leaf as
   an orphan (carcass) and `updateT` then drops carcasses that still have
   a live source counterpart.
3. Fix in the enrichment reconcile (Go `internal/enrichment/` — the
   shared plan/check leaf), never in the fuzz harness; add the shrunk
   sequence as a deterministic regression test beside the lane.
