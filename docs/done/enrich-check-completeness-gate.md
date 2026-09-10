---
type: fix
spec: guidelines
status: ready
created: 2026-09-10
---

# `mion enrich` check: wrong-content findings no longer fail the run

## Evidence

`go -C ts-go-runtypes test ./cmd/mion -run TestReportEnrichDiagnostics_CompletenessGate` fails on
`main`:

```
enrich_completeness_test.go:47: MD021 must fail under --require-complete; exit=0, want 1
enrich_completeness_test.go:55: a wrong-content error must fail even when a @todo is present; exit=0, want 1
```

`reportEnrichDiagnostics` (`ts-go-runtypes/cmd/mion/enrich_check.go`) decides the exit code from
two things: the completeness bit under `--require-complete`, and `diag.Level != LevelWarning` for
everything else. The wrong-content codes the test feeds it (`CodeFriendlyUnknownField`,
`CodeFriendlyOrphanConst`, `CodeMockUnknownField`, `CodeMockOrphanConst`) come back with exit 0,
so at least one of them is no longer reported at a level that fails the run. The most likely
cause is the diagnostics level split (Error into fatal Error and RuntimeError) that landed on
`main` shortly before: the test's `mkEnrichDiag` helper, the catalog level of those codes, or the
gate's level check drifted apart.

This test is NOT in CI: the Go gate runs `go test ./internal/...` only, so `cmd/mion` tests can
rot without anyone noticing.

## Intent

- A stale or malformed enrichment mirror (an unknown field, an orphan constant) must fail the
  `enrich` check in both lanes (default and `--require-complete`), and a `@todo` next to it must
  never mask that. Restore that and make the existing test pass, fixing whichever side (catalog
  level, helper, or gate) is actually wrong rather than loosening the test.
- Decide whether `cmd/mion` tests belong in the Go CI step (`go test ./internal/... ./cmd/...`)
  so the next drift is caught; if they are excluded on purpose, record why next to the workflow
  step.

## Repro

```bash
go -C ts-go-runtypes test ./cmd/mion -run TestReportEnrichDiagnostics_CompletenessGate -v
```

## Plan (2026-09-10)

Root cause: the level split re-read every enrichment content code as `LevelWarning` (degraded text is
enrichment that did not apply, not broken output), which is the right level for a BUILD. The three
enrichment gates still decided "wrong content" from the level, so every non-completeness finding
stopped failing: the single-file check (`reportEnrichDiagnostics`), the tree walk (`runGenCheck`, whose
hygiene findings were mapped through `severityFromDiag`), and the devtools production gate
(`enrichDriftGate` in `packages/devtools/src/core/unplugin.ts`, which filtered on
`level !== Warning`). All three receive findings that are either INCOMPLETE (the catalog's
`Completeness` bit) or WRONG; the catalog says so and says the gates must key on that bit.

1. `cmd/mion/enrich_check.go`: a completeness finding fails only under `--require-complete`; any
   other finding fails. No level test. Fix the stale "Error severity" comment on the worklist printer.
2. `cmd/mion/enrich_gencheck.go`: hygiene findings get their severity from the policy (completeness
   → Warning, carcass → Error) instead of the catalog level; the exit decision moves into
   `genCheckExitCode` so it can be unit-tested. Cosmetic `GE001` stays a non-failing warning.
3. `packages/devtools/src/core/unplugin.ts`: the production gate keeps every finding the enrich op
   returns (all hygiene: incomplete or stale) and names the stale carcass in its failure line.
4. Tests: the existing Go gate test passes unchanged; a new Go test pins `genCheckExitCode` and the
   hygiene severity per code; a new vitest case pins that an in-sync mirror carrying an
   `@rtOrphanChild` carcass fails a production build.
5. CI: `go test ./internal/... ./cmd/...` in `ci.yml`, `release-gate.yml`, `bump-tsgolint.mjs`, and
   the CLAUDE.md spellings, so `cmd/mion` tests cannot rot again.
6. Docs: one clause on the configuration page, the production gate also fails on a stale carcass.
