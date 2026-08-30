---
type: fix
spec: ready
status: ready
created: 2026-08-30
---

# What a consumer's TypeScript lib version does to what we compile

## Intent

The resolver adopts the consumer's tsconfig wholesale, on purpose: it and their own `tsc`
must agree about every type. The consequence is that the `lib` they select decides what
shape the resolver actually sees. We do not record that, check it, or test against most of
it.

The ESNext Buffer fix (docs/done/esnext-buffer-reflection-mkr009.md) was one symptom, and
fixing it produced two more, which is what makes this worth investigating rather than
patching again:

- A fix for one type did not cover the next one. `Buffer` was fixed; `PromiseLike` was
  still broken by the same mechanism and was found only by accident.
- Recognising a family by what it inherits fixed binary types and silently broke iterable
  ones, stripping the data fields off any user type that extends `Iterator`. Caught in
  review, not by design.

The concern under all of it: **we write functionality against a particular type shape, and
a consumer on a different lib hands us a different shape.** When that difference makes the
build stop, we find out. When it does not, we compile something that quietly does not
match what the code was written against, and nobody knows what the difference was.

## Blast radius: what was measured

The instrument was a throwaway Go test in
`internal/cachegen/runtype/typeid`, reusing `scanUnderLib`'s real-tsconfig harness: 18 lib
settings crossed with ~25 type shapes, printing the site id and every diagnostic. Whole
sweep ran in about 7 seconds. Everything in this section is a measured result, not an
argument.

### The loud set (build stops, already tolerable)

`MKR013` (unresolved type name) is the workhorse and it **does** cover the standard
library. Every one of these halts the build:

| what | when |
| --- | --- |
| `Set` / `Map` | `lib: ["es5"]`, `lib: []` |
| `Date`, `RegExp`, `Error`, `Promise`, `Uint8Array`, `Array<number>` | `lib: []` |
| `URL`, `Blob` | any lib without `dom` |
| `WeakRef` | anything below es2021 |
| `AsyncIterable` | anything below es2018 |

`MKR014` fires for `Blob` **with** `dom` (a real coverage gap on our side: the walk spirals
inside the DOM stream types). Loud, and it names us as the culprit, which is correct.

### What a structural id is (needed to read the rest)

The structural id is the string computed BEFORE hashing: a compact spelling of kind plus
children. `quickHash` turns it into the 7-char id that appears in generated code. It is what
the examples below print.

```
string                                     ->  5
{a: string; b: number}                     ->  30{32:a:5,32:b:6}
{id: number; at: Date; tags: string[]}     ->  30{32:at:2001,32:id:6,32:tags:25:0:5}
{seen: Set<string>; byId: Map<string,number>}
                                           ->  30{32:byId:2002{1801:5,1802:6},32:seen:2003{1803:5}}
```

`5` string, `6` number, `30` object, `32` property, `25` array, `2001` Date, `2002` / `2003`
Map and Set, `2004` non-serializable. `constants.Version` is NOT in this string; it is salted
into the hash only (`serialize.go:545`), which is exactly the layering option 3 adopts for
the lib.

### The silent set (compiles, different shape, no diagnostic)

This is the actual problem. Same source, different id, nothing said.

**1. Typed-array ids drift on the type argument, and the argument is a lib artifact.**

```
Uint8Array              es5 es2015 es2016 -> xpT1NJx
                        es2017 .. esnext  -> fbpFHRp     # silent split
Uint8Array<ArrayBuffer> every lib         -> xpT1NJx
DataView                same split at es2017
```

The cause is in `typeid.go`, the non-serializable branch. That branch exists precisely
because "identity is the CONSTRUCTOR NAME, never the lib member surface", but it then
appends the type arguments:

```go
if _, ok := NonSerializableBuiltinOf(computer.typeChecker, tsType); ok {
    id := strconv.Itoa(int(reflection.SubKindNonSerializable))
    if tsType.ObjectFlags()&checker.ObjectFlagsReference != 0 {
        if typeArguments := computer.typeChecker.GetTypeArguments(tsType); len(typeArguments) > 0 {
            id = collectionJoined(int(reflection.SubKindNonSerializable),
                strings.Join(computer.childIDs(typeArguments), ","), false)
```

`Uint8Array`'s default argument is `ArrayBufferLike`, which is `ArrayBuffer` up to es2016
and `ArrayBuffer | SharedArrayBuffer` from es2017 (when `SharedArrayBuffer` arrives). So
the id moves with the lib, for a value whose payload is bytes either way.

Note the second half of that result: on **every modern lib**, `Uint8Array` and
`Uint8Array<ArrayBuffer>` are two cache entries for one runtime value. That is a live bug
on the default config, not only an old-lib worry.

`Buffer` is immune only by luck: `@types/node` writes `Uint8Array<ArrayBuffer>` explicitly,
so it pins the argument. The Buffer fix's own matrix starts at es2020, where the split has
already happened, which is why it never saw this.

**2. Array sugar bypasses the silent-any guard entirely.**

```
Array<number>       lib: []  -> MKR013, build stops        # name-keyed guard works
number[]            lib: []  -> compiles, becomes {}       # no diagnostic
readonly string[]   lib: []  -> compiles, becomes {}       # no diagnostic
```

`MKR013` keys on a written type NAME resolving to the checker's error type. `T[]` writes no
name, so the guard never looks, and the checker hands back an anonymous empty object. The
emitted validator for `number[][]` under `lib: []` accepts anything. This is the worst
failure shape we have: silent, and semantically wrong rather than merely differently
hashed.

**3. Any lib type we do not handle is walked, so its id is its lib's member surface.**

```
Intl.DateTimeFormat   4 distinct ids: es5.. / es2017-18 / es2019-20 / es2021+
Object                3 distinct ids: es5 / es2015-es2025 / esnext
URL                   2 distinct ids: dom+es2020 / dom+esnext
```

`Date`, `Map`, `Set`, `RegExp`, `Promise`, `Error` and the typed arrays are all handled
atomically and are stable. Everything else in the standard library is walked, and a walked
lib type's id is a function of that lib edition. Nothing flags it.

**3b. The backend/frontend case, and where the real hazard turned out to be.** Adding `dom`
is purely ADDITIVE: it introduces new names and never redefines the ES ones. Measured over
eight shared-model shapes crossed with three ES libs, each with and without `dom`:

```
sharedApiModel     es2022 -> j1x3ZJn    es2022+dom -> j1x3ZJn    same
withBytes          es2022 -> bD7Pjb5    es2022+dom -> bD7Pjb5    same
withRecord / withNestedArrays / withPromiseField / withErrorField / withRegExp /
withOptionalUnion                                                 all same
```

So a backend on `["es2022"]` and a frontend on `["es2022","dom"]` sharing a model type is
safe, and the same held on esnext and on es2024 with `dom.iterable`.

The hazard is one layer down: a name that exists in BOTH environments with DIFFERENT
declarations. `URL` is the case, and it is silent on both sides:

```
backend  (@types/node URL)  30{32:link:30{32:href:5,32:origin:5,32:pathname:5,33toJSON{->5}}}
frontend (dom URL)          30{32:link:30{32:hash:5,32:host:5,32:hostname:5,32:href:5,
                                 32:origin:5#ro,32:password:5, ... 40-odd members ...}}
```

Both shapes are wrong, not merely different: `URL` is not serialisable data and should never
have been walked. The lesson for the fix is that stabilising ids is not enough on its own.
A lib type we have not decided about needs to be refused or taken atomically, the way
`Date` and the typed arrays already are.

### Does the consumer's TypeScript version matter separately?

**No, not for what we reflect, and the reason is worth writing down.** The lib `.d.ts` text
is embedded in our own binary:

```go
// program.go, both New and NewInferred
host := compiler.NewCompilerHost(cwd, fileSystem, bundled.LibPath(), nil, nil)
```

`bundled.LibPath()` is tsgo's embedded lib directory. The consumer's
`node_modules/typescript` is never read for lib files. So their `lib`/`target` selects a
subset of OUR standard library, and their TypeScript version cannot change the text.

That closes the question the todo asked, and opens a different one. The TS-side half of the
contract (`DataOnly<T>`, the marker brands) is evaluated by THEIR checker against THEIR
lib. `Uint8Array` became generic in TypeScript 5.7; a consumer below that has a
non-generic `Uint8Array` while we reflect a generic one, and the two projections can
disagree with nothing to catch it. `ts-runtypes-devtools` declares **no** `typescript` peer
at all today (only `@ts-runtypes/bin` and an optional `vite`), so nothing states a
supported range. `@mionjs/devtools` has `typescript: ">=6.0.0"`, lower bound only.

### Is the structural id supposed to be lib-independent?

Yes, and `TestLibMatrix_OneIdAcrossEveryLib` already asserts it (over es2020..esnext, on
four shapes). The measurements above say the assertion is true only because those shapes
and those libs were chosen.

Worth recording what is NOT at risk: ids do not cross a project boundary. They are minted
per build into that project's `genDir`, and nothing in `@mionjs/client` puts a type id on
the wire. So a lib difference between two projects cannot make one project's compiled
validator stand in for another's. The one place a stale entry can survive a lib change is
the disk cache under `node_modules/.cache/ts-runtypes/<optsFingerprint>/`, whose
fingerprint does not include the lib.

## Corrections to the first pass

Two recommendations in the first assessment were built on the measured evidence but not
checked against the EXISTING TESTS of the code they proposed changing. Both are withdrawn.
Recorded here so the next pass does not re-propose them.

**Withdrawn: "drop type arguments from the non-serializable structural id".** There is a
pinned test that keeps them on purpose:

```go
// TestStructural_NonSerializableDistinctByArguments — type arguments stay in
// the id, in lockstep with projectClass (which keeps them in Arguments). The
// converter reads those arguments back out of the cached node to print the
// escape, so two instantiations sharing an entry would print one's arguments
// for the other.
```

And the `Uint8Array` id split is not a correctness bug. `ArrayBufferLike` is `ArrayBuffer`
up to es2016 and `ArrayBuffer | SharedArrayBuffer` from es2017, so bare `Uint8Array` really
does denote a different type on the two libs and the id is right to track it. The cost is a
duplicate cache entry. The
measurement stands; calling it a silent correctness bug did not.

**Withdrawn: "hard-fail against a maintained allowlist of proven lib SETS".** Writing it
showed the cost lands in the wrong place: a tsgo bump that ships a new lib file would break
every consumer until the list was updated, while catching nothing our own matrix would not
already catch in CI. Replaced by CFG002 below, which needs no maintained list.

## Plan

### 1. Fold the lib into the hash salt and the disk-cache fingerprint — WITHDRAWN

Built, measured, then removed. It was written before the projection was inverted, and the
inversion made it dead weight.

The idea was to salt every wire hash with a digest of the loaded lib files, so a compiled entry
from one lib selection could never be served under another. The one concrete case anyone could
name for it was bare `Uint8Array`, whose default argument `ArrayBufferLike` is `ArrayBuffer` up
to es2016 and `ArrayBuffer | SharedArrayBuffer` from es2017.

Once a standard-library type is taken atomically WITH its type arguments, that case is written
into the structural id itself:

```
es2016  30{32:bytes:2004{2004#ArrayBuffer}#Uint8Array}
es2017  30{32:bytes:2004{23{2004#ArrayBuffer,2004#SharedArrayBuffer}}#Uint8Array}
```

Two different ids, so no shared entry, with no salt involved. And a model whose shape does NOT
depend on the lib now measures identical on every lib, which is exactly the case the salt would
have moved for nothing. Under the closed data set the remaining lib differences land in one of
three places, none of them silent: visible in the structural id (a lib type and its arguments),
dropped identically on every lib (a lib type is never data), or a hard error (the type does not
exist under this lib, MKR007 / MKR013 / CFG002).

Kept from the work: `program.LibSet`, which CFG002 needs to read the loaded lib files. Removed:
`LibSet.Fingerprint`, `runtype.Options.LibFingerprint`, `Cache.SetLibFingerprint`, the
`libFingerprint` threading through the resolver, and the `diskcache` field with its `"v12"` tag
bump.

Pinned by `TestLibMatrix_ALibDifferenceShowsInTheId`, which fails if the structural id ever
stops carrying that difference. That is the signal to reopen this.

### 2. CFG002: hard-fail when the lib declares no base ECMAScript edition

The only hard fail that is defensible on the evidence, and it closes the worst hole found.

Trigger: the loaded lib set contains no base edition (`lib.es5.d.ts`). Verified to separate
the unsound selections from every realistic one:

```
lib:["es5"] ["es2015"] ["es2022"] ["dom"] ["esnext","dom"], target with no lib  ->  ok
lib:[]  ["es2015.core"]  ["esnext.disposable"]                                  ->  refuse
```

Without a base edition TypeScript never declares `Array`, so `number[]` resolves to an empty
object and the generated validator accepts anything, with no diagnostic anywhere. The
silent-`any` guard family cannot reach it: MKR013 keys on a written type NAME and array sugar
writes none. Needs no maintained list, so a tsgo bump can never break a consumer with it.

Severity: ERROR, per the owner decision.

### 3. Walked lib types: OPEN, needs a decision

The remaining silent problem, and there is no safe design yet.

```
Intl.DateTimeFormat   4 distinct ids across libs
Object                3 distinct ids
URL                   @types/node's vs dom's: two entirely different member surfaces
```

Three candidates, to be measured against the repo's own suite before one is chosen:

- **(a) Error** on any lib-declared type the projection has not handled. Strongest guarantee,
  but it also catches `Iterable` and `ArrayLike`, which do appear in real models.
- **(b) Take them atomically** (non-serializable) instead of walking. No build break and the
  nonsense shapes stop, but it silently changes what such a field validates as.
- **(c) Leave it** and revisit.

The blast radius of (a) and (b) on the existing suite is the measurement that should decide
this, and it has not been run.

### 4. Lib matrix over every lib, with baseline ids

Replace `TestLibMatrix_ReflectionSurvivesEveryLib`'s hand-written 7 libs and 4 shapes with
the full set tsgo ships and the ~25 shapes probed above. Two assertions per cell: no error
diagnostic, and the STRUCTURAL id matches a recorded per-lib baseline. Today it only checks
`len(response.Sites) == 1`, which is why the `Uint8Array` split survived it.

Keep a separate cross-lib equality assertion, but only for shapes that MUST be lib
independent (plain models, `Date` / `Set` / `Map`, an explicitly argued
`Uint8Array<ArrayBuffer>`). Bare `Uint8Array` is explicitly NOT one of them, and the test
should say why.

`TestLibMatrix_OneIdAcrossEveryLib` compares `root.ID`, the wire hash. It must compare
`cache.StructuralForHash(root.ID)` as well, so the assertion holds at both layers.

Measured cost: 18 libs x 18 shapes ran in about 7 seconds, so the full cross product is well
inside a normal test budget.

### 5. TypeScript floor

`ts-runtypes-devtools` declares no `typescript` peer at all. Add `typescript: ">=6.0.0"`, and
a WARNING (never an error) when the detected version is below it. package.json is the
contract; the warning is a convenience.

### 6. Docs

CFG002 on the diagnostics page, beside the existing MKR007 / MKR013 / MKR014 entries.

## Done when

Steps 1, 2, 4, 5 and 6 are implemented, step 3 has a decision behind it and is either
implemented or split into its own spec, the lib matrix asserts baseline structural ids across
the full lib set, `pnpm test` and `go -C ts-go-runtypes test ./internal/...` are green, and
the diagnostics page documents CFG002.
