---
type: feature
spec: guidelines
status: ready
created: 2026-09-12
---

# One generic on-demand path for pure functions, for any package

## Intent

Pure functions work end to end today, but only for mion. Three parts of the system are each solved by
their own mion-private special case, and they are really ONE missing generic capability: taking a pure
function OUT of the file that declares it and serving it, on demand, from the pure-fn cache.

- **A third party cannot ship one.** Library B publishes a pure fn, library A depends on it, B sits in
  the consumer's `node_modules`. There is no `src/` for the program extractor to walk and B is not in
  mion's built-in table (`ts-go-runtypes/internal/cachegen/builtinpurefns/table.generated.go`), so B's
  body never reaches A's generated code.
- **Only mion's own bodies get stripped from their bundle.** `scripts/core/hollow-builtin-purefns.mjs`
  rewrites the package's published registrations to drop their bodies, worth roughly 1.6 KB (`rt::`)
  plus 9.7 KB (`rtFormats::`) per consumer bundle, precisely because something else delivers them on
  demand. Every other package pays full bundle cost for a pure fn a consumer may never call. That
  saving should be what the compiler does for ANY imported pure function, not a post-build script one
  package runs on itself.
- **Mion's own bodies travel as embedded source.** The table is a committed `.go` file holding
  compiled JS. Even granting that generated code cannot import mion internals the way user code can,
  the compiler could run the same extraction on them at build time and populate the compiled pure-fn
  cache. If a pre-extracted table is wanted at all, it belongs in the compiler's cache artifacts, not
  checked into the source tree.

Underneath all three: `utl.getPureFn('ns::name')` is a dependency edge spelled as an opaque string, so
the compiler learns the key but not the file, and has nowhere to go and extract from. The root cause is
a LOCATION problem, not a naming one.

## Direction

Direction, not a design. The implementer investigates and plans before building.

**1. Let an import supply the location.** An import is already how a compiler is told "this lives over
there": resolving it locates the module, and the module is then extractable like any scanned file. If
`registerPureFn` / `registerPureFnFactory` RETURNED the pure-fn id, that id is an ordinary exported
value and the import edge names the declaring module by construction:

    import pureFnId from 'x';            // locates the module that registers it

    const other = registerPureFn((utl) => {
      const dep = utl.getPureFn(pureFnId);
      ...
    });

They currently return a `CompiledPureFunction` (carrying `namespace` + `fnName`), not an id shaped for
the `CompTimeArgs<string>` lookup parameter, so this is a real API change to design.

**2. Reuse the extraction hook that already exists.** `ValidatePureFnDependencies`
(`cachegen/purefunctions/index.go`) already handles "this dep names a file the scan missed, so parse
it, extract it, merge it into the index, re-check", gated on `dep.FilePath`. What has no generic
supply is `dep.FilePath` itself: today it is filled either by a Go emitter hardcoding a repo-relative
source path (the mion-only bit, see `uniqueItemsPureFnPath` in
`typefunctions/formats/structural/arrayformat.go`) or by provenance from a file the scan already
covered. Work out whether a resolved import can feed that same hook rather than building a second path
beside it.

**3. Make the on-demand strip generic.** Whatever lets the compiler move a body out of its source file
and into the cache should apply to any imported pure fn from any package, so the bundle-size win the
hollow script currently buys mion becomes ordinary behaviour. That is the same capability as point 1
seen from the other end, which is a good sign it is one mechanism and not three.

**4. Then decide what the built-in table becomes.** Options range from "the compiler extracts mion's
internals like anything else" to "a pre-extracted table survives, but as a compiler CACHE artifact"
(the on-disk RT artifact cache under `node_modules/.cache/ts-runtypes/` is the natural home) rather
than committed Go source. Whichever way it lands, say where bodies are read FROM: dist is hollowed
today, so "read them at compile time" is circular as things stand, and shipping `src` or un-hollowing
are both choices with costs. The CLI compiler deserves its own look, since it has a real filesystem
and could read `node_modules`, which the bundler-plugin path may not want to depend on.

Three constraints, all verified, that any spelling has to respect:

- **Purity stays.** A factory body is inlined WITHOUT its lexical environment, so a free variable
  reads as an outer capture and fails `PFE9011`. An imported id must be lowered to a VALUE inside the
  body at build time, never left as a live reference.
- **The lookup is recognised by a brand, not a name.** The dep walker finds a pure-fn lookup through
  the `CompTimeArgs<string>` brand on the method's first parameter (`rtUtils.ts`), resolved by
  `resolveDepArg` (`purefunctions/deps.go`). A new spelling must stay equally checkable, or a dep goes
  silently untracked and the emitted module throws when called.
- **Built-ins are currently EXEMPT from the dep-validation pass** and served from the table at serve
  time instead, because a `.d.ts`-resolved core has no registrations in the program at all. That
  exemption is the shape of the problem, so it is the thing under review rather than a rule to keep.

Starting points: `cachegen/purefunctions/` (extractor, `deps.go`, `index.go`, the module emitter),
`cachegen/builtinpurefns/`, `packages/run-types/src/runtypes/pureFn.ts` (the four registrars and the
hollowed-built-in lane), `scripts/core/hollow-builtin-purefns.mjs`, and diagnostics `PFE9011` /
`PFE9012`, the latter being the symptom a third-party pure fn most likely produces today.

## Done when

- A pure function published by one package reaches the generated code of a package that depends on
  it, proven end to end by a test that does NOT involve mion's own built-ins.
- A pure fn imported from any package can be left out of the consumer's bundle and served on demand,
  by the compiler, without that package running a bespoke post-build step.
- Mion's own built-ins ride the same mechanism as far as they can, and no committed source file holds
  compiled JS bodies. Any pre-extracted table that survives is a compiler cache artifact, and the
  reasoning for keeping it is written down.
- Dep tracking stays build-time and total (an untracked dep stays impossible, not merely unlikely),
  and factory bodies stay pure.
