---
type: chore
spec: guidelines
status: ready
created: 2026-07-24
---

# CLI architecture: consolidate on tsgo-style subcommands

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
parked [plugin-driven-enrichment-sync.md](plugin-driven-enrichment-sync.md)
feature plans to spawn the CLI as a child process — "zero Go/protocol change",
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
  [plugin-driven-enrichment-sync.md](plugin-driven-enrichment-sync.md)'s
  needs in view (its hard constraint: mirror writes must not trigger HMR).
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
