// The value-first authoring surface, never imported by a type-first consumer. Format builders live beside
// their types on `@mionjs/run-types/formats` (and `/formats/temporal`).

// The STRUCTURAL array/object keywords are not separate builders: each rides a trailing params
// bag on `array` / `object` / `record`, and the wrapper TYPES live on the `/formats` surface.

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

// Composer builders — child schemas nest freely; the outer composer's marker reflects the whole shape.
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

// Utility-type builders — each brands the RESOLVED stdlib utility type, so `partial(model)`
// converges with `createValidateFn<Partial<T>>()`.
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

// The format-builder type helpers live in runtypes/builderTypes.ts; `InferType` is re-exported from the package root.
export type {PropModifiers, MapTuple, TemplatePart, AssembleTemplate, AnyOf} from './static.ts';

// Side-effect import: materialised validators call the built-in pure fns (newRunTypeErr et al.),
// which register themselves from this file. Run-types themselves register per entry, on first use.
import '../runtypes/pure-fns-utils.ts';
