---
type: feature
spec: guidelines
status: ready
created: 2026-11-04
---

# Review class getter and setter support

## Intent

Classes are supported, but no test covers a get/set accessor, so what each function does with one is unknown.
Decide the intended behavior, then pin it with tests. Current class handling may already be enough.

## Direction

- The `checkUnknowns` key count (`cntEK(v) === N`) only runs on an object whose props are ALL required and that has
  no index signature; a shape with an optional prop checks key names instead.
- Known today: on such an all-required class that declares a getter, `checkUnknowns` validate fails for its own
  instances, because the key count counts the getter but an instance does not list it as a key.
- Known today: an all-required plain interface type given a class value with a getter (or an inherited /
  non-enumerable prop) follows the same count: `{get id, name}` is rejected with a shape error, `{get id, name, extra}`
  passes. Validate and errors agree on both.
- Decide per function family: validate, errors, strict, JSON encode / decode, binary, clone, removeUnknownKeys,
  mock data. Serialize the getter's value or skip it? On decode, set it through the setter or ignore it?
- The type knows accessors (`reflection.FlagAccessor`; removeUnknownKeys already treats them as prototype members).
- Paired tests for both marker call shapes. The implementer plans the details.

## Docs

Classes page, existing section on what class features are supported, once the behavior is decided.
Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example
this change touched, review its report against the code, and commit it as its own commit.

## Done when

- Every function family has a stated, tested behavior for a class getter and setter.
- The strict key count no longer rejects a valid instance of an all-required class that declares a getter.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file,
  each committed on its own.
