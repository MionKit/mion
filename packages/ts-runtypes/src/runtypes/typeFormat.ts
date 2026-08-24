import type {__rtFormatName, __rtFormatParams, __rtFormatBrand} from './sentinelKeys.ts';

// TypeFormat is the brand marker for runtype-format types
// (String, UUIDv4, Email, …). Concrete format types
// live under `src/formats/` (the `ts-runtypes/formats`
// subpath); this module just provides the alias and the runtime registry
// plumbing they import.
//
// The shape mirrors `TypeFormat<Base, Name, Params, BrandName>`
// (ref: packages/run-types/src/lib/formats.runtype.ts) but uses a plain
// two-property brand object — `__rtFormatName` + `__rtFormatParams` —
// instead of deepkit's TypeAnnotation tag. Both are SYMBOL keys (see
// ./sentinelKeys.ts) so branding a type leaves its string keys untouched. Both sides of the wire
// agree on the same brand shape: the tsgo-backed format scanner in
// `ts-go-runtypes/internal/cachegen/runtype/typeid/formats.go` looks for exactly
// these two sentinel properties and lifts them into the RunType's
// FormatAnnotation field.

// Base types a format may wrap. Primitives (the TypeFormatPrimitives set)
// plus the native `Date` object for the Date family — the Go-side
// scanner lifts the brand off a `Date & {brand}` intersection the same
// way it does for `string & {brand}`.
export type TypeFormatBase = string | number | bigint | Date;

// TypeFormatParams is the JSON-serialisable shape every format's
// params object must satisfy. Nested objects, arrays of primitives,
// and literal values pass through. `unknown` is preferred over `any`
// so consumers can still narrow at the call site.
export type TypeFormatParams = Record<string, unknown>;

// TypeFormat tags a base primitive with a name+params pair the Go-side
// scanner can detect. The two sentinel properties are typed as `readonly`
// so the tag survives `as const` widening and TypeScript's excess-property
// checks on object literals don't mistake them for regular properties.
//
// The sentinels are OPTIONAL by default. A format WITHOUT a `BrandName`
// is therefore a transparent annotation — `String<{maxLength: 5}>`
// stays mutually assignable with its base `string`, so a plain `'hello'`
// flows into a format-typed slot with no cast and a format value flows
// back out as its base. Formats are RUNTIME contracts enforced by the
// generated validator, not compile-time guards; the optional sentinels
// keep the type ergonomic while still carrying the metadata the scanner
// lifts off the widened intersection. (tsgo widens the optional props to
// `Name | undefined` / `Params | undefined`; the scanner strips the
// `undefined` — see internal/cachegen/runtype/typeid/formats.go.)
//
// `BrandName` follows the standard convention: pass it (`String<P,
// 'UserId'>`) to opt INTO a nominal brand — a REQUIRED `__rtFormatBrand`
// marker that makes the type no longer assignable from a bare primitive,
// so the compiler forces values through a validation/cast boundary. The
// Go-side detection ignores `BrandName` (it only reads the two sentinels),
// so branding stays a pure TS-level discriminator.
export type TypeFormat<
  Base extends TypeFormatBase,
  Name extends string,
  // `object`, not Record<string, unknown>: interface-typed params
  // (StringParams, DateParams, …) have no index signature and so
  // don't satisfy Record<string, unknown>. `object` accepts them while
  // still excluding primitives.
  Params extends object,
  BrandName extends string = never,
> = Base & {
  readonly [__rtFormatName]?: Name;
  readonly [__rtFormatParams]?: Params;
} & ([BrandName] extends [never] ? unknown : {readonly [__rtFormatBrand]: BrandName});
