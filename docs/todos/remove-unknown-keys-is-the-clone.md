---
type: chore
spec: guidelines
status: ready
created: 2026-09-24
---

# One function removes unknown keys: `createRemoveUnknownKeysFn`

## Intent

Two public functions remove unknown keys, and only one is worth keeping:

- `createStripUnknownKeysFn` (`packages/run-types/src/createRTFunctions.ts:~474`, family `stripUnknownKeysWire` / `ukuw`) sets undeclared keys to `undefined` in place, and only on raw `JSON.parse` output. The key stays on the object. Nothing in mion uses it: the only callers are one example, two run-types tests and the JSON docs page. The JSON parse strategies `clone` / `mutate` / `compact` already cover the wire side.
- `createCloneExactShapeFn` (family `cloneExactShape`, Go `CloneExactShapeEmitter` in `ts-go-runtypes/internal/cachegen/typefunctions/clone_exact_shape.go`) returns a NEW value with only the declared keys, keeps live types (`Date`, `Map`, `Set`, bigint, class prototypes), and never changes the input. It is `structuredClone`, typed and without extra keys. Its uses: dropping extra keys before a database write, hiding fields like `passwordHash`, direct in-process calls with no JSON step.

Remove the first public factory, and rename the second so its name says what it does:

```ts
const removeUnknownKeys = createRemoveUnknownKeysFn<User>();
const clean = removeUnknownKeys(input); // new value, input untouched
```

Breaking change, fine with no users yet. No alias for the old names. No `strategy` option: an in-place version would need a real `delete`, add it later only if someone asks.

## Direction

The implementer plans the details. Verified pointers:

- Remove the public blanking factory: `createStripUnknownKeysFn` in `createRTFunctions.ts`, its export in `packages/run-types/src/index.ts`, its mention in `markers.ts`, and its tests in `packages/run-types/test/features/jsonValueFactories.test.ts` and `getRTFunctionRecovery.test.ts`. KEEP the internal `stripUnknownKeysWire` (`ukuw`) Go family: the `strip` JSON decoder still composes it, and a separate change removes that decoder and `ukuw` together.
- Rename the clone family end to end: `createCloneExactShapeFn` → `createRemoveUnknownKeysFn`, `CloneExactShapeFn` → `RemoveUnknownKeysFn`, `overrideCloneExactShape` → `overrideRemoveUnknownKeys` (`src/overrideRTFunctions.ts`), the marker family key `cloneExactShape` → `removeUnknownKeys`, and the Go operation / emitter names (`cachegen/operations`, `typefunctions/clone_exact_shape.go`). Check the new family key does not collide with any existing tag or fnKey.
- Regenerate every go-generated table with `pnpm miondevx core codegen` (run-types `fnHashes.generated.ts`, core `jitFunctionIds.generated.ts`, devtools `runtypes-constants.generated.ts` / `diagnosticCatalog.generated.ts`). Also check `packages/devtools/src/lint/diagnosticRouting.ts`, `devtools/src/core/protocol.ts`, `resolver-client.ts`.
- Tests: `packages/run-types/test/suites/cloning`, `test/fuzz/cloning`, `test/suites/overrides`; rename files/dirs only where the name would now mislead.
- The doc comment on the renamed factory says it returns a new value and never changes the input.

## Docs

- `container/website/content/02.runtypes/02.guide/03.validation.md`: the existing section that shows `createCloneExactShapeFn`; rename it and say it returns a new value, input untouched.
- `container/website/content/02.runtypes/02.guide/05.json-serialization.md`: remove the old `createStripUnknownKeysFn` mention.
- `container/website/content/01.rpc/06.devtools/01.linter.md` and `02.runtypes/04.tooling/01.linting.md`: update the family name.
- Examples: `packages/examples/src/guide/clone-exact-shape.ts` (rename the file to match), `all-factories.ts`.
- Check the compiled functions reference table for both rows.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example this change touched, review its report against the code, and commit it as its own commit.

## Done when

- `createStripUnknownKeysFn` is gone from the public API; `createRemoveUnknownKeysFn` is the clone-based function; no `cloneExactShape` / `CloneExactShape` name remains in source, generated tables, tests, examples or docs.
- `pnpm test`, `go -C ts-go-runtypes test ./internal/... ./cmd/...` and `pnpm run typecheck` pass.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file, each committed on its own.
