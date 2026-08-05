# Official JSON Schema Test Suite lane

Runs the official
[JSON-Schema-Test-Suite](https://github.com/json-schema-org/JSON-Schema-Test-Suite)
(draft 2020-12: the required set plus `optional/format/`) against the schema
door, `createValidateFn(runTypeFromJsonSchema(schema))`, and pins the outcome.
The scoreboard lives in [CONFORMANCE.md](CONFORMANCE.md).

The suite arrives as a root devDependency pinned to a full commit SHA
(`json-schema-test-suite` in the root package.json), so nothing is vendored;
[scripts/core/gen-json-schema-suite.mjs](../../../../scripts/core/gen-json-schema-suite.mjs)
turns the installed JSON into this lane. Schemas must be strongly typed (the
resolver reads the literal TYPE at each call site, and TypeScript widens JSON
imports), which is why the generator emits real `as const` call-site modules
under `generated/` — gitignored build output, rebuilt by `pnpm run
check:builds` (the `suite-modules` target in scripts/core/build.mjs).

## The pipeline

1. `node scripts/core/gen-json-schema-suite.mjs triage` — classify every suite
   group into the committed [triage.json](triage.json) by type-probing a
   one-call-site snippet against the door's `ExactJsonSchema` contract.
   Run only when the suite pin changes (seconds to minutes of tsc work).
2. `node scripts/core/gen-json-schema-suite.mjs generate` — emit the typed
   modules (also runs via `check:builds`). Fails loudly when triage.json was
   derived from a different suite commit than the lockfile pins.
3. `pnpm exec vitest run --project json-schema-official` — the lane.
   [official.test.ts](official.test.ts) soft-records every verdict, then
   hard-asserts the TWO-WAY ledger pin: every divergence must be in
   [known-divergences.json](known-divergences.json), and every ledger entry
   must still reproduce. Regressions and silent improvements both go red.
   The run writes `results.json` (gitignored) even when red.
4. `node scripts/core/gen-json-schema-suite.mjs report [--update-ledger]` —
   rewrite [CONFORMANCE.md](CONFORMANCE.md) from results.json;
   `--update-ledger` reconciles the ledger with observed reality (preserving
   hand-edited `byDesign` / `note` fields on surviving entries).

## Verdict taxonomy

- **conforming** — our verdict matches the suite label.
- **divergent (byDesign)** — deliberate policy: the required-set `format.json`
  and `content.json` test annotation-only semantics while RunTypes enforces
  formats and content keywords (same stance the bench spec corpus documents).
- **divergent (open)** — a real conformance gap, recorded, not yet fixed.
- **unsupported-input** — the door's typed input contract rejects the document
  (unknown keyword, cross-document `$ref`, …); no call site is generated.
- **proto-literal** — the group contains a `__proto__` key, which cannot be
  emitted as an object literal (it would set the prototype).
- **remote** — needs the suite's `localhost:1234` remotes server (out of
  scope, as is all of refRemote.json).
- **transform-halt** — hand-quarantined in [quarantine.json](quarantine.json):
  a group that kills a whole module's transform. Currently none.
- **build-rejected** — runtime outcome: the resolver marked the entry
  Error-severity, so building/calling the validator throws (the lane boots
  anyway via `failOnError: false`). Currently none.

## Upgrading the suite

1. Bump the SHA in the root package.json specifier, then
   `pnpm install --no-frozen-lockfile`.
2. `node scripts/core/gen-json-schema-suite.mjs triage` then `generate`.
3. Run the lane; on divergence churn, `report --update-ledger`, review the new
   entries' `byDesign` flags, and re-run until green.
4. `report` to refresh CONFORMANCE.md; commit triage.json, the ledger and the
   report together with the lockfile bump.
