// Type-level contract for the STRUCTURAL formats' brand keys.
//
// `FormattedObject<User, P>` / `FormattedArray<T, P>` brand the CONSUMER'S own
// type, so what the brand does to that type's keys is a user-facing contract,
// not an implementation detail. The sentinels ride `unique symbol` keys
// (src/runtypes/sentinelKeys.ts) precisely so branding leaves the string keys
// alone; this file pins that from both ends — what must stay clean, and the one
// residue that cannot be cleaned.
//
// Same shape as typesafety.test.ts: each `assertions…` function body is a
// type-only test, referenced so esbuild keeps it but never invoked, so the
// bodies have no runtime effect. `@ts-expect-error` pins a REJECTION — if the
// rejected line ever compiles, TS2578 ("unused '@ts-expect-error'") reds the
// file, which is the prompt to update the pin.
//
// Why pinned by test at all: every failure here is SILENT. A leaked sentinel
// does not error anywhere, it just surfaces in consumer code as a phantom
// optional field on a recovered type — in autocomplete, in `keyof`, in anything
// that walks keys. Run via `tsc -p tsconfig.test.json --noEmit` (wired into
// `pnpm run lint`).

import {describe, expect, test} from 'vitest';
import * as TF from '../../src/formats/index.ts';
import * as RT from '../../src/builders/index.ts';
import type {RunType, InferType, DataOnly} from '../../src/index.ts';
import type {CarriedKey} from '../../src/builders/static.ts';

describe('structural brand keys — type-only assertions', () => {
  test('assertion bodies are referenced (no runtime work here)', () => {
    expect(typeof assertionsStructuralBrandKeys).toBe('function');
    expect(typeof assertionsRecoveredTypesCarryNoMetadata).toBe('function');
    expect(typeof assertionsCarriedKeyIsExhaustive).toBe('function');
    expect(typeof assertionsMapContainsTakesAPair).toBe('function');
  });
});

// ── A Map's `contains` child must be a two-slot tuple ──
//
// A Map's ENTRY is its `[key, value]` pair, so `contains` on a Map is matched
// against a pair. A child of any other shape matches NO entry, which means
// `{contains: number}` would compile into a validator that always rejects, and
// nothing downstream can tell that from a deliberately strict constraint: the
// emitted count simply stays 0, so `minContains: 1` never holds. That is the
// silent-failure class this file exists for, so the slot is CONSTRAINED
// (`FormattedMapParams`) and the rejections are pinned here. An array and a Set
// keep the unconstrained slot on purpose, since their entry is a single value.
function assertionsMapContainsTakesAPair(): void {
  // ACCEPTED — a pair, either half pinned or left `unknown` to skip it.
  type Roles = TF.FormattedMap<Map<string, number>, {contains: ['admin', unknown]}>;
  type Scores = TF.FormattedMap<Map<string, number>, {contains: [unknown, 100]; maxContains: 1}>;
  type Bounded = TF.FormattedMap<Map<string, number>, {minItems: 1; uniqueItems: true}>;

  // REJECTED — a bare entry type. This is the one that matters: it reads
  // plausibly (it is what an array or a Set takes) and it can never match.
  // @ts-expect-error — a Map's contains child is the [key, value] pair, not the value type
  type BareValue = TF.FormattedMap<Map<string, number>, {contains: number}>;
  // @ts-expect-error — three slots is not an entry
  type TooManySlots = TF.FormattedMap<Map<string, number>, {contains: [string, number, boolean]}>;
  // @ts-expect-error — one slot is not an entry
  type TooFewSlots = TF.FormattedMap<Map<string, number>, {contains: [string]}>;
  // @ts-expect-error — an optional slot makes the length 1 | 2, so it is not an entry either
  type OptionalSlot = TF.FormattedMap<Map<string, number>, {contains: [string, number?]}>;

  // The value-first twin carries the same constraint through `RT.map`.
  const pairSchema = RT.map(TF.string(), TF.number(), {contains: RT.tuple({required: [RT.literal('admin'), RT.unknown()]})});
  // @ts-expect-error — a single-value schema is not a Map entry schema
  const bareSchema = RT.map(TF.string(), TF.number(), {contains: TF.number()});

  void (null as unknown as Roles);
  void (null as unknown as Scores);
  void (null as unknown as Bounded);
  void (null as unknown as BareValue);
  void (null as unknown as TooManySlots);
  void (null as unknown as TooFewSlots);
  void (null as unknown as OptionalSlot);
  void pairSchema;
  void bareSchema;
}

// ── Structural brand keys: exactly what a FormattedObject/FormattedArray exposes ──
//
// The keyword sentinels ride SYMBOL keys (src/runtypes/sentinelKeys.ts), so
// branding a type leaves the STRING keys of the shape it brands untouched.
// These assertions pin that contract from both directions: what must stay
// clean, and the one thing that cannot be cleaned.
//
// The `@ts-expect-error` line pins the residue: a property cannot be hidden
// from `keyof` at all, so the bare `keyof BoundedUser` still yields the two
// symbols (as symbols). If TypeScript ever changes that, the directive goes
// unused and TS2578 reds this file — the prompt to update the pin.
function assertionsStructuralBrandKeys() {
  interface User {
    id: string;
    name: string;
  }
  type BoundedUser = TF.FormattedObject<User, {minProperties: 1}>;
  type UniqueTags = TF.FormattedArray<string[], {uniqueItems: true}>;

  // CLEAN — every operation that treats the value as data sees the user's
  // members and nothing else. This is the whole point of the symbol keys: with
  // string keys each of these also surfaced '__rtFormatName'/'__rtFormatParams'.
  const objectKeys: 'id' | 'name' = null as unknown as Extract<keyof BoundedUser, string>;
  const arrayKeys: keyof string[] = null as unknown as Extract<keyof UniqueTags, string>;
  const spreadOfUser = {...(null as unknown as BoundedUser)};
  const spreadKeys: 'id' | 'name' = null as unknown as Extract<keyof typeof spreadOfUser, string>;

  // CLEAN — a string-constrained key helper (the shape `Object.keys` wrappers
  // take) needs no filtering at the call site.
  const helperKeys: ('id' | 'name')[] = keysOf(null as unknown as BoundedUser);

  // CLEAN — a string-keyed mapped type rebuilds the user's shape exactly.
  type Rebuilt = {[K in Extract<keyof BoundedUser, string>]: BoundedUser[K]};
  const rebuilt: {id: string; name: string} = null as unknown as Rebuilt;

  // CLEAN — branding never cost assignability: the sentinels are optional, so a
  // plain literal still flows in, members read normally, and a branded array is
  // still an array.
  const user: BoundedUser = {id: 'u1', name: 'Ada'};
  const userId: string = user.id;
  const tags: UniqueTags = ['a', 'b'];
  const firstTag: string = tags[0];
  const tagCount: number = tags.length;

  // CLEAN — a branded type used as a PROPERTY never affected the enclosing keys.
  interface Wrapper {
    inner: BoundedUser;
    other: number;
  }
  const wrapperKeys: 'inner' | 'other' = null as unknown as keyof Wrapper;

  // RESIDUE (pinned): the bare `keyof` still yields the sentinel symbols.
  // @ts-expect-error — keyof BoundedUser is 'id' | 'name' | typeof __rtFormatName | typeof __rtFormatParams
  const bareKeyof: 'id' | 'name' = null as unknown as keyof BoundedUser;

  void objectKeys;
  void arrayKeys;
  void spreadKeys;
  void helperKeys;
  void rebuilt;
  void user;
  void userId;
  void tags;
  void firstTag;
  void tagCount;
  void wrapperKeys;
  void bareKeyof;
}

declare function keysOf<T extends object>(o: T): Extract<keyof T, string>[];

// ── Recovered types never carry the brand's metadata as data ──
//
// The sentinels are metadata FOR THE RESOLVER, never members of the user's
// shape. So every helper that recovers a type from a RunType (`InferType`) or
// projects one for the wire (`DataOnly`) must hand back something whose data
// keys are the user's own — no `__rtFormatName`, no `__rtContains`, nothing.
//
// This holds by construction now that the keys are symbols, but it is pinned
// here because the failure would be SILENT: a leaked sentinel does not error,
// it just shows up in consumer code as a phantom optional field on every
// recovered type, in autocomplete and in anything that walks keys.
type MetaKeyNames =
  | '__rtFormatName'
  | '__rtFormatParams'
  | '__rtFormatBrand'
  | '__rtContains'
  | '__rtPatternProps'
  | '__rtPropNames';

/** True when `T` exposes ANY sentinel under its original string name. **/
type LeaksMeta<T> = [Extract<keyof T, MetaKeyNames>] extends [never] ? false : true;

function assertionsRecoveredTypesCarryNoMetadata() {
  interface User {
    id: string;
    name: string;
  }
  type BoundedUser = TF.FormattedObject<User, {minProperties: 1}>;
  type UniqueTags = TF.FormattedArray<string[], {uniqueItems: true; contains: string}>;
  type ShortName = TF.String<{maxLength: 5}>;
  type BrandedId = TF.String<{maxLength: 5}, 'UserId'>;

  // POSITIVE CONTROL — the predicate must actually detect a leak, or every
  // assertion below is vacuously true and this whole block proves nothing.
  const detectsALeak: true = null as unknown as LeaksMeta<User & {__rtFormatName?: 'formattedObject'}>;

  // InferType — the type a RunType carries, recovered.
  const inferredObject: false = null as unknown as LeaksMeta<InferType<RunType<BoundedUser>>>;
  const inferredArray: false = null as unknown as LeaksMeta<InferType<RunType<UniqueTags>>>;
  const inferredScalar: false = null as unknown as LeaksMeta<InferType<RunType<ShortName>>>;
  const inferredBranded: false = null as unknown as LeaksMeta<InferType<RunType<BrandedId>>>;

  // DataOnly — the JSON-shaped projection consumers actually serialize.
  const wireObject: false = null as unknown as LeaksMeta<DataOnly<BoundedUser>>;
  const wireArray: false = null as unknown as LeaksMeta<DataOnly<UniqueTags>>;
  const wireScalar: false = null as unknown as LeaksMeta<DataOnly<ShortName>>;

  // Nested — a branded FIELD leaks neither into its own keys nor the parent's.
  interface Account {
    owner: BoundedUser;
    label: ShortName;
  }
  const nestedParent: false = null as unknown as LeaksMeta<InferType<RunType<Account>>>;
  const nestedField: false = null as unknown as LeaksMeta<InferType<RunType<Account>>['owner']>;
  const nestedWire: false = null as unknown as LeaksMeta<DataOnly<Account>['owner']>;

  // The recovered object is still usable as the plain shape, in both
  // directions — recovering a type must not cost assignability.
  const asPlainShape: User = null as unknown as InferType<RunType<BoundedUser>>;
  const fromPlainLiteral: InferType<RunType<BoundedUser>> = {id: 'u1', name: 'Ada'};
  const wireAsPlainShape: User = null as unknown as DataOnly<BoundedUser>;

  void detectsALeak;
  void inferredObject;
  void inferredArray;
  void inferredScalar;
  void inferredBranded;
  void wireObject;
  void wireArray;
  void wireScalar;
  void nestedParent;
  void nestedField;
  void nestedWire;
  void asPlainShape;
  void fromPlainLiteral;
  void wireAsPlainShape;
}

// The sentinel vocabulary is CLOSED, and `SubstituteSelf` (the RT.circular
// knot) depends on that: it takes a carrier intersection apart by that exact
// list and puts it back together, so a sentinel missing from `CarriedKey`
// would be silently dropped from — or folded into — any type inside a
// recursive body, moving its structural id with no error anywhere. Deriving
// one side from the module makes adding a sentinel without wiring it a
// COMPILE error here rather than a silent id move at run time.
type SentinelModule = typeof import('../../src/runtypes/sentinelKeys.ts');
type AllSentinelKeys = SentinelModule[keyof SentinelModule];
type Exact<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

function assertionsCarriedKeyIsExhaustive(): void {
  const everySentinelIsCarried: true = null as unknown as Exact<CarriedKey, AllSentinelKeys>;
  void everySentinelIsCarried;
}

// The substitution used to keep a LIST of builtin classes to leave alone, and
// every class missing from it was silently flattened into a plain object,
// moving the declaration's id. The list is gone; the invariant it was trying to
// express is pinned by `substituteSelf.compile.test.ts`'s walk battery instead,
// which is a rule rather than an enumeration. Only the sentinel-carrier
// exhaustiveness is asserted here now.
