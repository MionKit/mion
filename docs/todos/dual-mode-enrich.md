---
type: feature
spec: full-plan
status: ready
created: 2026-07-24
---

# Dual-mode enrich: make gen / check daemon protocol ops

**Prerequisite: the CLI subcommand consolidation SHIPPED** (Part A, PR #279 —
[docs/done/cli-subcommand-consolidation.md](../done/cli-subcommand-consolidation.md)).
This is that todo's deferred Done-when #3. (The `describe` verb was removed as
low-utility, so this covers the two remaining enrich verbs: `gen` and `check`.)

## Intent

After the consolidation, the enrich verbs (`gen` / `check`) exist
ONLY as one-shot CLI runs, each building its own throwaway Program — while the
resolver daemon can run a check-shaped pass (the `checkEnrich` scan flag) but
cannot generate. The owner's uniform-surface goal wants mode
orthogonal to capability: **every enrich capability reachable BOTH as a CLI verb
AND as a daemon protocol op, over ONE shared implementation** (one function per
capability, two transports). Investigation confirmed it's well-supported:
enrichment is already a resolver-imported leaf package, the write seam
(`mirror.Scaffold`/`Reconcile`) is already pure (no I/O), and `checkEnrichFiles`
already runs the check against Session state.

Parked consumer note: [plugin-driven-enrichment-sync.md](plugin-driven-enrichment-sync.md)
plans to spawn the CLI as a child process (zero protocol change), so it is a
LIKELY FUTURE consumer of the daemon-side gen, not the driver. The uniform
surface itself is the driver; its hard constraint — mirror writes must not
trigger HMR — is why the gen op returns content rather than writing.

## Plan — ONE PR, built refactor-first

Steps 1-3 make the CLI a thin adapter over shared, transport-agnostic functions
(existing enrich suites gate it); steps 4-6 add the daemon transport; step 7 is
the parity gate.

1. **Extract `internal/enrichment/enrichgen`** (new leaf pkg). Move `enrichConfig`
   + its resolution (`resolveEnrichConfig`, the `mirrorPath` family) out of
   `ts-go-runtypes/cmd/ts-runtypes/config.go` (params, no `fatal`, return
   `error`), plus the pure orchestration as `PlanScaffold(resolved, cfg, want,
   out) → ([]mirror.Spec, error)`; content via `mirror.Scaffold` /
   `mirror.Reconcile`. **Seam fix: lift `migrateLegacyMirror` OUT of `groupSpecs`**
   (`enrich_cli.go:280`) — it does disk I/O, so spec-building must be pure;
   migration stays a CLI-only pre-step. `writeMirrorFile` / `updateMirrorFile`
   stay in `cmd/` as the disk shims; the daemon handler collects
   `{Path, Content, Added}` instead of writing. `existing` is injected (CLI and
   daemon both read disk, so parity holds).
2. **Collapse the two `check` orchestrations** into one
   `CheckFile(sourceFile, checker, cache, fs, filePath) []Finding` (in
   `internal/enrichment`, the home of the duplicated `tagCode`): tag hygiene
   (`DirtyTags`) + `astcheck.CheckSourceFile` + breadcrumb drift, **drift gated on
   `scan.HasMarkerComment()`** (resolver behavior wins), FS injected. Resolver
   `checkEnrichFiles` (`internal/compiler/resolver/enrichcheck.go`) and CLI
   `runCheck` (`cmd/ts-runtypes/enrich_check.go`) both delegate; delete the
   duplicated `tagCode`. NOTE: this changes CLI `check` to gate drift on the
   marker comment and read the Program FS — reconcile the gencheck / single-file
   check test expectations to the unified behavior.
3. **Drop `"source"` + thread `hashLength`.** Remove the two `"source"`
   injections: `config.go` `resolveEnrichProject`'s
   `ParseInferredConfig(…, "source")` and `enrich_cli.go` `buildProgram` /
   `buildProgramMulti`'s `Conditions:["source"]`. Thread the project `hashLength`
   into the enrich `resolver.Options{}` (today hardcodes only `Cwd`, at
   `enrich_cli.go:62,87`) so gen's hash-sensitive `@rtType` ids match a build.
   **Source-drop fix (verified):** the `enrichGen` / `enrichCheck` suites are the
   ONLY breakage — their spawns set no cwd, so the CLI discovers the ROOT
   `tsconfig.json` (no `customConditions`), and their temp modules import
   `@ts-runtypes/core/formats` whose format constraint params only project when
   resolved to `src` (via `"source"`). Point the two `enrichGen.ts` spawns
   (`packages/ts-runtypes/test/util/enrichGen.ts:83` gen-files, `:161` check) at
   `--tsconfig <abs>/packages/ts-runtypes/tsconfig.test.json` (already carries
   `customConditions:["source"]`), mirroring `packages/ts-runtypes/vitest.config.ts`.
   Do NOT add `customConditions` to the discoverable root/package `tsconfig.json`
   (leaks `"source"` into `pnpm build`'s dist emit). The other 4 harnesses use
   plain interfaces / inline format brands — safe.
4. **Protocol ops** (`internal/protocol/protocol.go`): add `OpEnrichGen` /
   `OpEnrichCheck` constants; Request fields `TypeName`, `EnrichFriendly` /
   `EnrichMock` / `EnrichUpdate`, `GenDir`; Response
   `EnrichFiles []EnrichFile{Path,Content,Added,Kind}` —
   **REGISTERED in the hand-rolled `Response.MarshalJSON`** (precedent: SiteFiles,
   FailOnError). `check` reuses the existing `Diagnostics` channel.
5. **`dispatchEnrich*` handlers** (`internal/compiler/resolver/dispatch.go`): a
   `case` per op guarding `sess.Program == nil`, calling the SAME shared functions
   with `sess.Program`, `sess.checker`, `sess.cache`, `sess.Program.FS`. No new
   import cycle (resolver already imports `enrichment` via `enrichcheck.go`).
6. **JS** (`packages/ts-runtypes-devtools/src/resolver-client.ts`): `enrichGen` /
   `enrichCheck` methods on `ResolverClientBase` (model on `generate()`), added to
   the `ResolverConnection` interface; `protocol.ts`: extend the `Request.op`
   union + Request/Response fields + an `EnrichFile` interface. The lint lane is
   unchanged (keeps `scanFiles({checkEnrich})`).
7. **Per-verb CLI≡daemon parity tests** (`cmd/ts-runtypes/enrich_parity_test.go`
   + one Vitest wire e2e through `ResolverClient` issuing the two ops): per verb,
   drive an in-process `resolver.Session` dispatch AND the CLI shared-fn path over
   one fixture and assert equal output — byte-identical `{Path,Content}` incl.
   `--update` (gen), same codes+sites (check). Fixture tsconfig carries
   `customConditions:["source"]`; pin the SAME `hashLength` on both sides.

## Settled sub-decisions

- The gen daemon op RETURNS content, never writes (plugin-driven-enrichment-sync's
  no-HMR constraint); the CLI keeps `atomicWriteFile`.
- `migrateLegacyMirror` is a CLI-only pre-step, skipped by the daemon op.
- The `check` daemon op has no production consumer yet (parity-test + future) —
  the accepted cost of the uniform surface.

## Done when

- Every enrich capability (`gen` / `check` and their lanes) is
  reachable in daemon mode AND as a CLI subcommand, both driving the same
  implementation — pinned by a CLI ≡ daemon parity test per verb, where parity
  means same findings/output for the same file state (check's CLI-vs-resolver
  drift-gating divergence resolved into ONE deliberate behavior first).
- Existing suites stay green; new front-end (Vitest) coverage for the wire ops.
- Docs updated where the execution model / CLI surface is described.
