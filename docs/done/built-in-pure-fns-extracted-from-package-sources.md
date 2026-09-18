---
type: chore
spec: guidelines
status: done
created: 2026-09-17
---

# Extract the built-in pure fns from the package's own sources, not a Go table

## Intent

`ts-go-runtypes/internal/cachegen/builtinpurefns/table.generated.go` held the compiled JS bodies
of the 46 package-owned pure fns as a committed Go file (62 KB), regenerated from
`packages/run-types/src` by `cmd/gen-builtin-purefns` and drift-checked by
`pnpm miondevx core codegen all --check`.

The table existed for a good reason: it is how a published consumer, whose program sees only
run-types' `.d.ts`, receives the built-in bodies on demand (`serveBuiltinPureFns` in
`internal/compiler/resolver/dispatch.go`), which is what lets the dist ship hollowed
(`scripts/core/hollow-builtin-purefns.mjs`) and keeps roughly 11 KB out of every consumer bundle.
That saving is not negotiable.

What was wrong is only WHERE the bodies lived: compiled JS committed as Go source, baked into the
binary, kept in sync by a codegen lane. A table of extracted bodies is a build output.

## What shipped

The original plan was to move the table into a JSON build artifact shipped with the package. That
is NOT what landed, twice over.

First, there is nothing to ship: the published tarball **already ships `src`**
(`packages/run-types/package.json` `files`), and a full extraction of the registration modules
takes **~145 ms**, once per session. So the bodies are extracted on demand from the package's own
sources, with no artifact and no second copy to drift from.

Second, the id scheme changed under this work. An id used to encode the file, so the first cut
decoded a demanded id to find its source. An id is now the package plus a hash of the body that
ships, which says nothing about where the body lives. The final design matches a demanded id
against what extraction produces, and never decodes it.

### The pieces

- **`table.generated.go` is gone** (62 KB of compiled JS committed as Go source), along with the
  table renderer in `cmd/gen-builtin-purefns` and the table row in the codegen outputs.
- **`purefunctions` produces the ids; `builtinpurefns` does not.** `resolveCtx`
  (`purefunctions/resolve.go`) already resolves a registration recursively and memoises it,
  following a dependency through its import, because an id is the hash of a body carrying its
  dependencies' ids. The loader only chooses which files to hand that resolver, and indexes what
  comes back.
- **It reuses the session's resolver whenever it can.** When the session's program already holds
  the marker sources (in-repo, via the `source` condition), the loader passes the session's checker
  and `FileCache`, so every id resolves against the session's single `resolveCtx`. Two resolvers
  hashing the same bodies would split one function into two entries; a test pins that both lanes
  agree. Only a program that does not hold those sources, a published consumer, builds a Program of
  the loader's own.
- **The source files are found, not declared.** The loader reads the package's `src` and keeps
  whatever calls a registrar, so a file that registers cannot be missed. Two alternatives were tried
  and both miss one: following imports from the entry points drops `circular-pure-fns.ts`
  (side-effect imported by nothing), and a declared list in `package.json` drops whatever someone
  forgets to add. `cmd/gen-builtin-purefns` runs the same scan. The scan descends through
  `GetAccessibleEntries`, not the FS's `WalkDir`, which on an overlay filesystem delegates to real
  disk and never sees a virtually served package.
- **Served entries drop their source-position bookkeeping** (`FactoryArgStart/End`,
  `IDInjectPos/Text`, `FilePath`). Those drive the rewrite of the call site an entry came from, and
  a served built-in's call site is inside the installed package: rewriting it would dangle an
  import into a consumer's dependency. `BindingName` stays, because a diagnostic and the build
  report name a built-in by it and the hash is unreadable.
- **A new `CFG004`** fails the build when the sources cannot be read or type checked, naming the
  package and the reason. `PFE9012` keeps its job: a demanded id the sources do not register.
- **Membership moved to `purefnids`.** The five `builtinpurefns.Has` call sites (`render.go` x3,
  `dispatch.go`, `apigen.go`) call `purefnids.Has`: the same id set, emitted by the same generator
  run. That also collapsed the two demand branches in `serveBuiltinPureFns` into one, since the
  second only existed for an id the table might lack. `purefnids` gained `All()` so a test can
  enumerate every generated id.
- **The ids stay generated and committed**, so the codegen row stays (narrowed to the two id
  outputs) and `codegen all --check` keeps guarding them.
- **The hollow lane is untouched.** Bundlers resolve `dist`, never `src`, so the ~11 KB saving is
  intact. `src` in the published `files` became load-bearing, and is pinned by a test.

### Deviations from the original direction

- **The codegen row was NOT deleted.** The same generator run produces the committed id constants,
  which still need their drift check. Only the table output went.
- **No artifact, so no `check:builds` entry.** `scripts/core/build.mjs` needed no change: there is
  no file to check for freshness, and `distIsStale` already watches the sources.
- **Two test fixtures had to start shipping `src`.** `internal/testfixtures/realmarker.go` and
  `packages/devtools/test/helpers/inline.ts` both mounted the marker package as package.json plus
  the dist `.d.ts` tree. That is no longer the package a consumer installs. Without the JS one the
  fuzz suites built clean and then threw `isEmailAddress is not a function` at runtime, which is
  exactly the degradation `CFG004` exists to prevent (the diagnostic did fire; that harness does
  not assert on diagnostics).

### Found on the way

`packages/run-types/src/runtypes/circular-pure-fns.ts` is imported by nothing: its name appears
only inside a comment in `circular.ts`. Its registration therefore never runs at load, which is
harmless now that the compiler serves the body, but it means the package's side-effect import list
is incomplete. Scanning for the registrar call is what keeps it served, and
`TestClosure_FindCycleIsServed` is what keeps it from being dropped again.

## Tests

- `internal/cachegen/builtinpurefns/builtinpurefns_test.go`: every generated id still resolves (the
  drift check the deleted `--check` lane gave), the core built-ins served with non-empty bodies,
  `findCycle` specifically, transitive module closure, dedup, a demanded id the sources do not
  register reported missing, extraction happening once, served entries carrying no rewrite spans but
  keeping their `BindingName`, unreadable sources erroring, a package where nothing registers
  erroring, the scan skipping what the tarball excludes, and both lanes agreeing on ids.
- `internal/compiler/resolver/builtin_purefns_delivery_test.go` gains
  `TestBuiltinDelivery_MarkerWithoutSourcesIsCFG004`: a marker package mounted without `src` fails
  the build with `CFG004` instead of emitting a validator that throws.
- `internal/compiler/resolver/builtin_purefns_serving_test.go` builds a Session carrying a loader
  instead of a zero Session, and gains the unreachable-sources case.
- `packages/devtools/test/repo-contracts.test.ts` pins that `@mionjs/run-types` publishes `src` and
  excludes only the two suffixes the scan itself skips.
- The existing end-to-end delivery tests now exercise the on-demand path against a `node_modules`
  layout holding only what the tarball ships, which is the proof the whole design rests on.

## Done when

- No committed source file holds compiled JS bodies; `table.generated.go` and its codegen output
  are gone. ✅
- A published consumer still receives built-in bodies on demand, and they stay out of its bundle
  (the hollow lane is unchanged, and the published `src` it depends on is pinned by a test). ✅
- Unreadable sources fail at compile time with a clear message, pinned by a test. ✅
- `pnpm test`, `go -C ts-go-runtypes test ./internal/... ./cmd/...`, `pnpm run lint` and
  `pnpm run check:builds` pass. ✅
