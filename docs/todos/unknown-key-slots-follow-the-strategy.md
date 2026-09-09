---
type: chore
spec: guidelines
status: ready
created: 2026-09-07
---

# The unknown-key slots should follow the encoder strategy, like every other slot

## Intent

A route asks the build for its compiled functions through a marker, and every slot in that marker is
computed from the route's encoder strategy, so a route only compiles what its wire actually needs.
Every slot except two. `huk` (hasUnknownKeys) and `uke` (unknownKeyErrors), the pair behind
`strictTypes`, are written as fixed strings on every helper:

```ts
paramsFns?: InjectTypeFnArgs<
  HandlerParams<H>,
  'val',
  'verr',
  'huk',   // always asked for
  'uke',   // always asked for
  'fmt',
  ParamsEncode<NoEncoderOptions>,   // computed from the strategy
  ParamsDecode<NoEncoderOptions>,
  ...
```

So every route in an application compiles both, whether or not they can ever do anything.

For some strategies they cannot. A `compact` route's wire is positional: an object arrives as an
array and the decoder rebuilds it from slot positions, so no key from the wire ever reaches the
restored object. There is nothing for an unknown-key check to find. Turning `strictTypes` on for such
a route is not a stricter setting, it is a setting that can never fire, and today nothing says so.

Two things follow. The slots should be strategy-driven like the rest, so a route that cannot have
unknown keys does not carry the code to look for them. And a `strictTypes` that can never trigger
should be a lint error at the call site, the same way the build already refuses a widened `encoder`.

## Direction

What was checked:

- **The slots really are hardcoded.** `'huk'` appears 20 times in
  `packages/router/src/lib/handlers.ts` and again in `packages/router/src/types/mionRouter.ts`, always
  as a literal beside the four computed ones. Making them computed means a new pair of aliases in
  `packages/router/src/types/encoder.ts` next to `ParamsEncode` and friends, resolving to `'huk'` /
  `'uke'` or to `never`.
- **`compact` is the clear case.** `emitObjectCompactFromJson`
  (`ts-go-runtypes/internal/cachegen/typefunctions/json_compact_restore.go:175`) rebuilds a declared
  object from `v[0]`, `v[1]` and so on. **But it has an exception right at the top**: an object with an
  index signature falls back to the keyed restore, so that shape does still carry wire keys. Any rule
  has to respect it.
- **The consumers are two.** The server at `rejectUnknownKeysOrThrow` in
  `packages/router/src/dispatch.ts`, and the client's local pre-validation at
  `packages/client/src/lib/validation.ts:65`. Both already guard on `options.strictTypes` and on the
  function not being a noop, so a route that stops compiling the pair keeps working.
- **The return direction never reads them at all.** Nothing in the repo touches
  `returnJitFns.hasUnknownKeys` or `returnJitFns.unknownKeyErrors`, yet `returnFns` asks for both on
  every helper. That looks like pure waste on every route, independent of strategy, and is worth
  settling first since it may be the larger half of the win.
- **There is a lint rule to copy.** `packages/devtools/src/lint/rules/` holds one rule today
  (`enforce-type-imports.ts` with its spec beside it), so a new rule has a working template, and the
  plugin already carries mion's own `@mionjs/*` namespace.
- **The docs already cover the neighbouring case.** The website's validation page explains that
  `strictTypes` is skipped automatically when a type has an index signature. The new rule belongs in
  the same place, in the same voice.

The implementer plans the rest. Points to settle rather than assume:

- **Which strategies actually guarantee no unknown keys.** `compact` is established above. `clone`,
  `mutate` and `direct` all restore a keyed object in place, so they keep the pair.
- **What the rule reports, and how loudly.** The user wrote `strictTypes: true` and it will do
  nothing, which is the shape of an Error rather than a Warning, matching how a widened `encoder` is
  a build error today. Needs a diagnostic code and a message that says why, not just that.
- **Whether the router-wide `strictTypes` should be reported too.** A router-wide `true` with one
  compact route among fifty is not a mistake, so the rule probably fires only on a route's own
  literal. Worth stating either way.
- **Whether anything else should ride the same treatment**, now that the pattern is established:
  `fmt` (the `sanitizeParams` lane) is also a fixed string on the params markers.

## Done when

- `huk` and `uke` are computed slots like the encode and decode ones, and a route whose strategy
  cannot produce unknown keys no longer compiles them.
- The return direction no longer asks for a pair nothing reads, or the todo records why it must.
- A route setting `strictTypes` where the check can never fire is a lint error naming the strategy
  that makes it moot, with the index-signature exception respected.
- The server and client unknown-key paths behave exactly as before for the strategies that keep the
  pair, pinned by tests, including a compact route with an index signature (which still needs it).
- The website's validation page says which wires make `strictTypes` moot, beside the existing note
  about index signatures.
