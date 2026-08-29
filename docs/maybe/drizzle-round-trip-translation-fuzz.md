---
type: chore
spec: guidelines
status: maybe
created: 2026-08-29
---

# Round-trip fuzz: drizzle to slim and back, byte-identical

## Intent

Prove the translator maps drizzle's authoring surface 1:1 by generating random
drizzle schemas, translating them to the slim packages and back, and requiring
the result to be byte-identical to the input. A shape the translator does not
really understand would come back different, and the fuzzer would find shapes
nobody thought to write a fixture for.

Parked, not rejected. What follows is the case against doing it now, so whoever
picks it up starts from the real trade rather than the idea.

## Why it is parked

**The reverse direction does not exist.** `ts-runtypes drizzle-migrate` goes
drizzle to slim. Nothing goes slim to drizzle SOURCE. `internal/convert`'s
drizzle arm converts our own tables between the type form and the builder form;
it does not emit drizzle. So the round trip needs a second translator written
only to serve as the oracle, and a bug in it reads as a bug in the real one.

**Byte-identical is the wrong bar for this pair.** The translation deliberately
adds bindings — `users$table` plus `const users = toDrizzle(users$table)` — and
sometimes a second import (`sql` and `rtSql` in one file, `Driz` and `rtDriz`).
Collapsing that back to the original text means reproducing decisions that depend
on how the file USES each name, so two files with the same tables and different
query code do not collapse the same way. The property would need so many
exceptions that it would stop proving much.

**Most of what it would prove is already proved, more cheaply.**

- The 1:1 interface map is machine-checked today. `gen-drizzle-manifest` extracts
  EVERY value export of each drizzle module and forces each to be `migrated` or
  `skipped` with a reason, and `validate()` refuses a `migrated` entry that its
  package does not export under the same name. `pnpm rtx core drizzle-manifest
  --check` gates it, and `drizzle-import-map.test.ts` pins the map the translator
  actually rewrites with against those manifests.
- Semantic equality per table is already fuzzed: `tableEquality.fuzz.spec.ts`
  builds random slim tables, materializes them, and diffs against a hand-written
  drizzle twin.
- The drizzle-e2e lane runs drizzle's OWN suites twice against the same database,
  translated and untranslated, and requires identical outcomes.

What none of those cover is the translator's SHAPE coverage: it only sees the
shapes drizzle's suites happen to write.

## Direction, if it is picked up

Cheaper things to do FIRST, in this order. Each is worth doing on its own and
together they may close the gap the round trip was for.

1. **More golden fixtures** in `internal/drizzlemigrate/migrate_test.go`, one per
   authoring shape. Already there: namespace imports, aliased imports, shadowed
   creators, schema-scoped tables, lazy indexes, idempotence, and each refusal.
   Not yet: `let` declarations, a table on an object property or in a class, a
   re-exported table, `satisfies` / `as const`, a `.tsx` file, JSDoc placement.
2. **A generated corpus** rather than a fuzzer: enumerate the manifest's migrated
   entries and emit one table per entry, in each dialect. That checks every entry
   translates at all, which is weaker than the round trip but needs no second
   translator, and it derives from the same manifests the boundary already uses.
3. **Materialized-table equality as the oracle**, not source text: for a
   generated drizzle schema, compare `getTableConfig(original)` against
   `getTableConfig(toDrizzle(translated))`. That is the property the round trip
   was really reaching for — the translation preserves the table's meaning — and
   it needs only the forward direction.

Only after those, if a gap remains, is the second translator worth writing.

## Done when

The gap is closed or shown not to exist: every `migrated` manifest entry is
exercised by a translation fixture, and there is a property test whose oracle
does not depend on a translator written for the test.
