---
type: chore
spec: guidelines
status: done
created: 2026-09-07
---

# The unknown-key slots should follow the encoder strategy, like every other slot

## Intent

A route asks the build for its compiled functions through a marker, and every slot in that marker is
computed from the route's encoder strategy, so a route only compiles what its wire actually needs.
Every slot except two. `huk` (hasUnknownKeys) and `uke` (unknownKeyErrors), the pair behind
`strictTypes`, were written as fixed strings on every helper, so every route in an application
compiled both, whether or not they could ever do anything.

For a `compact` route they cannot. Its wire is positional: an object arrives as an array and the
decoder rebuilds it from slot positions, so no key from the wire ever reaches the restored object.
There is nothing for an unknown-key check to find. Turning `strictTypes` on for such a route is not a
stricter setting, it is a setting that can never fire, and nothing said so.

## What shipped

The premise turned out to be **false as written**, and the codec was fixed first.

### The compact wire did not keep its promise

Two shapes carried key names on a compact wire, so `strictTypes` there was doing real work and
dropping the slots would have turned a security control off in silence:

- **A union member stays keyed.** The merged branch has no single positional shape
  (`json_compact.go`, the `KindUnion` arm), so the object rides with its key names. The encode side
  already rebuilt it from its declared props, but the decode walked it in place and kept everything
  it had not named. So a caller could post `{kind:'a', x:1, extra:'…'}` and `extra` reached the
  handler.
- **A keyed object where the positional array belongs** was taken as it came, on the comment's
  assumption that validate would refuse it. Validate refuses junk, but a well-formed keyed object
  matches the declared type and passes, extras and all. That shape is not hypothetical: the client's
  `optimistic` mode sends plain keyed JSON on the first call to a route whose compiled functions it
  has not fetched yet.

Fixed in `ts-go-runtypes/internal/cachegen/typefunctions/`:

- `FlatLayout.StripMergedExtras`, set by the compact layout only, makes the decode REBUILD the merged
  object from `layout.MergedProps` instead of walking it. Both directions now rebuild from the same
  list, pinned by a symmetry test.
- `compactUnionNeedsEnvelope` now also fires for a member that merges into the `[-1, merged]` branch,
  so the decoder can tell that branch from an index-signature member, whose keys must all survive.
  Compact therefore gives up the record-union optimisation; the keyed strategies keep it.
- The positional object decode rebuilds a keyed arrival from its declared NAMES and drops the rest,
  rather than taking it as it came. Refusing it outright was the first plan; it would have cost the
  optimistic first request a second round trip for nothing, since dropping the keys closes the same
  hole. No child transform runs on that branch, exactly as before, so the bet still pays off only
  for a value that needs none.

The index-signature case needed no carve-out in the end: an index signature declares every key, so
nothing there is unknown, and a template-literal key pattern is checked by validate
(`validate.go`), not by the unknown-key families.

### The slots

`packages/router/src/types/encoder.ts`:

- `returnFns` drops `'huk'` and `'uke'` outright. Nothing in the repo reads
  `returnJitFns.hasUnknownKeys`, on any wire, and `serializeMethodDeps` shipped both to the browser
  for every route.
- `paramsFns` resolves them through `ParamsHasUnknownKeys` / `ParamsUnknownKeyErrors`, which are
  `never` on a compact params wire.

`packages/core/src/runtypes/mionAdapter.ts` leaves the pair OFF the built set when the marker did not
ask for it, instead of fabricating a stand-in that always answers false, so both readers take their
own `!hasUnknownKeys` early return.

### The lint rule

`MRT006` / `@mionjs/unreachable-strict-types`, a resolver diagnostic in
`ts-go-runtypes/internal/compiler/routerrules/`. It reads the route call's return type, which carries
the route's own options literal and the factory's, resolves the params wire the same three steps the
type side takes, and fires when the route's OWN literal sets `strictTypes: true` on a compact wire. A
router-wide `strictTypes` is left alone: it is a default for the routes that can use it.

Level `LevelRuntimeError`, matching every other `MRT` code: the route accepts payloads its author
declared it would reject.

### Tests

- Go: the compact codec (encode and decode drop the same set, a union member's extra key survives
  neither direction, an index-signature member keeps its keys, a keyed arrival is rebuilt from its
  declared names) and the new rule across both option levels and all three helpers.
- Fuzz: **O26**, the compact twin of O25, in `packages/run-types/test/fuzz/value/`. An undeclared key
  planted anywhere on the encoded compact wire must not survive the decode. Verified to fail when the
  strip is turned off.
- Vitest: the slots per wire in `packages/router/src/encoder.spec.ts`, including an end-to-end
  dispatch where a smuggled key on a compact union param never reaches the response; the absent pair
  in `packages/core/src/runtypes/mionAdapter.spec.ts` (untested before); `MRT006` routing in the lint
  plugin.

### Docs

The validation page says a compact wire has no unknown keys to find and that setting `strictTypes`
there is a lint error. The serialization page says the decoder rebuilds your object from the declared
properties whichever form a caller sends, and that a union of objects keeps its key names inside a
small wrapper. The linter page carries the new rule.

## Not done

**The `fmt` slot** (the `sanitizeParams` lane) is still a fixed string on every params marker. It
follows an OPTION, not the wire, so it is a different axis: making it conditional needs a
build-versus-runtime guard like `assertCompiledEncoder`, or a route whose build saw
`sanitizeParams: false` while the runtime resolves `true` silently stops transforming. Worth doing,
but it is its own change and its own tests.
