# Restore handler param NAMES, sourced from reflection instead of `fn.toString()`

**Status:** partially shipped in PR #128 — server side done, WIRE decision still open
**Type:** fix
**Spec:** full-plan
**Created:** 2026-07-27

Surfaced by PR #128 review comment
[r3659660725](https://github.com/MionKit/mion/pull/128#discussion_r3659660725): *"I think we should
be able to access params name from runTypes reflection. using old params name assertion is safer
than just count. same for any test that we changed paramNames by paramsCount."*

## Problem

Commit `5a9e6f4` replaced `paramNames: string[]` with `paramsCount: number` on `MethodReflect` /
`RtMethodReflection`. The motivation was sound and stays valid: the name strings came from parsing
`handler.toString()` (`getParamNamesFromHandler` + `extractParamList` + `splitParamList` …), which
is unreliable under minified bundles — a reflection library should not be reading source text.

But the replacement threw out more than the bad source. Arity is strictly weaker than names:

- **Tests got weaker.** `packages/router/src/lib/remoteMethods.spec.ts:73` now asserts
  `paramsCount: 1` where it used to name the parameter. Reordering two params of the same arity is
  invisible to a count.
- **The wire got less descriptive.** Router→client methods-metadata ships an arity, so a client
  cannot label a validation error with the parameter that failed.

## Reflection does carry the names — verified

Probe run against `@ts-runtypes/core` 0.11.0, reflecting
`type SaveArgs = [pet: {name: string}, notes?: string]`:

```json
{ "kind": 26, "childCount": 2,
  "children": [ {"name": "pet", "kind": 27},
                {"name": "notes", "kind": 27, "optional": true} ] }
```

Tuple member labels survive into the run-type graph (`kind 26` = tuple, `27` = tuple member), and
**optionality comes free**. `RunType` types this as `children?: RunType[]` with `name?: unknown` on
each. So names are available from the same source `paramsCount` already uses — no `toString()`, no
minification hazard.

## Plan

1. **`packages/core/src/runtypes/mionAdapter.ts`** — extend `getParamCountFromRunType` (currently
   `root.kind === RunTypeKind.tuple ? root.children?.length ?? 0 : 0`) into a
   `getParamsFromRunType` returning `{name, optional}[]`, reading `child.name` per member.
   - Handle the **unlabelled** case: a tuple written `[string, number]` has no labels. Decide the
     contract — `undefined` name, or a positional fallback (`arg0`) — and pin it with a test. Do not
     let an unlabelled tuple silently produce empty strings.
   - Keep arity derivable (`.length`) so nothing that only needs a count has to change.
2. **`packages/core/src/types/method.types.ts:27`** — replace `paramsCount?: number` with the
   richer shape. Prefer keeping a `paramsCount` getter or leaving the field alongside `paramNames`
   so the three consumers that genuinely only want arity stay simple:
   `client/src/lib/validation.ts:55`, `client/src/lib/serializer.ts:131`, and the router
   private/public gates.
3. **`packages/core/src/runtypes/mionAdapter.ts:255`** — populate from the new helper.
4. **Wire impact — check before shipping.** `paramsCount` rides router→client methods-metadata.
   Adding names grows the payload for every method. Confirm whether names should ship to the client
   at all, or stay server-side for diagnostics only. `client/src/lib/clientMethodsMetadata.spec.ts:146`
   asserts `paramsCount` is defined, so the client contract is real. **This is the one decision that
   needs agreeing before implementing.**
5. **Restore the stronger assertions** in every test switched to a count — start with
   `router/src/lib/remoteMethods.spec.ts:73` and grep for `paramsCount` across specs.

## Tests

- **Labelled tuple** — names and order both asserted (`['pet','notes']`, not just length 2).
- **Optional param** — `notes` reports `optional: true`.
- **Unlabelled tuple** — whatever contract step 1 picks, pinned explicitly.
- **Minified handler** — `mionAdapter.spec.ts:85-88` already proves arity survives a
  source-stripped handler (`const degraded = (() => undefined) as unknown as (...)`). Extend it to
  assert **names** also survive, since that is the whole reason reflection beats `toString()`.
- **Client metadata** — update `clientMethodsMetadata.spec.ts:146` to match whatever step 4 decides.

## Out of scope

- Reinstating any `fn.toString()` parsing. The names must come from reflection; if a case cannot be
  served that way, it stays unserved.
- Param names for pure-fn / mapper signatures (`ServerMapperEntry.paramNames`) — a different lane.

## Done when

- `MethodReflect` carries parameter names sourced from the run-type graph.
- The minified-handler test asserts names, not just arity.
- Every spec weakened to `paramsCount` asserts names again, or has a comment saying why not.
- The wire decision from step 4 is recorded in the spec/PR.
- Full suite + lint + format green.

## What shipped (server side)

- `getParamsFromRunType` returns `{name?, optional?}[]` from the params tuple's member labels;
  `getParamCountFromRunType` now delegates to it, so arity stays available.
- `RtMethodReflection.paramNames` and `MethodReflect.paramNames` carry the names **server-side**.
- Tests: names asserted alongside arity, including on the **minified handler** — the case that
  proves reflection beats `toString()`; plus optionality (`[undefined, true]`) and the
  non-tuple → `[]` path.

## Still open: the wire

The reviewer's specific line (`router/src/lib/remoteMethods.spec.ts:73`) asserts on `api.auth`,
which turned out to be the **public wire payload**, built by an explicit field list at
`remoteMethods.ts:88` — not the raw reflection object. Confirmed empirically: adding `paramNames`
to the reflection did **not** make it appear there.

So restoring a name assertion on that line requires shipping names to the client, which grows every
methods-metadata payload and changes the contract pinned by
`client/src/lib/clientMethodsMetadata.spec.ts:146`. That call was deliberately deferred; the spec
line keeps its arity assertion with an inline comment explaining why and pointing here.

**To close this todo:** decide whether `paramNames` joins the wire payload. If yes, add it at
`remoteMethods.ts:88`, update the client metadata spec, and restore the name assertion at
`remoteMethods.spec.ts:73`.
