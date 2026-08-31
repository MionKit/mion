// Public entry for the `ts-runtypes/builders` subpath — the TYPE BUILDERS authoring
// surface: the atomic NON-format builders (`boolean` / `literal` / `regexp` /
// `symbol` / `any` / `unknown` / `never` / `void` / `enum` / `class`), the
// composers (`object` / `array` / `tuple` / `union` / …) and the standard-library
// utility builders. Each builder returns the generic `RunType<…>` node, so
// `typeof object({...})` IS the run-type and `InferType<typeof …>` recovers its type.
// Opt-in lane: consumers who want pure type-first reflection never import this.
//
// The FORMAT builders (`string` / `number` / `bigInt` / `date` / `email` / … plus
// the `brand` tag) moved to the `ts-runtypes/formats` surface (namespaced `TF`),
// and the `temporal.*` builders to `ts-runtypes/formats/temporal` (`TFT`); none of
// them are exported here — a format's TYPE and its BUILDER now live together.
//
// The older `ts-runtypes/schema` subpath still resolves to THIS module as a
// deprecated alias; it is removed at 1.0.

// The STRUCTURAL array/object keywords are no longer separate builders: every
// one rides a trailing params bag on `array` / `object` / `record`
// (`RT.array(RT.number(), {uniqueItems: true})`), and the wrapper TYPES
// `FormattedArray` / `FormattedObject` live on the `ts-runtypes/formats`
// surface beside the other format types. Both authoring modes (type-first,
// value-first) converge on one id.

// Atomic NON-format builders — the atomic leaves (`literal` / `regexp` / `symbol`),
// `boolean`, the top / bottom kinds (`any` / `unknown` / `never` / `void`;
// `voidType` aliased as `void` for a natural `RT.void()`), the class-instance
// builder, and the enum builder (`enumType` aliased as `enum` for `RT.enum(MyEnum)`).
export {
  boolean,
  literal,
  regexp,
  symbol,
  any,
  unknown,
  never,
  voidType,
  voidType as void,
  classType,
  enumType,
  enumType as enum,
} from './atomic.ts';

// Composer builders — `array` / `tuple` / `union` / `intersection` / `record` /
// `map` / `set` / `promise` / `func` / `callable` / `templateLiteral`, the `object` assembler,
// the `propMod({optional?, readonly?}, field)` / `optional(field)` property-modifier
// wrappers, and the recursive-schema pair `circular(…)` / `self()`. Each
// returns the generic `RunType<…>`; child schemas nest freely (the outer composer's
// marker reflects the whole shape).
export {
  object,
  array,
  tuple,
  slot,
  union,
  anyOf,
  intersection,
  record,
  map,
  set,
  promise,
  circular,
  self,
  func,
  callable,
  templateLiteral,
  propMod,
  optional,
} from './compose.ts';

// Utility-type builders — Partial / Required / Pick / Omit / Exclude / Extract /
// NonNullable / Readonly / ReturnType + Parameters. Each brands the RESOLVED
// stdlib utility type; tsgo resolves it before the Go scanner computes the id, so
// `createValidateFn(partial(model))` converges with `createValidateFn<Partial<T>>()`.
// `readonlyType` is re-aliased as `readonly` for a natural `RT.readonly(model)`.
export {
  partial,
  required,
  pick,
  omit,
  exclude,
  extract,
  nonNullable,
  readonlyType,
  readonlyType as readonly,
  returnType,
  parameters,
} from './utility.ts';

// Type-level composer helpers (in static.ts). The format-builder helpers
// (`InferType` / `BrandArg` / `LeafType` / …) live in runtypes/builderTypes.ts;
// `InferType` is re-exported from the package root.
export type {PropModifiers, MapTuple, TemplatePart, AssembleTemplate, AnyOf} from './static.ts';

// Run-type registration is per-entry now: the value-first builders' marker
// call sites import their type's virtual entry module and register it (plus
// transitive children) on first use — no monolithic cache module to populate.
// The built-in pure fns still need to load for materialised validators that
// call them (newRunTypeErr et al.) — their registration file is the side
// effect (each registerPureFnFactory call site registers its entry tuple).
import '../runtypes/pure-fns-utils.ts';
