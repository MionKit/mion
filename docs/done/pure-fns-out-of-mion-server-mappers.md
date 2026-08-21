# Pure functions out of mion; `mionPureFns` → `serverMappers`

**Status:** done — branch `refactor/runtypes-glue-umbrella`
**Created:** 2026-07-27 (as `docs/todos/runtypes-glue-2-pure-fns-registry.md`)
**Parent:** [runtypes-glue-0-umbrella.md](../todos/runtypes-glue-0-umbrella.md) — phase 3 of 3

Surfaced by PR #128 review comment
[r3634525205](https://github.com/MionKit/mion/pull/128#discussion_r3634525205): *"we should be using
equivalent functionality from ts-runtypes … I don't see any reason to have something similar in
mion. this file related functionality and test should be removed."*

## Outcome

**mion registers no pure functions.** `MION_PURE_FN_NAMESPACE`, `mionPureFnId`,
`registerMionPureFn`, `getMionPureFn` and `hasMionPureFn` are all gone. Registration is entirely
`@ts-runtypes`' job:

```ts
registerPureFn('mionjs::toPreferenceId', (customer: {preferenceId: number}) => customer.preferenceId);
allowServerMapper(serverMapperKey('toPreferenceId'));
```

A **literal key plus an inline function literal** is scanner-clean — no CTA003, no PFN001 — which is
what made the mion-side registration wrapper unnecessary. (It also works with no plugin at all:
upstream has an explicit no-plugin fallback, so CDN/no-Vite servers keep working.)

`mionPureFns.ts` is renamed `serverMappers.ts` and reframed: it is a routesFlow transport with a
security boundary, not a pure-fn registry.

## The one thing upstream cannot do

The review comment was right about registration and wrong about the allow-list.

`allowedMapperKeys` is the **only** gate on a wire-driven registry lookup. `mapping.bodyHash` arrives
in the **URL query string** (`?data=<base64url JSON>`), is `JSON.parse`d with no schema validation,
no shape check and no route-level allow-list, and goes straight to `getServerMapper`. Upstream's
`getPureFnByKey` has no equivalent gate — deliberately: it is documented as the *untracked* door for
exactly this wire-driven case, which makes gating the framework's job, not upstream's.

Deleting the registration wrappers with no replacement would have left the name lane **100% dead**:
`registerMionPureFn` was the only writer of the allow-list for that lane, and the harvest filter
keeps only `serverMapFrom` sites. Every named-lane request would reject.

So mion keeps the gate and nothing else, exposed as one function:

```ts
export function allowServerMapper(pureFnId: string): void { allowedMapperKeys.add(pureFnId); }
```

The threat is concrete, not theoretical: `mionAdapter.addSerializedJitCaches` installs arbitrary
`<ns>::<fn>` entries out of a **server methods-metadata payload** and never touches the allow-list,
so in an SSR process both lanes share one registry. Built-ins and any unrelated library's entries are
in there too. Note the gate keys on **lane of registration, not namespace** — `rt::` keys are exactly
what the legitimate inline lane produces.

## mion's duplicate ESLint purity rule removed

`@mionjs/pure-functions` was a hand-written reimplementation of the `@ts-runtypes` purity checker.
Its 8 message ids mapped 1:1 onto upstream diagnostics:

| mion messageId | upstream |
|---|---|
| `purityThis` / `purityAwait` / `purityYield` | PFE9006 / 9007 / 9008 |
| `purityDynamicImport` / `purityForbiddenIdentifier` / `purityClosureVariable` | PFE9009 / 9010 / 9011 |
| `unresolvedArgument` / `importedArgument` | PFN001 / PFN002 |

`runtypes/pure-functions` from `@ts-runtypes/devtools/eslint` routes the real diagnostics and was
**already enabled** via `tsRuntypesESLint.configs.recommended` in `eslint.config.js`, so the two ran
side by side and double-reported on every `serverMapFrom`.

The recorded rationale for keeping it — *"mion's `pure-functions` covers the runtime
`registerMionPureFn` lane that the upstream marker-based rule does not scan"* — does not hold: that
lane registered a runtime factory with `bodyHash: ''` and `code: ''`, never extracted, never
compiled, never shipped. It is plain server-side JS, so purity was never a requirement there. The
rule enforced a constraint that did not exist, and duplicated upstream everywhere else.

Removed: the rule, its spec, `purityRules.ts`, and the `configs.recommended` entry.
`no-vite-client` (mion-specific, no upstream equivalent) survives; its one import from `purityRules`
is inlined, narrowed to the single module that actually exports `serverMapFrom`. Stale rationale in
[eslint-rules-tuning-and-docs.md](eslint-rules-tuning-and-docs.md) corrected.

## Tests

`mionPureFns.spec.ts` → `serverMappers.spec.ts`, rewritten onto the replacement API. The security
property now has coverage at **both** levels:

- core: an `rt::` entry put in the registry directly does not resolve; **and** a `mionjs::` entry
  registered correctly through upstream but *without* `allowServerMapper` does not resolve either —
  the realistic near-miss, and the one that proves the gate is not decorative.
- router (new, `routesFlow.spec.ts`): the same two cases driven through a real request. That file
  previously contained **zero** occurrences of `bodyHash` or `mapping` — the property was untested at
  the point it matters.
- Added: lazy manifest re-read on a miss (`installServerMapperReader` had no TS caller at all, only
  the string the vite plugin emits).

The three client e2e lanes all pass against the live test server: name lane, inline/harvested lane,
and unknown-key rejection.

## Adjacent fixes

- **Deleted `getGreetingsPureFnResult` and `callPureFnByName`** from the test server. Zero callers;
  the first looked up `mionjs::greeting`, registered nowhere, so it could only ever throw; the second
  was a wire-driven registry lookup with **no gate** — the exact anti-pattern this module exists to
  prevent, sitting in the file people copy from.
- Removed the stale comment pointing at `packages/client/src/vitePlugin.e2e.spec.ts`, which does not
  exist.
- **Fixed the `registerMionPureFn(namespace, factory)` doc bug.** Two website pages and
  `packages/examples/src/run-types/pure-functions.ts` documented the first argument as a *namespace*;
  it was the function **name** (the namespace was hard-coded to `mionjs`). The example was
  registering `mionjs::myNamespace`. Both examples and both pages rewritten onto the new model.
- Truncated the dead `@mionjs/pure-functions` section of
  `packages/router/examples/eslint-rule-test.routes.ts` — a fixture for the deleted rule, built on
  `pureServerFn`, which was removed from core long ago — and its now-orphaned `helpers.ts`.

## Corrections to the original spec

| Spec claim | Reality |
|---|---|
| "`mapping.bodyHash` **arrives in the request body**" (also in the umbrella) | **Wrong mechanism.** It arrives in the **URL query string**, `JSON.parse`d with no validation at all. The conclusion holds — arguably more strongly. |
| "That is the security property, and today nothing pins it" | **Stale.** `mionPureFns.spec.ts:53-68` pinned it, added five days before the spec was written. The real gap was a **router-level** test. |
| "Add the missing negative test **first**" | Already existed. Replaced with: extend to the `mionjs::` namespace, add the router-level case. |
| "re-registration overrides … which upstream's `addPureFn` **may** not do" | **Confirmed** — it returns the existing entry when both `bodyHash`es are empty, which was always the case here. Now moot: the wrapper that needed it is gone, and upstream's registrars are the registration path. |
| "replacing the ~6 call sites (`test-server.ts:284,291` plus the public export)" | **Undercounted.** Also `packages/client/src/routesFlow.ts` (production), 3 spec files, 2 example files that are website `code-import` targets, and the devtools ESLint rule + its fixtures. Meanwhile `test-server.ts:284,291` were **dead** and `hasMionPureFn` had no production caller at all. |
| implies mion's ESLint purity rule is worth keeping | It duplicated upstream's checker 1:1 and ran alongside it. Removed. |

## Out of scope, filed separately

`routesFlow.ts` wrote `ctx.request.body[toId][paramIndex] = value` with a completely unvalidated,
attacker-supplied `paramIndex` — same wire object, different defect. Filed separately and since
fixed: [routesflow-query-validation.md](routesflow-query-validation.md).

## Verification

0 net-new typecheck errors across core / router / client / drizze / examples. Full suite **669 tests
/ 45 files green** (the drop from 725 is the deleted ESLint rule's fixtures). Lint 0 errors.
