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
> = Base & FormatBrand<Name, Params> & ([BrandName] extends [never] ? unknown : NominalBrand<BrandName>);

/** The two sentinel members every format carries, as a NAMED interface rather
 *  than an inline object.
 *
 *  Naming them is what keeps declaration emit working downstream. A symbol-keyed
 *  property can only be printed into a `.d.ts` when the emitting file can name
 *  the symbol, and TypeScript will not invent an import for it. Any type that
 *  loses the format alias on its way through a mapped type — a mion router's
 *  public API is the case that bit us — then gets printed structurally, hits the
 *  bare `[__rtFormatName]` key, and fails the whole emit with TS4023. Behind an
 *  interface the same expansion prints a reference to THIS name instead, which
 *  the emitter can always write.
 *
 *  Structurally identical to the inline object it replaces, so nothing about
 *  format detection changes: key presence still drives `FormatNameOf` here and
 *  the declaration NAMES are still what the Go resolver matches on. **/
export interface FormatBrand<Name extends string, Params extends object> {
  readonly [__rtFormatName]?: Name;
  readonly [__rtFormatParams]?: Params;
}

/** The opt-in nominal marker, named for the same declaration-emit reason. **/
export interface NominalBrand<BrandName extends string> {
  readonly [__rtFormatBrand]: BrandName;
}

// Type-level format introspection for downstream packages (e.g. a column mapper
// that picks a database column per format). The sentinels are unique symbols, so
// without these helpers a consumer cannot replicate the detection — a locally
// declared symbol of the same name only helps the Go scanner, never TS type
// matching. Detection is by KEY PRESENCE (`typeof __rtFormatName extends keyof T`),
// never a required-prop `extends` check: the sentinels are OPTIONAL on TypeFormat
// (so a format stays assignable from its base), and an optional prop does not
// satisfy a required-prop constraint — but the key is still present in `keyof`.

/** The format name carried by `T` (`FormatNameOf<Email>` is `'email'`), or `never`
 *  when `T` carries no format tag (`FormatNameOf<string>` is `never`). */
export type FormatNameOf<T> = typeof __rtFormatName extends keyof T
  ? NonNullable<T[typeof __rtFormatName & keyof T]> & string
  : never;

/** The format params carried by `T` (`FormatParamsOf<UUIDv7>` is `{version: '7'}`),
 *  or `never` when `T` carries no format tag. */
export type FormatParamsOf<T> = typeof __rtFormatParams extends keyof T
  ? NonNullable<T[typeof __rtFormatParams & keyof T]>
  : never;
