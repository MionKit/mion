# typeid: platform classes, `URL`, readonly

Read before changing what counts as data or what enters a structural type id.

## A class the platform declares is not data

- Decided by where it is declared: `typeid.NotDataBuiltinOf` ([libglobal.go](libglobal.go)).
- Interface or class with ≥1 declaration in the platform = not data.
- Unless another declaration adds a member the platform lacks (own or inherited), or extends something.
- An empty merge, a `var` or a restated member list changes nothing.
- No name list, ever. No folder test.

### The platform = bundled lib + environment the project loads

- Environment = `program.EnvironmentFile` ([environment.go](../../../compiler/program/environment.go)):
  - what the tsconfig `types` list resolves to;
  - what any `/// <reference types>` resolves to, a dependency's included (`@types/express` loads `node`);
  - every file those pull in through `/// <reference>`.
- Imports are never followed.
- Inside the environment only a script file or a `declare global` block counts.
  → a class a loaded package exports from a module stays data.
- Built once per Program, handed to the cache with `Cache.SetEnvironment` on every program swap.

### Settled limits, not bugs

- Ambient `declare module "x"` class in a loaded package counts (`EventEmitter` from `@types/node` needs it).
- `types: ["*"]` loads every `@types` package → their globals count.
- No `types` list (or no tsconfig) → environment = only what a `/// <reference types>` loads (also all tsgo loads).
  - No fallback. A name nothing loads becomes a silent `any` the build reports (`marker-any-from-unresolved-name`).
- A library the code imports never counts, even under `node_modules`.
- `platform_declared_test.go` pins each one, with mutation-proof pairs for both call shapes.
- `program/environment_test.go` runs on real files: the only place the compiler flags a dependency as external library.

## `URL` is a supported native, not a platform class

- `typeid.IsNativeUrl` ([nativeurl.go](nativeurl.go)) runs before `NotDataBuiltinOf`.
- Accepts a `URL` from any `.d.ts`: lib.dom, the `@types/node` global, `node:url`.
- Same merge rule (`declaredBy`): an empty merge, even in a `.ts` file, keeps it native.

## `DataOnly<T>` keeps platform class shapes

- `DataOnly<T>` cannot see where a class was declared → keeps their shape. Settled limit.
- Go is the one source of truth. Never add a generated or fixed list to the TypeScript side.

## Readonly is part of the type id, though no type function reads it

- `readonly` on a property, index signature, tuple or array changes no generated code.
- Yet it is in the structural id (`readonlyBit` in [typeid.go](typeid.go)) and in reflection.
- Why: equal ids share ONE node. A flag left out of the id → reflection, the `jsonSchema` doc's `tsReadonly`
  and `mion convert` report whichever twin was projected first.
- New readonly position → projection + id together, through one shared predicate (`typeid.IsReadonlyCollection`).
