---
type: fix
spec: guidelines
status: ready
created: 2026-08-09
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
