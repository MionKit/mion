---
type: fix
spec: guidelines
status: done
created: 2026-08-09
completed: 2026-08-14
---

# Narrow program roots silently drop ambient declarations (lint, dev HMR, convert, enrich)

## Problem

Several lanes build the checker's Program from the files they were HANDED rather
than from the tsconfig's own file set. Anything tsc would add WITHOUT an import
— a `.d.ts` in the include set declaring globals, `types` / `typeRoots`
auto-inclusion — is therefore absent, the checker answers `any`, and every
downstream artifact is computed from that `any`. No diagnostic, exit code 0.

    // src/ambient.d.ts  (in the tsconfig include, imported by nothing)
    declare interface Ambient {a: string; b: number}

    // src/main.ts
    getRunTypeId<{value: Ambient}>();           // A
    getRunTypeId<{value: {a: string; b: number}}>();  // B

Measured through the real daemon, one session, same file content:

    project-mode scan (program.New)   A = MEeIoME   B = MEeIoME   ← agree, correct
    after one setSources              A = SmkgIg6   B = MEeIoME   ← A is now {value: any}

`ts-runtypes compile` and the Vite plugin's INITIAL build take `program.New`
(the tsconfig's own file list) and are correct. What matters is which lanes do
not:

| Lane | Program | Ambient declarations |
| ---- | ------- | -------------------- |
| `compile`, plugin build start (`serve --sources project`) | `program.New` from the config file list | seen |
| Vite dev server, after the FIRST edit (`unplugin.ts` watchChange → `setSources`) | `NewInferred`, roots = the edited file | **lost** |
| Lint (oxlint / ESLint, `serve --sources ops`) — every request | `NewInferred`, roots = the linted file | **lost** |
| `convert` CLI | `NewInferred`, roots = the named files | **lost** |
| `enrich` CLI | `NewInferred`, roots = the target file | **lost** |

The narrow program still resolves everything reachable by module resolution
(imports are read through the overlay FS from disk), so this is not "the daemon
sees one file". It loses exactly what nothing imports.

`setSources` REPLACES the session Program, so in a dev server the degradation is
sticky: one edit re-roots the whole session at that file.

## Why it is worse than a wrong answer

Nothing crashes — that is the problem. When `T` degrades to `any`:

- the emitted validator is the always-true identity, the mock is `undefined`,
  encoders pass values through;
- the structural id CHANGES, so a different cache module is generated — dev and
  build silently disagree about the same call site;
- lint computes its diagnostics against the degraded type, so it can neither
  report nor reproduce what the build sees;
- `convert` writes the degraded type INTO the user's source (`RT.any()`), which
  is permanent.

No path was found where this throws. Silent acceptance is the whole failure.

## Prior art in this repo

Two guards already exist for exactly this shape — "the resolved type is `any`
and the author did not write `any`" — each covering one cause:

- `TMP001` (`resolver/temporal_guard.go`): a written `Temporal.<Name>` that
  resolved to `any` because the lib is missing.
- `MKR007` (`resolver/unresolved_import_guard.go`): the site's `T` is `any` AND
  the file has an import whose bindings do not resolve.
- `CNV007` (`convert/set.go`): the convert-side twin of TMP001.

The missing cause is the third one: `any` from an unresolved BARE TYPE NAME.
Note also that MKR007's own comment rules out a program-level
semantic-diagnostics pass in the scan path — it "acquires additional pool
checkers and can starve the pool mid-scan". That constraint applies to the hot
scan lane, NOT to the one-shot CLIs.

## Fix direction

Two independent pieces. The first removes the cause, the second makes the
failure impossible to have silently.

### 1. Give the inferred Program the project's roots

`ParseInferredConfig` already parses the full `ParsedCommandLine` — it has the
file list and throws it away, keeping only `CompilerOptions`
(`compiler/program/inferred_config.go`). Carrying the file names on
`InferredConfig` and unioning them into `NewInferred`'s roots is small at the
plumbing level. The conversion / scan SET stays the caller's file list, so
`BuildSet`, CNV004 and the per-file scan semantics do not move — only what the
checker can see.

The open question is cost, and it differs per lane:

- `convert` / `enrich` are one-shot batch tools: root the whole project, done.
- the daemon's `setSources` runs per lint request and per keystroke-ish HMR
  edit. Rooting the whole project there is exactly the regression `NewInferred`
  exists to avoid. **Rooting only the `.d.ts` members of the include set** is
  the middle ground worth measuring first: declaration files are cheap to parse
  and are precisely what carries globals.

Measure before choosing. A lint request that goes from milliseconds to seconds
is not an acceptable trade for this.

### 2. Refuse instead of computing from `any`

Extend the guard family with the unresolved-name cause: walk the WRITTEN type
syntax (as `detectTemporalNotLoaded` already does), and for every
`TypeReference` whose resolved type is `any`, decide whether the NAME resolved.
A written `any` / `unknown` keyword is not a `TypeReference`, so deliberate
`any` stays legal for free; `type Foo = any` resolves to a real symbol and must
stay legal too.

Three candidate tests, cheapest first:

- **`Program_GetSemanticDiagnostics`** — already exposed in the shim, unused so
  far. For the one-shot CLIs this is exact and free of new machinery: a file
  with `TS2304 Cannot find name` should not be rewritten at all. Convert
  arguably should refuse ANY file that does not typecheck.
- **Symbol lookup on the reference's name** — needs a `getSymbolAtLocation`-shaped
  accessor the shim does not currently export.
- **`errorType` identity** — the exact test (an unresolved name resolves to the
  checker's error type, which carries the `Any` flag but is a distinct type
  object). The field is present on the shim's mirrored struct but no accessor is
  generated for it.

⚠️ The last two need an entry in `third_party/tsgolint/shim/.../extra-shim.json`,
which is OFF-LIMITS without the patch workflow. **Do not edit it. If the chosen
design needs a new checker accessor, STOP and surface the case first** (SETUP.md
→ Patching tsgolint). Prefer a route that needs none.

## Tests

`TestTsconfigParity_BuildLaneEqualsDaemonLane`
(`resolver/tsconfig_parity_test.go`) is already the oracle for "one tsconfig,
one behavior" — it scans one fixture through the build lane and the daemon lane
and demands identical ids. It passes today only because it hands the daemon
lane EVERY file as a source, which production never does.

- Add a row whose daemon lane sends ONLY the consumer file, with the rest on
  disk — production's actual shape.
- Add an ambient-declaration fixture (`declare interface …` in a `.d.ts` nothing
  imports) to that row. It fails today; it is the regression pin.
- Convert / enrich: an ambient-typed declaration converts faithfully, and a file
  with an unresolvable type name refuses instead of writing `any`.

## Done when

The lanes in the table agree with `tsc` about a project's ambient declarations,
or refuse loudly where they cannot; the parity oracle covers the single-root
daemon shape; and the per-lane cost of widening the roots is recorded in the PR
so the choice can be re-litigated with numbers rather than guesses.

## Plan — approved 2026-08-14

Key discovery during planning: **no shim/patch edits are needed anywhere.** The
shim packages alias the upstream types (`type ParsedCommandLine =
tsoptions.ParsedCommandLine`, `type Type = checker.Type`, `type IntrinsicType =
checker.IntrinsicType`), so the exported methods `FileNames()`, `Type.Flags()`,
`Type.Alias()`, `Type.AsIntrinsicType()` and `IntrinsicType.IntrinsicName()`
are already callable. Upstream `checker.isErrorType` is `t == c.errorType ||
(t.flags&Any != 0 && t.alias != nil)`, and `errorType` is the intrinsic named
`"error"` (`anyType` is `"any"`) — so the EXACT "resolved to `any` but not
written as `any`" identity test is reproducible verbatim, including the
transitive `type Foo = Bar`-with-Bar-missing case the symbol-lookup sketch
would miss. This replaces the `Program_GetSemanticDiagnostics` route entirely
(decided with the user at plan time: refuse on the precise error-type identity,
not on blanket semantic diagnostics).

### Part 1 — roots

`InferredConfig` carries the parsed config's `FileNames()`; callers compose
their own roots via `program.UnionRoots`:

- daemon `setSources` + `serve --sources stdin`: union the config's **`.d.ts`
  members only** (cheap to parse, carries the globals, and — decisive —
  `scanAllProgramFiles` skips declaration files, so OpDump/OpGenerate/enrich-op
  behavior does not widen; full-project rooting there would).
- `convert` / `enrich` CLIs: union the **full** config list (one-shot; exact
  tsc agreement). `convert --out-dir` re-roots config members under the copied
  rootDir into the copy so originals and copies are never double-rooted.
- The conversion/scan SET stays the caller's file list (`BuildSet`, CNV004,
  per-file scan semantics unchanged).

Known residual gap (documented, made loud by part 2): globals declared in a
non-imported plain `.ts` script file are still missed by the daemon lanes.

### Part 2 — guards

- `marker.IsErrorLikeAny(t)` — the shared identity test above.
- **MKR013** (resolver, both scan guard sites): written-syntax walk (TMP001
  shape, skipping `Temporal.*` which TMP001 owns) + a slot-level check on the
  resolved type argument so the reflect form is covered; skips calls where
  MKR007 already fired. Written `any` / `type Foo = any` stay legal by
  construction (true `anyType` fails the identity test).
- **CNV008** (convert): per-declaration walk twin (CNV007 shape); refuses the
  declaration, source untouched, exit 1.
- Enrich: same detection over target declarations; skip + nonzero exit.

### Tests

Parity oracle gains a `daemonOnly` sources knob + two rows (production
single-root shape; ambient `.d.ts` — the regression pin), MKR013 joins the
tripwire list. New Go suites: `unresolved_name_guard_test.go`,
`inferred_config` additions, convert `unresolvedname_test.go` + faithful
ambient conversion, enrich faithful + refusal (re-exec pattern), and a
`NewInferred` roots benchmark. JS: `ambient-declarations.test.ts` (daemon,
both marker shapes, HMR stickiness, MKR013 loudness) + convert-cli e2e
faithful/refusal rows. Fuzzing: not a candidate (fix; no cheap oracle — a
lane-parity fuzzer would build a Program per case).

## Shipped — 2026-08-14

Both parts landed as planned; deltas from the plan were nil. Per lane:

| Lane | Roots now | Guard |
| ---- | --------- | ----- |
| daemon `setSources` (lint + HMR), `serve --sources stdin` | request roots ∪ config `.d.ts` members | MKR013 (walk + reflect-form slot probe; yields to TMP001 / MKR007) |
| `convert` CLI | targets ∪ full config list (`--out-dir` re-roots copied members) | CNV008 per declaration, source untouched, exit 1 |
| `enrich` CLI | targets ∪ full config list | `enrichgen.Plan` refuses; `PlanMany` (daemon sync) skips |
| `compile`, plugin build start | unchanged (`program.New` already rooted the config list) | MKR013 via the shared scan |

The enrich refusal took the shared-plan seam (`enrichgen.Plan`) instead of a
CLI-side re-exec fatal, so the daemon single-type OpEnrich inherits the same
contract; enrich tests assert Plan's error directly (no re-exec needed).

### Measured cost of widening the roots (the open question)

`BenchmarkNewInferred_RootModes` (`internal/compiler/program/roots_bench_test.go`),
200 unimported modules + 4 ambient `.d.ts` + 1 consumer, Linux amd64, count=3:

| Roots | ns/op | delta |
| ----- | ----- | ----- |
| single file (old daemon shape) | 46.7–49.7 ms | — |
| single file + config `.d.ts` (new daemon shape) | 45.4–46.7 ms | within noise (lib parse dominates); +~280 allocs |
| full config list (one-shot CLI shape) | 48.2–50.0 ms | +4–6%, +2.6 MB, +17.8 k allocs; scales with project size |

The `.d.ts`-only union is effectively free per lint request / HMR edit, so the
todo's "milliseconds to seconds" risk did not materialize. The full-list union
is reserved for the one-shot CLIs, where it is paid once — and in the daemon it
would also have widened the whole-program ops (OpDump / OpGenerate / OpEnrich
walk non-declaration program files), a behavior change, not just a cost.

### Known boundaries (documented in ARCHITECTURE.md / MKR013's detail text)

- A global declared in a non-imported plain `.ts` SCRIPT file (not `.d.ts`) is
  still outside the daemon lanes' roots — MKR013 reports it loudly instead of
  the old silent `any`; the one-shot CLIs see it via the full-list union.
- The config file list is parsed once per daemon session: a newly ADDED `.d.ts`
  needs a dev-server / lint-process restart (stated in MKR013's fix text).
- Guard locality matches TMP001/MKR007: a reflect-form value whose type nests
  an error-any member below the top level is not detectable at the call site.
