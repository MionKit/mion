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

## Options, assessed against that evidence

### Option 1: pin the supported lib and hard-fail outside it

Rejected in its strong form, recommended in a weaker one. The evidence says nearly every
lib is already fine, so refusing to compile under es2019 would cost a consumer a tsconfig
edit and buy nothing. What IS worth refusing is a lib set we have not proven: a future
edition, a hand-listed lib file set, `noLib`.

Change required: read the effective lib set (the bundled `lib.*.d.ts` files the Program
actually loaded, which is more honest than re-deriving from `Lib`/`target`), compare
against the set the matrix test covers, and raise a new config-level error when it is not
covered. `CodeTsconfigLoadFailed` (CFG001) is the shape to copy: a config-level code the
daemon tags on the failed op and the CLI lanes exit on. Cost: one new diagnostic code plus
message, ~40 lines in `program`/`resolver`, one test per lane, and a docs entry on the
diagnostics page. Ongoing cost: one list to extend per TypeScript edition, which the matrix
already forces.

### Option 2: support every existing lib and prove it

Recommended, and it is the load-bearing piece, but it is not sufficient alone: it catches
our regressions, never a consumer sitting on something we never listed. Pair it with
option 1.

Change required: replace `TestLibMatrix_ReflectionSurvivesEveryLib`'s hand-written 7 libs
with the full set tsgo ships (`tsoptions.Libs`), widen the shape corpus to the ~25 probed
here, and add the assertion the current test lacks: **every cell must match a recorded
baseline id**, not merely produce a site. Today it only checks `len(response.Sites) == 1`,
which is exactly why the `Uint8Array` split survived it. Cost: rewrite of one test file,
runtime around 30 to 40 seconds for the full cross product (measured 7s for 18x18). Add
`lib: []`, `dom`-without-an-ES-lib and target-with-no-lib as their own cells, since all
three produced distinct behaviour.

### Option 3: record the lib so a cache entry cannot be reused across libs

Decided: do it, as a **hash salt**, mirroring how `constants.Version` already works.

`serialize.go:541` already salts every wire hash with the binary version:

```go
func versionSalt() string { return constants.Version + "|" }
// folded in via
return cache.dict.UniqueSalted(versionSalt(), structural, length)
```

The lib fingerprint joins it: `constants.Version + "|" + libFingerprint + "|"`.

**Two layers, and the split is load-bearing:**

| layer | lib-scoped | why |
| --- | --- | --- |
| structural id string | no, stays lib-free | it is the oracle the matrix asserts on. If it moves between libs that is a bug we want to see |
| wire hash + disk-cache fingerprint | yes, salted | safety net for drift we have not found yet |

Salting the STRUCTURAL id would make every lib difference invisible by construction and the
`Uint8Array` split above would have been unfindable. Salt only the short hash.

Consequence for the tests: `TestLibMatrix_OneIdAcrossEveryLib` compares `root.ID`, the wire
hash, which now differs by design. It must compare `cache.StructuralForHash(root.ID)`
instead. That is the better assertion anyway, since a failure then names what differed.

Also fold the lib fingerprint into `diskcache.FingerprintInputs` and bump its tag `"v11"` to
`"v12"`, so a tsconfig lib edit orphans the previous cache directory.

**What this actually buys today, measured rather than assumed.** Type ids never leave a
single build: no published package ships a genDir (checked every `files` list in
`packages/*/package.json`), and no type id crosses the `@mionjs/client` wire. So the salt
covers a warm disk cache surviving a tsconfig edit, and any future shipped or shared cache.
Cheap insurance, not the fix. Cost: about 10 lines plus the fingerprint tag and the test
change above.

### Option 4 (narrower, and the highest value): fix the two silent causes

This falls straight out of the blast radius and should lead, because it removes the
difference rather than detecting it.

**4a. Drop type arguments from the non-serializable structural id.** The branch already
declares that identity is the constructor name and not the member surface; the type
arguments are the same kind of lib detail. Nothing downstream reads them as data (every
emitter strips non-serializable values). This also merges `Uint8Array` with
`Uint8Array<ArrayBuffer>`, which is correct. Cost: about 5 lines in `typeid.go`, plus
tests. **It changes ids**, so it is a breaking rebuild for consumers, which the version
salt already handles across releases.

**4b. Extend the silent-any guard past written names.** `T[]` and `readonly T[]` need the
same treatment `Array<T>` gets. The condition to key on is the checker's missing-global-
type state rather than a written identifier. Cost: a new branch in the MKR013 path plus
tests; possibly a sibling code if the message needs to name the missing global instead of
the written name.

## Recommendation

Decided with the owner. Ship in this order:

1. **Fix the two silent causes** (4a, 4b). Without this the matrix records the drift instead
   of removing it.
2. **Rewrite the lib matrix** over every lib and every probed shape, asserting a baseline
   **structural** id per cell (not just "a site came out"). This is what turns "we support
   all libs" from a claim into a gate.
3. **Salt the wire hash and the disk-cache fingerprint with the lib fingerprint** (option 3),
   leaving the structural id lib-free.
4. **Hard-fail on a lib set the matrix does not cover**, with a new config-level ERROR code.

Steps 1 to 3 sit inside the standing constraint (support all existing libs). Step 4 is the
hard fail the constraint reserved, scoped to a lib set we have NOT proven, so no consumer on
a real TypeScript lib is ever turned away.

### Owner decisions taken

- **Step 4 is an error, not a warning.** An unproven lib set stops the build.
- **Changing type ids is acceptable.** Type ids exist for idempotency (the same type always
  lands on the same entry), not as a stable published identity, so 4a's id change is fine.
- **Fold the lib into the hash**, exactly as `constants.Version` already is. Design in
  option 3 above.

### Cut from this todo

A `typescript` peer range on `ts-runtypes-devtools` was proposed and dropped. It is a
different axis: the eslib comes from the consumer's tsconfig and selects a subset of OUR
embedded libs, so their installed `typescript` cannot change what we reflect. The only real
gap is that `ts-runtypes-devtools` declares no `typescript` peer at all while `ts-runtypes`
publishes `src` carrying `.ts` import specifiers (`import {getRTUtils} from
'./runtypes/rtUtils.ts'`), which needs a floor stated somewhere. The suggestion that a
consumer's older TypeScript could make `DataOnly<T>` disagree with the Go projection was NOT
reproduced and should not be treated as established. Separate work.

**Out of scope:** the two items left open by the ESNext Buffer fix (the iterator
disagreement between the Go set and `DataOnly<T>`, and type-only names reaching
`classType = globalThis.<name>`). Recorded in
docs/done/esnext-buffer-reflection-mkr009.md, their own work. `Blob` under `dom` raising
MKR014 is a genuine coverage gap found here; it is loud, so it is its own fix, not this one.

## Done when

Steps 1 to 4 under Recommendation are implemented, the lib matrix asserts baseline
STRUCTURAL ids across the full lib set, `pnpm test` and
`go -C ts-go-runtypes test ./internal/...` are green, and the diagnostics page documents the
new hard-fail code.
