# Class serializer redesign — optional `serialize`, class-derived identity, class-in-union reconstruction

**Status:** DONE (Phase 1 shipped PR #189; triaged to done 2026-07-25) — the API
redesign + class-in-union reconstruction shipped (union discriminant = the **numeric
member index**, superseding the original `rt$classID` string-tag design). The registry
is keyed by the injected **type id** (namespace dropped). Only open-world polymorphism
(Phase 2) stays deferred, and it is tracked in
[docs/ROADMAP.md](../ROADMAP.md) (see the class-serializer entry) — nothing in Phase 1
is outstanding, so this spec moves to done.
**Created:** 2026-07-06

> **Triage note (2026-07-25):** every Phase-1 claim below was re-verified against the
> code and is substantively in the tree (`classSerializerRegistry.ts` new signature +
> `deserializeClass` + epoch cache, `class_serializer.go` emit, `typeid.go` `#<ClassName>`
> fold, `union_flat_layout.go` atomic-member routing + `instanceof` guard, CLS001 update +
> runtime CLS002, docs + example). Two things the prose predates:
> 1. **Keying is now TWO-LANE, not type-id-only.** A later enhancement (shipped under
>    [docs/done/generic-class-serializers-single-instantiation.md](../done/generic-class-serializers-single-instantiation.md))
>    added a class-name fallback lane, so emit passes the two-arg
>    `utl.getClassSerializer('<rt.ID>', '<rt.TypeName>')` and the runtime keeps both an
>    exact-id map and a by-name map. The "keyed by the injected type id" / single-arg
>    emit wording below is understated but not wrong (the id is still the primary key).
> 2. **Tests are split across files.** `classSerializer.test.ts` holds the monomorphic /
>    auto-instantiate / CLS002 / isolation cases; the union coverage (JSON class unions,
>    class+object, binary union, codecs-agree) lives in `classSerializerUnion.test.ts`,
>    and the name-lane cases in `classSerializerGenerics.test.ts`. Coverage is complete.
>
> **Minor doc-drift found (not blocking, surfaced for cleanup):** the cross-reference to
> `class-serializer-custom-wire-shape.md` is stale in four places — it points at
> `docs/todos/` but the file now lives in `docs/done/` (`docs/ROADMAP.md`,
> `docs/ARCHITECTURE.md`, `packages/ts-runtypes/test/features/classSerializer.test.ts`,
> and the `classSerializerRegistry.ts` header comment). Fixing those paths was left out
> of this triage (two are in code, outside the "move the docs" scope).
**Area:** JSON + binary codecs (`pj` / `pjs` / `sj` / `rj` / `tb` / `fb` families), flat-union machinery, type-id, marker injection, runtime registry
**Supersedes:** the T7 class-serializer contract (both `serialize` + `deserialize` required, keyed by bare class name)

> **Design changes (agreed with the maintainer):**
> 1. The JSON-union discriminant is the union's **existing numeric member index**,
>    not a synthetic `rt$classID` string. The flat union already writes an
>    `[idx, value]` envelope (the same discriminant binary uses); routing each named
>    class member through that per-member index reuses the class-serializer wrappers
>    and needs no wire string. The old `rt$classID` prose below is kept for history.
> 2. A compile-time (comptime-scanned) registration was considered and **rejected**:
>    the client and server can register DIFFERENT serializers against the same build
>    artifact, so registration state cannot be embedded in the emitted code or the
>    type id. The lookup stays a runtime registry.
> 3. The registry is keyed by the injected **type id**, NOT the class name, and the
>    `namespace` parameter is dropped (it fed only the now-dead `rt$classID` string).
>    See "Registry keying" below.

## What shipped (PR #189)

The runtime API redesign and auto-instantiate, end to end (JSON + binary,
monomorphic and nested / array positions), fully tested and documented:

- **New signature** `registerClassSerializer(cls, handler?)` — the client passes the
  class itself (not a name string, no namespace). A trailing `id?: InjectRunTypeId<T>`
  slot is injected by the plugin (T infers from the `new () => T` constructor param),
  and the registry is keyed by that type id (see "Registry keying"). The entry stores
  the constructor + the optional halves. Overloads make `deserialize` optional only
  for a `SerializableClass` (zero-arg constructor) and required for any `AnyClass`.
- **`serialize` optional** — omit for structural encode. The encode wrappers gate on
  `cs && cs.serialize`.
- **`deserialize` optional for zero-arg classes** — default is
  `Object.assign(new cls(), decodedData)` via the new `utl.deserializeClass` helper;
  the decode wrappers route through it. A registered class without a custom `serialize`
  runs the structural decode first (→ `DataOnly`), then reconstructs the instance, so
  `deserialize(data: DataOnly<T>): T` always receives the data-only projection.
- **CLS001** message updated to the new signature; **CLS002** added as a runtime error
  when the auto `new cls()` throws (constructor needs args, no `deserialize`).
- The dead `rtUtils` scaffolding (`setSerializableClass` / `setDeserializeFn` / …) was
  deleted; `AnyClass` / `SerializableClass` / `DeserializeClassFn` moved next to the
  single public registry.

### 0. Registry keying — injected type id, no namespace

The registry is keyed by the class's structural **type id**, not its name:

- **Why not the name.** Name keying breaks under class-name minification (a prod
  bundler mangles `cls.name` to `a`, but the compiler baked the literal `'Point'` into
  the emitted lookup → miss → the class SILENTLY stops reconstructing), and it collides
  two same-name / different-shape classes. The type id is build-time-stable and matches
  the class node's `rt.ID` the emitter already uses.
- **How the id reaches registration.** `registerClassSerializer<T>(cls, handler?, id?)`
  declares a trailing `id?: InjectRunTypeId<T>`; the marker scanner injects T's entry
  tuple (T inferred from `cls: new () => T`). Registration extracts the id string via
  `entryTupleKey(id)` (mirroring `getRunTypeId`) and keys the map by it. **Verified by a
  spike:** `idFromClass<T>(cls: new () => T, id?: InjectRunTypeId<T>)` injects the same
  id as `getRunTypeId<T>()`.
- **Emit side.** `class_serializer.go` emits `utl.getClassSerializer(<rt.ID>)` instead
  of `getClassSerializer(<rt.TypeName>)`; the union `atomicEncodeDispatch` keys `cix_`
  off the member id. The `userClassName(rt) != ""` gate stays (it only decides WHETHER
  to emit a lookup — anonymous classes never route — not the key).
- **Consequence.** `registerClassSerializer` becomes plugin-dependent (it needs the
  injected id), consistent with the rest of the surface; a no-plugin registration could
  never match plugin-emitted codecs anyway. `unregisterClassSerializer(cls)` uses a
  reverse `cls → key` map (no re-injection), or tests use `clearClassSerializers`.

### Runtime access — epoch-cached closure lookup

The emitted factory used to call `utl.getClassSerializer(<id>)` (a Map lookup) on every
(de)serialization. It now caches the entry in the factory CLOSURE and re-looks-up only
when the registry changes: the registry keeps a monotonic `epoch` (bumped on
register / unregister / clear), exposed as `utl.csEpoch()`, and each class factory emits

```
closure:  let cs_<id>, cs_<id>_ep = -1
per-call: if (cs_<id>_ep !== utl.csEpoch()) { cs_<id> = utl.getClassSerializer('<id>'); cs_<id>_ep = utl.csEpoch(); }
```

So a hot loop pays one int compare per call instead of a Map lookup, while
register / clear still take effect immediately (they move the epoch, so the next call's
guard misses and re-reads). This preserves the "register anytime, even on an
already-materialized factory" contract. Comptime baking of registration was rejected
(client and server can register different serializers against one build), so the runtime
lookup stays — this just makes it cheap.

## Union reconstruction — final design (shipped)

### 1. Type-id: fold the class name into a plain class's structural id

A plain user class routes reconstruction through the type-id-keyed registry (see
"Registry keying"). Two structurally-identical classes with different names
(`class A {x:number}` vs `class B {x:number}`) previously collapsed to ONE structural
id → one shared cache entry → mis-routed (de)serialization, and in a union both members
became one node so nothing could tell them apart. It also means the registry key
(the id) would be identical for both. Fix: the plain-class (`KindClass` + `SubKindNone`)
structural id now appends `#<ClassName>` outside the member group
([`typeid.go`](../../ts-go-runtypes/internal/cachegen/runtype/typeid/typeid.go), the
`isClass` branch). Anonymous classes (0xFE internal symbol name, same test as
`userClassName`) are never registered and keep the nameless id. Interfaces / object
literals are unaffected (name-irrelevant pure data). This fold-in is what makes both
the union routing AND the type-id registry key sound for same-shape classes.
**Done — Go suite green.**

### 2. Route named class union members through the per-member index

The flat union already splits members into an **atomic** bucket (per-member
`[idx, value]` dispatch) and an **object** bucket (merged into one `[-1, merged]`
branch). Plain classes currently fall into the object bucket, so their properties are
structurally merged and the class-serializer wrapper is bypassed. Change:

- **Layout** ([`union_flat_layout.go`](../../ts-go-runtypes/internal/cachegen/typefunctions/union_flat_layout.go)):
  bucket a named plain class (`userClassName != ""`) into **AtomicMembers** (keeping its
  `OriginalIndex`), NOT ObjectMembers. It then compiles via `CompileChild`, hitting the
  `KindClass` encode/decode arms — i.e. the class-serializer wrappers already shipped.
- **Force the envelope**: a plain class is `isJsonCompatible` (number props round-trip),
  so a class union would otherwise `roundTripsRaw` and decode as identity. When the
  layout has ≥1 named class atomic member, force `AtomicNeedsTuple` so the `[idx, value]`
  envelope is written and the decoder runs (and can reconstruct).
- **Encode guard** (pj / pjs / sj): a class member's arm is guarded by **instance
  identity** — `cs_<name> && v instanceof cs_<name>.cls` — read from the registry.
  `instanceof` separates same-shape classes cleanly (distinct prototypes), and an
  unregistered class (`cs_<name>` undefined) skips the identity arm. Identity arms are
  emitted BEFORE a **structural fallback** (the normal `unionMemberValidateCheck`) so a
  plain object assignable to a class-union position still routes (best-effort: same-shape
  fallback picks the first match). The selected member's `OriginalIndex` goes in the
  envelope.
- **Decode**: unchanged. The shared `emitUnionRestoreFromJsonFlat` already dispatches
  atomic members by `[idx, value]`; the class member's restore arm is the normal
  `CompileChild` restore = the class restore wrapper (structural restore → `DataOnly`,
  then `utl.deserializeClass`). So `deserialize` runs only after the value is restored
  to `DataOnly`, exactly as at a monomorphic position.
- **Binary**: already correct — `union_flat_binary.go` writes/reads a per-member index
  and compiles members via `CompileChild`, so class members reconstruct with no change.

### 3. Scope + behaviour

- Triggers ONLY for a union that contains ≥1 named class member. A union with no class
  members (including discriminated unions of plain object literals) is byte-for-byte
  unchanged and keeps its discriminator fast-path.
- Applies to **any** named class union member, independent of whether the members share
  a natural discriminator: reconstruction must be consistent ("a class in a union always
  comes back as an instance"), and registration is a runtime fact the build can't see.
  An unregistered class member falls back to a structural plain object, same as today,
  just inside the `[idx, value]` envelope.
- No wire string is added. No new family. No new structural-id hash input beyond the
  class-name fold in (1). Confirm the disk-cache fingerprint needs no bump and re-run the
  mode-parity + cache tests.

### 4. Still deferred

- **Phase 2 — open-world polymorphism** (a base-class / interface field reconstructs any
  registered subclass, candidate set not statically known). Needs a `classID`-keyed
  global registry index and open dispatch. Recorded in ROADMAP.
- **Custom `serialize` owning an arbitrary JSON wire shape** — a pre-existing limitation
  (the JSON decoder's structural `ukuw` pre-pass), filed in
  [class-serializer-custom-wire-shape.md](../todos/class-serializer-custom-wire-shape.md).

---

_The sections below are the ORIGINAL design record. The `rt$classID` string tag they
describe is superseded by the numeric-member-index design above; kept for historical
context and for the Phase-2 polymorphism notes._

## Summary

Today `registerClassSerializer(className, {serialize, deserialize})` demands **both**
halves and a hand-typed class-name string. In practice the encode half is almost
always just "serialize it like any other interface" — the only thing the app truly
has to supply is a way to get a **real instance back**. This todo makes `serialize`
optional (default: structural, same as any interface), makes `deserialize` optional for
classes with a zero-argument constructor (default: `new Cls()` then overwrite the decoded
props), and changes the signature so the user passes a **namespace** and the **class
itself** instead of a name string:

```ts
// zero-arg constructor: nothing else needed — client just hands over the class
registerClassSerializer('billing', Money);

// non-empty constructor: only deserialize is required
registerClassSerializer('billing', Money, {
  deserialize: (data) => new Money(data.amount, data.currency),
});

// custom encode still allowed, both halves optional where the defaults suffice
registerClassSerializer('billing', Money, {
  serialize: (m) => `${m.amount} ${m.currency}`,
  deserialize: (data) => Money.parse(String(data)),
});
```

The `rt$classID: '<namespace>::<ClassName>'` field is a **JSON-only synthetic union
discriminant**: it is written only where decode is otherwise ambiguous (a union of
registered classes, a class-vs-object union), so the decoder can pick which class to
rebuild. Monomorphic positions route positionally and carry no tag; the binary codec
never needs it because its union frame already writes a numeric member index.

## Why a class can't just be serialized automatically (the reasoning to put in the docs)

A plain object / interface is **pure data**: everything it carries survives JSON and
comes back the same. A class instance is not. Reconstructing one is not a data
problem, it is a *code* problem, and the build tool does not have that code:

- **The prototype is behaviour, not data.** Methods, getters and setters live on the
  prototype. They are functions (code), so they never ride the wire. `JSON.stringify`
  already drops them; there is nothing to serialize.
- **The constructor runs arbitrary logic.** Rebuilding a live instance means *running*
  the constructor (or a factory). It may validate invariants, derive fields, open
  resources, or capture values from module scope. Only the application can run it.
- **An instance can hold things that are not serializable at all:** closures, private
  `#fields`, symbols, imported singletons, DOM nodes, sockets, file handles. These are
  references into a running program, not values.
- **Identity and invariants.** Two instances with identical fields are not necessarily
  interchangeable. The constructor may enforce rules ("amount is always an integer
  number of cents") that a blind `Object.assign` would quietly violate.

So the wire can only carry the **data projection** of an instance. Turning that data
back into a live object requires the app to hand the runtime two things: the **class**
(a constructor to instantiate) and, when a bare instantiate + copy is not safe, a
**deserialize** function. That is the whole reason the registry exists — the build
cannot import your class or know its rules, but your app can register them once.

This is why `createValidateFn` is unaffected: it only ever checks the *structural shape*
of the data and never needs to bring an instance back to life.

## Current state (what exists today)

### Public API — T7, both halves required
[`packages/ts-runtypes/src/runtypes/classSerializerRegistry.ts`](../../packages/ts-runtypes/src/runtypes/classSerializerRegistry.ts)

```ts
interface ClassSerializer<T = any> {
  serialize(instance: T): unknown;   // required
  deserialize(data: unknown): T;     // required
}
function registerClassSerializer<T>(className: string, handler: ClassSerializer<T>): void;
```

Keyed by a hand-typed class-name string. Exported from
[`index.ts`](../../packages/ts-runtypes/src/index.ts) as `registerClassSerializer` +
`ClassSerializer`. Test coverage:
[`test/features/classSerializer.test.ts`](../../packages/ts-runtypes/test/features/classSerializer.test.ts).

### Routing is positional / static (no wire tag)
[`ts-go-runtypes/internal/cachegen/typefunctions/class_serializer.go`](../../ts-go-runtypes/internal/cachegen/typefunctions/class_serializer.go)

The compiler already knows a given position holds class `Money` (from the RunType graph,
`rt.TypeName`), so each JSON/binary family emits a per-position branch:

```js
const cs_Money = utl.getClassSerializer('Money')
if (cs_Money) { v = cs_Money.serialize(v) } else { /* structural */ }   // encode
if (cs_Money) { v = cs_Money.deserialize(v) } else { /* structural */ } // decode
```

The lookup is emitted **inside** the function body (per call), so registration can
happen any time before the first call. Nothing is written to or read from the wire to
identify the class — decode routing is 100% positional. Anonymous classes (TS internal
symbol names, `name[0] == 0xFE`) are never routed and never warned about.
`emitClassSerializerWarning` raises **CLS001** (Warning) once per compile pointing the
user at the registry.

### Unions already discriminate on a property (JSON) or an index (binary)
[`union_flat.go`](../../ts-go-runtypes/internal/cachegen/typefunctions/union_flat.go) /
[`union_flat_layout.go`](../../ts-go-runtypes/internal/cachegen/typefunctions/union_flat_layout.go) /
[`union_flat_binary.go`](../../ts-go-runtypes/internal/cachegen/typefunctions/union_flat_binary.go)

This is the machinery `rt$classID` plugs into:
- **JSON** — when object members share a required literal discriminant (`kind: "t0" | "t1"`),
  the `hasDiscDispatch` path reads that one field (`DiscName`) and gates each arm by its
  `DiscValues` — no re-validation, no index field. Non-discriminated unions fall back to
  structural trial (try each member's shape).
- **Binary** — `writeDiscriminator` / `readDiscriminator` *always* prepend a small uint
  **member index** on every union; decode reads it and dispatches to that member's arm.

### There is already dead scaffolding for exactly this feature
[`rtUtils.ts:140-168`](../../packages/ts-runtypes/src/runtypes/rtUtils.ts#L140) +
[`types.ts:213-223`](../../packages/ts-runtypes/src/runtypes/types.ts#L213)

An earlier sketch defined — but never wired or exported — precisely the shapes this
redesign needs:

```ts
export type DeserializeClassFn<C> = (deserialized: DataOnly<C>) => C;   // decode receives the data-only projection
export interface AnyClass<T = any>          { new (...args: any[]): T }  // any constructor
export interface SerializableClass<T = any> { new (): T }               // ZERO-ARG constructor

// rtUtils methods, present but unused:
setSerializableClass(cls)          // register a zero-arg class
setDeserializeFn(cls, deserializeFn)
useSerializeClass / getSerializeClass / useDeserializeFn / getDeserializeFn
```

`DeserializeClassFn = (DataOnly<C>) => C` is the auto-instantiate contract ("here is the
decoded data, return an instance"); `SerializableClass = new () => T` is exactly the
"has an empty constructor" predicate at the type level. **This redesign should revive
and unify this scaffolding, not add a third parallel registry.** Decide up front: fold
these methods into the single public registry, or delete them.

## Proposed API

Replace the name-string signature with a namespace + class signature. Overloads
enforce the "empty constructor ⇒ `deserialize` optional" rule *at compile time* by
keying on `SerializableClass<T>` (`new () => T`) vs `AnyClass<T>` (`new (...args) => T`):

```ts
interface ClassSerializerHandler<T> {
  /** Optional. Omit to serialize structurally (like any interface). */
  serialize?(instance: T): unknown;
  /** Receives the data-only projection; returns a real instance. */
  deserialize?(data: DataOnly<T>): T;
}

// Zero-arg constructor: everything optional. The client literally just hands over the class.
function registerClassSerializer<T>(
  namespace: string,
  cls: new () => T,
  handler?: ClassSerializerHandler<T>,
): void;

// Non-empty constructor: deserialize is REQUIRED (auto new Cls() is unavailable).
function registerClassSerializer<T>(
  namespace: string,
  cls: new (...args: any[]) => T,
  handler: ClassSerializerHandler<T> & { deserialize(data: DataOnly<T>): T },
): void;
```

- **`namespace`** — a short owner string, mirroring the existing pure-fn
  `"namespace::fnName"` key convention (`registerPureFnFactory('rt::foo', …)`). It makes
  the on-wire `rt$classID` globally unique so the same class name in two packages does
  not collide across a persisted / distributed payload.
- **`cls`** — the class itself. Gives the runtime the **constructor** (to instantiate)
  and the **name** (`cls.name`, no more hand-typed strings). The registry stores
  `classID = namespace + '::' + cls.name`.
- **`handler.serialize?`** — optional. Default = structural encode (identical to an
  interface of the same shape).
- **`handler.deserialize?`** — optional **only** for a zero-arg class. Default =
  `Object.assign(new cls(), decodedData)` (see runtime semantics). Required by the type
  system for any class whose constructor takes arguments.

`DataOnly<T>` is the same projection decoders already return
([`dataOnly.ts`](../../packages/ts-runtypes/src/runtypes/dataOnly.ts)), so
`deserialize` receives exactly what structural decode produced — methods already gone.

## Relationship to `overrideX<T>` — the impure sibling of a pure override

RunTypes already has a "user hands us a function, we call it instead of the emitted body"
surface: the `overrideX<T>` family in
[`overrideRTFunctions.ts`](../../packages/ts-runtypes/src/overrideRTFunctions.ts) —
`overrideJsonEncoder` / `overrideJsonDecoder` / `overrideBinaryEncoder` /
`overrideBinaryDecoder` (plus validate / unknownKeys / formatTransform). Every
`createX<T>()` for that T then returns the user's function. The custom `serialize` /
`deserialize` here are the **same idea**, so the docs should present them as one family —
but they occupy different lanes and cannot be merged:

| | `overrideX<T>(fn)` | class registry `serialize` / `deserialize` |
| --- | --- | --- |
| Function kind | **`PureFunction`** — no free capture, body hashed into T's type id | **impure** — captures the live class constructor / imports |
| Routing | compile-time cfn, folded into the type id (propagates to containing types) | runtime registry lookup (`getClassSerializer`), per position |
| Scope | any type `T` | classes (`KindClass`) |

The dividing line is **purity**. `overrideX` folds a *pure* body into the type hash and
re-emits it as codegen; a class serializer is fundamentally *impure* —
`deserialize: (d) => new Money(d.amount, d.currency)` captures the `Money` constructor, a
free import. That is exactly what "why a class can't be serialized" is about, and exactly
what `PureFunction` forbids. So class reconstruction **cannot** be expressed as an
`overrideX`; the class registry is the impure, class-keyed lane for precisely the thing the
pure overrides cannot carry. Both must exist. Frame them together in the docs ("customize
serialization: pure `overrideX<T>` for any type, the class registry for live classes") and
cross-reference, so a reader is not surprised there are two doors.

## Wire format — `rt$classID` is a JSON-only union discriminant

`rt$classID` is **not** a general "tag every class" field. Encode never needs it for its
own logic; it exists solely so **decode** can tell which class to rebuild, and decode only
cannot tell in **ambiguous positions**. So the tag is emitted *only* there:

| Position | Tag? | How decode routes |
| --- | --- | --- |
| Monomorphic field (`total: Money`) | **No** | Positional — the compiler already knows it is a `Money`. |
| JSON union of registered classes (`Circle \| Square`) | **Yes** | Reads `rt$classID`, dispatches to the member (synthetic discriminant). |
| JSON union of class + object (`Money \| {amount:number}`) | **Yes** | Tag says "rebuild a Money" vs "leave as a plain object". |
| **Binary**, any union | **No** | The union frame already writes a numeric member index, which routes to the member — and that member carries the class deserialize. |

So the tag is **JSON-only** and **union-only** (plus Phase-2 polymorphism). Binary gets
class-in-union reconstruction for free from its existing per-member index; do not add a
binary class field.

### It behaves like a literal discriminant property
Treat each registered class in a union as if it declared
`rt$classID: '<namespace>::<ClassName>'`, so it plugs into the existing discriminated-union
machinery (`DiscName` / `DiscValues` / `hasDiscDispatch` in
[`union_flat_layout.go`](../../ts-go-runtypes/internal/cachegen/typefunctions/union_flat_layout.go)).
The JSON object body is `'{' + parts.join(',') + '}'`
([`json_stringify.go:437`](../../ts-go-runtypes/internal/cachegen/typefunctions/json_stringify.go#L437)),
so encode adds one `parts` fragment; decode reads `v.rt$classID`, matches the arm, calls
that member's deserialize (or auto-`new`), and **strips** the key before it lands as a prop.

Two things keep it honest:

- **Namespace-correct without a compile-time literal.** The namespace is a runtime
  registration value, so the arm cannot hardcode the expected string. It reads it from the
  registry entry instead — each arm matches `v.rt$classID === cs_<member>?.classID`:

  ```js
  const d = v.rt$classID
  if (d === cs_Circle?.classID)      { /* Circle arm → deserialize / auto-new */ }
  else if (d === cs_Square?.classID) { /* Square arm */ }
  else                               { /* structural trial — members not registered */ }
  ```

  Static arm structure (compiler knows the members) + dynamic discriminant values (from the
  registry) + a **structural-trial fallback** for when the members were never registered
  (so no tag was written). That conditional fallback is the one way this differs from an
  ordinary static discriminated union.
- **Use-site decision, not a class property.** Whether a class writes the tag depends on
  its *parent* position (union vs monomorphic), so the decision lives on the **union node**,
  never on the canonical class node — per the "never store parent-relative data on a
  canonical node" rule.

### Custom `serialize` owns its wire shape — we do not tag it
When the user provides a `serialize`, they are in charge of the output, so the codec does
**not** inject `rt$classID` into it — imposing our envelope would override the control we just
handed them. The tag is added **only on the default structural path**, where the codec owns
the shape and always produces an object. Consequence: a class with a custom `serialize` that
returns a non-object (`Money → "4999 USD"`) opts out of JSON union discrimination — to sit in
an ambiguous JSON union it must either return a tagged object itself or move to binary (which
routes by member index and needs no tag). Binary is unaffected either way. See Open question 1.

### Reserved prefix
Document `rt$` as a reserved wire-key prefix (as `rt$errors` / `rt$label` are reserved in
enrichment maps). A user data key literally named `rt$classID` is a documented conflict.

## Runtime semantics

### Encode
1. `cs = utl.getClassSerializer('<TypeName>')`. If unregistered → structural fallback +
   **CLS001** (unchanged from today).
2. Registered:
   - `serialize` present → `out = cs.serialize(v)`; else structural encode of the declared props.
   - **Only at a JSON union position:** add `rt$classID: cs.classID` to `out` (structural
     output is always an object; for a non-object custom `serialize` see the envelope note
     above). Monomorphic positions add nothing. Binary adds nothing (the union index does the job).

### Decode
1. Structural decode produces the data-only object (as today).
2. Pick the class:
   - **Monomorphic** → `cs = utl.getClassSerializer('<TypeName>')` (positional, as today).
   - **JSON union** → dispatch on `v.rt$classID` matched against each member's `cs_*.classID`;
     fall back to structural trial when the tag is absent.
   - **Binary union** → the member index already selected the arm.
3. Strip `rt$classID` from the data (JSON union path only — it is never written elsewhere).
4. Reconstruct:
   - `deserialize` present → `cs.deserialize(strippedData)`.
   - `deserialize` absent (zero-arg class) → `Object.assign(new cs.cls(), strippedData)`.
5. If unregistered → structural plain object (as today).

### The zero-arg rule, honestly
`new Cls()` + `Object.assign` works even for `class Money { constructor(a, b) }` —
the params come in `undefined`, then get overwritten by the copy. It **only** breaks
when the constructor *does work that needs its args* (`constructor(x){ this.y = x.id }`
throws on `undefined`). That is not statically detectable in general, so:
- The **type system** encodes the guarantee: `SerializableClass = new () => T` means
  "safe to call with no args", so the overloads make `deserialize` optional only there.
- At **runtime**, if `deserialize` is absent and `new cls()` throws, surface a clear
  error ("class `<id>` needs constructor args; register a `deserialize`") rather than a
  raw constructor stack — see CLS002 below.

## Compiler / Go changes

Two areas: the per-position registry branch (exists today) and the union-discriminant
integration (new).

**Registry branch** — in / around
[`class_serializer.go`](../../ts-go-runtypes/internal/cachegen/typefunctions/class_serializer.go):
- **Encode wrappers** (`wrapPrepareWithClassSerializer`, `wrapSafeWith…`,
  `wrapStringifyWith…`): keep the `serialize`-or-structural branch; the structural arm now
  also serves as the default (no `serialize` registered). `wrapToBinaryWith…` /
  `wrapFromBinaryWith…` keep routing through the registered handler.
- **Decode wrappers** (`wrapRestoreWith…`, `wrapFromBinaryWith…`): branch
  `cs.deserialize ? cs.deserialize(data) : Object.assign(new cs.cls(), data)`.
- **Lookup key stays `rt.TypeName`** (bare name) so the compiler needs no namespace; the
  registry entry stores the full `classID`.
- `userClassName` / anonymous-class handling / CLS001 dedup: unchanged.

**Union discriminant** (the `rt$classID` work) — in / around
[`union_flat_layout.go`](../../ts-go-runtypes/internal/cachegen/typefunctions/union_flat_layout.go) /
[`union_flat.go`](../../ts-go-runtypes/internal/cachegen/typefunctions/union_flat.go):
- When a JSON union has ≥2 registered-class members (or class + object), synthesize a
  discriminant: `DiscName = "rt$classID"`, each member's `DiscValues` = its `cs_*.classID`
  read from the registry (not a static literal — namespace is runtime). Emit the write on
  the encode side (one extra object fragment) and the match + strip on the decode side, with
  a **structural-trial fallback** arm for the unregistered case.
- **Binary is untouched** — `union_flat_binary.go` already writes/reads a per-member index,
  which routes to the arm that carries the class handler. Do NOT add a binary class field.
- Monomorphic positions emit no tag on either wire.

**No new structural-id / hash input.** The registry is a pure runtime concern and the
lookup keys off the same `TypeName`; the emitted body shape changes (an extra fragment at
union positions) but nothing in the type graph does. Confirm the disk-cache fingerprint does
not need bumping (it should not) and re-run the cache tests to be sure.

## Diagnostics

- **CLS001** — update headline/detail in
  [`messages.go:330`](../../ts-go-runtypes/internal/diagnostics/messages.go#L330) to the new signature:
  `registerClassSerializer('<ns>', <Class>, { deserialize })`. Keep it a **Warning**
  (structural fallback is still valid).
- **CLS002 (new, runtime Error)** — a registered class with a non-empty constructor and
  no `deserialize` was hit at decode. Thrown at runtime from the auto-instantiate path.
  (Build-time cannot see the registration, so this is a runtime guard, not a compile
  diagnostic.)
- Consider a **CLS003** advisory if a user type legitimately declares an `rt$classID`
  property (reserved-key collision).

## Phasing

- **Phase 1 (this todo).** Optional `serialize` (structural default), optional `deserialize`
  for zero-arg classes (auto `new Cls()` + assign), namespace + class-param signature,
  revive/unify the dead scaffolding, docs + tests. `rt$classID` as a **JSON union
  discriminant over a closed candidate set** — a union whose members are known registered
  classes (or class + object) dispatches on the tag; monomorphic positions route
  positionally with no tag; binary routes via its existing member index. This is tractable
  because the union node lists its members, so the arm structure is static and only the
  discriminant *values* come from the registry.
- **Phase 2 (defer, note in ROADMAP).** **Open-world polymorphism** — a field typed as a
  base class / interface reconstructs whatever registered subclass the wire `rt$classID`
  names, where the candidate set is *not* statically known. Needs a `classID`-keyed global
  registry index and open dispatch (not the closed-arm union path). No wire change — Phase 1
  already emits the tag in the shape Phase 2 reads.

## Docs + guides to update (part of the deliverable)

- **Website — [`container/website/content/2.guide/3.serialization.md`](../../container/website/content/2.guide/3.serialization.md)**,
  "Custom class serializers" section. New signature, the serialize-optional and
  deserialize-optional (zero-arg) stories, and a short version of **"Why a class can't just
  be serialized"** above. Keep the `rt$classID` explanation light and user-facing (it helps
  a union of your classes round-trip; you rarely think about it) — do not dump the discriminant
  internals. Follow the website docs style (plain language, **no em/en dashes**, prefer
  `<code-import>`, short frontmatter `description`); do not restructure the surrounding MDC.
- **Example — [`packages/examples/src/guide/custom-class-serializer.ts`](../../packages/examples/src/guide/custom-class-serializer.ts)**.
  Rewrite to the new API and add a second class showing the **zero-arg / no-deserialize**
  path. It is compiled by the examples tsconfig (wired into `typecheck` → `lint` → CI),
  so it must type-check under the new overloads — good drift guard.
- **[`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md)** — the T7 / class-serializer
  notes and the registry list (`registerClassSerializer` around line 215): new signature,
  the JSON-union-discriminant wire tag, encode-reads-classID, binary-uses-index, the
  positional-vs-union split.
- **CLS001 message** — [`messages.go`](../../ts-go-runtypes/internal/diagnostics/messages.go) as above.
  Regenerate the mirror: `pnpm rtx core codegen diag` (updates
  `packages/ts-runtypes-devtools/src/diagnosticCatalog.generated.ts`).
- **[`docs/ROADMAP.md`](../../docs/ROADMAP.md)** — record Phase 2 (open-world polymorphic
  class dispatch) as known future scope.
- **[`README.md`](../../README.md)** — only if it lists the factory/registry surface
  (current grep: no class-serializer mention; check before editing).
- **Playground vendor d.ts** (`container/website/app/playground/.vendor/ts-runtypes-dist/…`)
  is generated — it regenerates from the marker package build; do not hand-edit.

## Test plan

Extend [`test/features/classSerializer.test.ts`](../../packages/ts-runtypes/test/features/classSerializer.test.ts).
**Marker rule (CLAUDE.md):** every case must exercise BOTH call shapes —
`createJson/BinaryEncoder<T>()` (static) and `createJson/BinaryEncoder(value)` (reflect).

- **Serialize omitted → structural.** JSON payload at a monomorphic position has the declared
  props and **no** `rt$classID`; binary round-trips; decode reconstructs a real instance.
- **Deserialize omitted, zero-arg class → auto instantiate.** `registerClassSerializer('ns', Foo)`
  only; decoded value is `instanceof Foo` with props copied and methods live.
- **Non-empty constructor without deserialize → CLS002** at decode (assert throw with a
  helpful message).
- **JSON union of registered classes** (`Circle | Square`, no natural discriminant) — decode
  dispatches on `rt$classID` and rebuilds the right instance; both call shapes.
- **JSON union of class + object** (`Money | {amount:number}`) — the tagged member rebuilds a
  `Money`, the untagged shape stays a plain object.
- **Binary union of classes** — reconstructs correctly with **no `rt$classID`** on the wire
  (the bytes carry only the member index; the string tag is absent).
- **Unregistered union members** — a class union whose members are not registered falls back
  to structural trial (no throw, plain objects out).
- **`rt$classID` is stripped** — at a union position it never appears as an own-property of the
  rebuilt instance; at a monomorphic position it is never written in the first place.
- **Custom `serialize` returning a non-object** — pins whatever Open-question-1 decision lands
  (envelope vs "cannot sit in a JSON union").
- **Nested / array positions** (extend the existing `Point` / `Shape` cases).
- **Registry isolation** (clear / unregister / last-wins) — carry the existing cases to the
  new signature.
- **Both codecs agree** — JSON and binary reconstruct identical instances (binary is the
  oracle for wire questions, per the JSON-codec fuzzing notes).

## Open questions / decisions for review

1. **Custom `serialize` and union discrimination — RESOLVED by the "user is in charge"
   principle.** When a `serialize` is provided the user owns the wire shape, so the codec must
   not impose the `rt$classID` envelope on their output; we tag **only** the default structural
   path (which the codec owns, and which is always an object). A custom-`serialize` class that
   returns a non-object therefore opts out of JSON union discrimination — to sit in an ambiguous
   JSON union it returns a tagged object itself or uses binary. This is the principled
   resolution, not a reluctant limitation: the tag is ours to add only where serialization is
   ours to control. (An opt-in envelope could be added later if a real user wants a non-object
   custom serialize inside a JSON union, but it is not the default and not Phase 1.)
2. **Breaking change vs compat shim.** The signature change (name-string → namespace +
   class) is breaking. Given lockstep pre-release versioning and that T7 is new, prefer a
   **clean break** with a migration note over keeping the string overload alive.
3. **Union vs open-world scope.** Phase 1 covers **closed-set** JSON unions (members are
   known registered classes). Confirm **open-world polymorphism** (base-class / interface
   field → any registered subclass) is Phase 2, out of the first PR.
4. **`validate` and the tag.** `createValidateFn` runs on **in-memory** values, not the wire
   form, so it should never see `rt$classID`. Confirm no path validates a still-tagged
   decoded payload; if one exists, `validate` must tolerate the reserved key.
5. **Fold or delete the dead `rtUtils` methods** (`setSerializableClass` /
   `setDeserializeFn` / `useSerializeClass` / …). Recommendation: delete them and keep a
   single public `registerClassSerializer`, moving `SerializableClass` / `AnyClass` /
   `DeserializeClassFn` next to the registry as the public handler types.
