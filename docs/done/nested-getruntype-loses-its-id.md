---
type: fix
spec: guidelines
status: done
created: 2026-08-10
completed: 2026-08-10
---

# `getRunType` nested inside another marker call threw "no id injected"

## Problem

The scanner deliberately drops the injected id of a value-first builder nested
inside another marker call: the enclosing marker already reflects the whole
shape, so `object({a: string()})` inside `createValidateFn(…)` needs no id of
its own, and at runtime the nested builder returns a carrier the enclosing
marker consumes. `enclosedByInjectionMarker`
(`ts-go-runtypes/internal/compiler/resolver/scan.go`) implements that skip.

`getRunType` was caught by the same rule and must not be. It returns a
`RunType<T>` like every builder but does not BUILD one — it hands the injected
id to the runtime registry and returns what comes back
(`packages/ts-runtypes/src/getRunType.ts`). With the id dropped it has nothing
to look up, so it threw on the first call:

    const isB64 = createValidateFn(getRunType<Base64String>());
    // Error: getRunType(): no id injected. ts-runtypes-devtools must be active.

The emitted transform showed it plainly — the outer call got its id, the inner
one got nothing at all:

    export const nested = createValidateFn(getRunType(), undefined, __rt_nPZ_OC8eOow);
    export const innerOnly = getRunType(undefined, __rt_OC8eOow);   // standalone: fine

## How it was found

Converting the suite tree to builder form. `--to builders` prints
`getRunType<Named>()` whenever a call's type argument resolves to a declaration
the run already converts, so the nested shape went from rare to everywhere at
once: 410 failures across the converted trees, all the same throw.

Nothing in the hand-written suites nested the escape inside a factory, which is
why it had never fired.

## Fix

`builders.IsIdLookupCall` names the one function whose RunType comes from the
id rather than from its arguments, and the nested-builder skip exempts it. The
rule it narrows stays intact: a nested builder still needs no id.

Regression pin: `packages/ts-runtypes/test/features/nestedMarkerCalls.test.ts`
— the nested escape works, converges with the direct const and the type form,
covers both `getRunTypeId` shapes at a nested position, and asserts a nested
builder still works without an id of its own.
