---
type: fix
spec: guidelines
status: ready
created: 2026-09-09
---

# Split Error into fatal errors and runtime-guaranteed errors

## Intent

"Error" today means two unrelated things, and the difference is the one that
matters: **can the build still emit code or not.**

- Some errors mean the build cannot produce output at all. An invalid tsconfig
  (`CFG001`, "nothing can run until it loads"), a pure-function extraction
  failure (`PFE9xxx`), a type whose id cannot be computed (`MKR003`, `MKR010`).
- Some mean output IS produced and is broken at runtime. That covers two
  shapes, and both belong on the same level. The loud one is `VL002`'s "the
  generated function will always fail". The quiet one is a type that resolved to
  `any`, where the build succeeds and the validator then accepts every value:
  `TMP001` (the Temporal lib is missing from `lib`), `MKR007` (an unresolved
  import), `MKR013` (a name that failed to resolve), which the marker catalog
  already calls the silent-any guard family, plus `CFG002` where a `lib` with no
  base edition leaves "reflected types cannot be trusted". These read like
  config failures and are easy to mistake for fatal, but the build emits, so
  they are RuntimeErrors.
- And roughly twenty mean neither. `MRT001-005` are route lint rules the build
  never even asks for. `FT020` / `MD020` are unfilled enrichment scaffolds, so
  the app runs with blank labels. `BAT001` just ships the batch without an id,
  which one of its own tests asserts. `EXP001-003` report a wrong comment.

Because the levels are lumped, a blank label can stop a bundler build while a
route-rule finding cannot stop anything, and neither outcome was designed. The
goal is three levels that say what they mean, so a consumer knows what it is
allowed to do without reading the catalog.

## Direction

Three levels. The implementer settles the details.

| Level | Meaning | What a consumer does |
| --- | --- | --- |
| Error | The build cannot produce code | Stop. Never downgradeable, never silenceable |
| RuntimeError (new) | Code is emitted, and it throws or is wrong when called. "Wrong" includes a validator that accepts everything | Report it. Emitting and exiting non-zero is legitimate |
| Warning | Worth knowing, nothing is wrong | Report it |

`Error` keeps its current name and level, so the fatal cases stay put and only
the emit-but-broken ones move.

**The open question to settle first: is RuntimeError a new severity, or a policy
bit on `Definition`?** Both have precedent and the answer is not obvious.

- Against a new severity: `SeverityLabel` returns "the canonical lowercase
  string used by `tsc --pretty=false` and VS Code's `$tsc` problem matcher"
  (`internal/diagnostics/catalog.go`). A label that matcher does not know would
  quietly degrade editor problem matching. Several places switch on
  `Severity.Error` and a new enum value stops matching them silently rather
  than failing to compile.
- For a policy bit: `Definition` already carries two, `Completeness` and
  `Transient`, each documented as "ORTHOGONAL to Severity". Notably
  `FT020` / `MD020` are already `Completeness: true`, so part of this problem is
  half-solved by that pattern already.

**The concept already exists, hardcoded as one family.** Four places treat
pure-fn as fatal by name, and a per-code answer would delete all four:

- `packages/devtools/src/core/unplugin.ts` — the `d.family === Family.PureFn`
  surfacing call that halts regardless of configuration
- `ts-go-runtypes/internal/diagnostics/downgrade.go` — twice: a pure-fn code
  cannot be listed in `downgradeErrors`, and the wildcard skips it
- `ts-go-runtypes/internal/diagnostics/expecterror.go` — a pure-fn code cannot
  be silenced by an `@mion-expect-error` comment

Whatever shape RuntimeError takes, those three rules must follow the fatal
level rather than the pure-fn family: a fatal Error is never downgradeable and
never silenceable, exactly as pure-fn is today.

**The bulk of the work is the classification pass, and it covers EVERY code, not
just the errors.** 181 codes today: 112 errors and 69 warnings. Each one gets
the same two questions asked honestly:

1. If we let this through, does the build still produce output?
2. If it does, is that output broken when it runs?

No → Error. Yes and yes → RuntimeError. Yes and no → Warning.

Both directions are in play. Some of today's errors will come down, including
builds that fail now and would stop failing. Some of today's warnings may go up:
a warning that describes emitted code which misbehaves is a RuntimeError, and
the only way to know is to read all 69. Record the verdict per code so the next
reader does not have to re-derive it.

**The rules go in CLAUDE.md.** The point is that every future diagnostic picks
its level by the same question, so the guidance has to live where an author
will read it, next to the existing Scope rule.

## Done when

- Every one of the 181 codes has been re-read and carries a level chosen by the
  two questions above, warnings included. The verdict is recorded per code, and
  defended in the catalog wherever it is not obvious.
- The four hardcoded pure-fn checks are gone, replaced by the level.
- `downgradeErrors` and `@mion-expect-error` both refuse fatal Errors and both
  accept RuntimeErrors.
- CLAUDE.md states the three levels and the question that picks between them.
- The website's diagnostics page explains the three levels to a reader, and the
  per-lane behaviour table there still tells the truth afterwards.
