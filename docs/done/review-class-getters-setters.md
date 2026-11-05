---
type: feature
spec: guidelines
status: done
created: 2026-11-04
---

# Review class getter and setter support

## Intent

Classes are supported, but no test covered a get/set accessor, and several functions break on one.
The behavior is now decided: **a getter or setter behaves like any other prop, in every function.**
A getter-only member is a readonly prop. A get+set pair is a normal writable prop. Extra code to make that true
is fine. Implement the rule, fix the bugs below and pin all of it with tests.

Why: TypeScript treats them as props, and `DataOnly<T>` cannot tell them from fields, so the types stay honest.
Skipping them like methods was considered and rejected.

## The catch

JS does not list a class accessor. It sits on the prototype with `enumerable: false`, so `for..in`, `Object.keys`,
spread and `JSON.stringify` all miss it, while `v.id` and `'id' in v` work. Every place that lists or writes keys must
therefore handle it on purpose. An object literal getter is an own enumerable key and already works as data.

## Which members count

- Detect a member by its declarations: any `KindGetAccessor` / `KindSetAccessor`, except one whose parent is an object
  literal expression. Drop the `asClass` gate on `reflection.FlagAccessor` and on the `#acc` type id bit.
- Tested: the declaration survives `Pick`, `Omit`, `Partial`, `Required`, `Readonly`, plain mapped types and the real
  `DataOnly<T>`, and the symbol keeps its accessor flag in an intersection and an interface. Renamed keys and `Record`
  lose it, correctly, since those are new props.
- `accessor x = 1` follows the same rule: it is a prop backed by hidden storage.
- A plain type given a class value (`validate<Plain>(new Impl())`) cannot be detected at build time. Strict checks the
  value at runtime and clone never counts keys, so both answer right. Mutate and format exceptions are emitted only
  for a type that names an accessor.

## Behavior per function

| Function | Today | Required |
|---|---|---|
| validate, errors | Reads it, required | No change |
| strict, validate + errors | Own instance rejected, `{get id, name, extra}` passes | Instance passes, the extra key fails, both agree |
| JSON encode, clone + compact | Writes the value | No change |
| JSON encode, mutate | Left out; crashes or runs the setter when the value needs a transform | Written, as in clone, instance untouched |
| JSON decode, plain result | Keeps the wire key | No change |
| Decode, registered class, no `deserialize` | `target[key] = value` crashes on a getter | Skip getter-only keys, a pair goes through its setter |
| removeUnknownKeys | Prototype keeps it on a class, a plain shape stores the value | No change |
| format transform | Crashes on a getter, runs the setter on a pair | Skip getter-only, a pair goes through its setter |
| JSON schema, mock data | Normal required prop | No change |
| Reflection | Keeps it, `flags: ['accessor']` | Also mark a getter-only member `readonly` |

Direction for the two hard rows:

- **Strict:** the count `cntEK(v) === N` cannot see an accessor, so it only answers on a plain object. Anything else takes
  the key names (`!hUKFA(v, k)`), as an optional prop already does. Validate and errors share the answer.
- **Mutate:** it works in place and `JSON.stringify` skips accessors, so an object with an accessor member must be
  copied instead, never written to. Today a setter gets the encoded value: `set n(v: bigint)` receives `"1"` and
  corrupts the instance.

## Members that need their own rule

- **Setter-only:** nothing to read, so the member is optional. Today plain validate rejects the class's own instance.
- **`get x(): string; set x(v: number)`:** the type holds only the read type, so the wire carries that. The automatic
  rebuild treats the member as getter-only, and `deserialize` is the way to set it.
- **Printer:** getter-only reflects back with an invented setter, setter-only with an invented getter
  (`convert/printtype.go`). The `readonly` fix covers the first, fix the second too.

## Same as any other prop, no special code

- A getter runs in validate and encode. A throw escapes, as in every library that reads it.
- A getter that returns its own class is a recursive prop, with no new warning or error. `get root()` that returns
  `this` overflows by default and `rejectCircularRefs` catches it. `get negated(): Money` returns a new object on every
  read, so the option cannot catch it and it always ends in `RangeError`. The fix for users is a method.
- A public getter over a `#field` goes on the wire. `serialize` hides it.
- `private` and `protected` getters encode, like those fields.
- A class without a registered serializer decodes to a plain object, so a getter key is plain data. A registered class
  runs a pair's setter during the rebuild, before validate, so a setter that throws on bad data is a crash.

## Tests

- Paired tests for both marker call shapes, per function above, one level deep too.
- Getter-only, get+set pair, setter-only, mixed get/set types, inherited, abstract, `static`, `private`.
- Same member through an interface, `Pick`, `Partial`, an intersection and `DataOnly<T>`.
- All three JSON strategies round trip through decode and validate, on a registered class too.
- A setter is never called by encode. Each mutate case leaves the instance unchanged.
- The `checkUnknowns` cases over hidden keys and the fuzz value lane that hides a key use types with no accessor, so
  they keep the answers they have.

## Docs

- `.agents/docs/architecture.md`, validate contract: getters are no longer in the non-serialisable list.
- `container/website/content/02.runtypes/02.guide/03.validation.md`: same in the opening paragraph.
- `container/website/content/02.runtypes/02.guide/04.json-round-trip.md`: Classes section states the rule, and the
  mutate copy goes in the strategy notes. The recursive types note says a getter returning its own class counts.
- `cachegen/runtype/modifiers.go`: the comment on a getter without a setter is wrong today.
- `Removing Unknown Keys` table in the validation page already holds.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example this
change touched, review its report against the code, and commit it as its own commit.

## Done when

- Every function above behaves as the table says, tested.
- A class instance with a getter passes strict, and an extra key on it fails, for validate and errors alike.
- No function writes to a member the type marks as a getter or crashes on one, and encode never calls a setter it can see.
- The strict change has benchmark numbers, with the user warned before the run.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file,
  each committed on its own.

## Plan: every function, one PR (approved 2026-11-04)

### Setup

Branch `feat/class-accessors-as-props` from `main`, carrying the uncommitted spec edit. Commit the spec first, append
this plan to it, and keep each fix below in its own commit with its own tests.

### 1. Detect the member (Go, `cachegen/runtype`)

- `typeid.IsAccessorMember`: read declarations (`KindGetAccessor` / `KindSetAccessor`), skip a parent that is an object
  literal expression. Remove the `asClass` gate in `serialize.go` `appendProperty` and in `typeid.go` `memberID`.
- New `reflection.FlagAccessorNoSetter`: getter-only, setter-only, or a setter that does not accept the getter's declared
  type. Compare declared types (getter's return type vs the setter parameter's), so `Box<T>` instantiations do not read
  as different. `#acc` gets a second form so the two cannot share a cache entry.
- Getter-only sets `Readonly` in `appendProperty` past the method form and in `memberID`; fix the wrong comment in
  `modifiers.go`. A mapped or merged copy keeps what the checker decided.
- Setter-only is optional, in both `appendProperty` and `memberID`, as they must agree.
- `convert`: only class members print `get` / `set`. Other shapes print a plain prop, as TypeScript shows it. A class
  member that is an optional accessor is setter-only and prints only `set` (a getter cannot be optional).

### 2. Strict

`strictObjectKeyAssertion` becomes `(kCnt = cntEK(v)) === N ? v.constructor === Object || scan : kCnt < N && scan`, where
`scan` reads the key names. `emitParentUnknownKeyErrors` gates its report on the same check. Fixes class, `Pick`,
interface and plain type + class value together. The union-keys families share this function.

### 3. Clone encode fast path (found while planning)

`if (Object.keys(v).length === N) return v` in `json_prepare_clone.go` has the same hole: an accessor stays off the
count. The shortcut is gone: clone always builds the object, which measured no slower than counting.

### 4. Mutate encode

- `objectChildrenCompat` answers false for an accessor member, and `jsonNoopObjectChildren` too in prepare mode, so
  mutate never skips the object. This also makes a union holding one take the envelope, on both halves.
- In prepare only (the object walk is shared with restore), an object with accessor members starts with
  `v = {...v, id: v.id}`, then the existing child writes run on the copy. Undeclared keys stay, as mutate promises.
  A nested object is replaced in its parent, which mutate already does to transformed fields.
- Same line in the object arm of `emitUnionPrepareForJsonFlat`, naming every object member's accessors.
- Skip static, method-kind, symbol-keyed, unsafe-named and stripped members.

### 5. Class rebuild + format transform

- `wrapRestoreWithClassSerializer` passes a key list without no-setter members. `collectObjectChildNames` keeps them,
  since strict needs them declared. `deserializeClass` is unchanged.
- `emitObjectFormat` and `formatNoopObjectChildren` skip no-setter members.

### Tests

- Go: `class_member_flags_test.go` (flag on interface, `Pick`, intersection, object literal has none, no-setter, setter
  only, readonly, id splits); `check_unknowns_test.go` (emitted check, update the count test); a printer test.
- Vitest, new `packages/run-types/test/features/classAccessors.test.ts`: every row of the spec table, paired static and
  value-first marker shapes, root and one level deep. Getter-only, pair, setter-only, mixed types, inherited, abstract,
  `static`, `private`; through interface, `Pick`, `Partial`, intersection, `DataOnly<T>`. All three JSON strategies
  round trip through decode and validate, registered class too. Encode never calls a setter.
- Fuzz: in the hidden key lane, a valid value with a hidden declared key must pass strict, and an extra key beside it
  must fail unless it fills the count of a plain object (known limit).

### Docs

- `.agents/docs/architecture.md`: remove getters from the non-serialisable list.
- `03.validation.md`: same in the opening paragraph; add the plain object / class note to the strict section.
- `04.json-round-trip.md`: Classes section states the rule; `mutate` row and notes cover the copy; the recursive note
  says a getter returning its own class counts.
- `SETUP` none. Fuzz README: the lane's new rule.

### Benchmark

The plain object check adds one compare to a hot path. Before any run I post a heads-up with an end time, as the Mac is
shared, then run the validator bench against the branch without it, and check the round spread. Numbers go in the PR.

Result against the branch without it, median of 6 interleaved rounds, Node / Bun. Strict validate, geomean of the 4
`STRICT` cases: valid 0.92x / 0.89x, invalid 0.97x / 0.91x, mixed 0.97x / 0.93x. Worst single case 0.85x. Strict errors
0.99x / 0.98x on valid. Clone encode, geomean of 155 cases: 1.03x, with mutate and compact (unchanged code) at 1.02x and
1.01x. Round spread was up to 12%, so read these as about 8 to 11 percent on valid strict, and clone unchanged.

### Finish

Gate: rebuild `mion-bin/mion`, `pnpm test`, `go -C ts-go-runtypes test ./internal/...`, `pnpm run lint`,
`pnpm run format`, fuzz lane. Reconcile the spec and `git mv` it to `docs/done/`. Then review-pr (automatic),
docs-simplifier + comments-simplifier in one message, PR with labels from `pr-ready.md`, drive CI to green, list
every decision I made.

## What shipped

Differences from the plan above, and what it did not say:

- **A runtime check on strict only.** Compile-time gating left `strict<Shape>(classValue)` wrong, so the maintainer
  accepted one compare on the count path. `Object.getPrototypeOf` halved strict validate, so it reads `v.constructor`.
  Mutate and format exceptions stay compile-time only. Copies count: `Pick`, an interface with `get` and an
  intersection all say so at build time.
- **Removing the clone shortcut exposed two older bugs,** both fixed. An optional tuple slot padded a short tuple
  (`['a']` for `[string, boolean?]` wrote `["a",null]`). `isExtraProof` memoized a false from a Map or Set element ref
  under the element's id, so `string[]` beside `Set<string>` was copied, which cost `string[]` 40 percent until fixed.
- **A function-typed getter** (`get fn(): () => void`) is a method, so it stays dropped and does not take `readonly`.
- **Printed declarations keep their ids.** `get` / `set` cannot spell an optional member, a readonly pair or a setter of
  another type, so a printed member uses a `/** @accessor */` or `/** @accessorNoSetter */` tag, read like
  `@nonEnumerable`. Outside a class every copy uses the tag.
- **Source conversion refuses a copy of an accessor** (`Pick<User, 'fullName'>`): no builder can spell it.
- **Union object arm:** one copy under `'id' in v || 'name' in v` lists every accessor. An accessor the value lacks reads
  undefined, which the props and JSON both skip. A value with none stays in place.
- **Setter-only:** counts as no-setter. Validate reads undefined whatever the setter took, so no check covers a wire value.
- **`accessor x`** is a get and set pair with hidden storage, detected from its declaration.
- **Stripped accessors** (`get rx(): RegExp`, `get later(): Promise<T>`) are never read: the wire does not hold them.
- **A doc comment** with `@accessor` on a real class field means nothing. On a type member the printer's tag and a
  hand-written one look the same, so writing it there opts that member in, with the same code an accessor gets.
- **A format on a copy of a no-setter member** runs only where the value owns the key. A class
  value keeps answering through its accessor.
- **Decided limit: a plain type trusts a plain value, on mutate and format.** Given a class instance with no accessor in
  the type, they write straight to the instance: the setter runs, a getter-only member throws `TypeError`, and a mutate
  noop leaves a getter to `JSON.stringify`, which drops it. Only a noop can stay free, so no runtime check closes this.
  Stated in the docs, pinned by tests.
- **Known limit: strict on a hand-built plain value.** An own non-enumerable prop plus an extra key, or a getter on a
  hand-built plain prototype plus an extra key, still match the count. Only in-process values can do that.
- **Decided limit: key formats read own keys.** `minProperties`, `maxProperties` and `uniqueItems` work on the value's own
  keys, so they miss a getter, as they miss a `#private` field. They receive no type, and they target JSON-shaped data.
  Stated in the docs, pinned by a test.
- **Mutate:** a getter that returns an inner array or object hands back that same object, and its contents are converted
  in place, as for any field.
- **Fuzz rule O28.** A declared key hidden from `for...in` passes strict, and an extra key beside it fails.

### Done when (mirrors the section above)

- Every function behaves as the spec's table says, tested.
- A class instance with a getter passes strict, an extra key on it fails, for validate and errors alike.
- No function writes to a member the type marks as a getter or crashes on one, and encode never calls a setter it can see.
- The strict change has benchmark numbers, with the user warned before the run.
- simplify-docs ran on every touched page and simplify-comments on every touched source file, each its own commit.
