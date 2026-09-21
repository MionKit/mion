import type {__rtFormatName, __rtFormatParams, __rtFormatBrand} from './sentinelKeys.ts';

// TypeFormat is the brand marker for runtype-format types (String, UUIDv4, Email, …); the concrete formats live under `src/formats/`.
// The brand is a plain two-property object, `__rtFormatName` + `__rtFormatParams`, both SYMBOL keys so branding leaves a type's string keys untouched.
// The tsgo-backed format scanner (ts-go-runtypes/internal/cachegen/runtype/typeid/formats.go) looks for exactly those two and lifts them
// into the RunType's FormatAnnotation field.

// Primitives plus native `Date`: the Go-side scanner lifts the brand off a `Date & {brand}` intersection the same way it does for `string & {brand}`.
export type TypeFormatBase = string | number | bigint | Date;

// The JSON-serialisable shape every format's params object must satisfy; `unknown` over `any` so consumers can still narrow at the call site.
export type TypeFormatParams = Record<string, unknown>;

// TypeFormat tags a base primitive with a name+params pair the Go-side scanner can detect.
// The sentinels are `readonly` so the tag survives `as const` widening and excess-property checks don't mistake them for regular properties.
// They are OPTIONAL by default, so an unbranded format stays mutually assignable with its base: formats are RUNTIME contracts
// enforced by the generated validator, not compile-time guards.
// (tsgo widens the optional props to `Name | undefined`; the scanner strips the `undefined` — see internal/cachegen/runtype/typeid/formats.go.)
// Passing `BrandName` opts INTO a REQUIRED `__rtFormatBrand` marker, no longer assignable from a bare primitive, so values must pass a
// validation/cast boundary; the Go-side detection ignores it, so branding stays a pure TS-level discriminator.
export type TypeFormat<
  Base extends TypeFormatBase,
  Name extends string,
  // `object`, not Record<string, unknown>: interface-typed params (StringParams, …) have no index signature, and primitives are still excluded.
  Params extends object,
  BrandName extends string = never,
> = Base & FormatBrand<Name, Params> & ([BrandName] extends [never] ? unknown : NominalBrand<BrandName>);

/** A NAMED interface, not an inline object: a symbol-keyed property only prints into a `.d.ts` when the emitting file can name the symbol. **/
// A type that loses the format alias through a mapped type (a mion router's public API did) prints structurally, hits the bare
// `[__rtFormatName]` key and fails the whole emit with TS4023; behind an interface the expansion prints a reference to THIS name.
// Structurally identical to the inline object it replaces, so detection is unchanged: the declaration NAMES are what the Go resolver matches on.
export interface FormatBrand<Name extends string, Params extends object> {
  readonly [__rtFormatName]?: Name;
  readonly [__rtFormatParams]?: Params;
}

/** The opt-in nominal marker, named for the same declaration-emit reason. **/
export interface NominalBrand<BrandName extends string> {
  readonly [__rtFormatBrand]: BrandName;
}

// Type-level format introspection for downstream packages (e.g. a column mapper that picks a database column per format).
// The sentinels are unique symbols, so without these helpers a consumer cannot replicate the detection: a locally declared symbol of the
// same name only helps the Go scanner, never TS type matching.
// Detection is by KEY PRESENCE, never a required-prop `extends` check: the sentinels are OPTIONAL, and an optional prop satisfies no
// required-prop constraint, but the key is still present in `keyof`.

/** The format name carried by `T` (`FormatNameOf<Email>` is `'email'`), or `never` when `T` carries no format tag. */
export type FormatNameOf<T> = typeof __rtFormatName extends keyof T
  ? NonNullable<T[typeof __rtFormatName & keyof T]> & string
  : never;

/** The format params carried by `T` (`FormatParamsOf<UUIDv7>` is `{version: '7'}`), or `never` when `T` carries no format tag. */
export type FormatParamsOf<T> = typeof __rtFormatParams extends keyof T
  ? NonNullable<T[typeof __rtFormatParams & keyof T]>
  : never;

/** The nominal brand name carried by `T`, or `never` for a transparent format or no format at all. */
export type FormatBrandNameOf<T> = typeof __rtFormatBrand extends keyof T ? T[typeof __rtFormatBrand & keyof T] & string : never;
