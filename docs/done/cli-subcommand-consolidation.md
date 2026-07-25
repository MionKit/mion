---
type: chore
spec: guidelines
status: done
created: 2026-07-24
---

# CLI architecture: consolidate on tsgo-style subcommands

**Status:** SHIPPED 2026-07-24 (Part A, PR #279). The uniform `args[0]`
subcommand surface (`serve` / `compile` / `gen` / `check`), the single
`resolveConfigPath` policy with parse-once threading, the retired `--one-shot` /
`--daemon`, `serve --sources project|stdin|ops`, `--json` everywhere, `check`
absorbing `gen --check`, the migrated JS spawn layer, and docs — Done-when #1,
#2, #4, #5, #6. (The `describe` verb, briefly part of the surface, was removed in
the same PR as low-utility — its type-shape output was near-identical to the type
and the `gen` scaffold already lays out the fields.)

**The dual-mode enrich follow-up (Done-when #3) is tracked as its own todo:
[docs/todos/dual-mode-enrich.md](../todos/dual-mode-enrich.md)** — making the
`gen` / `check` verbs daemon protocol ops with the CLI verbs as thin adapters
over one shared implementation, collapsing the two `check` orchestrations, and
the per-verb CLI≡daemon parity tests.

**Sequencing: implement AFTER [tsconfig-alignment.md](../done/tsconfig-alignment.md)
(SHIPPED 2026-07-24 — unblocked). It must inherit that todo's single
config-resolution seam untouched.**

## Intent

Exactly one user-facing binary exists (`ts-runtypes`; the WASM build is forced
separate by its compile target, and the other `cmd/` mains are internal `go run`
codegen and test tools). But the binary's mode dispatch mixes two conventions:
enrich rides tsgo-style `args[0]` subcommands (`describe`/`gen`/`check`,
`main.go:108`), while resolver modes are flag-selected (`--compile`,
`--inline-server`, `--inline-sources-stdin`, `--daemon`; declarations at
`main.go:147-208`, dispatch at `:393-496`). tsgo itself is an `args[0]` switch
(`--lsp` / `--api`) falling through to a single default tsc command (vendored
`cmd/tsgo/main.go:17-32`), and [ROADMAP.md](../ROADMAP.md):178 already envisions a
`ts-runtypes build` SUBCOMMAND. Consolidating on one convention makes the tool
read like tsc: one command, one config, the mode as the first word.

Cleanups to fold in: the `--one-shot` flag is inert (declared `main.go:149`,
never read; the JS side always passes it, `resolver-client.ts:490`), and
`docs/done/transform-cli-compile-command.md` still documents THREE pre-rename
names: the `--run-types-gen-dir` flag, the `runTypesGenDir` tsconfig key, and
the `resolveRunTypesGenDir` function (now `--gen-dir` / `genDir` /
`resolveGenDir` in `buildconfig.go`).

**Residue the tsconfig-alignment rework leaves for THIS todo (owner review,
2026-07-24).** Config resolution is now uniform and tsc-exact (one discovery
function `program.DiscoverTsconfig`, one parser `program.ParseInferredConfig`),
but the thin "explicit `--tsconfig` wins, else discover from cwd" POLICY
wrapper still exists twice, because the binary has two argv worlds: main's
flag parse (`main.go`, the seam serving build/daemon/one-shot/`--compile`) and
the enrich subcommands' own FlagSets, which dispatch BEFORE main
(`dispatchEnrichCommand` → `resolveEnrichTsconfig` in `config.go`). The enrich
lane also parses the resolved config twice (`resolveEnrichConfig` for
rootDir/genDir, then `buildProgram` again with the `"source"` condition).
Collapsing the argv worlds must leave the policy in exactly ONE function
called from exactly ONE entry, and each command run parsing its config ONCE
(thread the `InferredConfig` through instead of re-parsing).

**Owner directive (2026-07-24): enrich is NOT a pure CLI — every ts-runtypes
capability must work in BOTH CLI and daemon mode.** The goal is a UNIFORM
surface: mode stays orthogonal to capability, so nobody — user or tool — ever
has to reason about which transport supports what, and no capability exists in
one mode only. Today the enrich verbs (`describe` / `gen` / `check`, plus the
`--update` / `--prune` / `--translate` lanes) exist only as argv subcommands,
while the daemon protocol can run a check-shaped pass (the lint lane's
`checkEnrich` scan flag) but cannot describe or generate. The consolidation
must make the enrich operations protocol ops the daemon serves, with the CLI
subcommands as thin argv adapters over the SAME implementations — one function
per capability, two transports. (Consumer status, corrected 2026-07-24: the
parked plugin-driven enrichment sync feature (now Part B of
[../todos/enrich-surface-and-plugin-sync.md](../todos/enrich-surface-and-plugin-sync.md))
plans to spawn the CLI as a child process — "zero Go/protocol change",
its own words — so it is a LIKELY FUTURE consumer of the daemon-side gen, not
the driver; the uniform surface itself is the driver. Its hard constraint —
mirror writes must not trigger HMR — should still inform the gen op's
write-semantics decision so it can slot onto the op later without a redesign.)

## Direction

The implementer plans the details. Verified constraints and pointers:

- Candidate shape (adjust as needed): default = the tsc-like project scan
  (today's default stdio serve); `compile` (today `--compile`); `serve` (today
  `--inline-server`); `build` (ROADMAP:178); enrich stays `describe`/`gen`/
  `check`. Decide whether `--inline-sources-stdin` and `--daemon` become
  subcommands, merge, or retire — daemon mode currently has no production JS
  caller. Per-subcommand `flag.NewFlagSet`, like tsgo's lsp/api.
- **Naming must be coherent and collision-free (owner directive).** Careful
  with `serve`: the binary has THREE server-ish modes today — the default
  (stdio protocol serve), `--inline-server` (stdio serve, no startup Program),
  and `--daemon` (Unix socket) — so promoting one of them to `serve` invites
  confusion; name (or merge/retire) all three deliberately. Same discipline on
  flags: ONE spelling per knob across every subcommand — today `describe`
  selects JSON output via `--format text|json` while `check` / `gen --check`
  use a boolean `--json`; and "checking" is spread over three spellings
  (`check <file>`, `gen --check`, `check --translate`). Pick one convention
  per concept.
- The JS argv assembly is a single seam: `buildResolverArgs`
  (`resolver-client.ts:489-520`). Binary and JS packages version in lockstep
  (exact-pinned), so the argv contract can change atomically; decide whether to
  keep old flags as aliases for one release anyway.
- Shared knobs (`--tsconfig`, `--cwd`, `--emit-mode`, …) must mean the same thing
  under every subcommand; config resolution stays the one seam from
  tsconfig-alignment, reduced to a SINGLE policy function called from the
  single entry (see the residue note above).
- Dual-mode capabilities: design the protocol ops for describe/gen (check
  already partially rides `checkEnrich`) so the daemon serves them and the CLI
  subcommands wrap them. Mirror WRITES from the daemon need a decision (op
  returns content vs op writes like the CLI) — plan it with
  the plugin-driven enrichment sync's needs in view (now Part B of
  [../todos/enrich-surface-and-plugin-sync.md](../todos/enrich-surface-and-plugin-sync.md);
  its hard constraint: mirror writes must not trigger HMR).
- `check` is both the dual-mode template and the cautionary tale: it is the
  one capability already on both transports, but as two orchestrations that
  share the low-level helpers (`mirror`, `astcheck`) and DIVERGE — the CLI's
  `runCheck` (`cmd/ts-runtypes/enrich_check.go`) runs breadcrumb-drift
  unconditionally and reads DISK (`nil` FS), while the resolver's
  `checkEnrichFiles` (`internal/compiler/resolver/enrichcheck.go`) gates
  drift on `scan.HasMarkerComment()` and reads the Program OVERLAY (unsaved
  buffers); the `tagCode` mapping is duplicated in both files. A naive parity
  test fails on check TODAY. Collapse them into one implementation whose
  gating/FS differences are explicit parameters, and choose the unified
  drift-gating behavior deliberately.
- Out of scope: merging the WASM main (build-target constraint) or the internal
  `go run` codegen tools into the binary.

## Done when

- One dispatch convention: `args[0]` subcommands with per-subcommand FlagSets;
  the flag-modes and the dead `--one-shot` are gone.
- The "explicit flag, else discover" config policy lives in exactly ONE
  function called from exactly ONE entry; an enrich command run parses its
  config ONCE.
- Every enrich capability (describe / gen / check and their lanes) is reachable
  in daemon mode AND as a CLI subcommand, both driving the same implementation
  — pinned by a CLI ≡ daemon parity test per verb, where parity means same
  findings/output for the same file state (check's current CLI-vs-resolver
  drift-gating divergence resolved into ONE deliberate behavior first).
- Naming is coherent and collision-free across the surface: one spelling per
  knob under every subcommand (one JSON-output convention), no name serving
  two concepts (the three server-ish modes named or retired deliberately).
- The JS spawn layer is migrated; README and website CLI docs updated.
- Existing suites stay green.

## Plan — split into Part A + Part B (approved 2026-07-24)

Investigation (three Explore agents + a Plan agent) confirmed the change splits
cleanly, and that Part B is much smaller than feared: enrichment is already a
resolver-imported leaf, the write seam is already pure (`mirror.Scaffold` /
`mirror.Reconcile` do no I/O), and `check` already runs on Session state via
`checkEnrichFiles`. Owner decisions: **Part A first** (this PR), **proposed
naming scheme** confirmed.

### Target surface (naming — confirmed)

`main()` becomes a tsgo-style `args[0]` command table (no implicit default; JS
versions in lockstep so it always passes an explicit verb):

- `serve` — the one stdio protocol server; the three server-ish modes (default
  disk Program / `--inline-sources-stdin` / `--inline-server`) fold into
  `serve --sources project|stdin|ops` (default `project`).
- `compile` — today `--compile` (full tsc replacement: emits `.js` + cache).
  The ROADMAP pre-process/`build` mode is NOT reserved — when built it is most
  likely `compile --no-emit`, decided under its own todo.
- `gen` / `check` — the enrich verbs; `--json` everywhere; `check` absorbs
  `gen --check` (file target = single-file health, dir target = mirror-tree drift
  incl. GE001); `gen` is generation-only. (`describe` was briefly in this surface
  but removed as low-utility — see the Status note at the top.)
- `--daemon` RETIRES (no JS caller): delete `runDaemon` / `runOneShot` /
  `--socket` / JS `ResolverSocketClient`. `--one-shot` (inert) deleted.

Shared knobs mean the same thing under every verb (`--tsconfig`, `--cwd`,
`--gen-dir`, `--emit-mode`, `--inline-mode`, `--module-mode`, `--hash-length`,
`--size-*`, `--number-mode`, `--single-threaded`/`--no-single-threaded`,
`--no-parallel-*`, `--allow-unchecked-patterns`, `--pure-fn-report-*`).

### Part A — SHIPPED 2026-07-24 — Done-when #1, #2, #4, #5, #6

Landed as built (a couple of refinements vs the pre-build plan): `resolveConfigPath`
resolves the path only and defers existence to `ParseInferredConfig` (so the
`serve` daemon reports a bad `--tsconfig` per-op and stays alive to heal, instead
of crashing at startup); the enrich `"source"` condition was KEPT (behavior-
preserving, deferred to Part B); the ROADMAP `build` verb was NOT reserved (dead
surface — it will most likely be `compile --no-emit` under its own todo).

- `main.go` → command table + shared helpers (`resolveCwd`,
  `buildResolverOptions` with the old `hasTsconfig` gate as an explicit
  `readBuildPlugin` param, `newStdioSession` keyed on `--sources`).
- `config.go` → one policy `resolveConfigPath` from one entry; delete
  `resolveEnrichTsconfig`; `resolveEnrichConfig` takes a pre-parsed
  `*program.InferredConfig`.
- `enrich_cli.go` → `buildProgram`/`buildProgramMulti` consume the threaded
  config, parsed ONCE (kill gen's double-parse). The `"source"` condition is
  KEPT in Part A (behavior-preserving); its removal is a Part B parity concern.
- JS `buildResolverArgs` → `serve` + `--sources`; delete `ResolverSocketClient`.
- Tests: Go dispatch-routing + updated config/enrich tests; the 4 flag-pinning
  Vitest files. Docs: website CLI pages, `docs/COMPILER-DRIVEN-TRANSFORM.md`,
  `CLAUDE.md`, enrich skills; fix stale names in
  `docs/done/transform-cli-compile-command.md`.

### Part B split out to its own todo

The finalized Part B plan (dual-mode enrich protocol ops — Done-when #3) now
lives in [docs/todos/dual-mode-enrich.md](../todos/dual-mode-enrich.md); this doc
records only what shipped.
