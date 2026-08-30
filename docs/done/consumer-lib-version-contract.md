---
type: fix
spec: ready
status: done
created: 2026-08-30
---

# What a consumer's TypeScript lib version does to what we compile

## Intent

The resolver adopts the consumer's tsconfig wholesale, on purpose: it and their own `tsc` must
see one program. That includes `lib`, which decides which standard library the checker loads.
The question was what a `lib` change can do to what we compile, and whether anything about it
could be silent.

Two answers came out of the investigation, and only the second was the real problem.

The loud set was fine. A type that does not exist under the selected lib fails to resolve, and
MKR007 / MKR013 already stop the build rather than letting it check as `any`.

The silent set was not. A standard-library type that DOES resolve could be walked as if it were
the consumer's own data, and its member surface differs per lib edition. Measured on the tree at
the time: `Intl.DateTimeFormat` had four distinct structural ids across the libs, `Object` three,
and `@types/node`'s `URL` against dom's `URL` were two entirely different shapes. A `URL` field
compiled a forty-member validator over `href`, `searchParams` and friends, with no diagnostic
anywhere.

## The root cause was the direction of the check

`reflection.NonSerializableGlobals` was a hand-written list of type NAMES the projection took
whole. Anything not on it fell through and was walked as data. That is an attempt to enumerate an
open set: everything in the standard library that is not data. It cannot be completed, and the
history shows it.

- #173 fixed an ESNext `Buffer` build stop by adding `IteratorObject`, `ArrayIterator`,
  `MapIterator` and five siblings to the list.
- #174 then had to fix the mechanism behind the list: it added base matching, found by review
  that base-matching iterators stripped user data, reverted that to names, added `PromiseLike`
  because three sites matched the literal string `"Promise"`, and added MKR014 for when the list
  fell behind anyway.
- The list was still incomplete on the day it was read, and already stale in a way nobody had
  noticed: the bundled lib ships `Float16Array`, which was on no list, so
  `class MyF16 extends Float16Array` was not recognised as binary.

The set of things that ARE data is finite, and we already owned it. The TypeScript twin was
written that way and said so:

```ts
type DataOnlyStripped =
  | symbol
  | ((...args: never[]) => unknown)
  | {then: (...args: never[]) => unknown}
  | ArrayBuffer | SharedArrayBuffer | ArrayBufferView;
```

No names, no per-type arms. The Go side was the half still enumerating.

## What shipped

### 1. Data is decided by what IS data

A type is walked as data only if it is a primitive, a literal, an enum, an array, a tuple, a
union, an intersection, one of the identity-checked natives (`Date`, `RegExp`, `Map`, `Set`,
Temporal), or an object, interface or class **declared outside the bundled standard library**.
Everything else projects atomically: `KindClass`, `SubKindNonSerializable`, `ClassRef.Builtin`,
no children.

`NotDataBuiltinOf` is the one predicate every projection site asks, and it reads as its three
rules:

- shaped like a view over bytes (`IsBinaryViewShape`), which covers every typed array, `DataView`,
  Node's `Buffer` and any subclass a consumer writes;
- inherits from a raw buffer (`BinaryRootBaseOf`), the one binary case with no member shape to
  test for;
- declared in the standard library (`LibDeclaredGlobalOf`).

Two properties come free. An ALIAS cannot be caught, because a mapped type from `Partial`,
`Record` or `Readonly` has no interface-flagged symbol. Declaration merging is handled, because
the lib test reports "not standard library" the moment any declaration sits outside the lib
directory, so an augmented lib interface goes back to being the author's and is walked.

Binary is recognised by SHAPE rather than by name. Nothing in the bundled lib declares
`extends ArrayBufferView`, the typed arrays simply carry the same three members
(`buffer`, `byteLength`, `byteOffset`), which is why the TypeScript side tests assignability to
it. Testing those three members reproduces that without a global-type lookup, and it is what
keeps the two projections agreeing about binary with no list on either side.

### 2. CFG002, a hard fail for a lib that cannot support reflection

With no base ECMAScript edition in `lib`, TypeScript never declares `Array`, so `number[]`
resolves to `{}` and the emitted validator accepts anything. The closed data set cannot see it:
`{}` is a legitimate walked object. MKR013 cannot either, because it keys on a written type NAME
and `T[]` writes none.

`CFG002` refuses the selection outright, as an Error. The trigger is the absence of
`lib.es5.d.ts` from the files the Program actually LOADED, read from the Program rather than
re-derived from `lib` / `target`, since only the loaded set accounts for what a `full` lib pulls
in, what a reference chain adds, and the target's implicit default. It needs no maintained list,
so a tsgo bump can never break a consumer with it. Verified to separate cleanly:

```
["es5"] ["es2015"] ["es2022"] ["dom"] ["esnext","dom"], target with no lib  ->  ok
[]  ["es2015.core"]  ["esnext.disposable"]                                  ->  refuse
```

### 3. A TypeScript 6 floor

`typescript: ">=6.0.0"` joins `@ts-runtypes/devtools`'s peer list, optional in
`peerDependenciesMeta`. Optional is the honest shape: the resolver carries its own compiler and
never loads the consumer's, so a project with no TypeScript installed still builds. A build-time
check warns once per process when an older copy is found, and never fails a build.

## What was deleted

The contract became "is this in the supported data set", which is closed. That removed the reason
for every name list, and most of what the two PRs built around them.

| From | What it was | Why it went |
| --- | --- | --- |
| #173 | `NonSerializableExactGlobals`: `Error` and six subclasses, `WeakMap`, `WeakSet`, `Generator`, `Iterator`, `IteratorObject`, `ArrayIterator`, `MapIterator`, … | all lib-declared, so the closed set excludes them with no name |
| #173 | The fourteen typed-array names | replaced by the `ArrayBufferView` member shape, which also picks up `Float16Array` and anything a future lib adds |
| #174 | Base matching as a mechanism | one narrow case survives, a consumer class extending a raw buffer |
| #174 | MKR014, for when the list fell behind | a lib type is never walked, so it cannot reach the walk backstop |
| #174 | `runtype.safeGetBaseTypes` | a one-line pass-through to `typeid.BaseTypesOf` |
| #173 | `NON_SERIALIZABLE_GLOBALS` in the generated JS mirror | nothing in `packages/` ever read it |

`PromiseGlobals` was KEPT. The plan proposed matching a thenable structurally, the way
`DataOnlyStripped` does with `{then: (...) => unknown}`. That would classify any object carrying
a `then` member as a promise, which is the same over-reach review caught in #174 with iterators.
Two lib-declared names are the cheaper trade.

## The divergence, and why it needs no second list

`DataOnly<T>` cannot test "declared in the standard library"; TypeScript has no such predicate.
So for a lib class like `URL`, Go strips and `DataOnly<T>` keeps the data shape.

This does not get a list on the TypeScript side, because the build announces it. A property whose
value has no data form raises the per-family `…015` drop WARNING naming the property, and at root
the `…001` ERROR renders a throwing factory. Warning means an expected drop, Error means it would
throw. So a `URL` field now produces a build warning naming the property instead of silently
compiling a forty-member validator.

Two message texts were corrected while this landed. The `…015` detail named only binary examples,
so a dropped `URL` read as if RunTypes thought it was bytes. The root detail claimed `Map` and
`Set` cannot be validated, which is untrue, they are supported; it now states the rule and names
the five exceptions.

## Withdrawn

**Dropping type arguments from the non-serializable id.** Recommended early, then withdrawn. A
pinned test keeps them so the converter can print instantiations, and the `Uint8Array`
es2016/es2017 split is CORRECT: `ArrayBufferLike` genuinely differs per lib.

**Hard-failing against a maintained allowlist of lib sets.** Replaced by CFG002's base-edition
test, which needs no list. An allowlist would break every consumer on a tsgo bump that shipped a
new lib file, while catching nothing our own matrix would not.

**Folding the lib into the hash salt and the disk-cache fingerprint.** Built, measured, then
removed. It was written before the projection was inverted. The one concrete case for it was bare
`Uint8Array`, and once a lib type is taken atomically WITH its type arguments, that case is
written into the structural id itself:

```
es2016  30{32:bytes:2004{2004#ArrayBuffer}#Uint8Array}
es2017  30{32:bytes:2004{23{2004#ArrayBuffer,2004#SharedArrayBuffer}}#Uint8Array}
```

Two different ids, so no shared entry, with no salt involved. A model whose shape does not depend
on the lib measures identical on every lib, so the salt only moved ids that mean the same thing,
and it split the shared-model case where a backend on `["es2022"]` and a frontend on
`["es2022","dom"]` describe one type. Under the closed data set the remaining lib differences land
in one of three places, none silent: visible in the structural id, dropped identically on every
lib, or a hard error. `program.LibSet` was kept, since CFG002 reads it.

## Settled by measurement, not argument

- `dom` is purely additive, so a backend on `["es2022"]` and a frontend on `["es2022","dom"]`
  sharing a model is safe.
- Lib `.d.ts` text comes from our embedded tsgo, never the consumer's installed `typescript`.
- Type ids never leave one build.

## Tests

- `ts-go-runtypes/internal/cachegen/runtype/typeid/libatomic_test.go` — `URL`,
  `Intl.DateTimeFormat` and `Object` project whole with one id on every lib; `Partial` / `Record`
  / `Readonly` still walk; an augmented lib interface goes back to being the author's. Both
  marker call shapes, paired.
- `ts-go-runtypes/internal/cachegen/runtype/typeid/esnext_lib_test.go` — the lib matrix now
  asserts a per-shape structural id across nine lib selections (`dom` included) rather than that
  a site came out, which is how the `Uint8Array` split survived it before.
  `TestLibMatrix_ALibDifferenceShowsInTheId` is the pin that says why ids are not lib-scoped, and
  the signal to reopen that if it ever fails.
- `ts-go-runtypes/internal/cachegen/runtype/typeid/libguard_test.go` — CFG002 fires for each
  unsound selection and for none of the sound ones, plus the asymmetry it exists for:
  `Array<number>` is MKR013's job and `number[]` is nobody else's.
- `ts-go-runtypes/internal/cachegen/runtype/typeid/nonserializable_test.go` — the #174 pins all
  still pass, and a staged lib spiral is taken whole instead of reaching the walk backstop.
- `ts-go-runtypes/internal/compiler/resolver/libdrop_test.go` — end to end: a `URL` property
  raises the `…015` Warning naming it and no root Error, a `URL` at root raises the `…001` Error.
- `ts-go-runtypes/internal/compiler/program/libset_test.go` — what the Program actually loaded,
  and which selections carry a base edition.
- `packages/ts-runtypes-devtools/test/unsupported-lib-selection.test.ts` — CFG002 through the
  daemon, with the lib in a real tsconfig. Both marker call shapes, paired.
- `packages/ts-runtypes-devtools/test/typescript-floor.test.ts` — warns once below the floor,
  quiet at or above it, quiet with no install, and never throws.

## Docs

- `08.diagnostics.md` — the MKR014 paragraph is replaced by CFG002.
- `02.guide/03.validation.md` — a new section says standard-library types are not expanded, names
  the five that are supported, shows the warning, and gives the one-line workaround.

## Follow-ups

Two guidelines todos came out of this, both filed and neither started. The closed contract is what
makes them possible: the supported set now grows one reviewed type at a time.

- Which standard-library globals should become data-only, `URL` first.
- Binary as data under binary serialization only, as an explicit consumer opt-in.
