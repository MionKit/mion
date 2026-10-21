---
type: feature
spec: full-plan
status: done
created: 2026-09-18
---

# A pure function's id is its package and the hash of the body that ships

## Problem

A pure function's id was `<package>/<path>#<name>`, and the name half came from one of two places
depending on where the registrar call happened to sit: the identifier a `const` bound it to, or,
failing that, a hash of its body. That is a hybrid, and it was the actual problem. Half the ids
were locations and half were content addresses, so no single statement was true of all of them:

```ts
export const slugify = registerPureFn(...);         // #slugify   — a location
routes.orders.getById(inputFrom(o, (x) => x!.id));  // #Kq3f..    — a content address
```

Committing to names would have meant supporting the exported name everywhere and keeping a real
name to function mapping in the cache. Committing to content means one rule, one behaviour,
everywhere. This took the second road.

## The rule that shipped

**`id = <package name> # CodeHash(the body as it ships)`**

```
@mionjs/run-types#Kq3f_xN9pQ2wLd
@acme/text#9Zt1bRm4cVaPqL
```

The package half stays because delivery reads ownership off it: `purefnids.IDPrefix` and
`remoteMethods.ts`'s `RUN_TYPES_ID_PREFIX` both became `<package>#` rather than `<package>/`.
There is no path, so moving a file inside its package never moves an id, and neither does
renaming a binding or an export. A file under no named package keeps the hash alone, which is the
same answer from any directory — a property the old path-relative id never had.

**As it ships, not as written.** The shipped body carries each dependency's id in place of the
binding it was written with. Hashing the written form would be cheaper and needs no ordering, but
two files in one package whose `helper` resolves to different imports have identical text and
different behaviour, and the dedup would have silently shipped one body for both call sites.

## What that cost, and how it is paid

`id(A)` depends on `id(B)` for every dependency B, so id resolution became a memoised post-order
walk. The governing rule: **computing an id IS producing the shipped body.** Stripping the types,
lowering the dependencies and hashing the result are one pass with one output, and that output is
the cache entry.

- `resolve.go` holds `resolveCtx` and one memoised `entryFor(file, call) → *Entry`. An id is just
  `entryFor(...).ID`. A helper referenced by ten dependents is extracted once per Program.
- The memo keys on the call NODE, not its position: `inputFrom(…).asArg()` and the inner
  `inputFrom(…)` start at the same offset, and keying by offset made the inner one collide with
  the outer one's result.
- `extractFromSourceFile`, `RawEntries` and `PureFnIDForCall` all read that one memo, so the batch
  lane's mapper id and the emitted module can never disagree and no body is rendered twice.
- A dependency cycle has no answer, so it is **PFE9015** (`LevelError`). Nothing rejected one
  before: `entrymodules.go` collapses cycles rather than erroring, and `initPureFunction` has no
  re-entrancy guard, so an eager cycle recursed forever at materialisation. This replaced a
  runtime hang with a build error.
- A dependency declared in a `.d.ts` has no body to hash, so its id is read off the branded
  literal type. That road is unchanged and now caps the recursion: a published dependency is a
  leaf.

## What this deleted

Same id now implies a byte-identical shipped body, by construction.

- **`BodyHash` everywhere.** It was `sha256(id + code)`, so once the id IS the hash of the code it
  carried nothing. Gone from `Entry`, the emitted tuple (one slot, dropped in lock-step in
  `module.go` and `PURE_FN_REQUIRED_KEYS`), the 46 built-in rows, `types.ts`, the metadata wire and
  the client store. The resolver's change index collapsed from `map[string]string` to a key set.
- **PFE9004 entirely.** "Two pure functions share an id but have different bodies" is unreachable.
  The cross-file fold's dedup became an unconditional `continue`.

## What was added to carry the readable name

An id is a hash, which names nothing a reader can search for, so the name the source binds a
registration to rides alongside: `Entry.BindingName`, `protocol.PureFnSite.bindingName` on the
build report, and a generated `purefnids.NameOf(id)`. The built-in constants keep their readable
names (`isUUIDId`, `IsDateStringYMD`) because the generator reads `BindingName` instead of
splitting the id.

## Three defects the change surfaced

- **The disk cache had no drift check on its pure-fn edges.** A cached type entry stores the
  pure-fn ids its body reaches (`RTEntry.PureFnRefs`), and the field was documented as needing no
  check because "the keys are stable strings". Content-addressed ids end that: edit a built-in
  body and its id moves, while the type's structural id does not, so the entry still hits and
  hands back an `argsText` baking `utl.getPureFn('<retired id>')`. Delivery finds no such
  built-in, `AddMissingStubs` inserts a `KindMissing` stub, and the validator degrades to the
  family identity function. Silently, on every build, until someone wipes the cache by hand. Both
  ends now check each id against `purefnids.Has` — the whole oracle, because every id that can
  land there comes from `EmitContext.UsePureFn`, whose argument is always a generated constant.
  The reader misses and re-walks; the writer refuses to persist a record it would refuse to read.
  No format bump: the check is exactly the right granularity, and an entry that reaches no pure
  function is untouched by the id rule and may still hit.

- **An emitted local variable spelled a hash bare.** `pureFnAliasFor` fell back to the id's name
  half as a JavaScript identifier, and base64url carries `-`. `const G5-z72czuSL8sC = …` is not
  valid JavaScript. The alias table is now keyed by the `purefnids` constants, and the fallback
  goes through `identifierSafe`.
- **`ModuleName` emitted a double slash** for an id with no package half, so a project without a
  package name wrote its mapper module to a path nothing could find. Empty segments are skipped.

One test-only false positive: the generated-code security oracle reads a body positionally from
slot 5, and dropping the `bodyHash` slot shifted a pure fn's code into it, so hand-written library
bodies started being audited as generated code. `emittedBodies` now skips a tuple whose slot 0 is
not a family tag.

## Behaviour that changed for users

- Every pure-fn id in a build moves. Both ends of a build regenerate together, so this is a
  rebuild rather than a runtime break.
- The same helper written in two files of one package is now ONE entry, compiled and shipped once.
  The same is true of batches: two identical batches in two files share one batch id, which is one
  plan recognised as one rather than a collision.
- Two identical bodies in DIFFERENT packages stay apart, because the package half differs.

## Out of scope, with its own spec

Collapsing the tracked lookup lane (`usePureFn` / `getPureFn` / `hasPureFn` / `getCompiledPureFn`)
into a single `utl.importPureFn(id)`: three of those four have zero production callers, and once
an id is statically known its existence is a build-time fact, so both the `undefined` arm and the
existence check have no job. It does not simplify the compiler, which detects a lookup by the
`CompTimeArgs` brand rather than by method name. The untracked `*ByKey` lane stays either way: a
runtime id off the wire is not something a build can analyse.
