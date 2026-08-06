// The sentinel KEYS every RunTypes brand rides.
//
// They are `unique symbol`s rather than plain string properties so that
// branding a type does not pollute the STRING keys of the shape being branded.
// `FormattedObject<User, {minProperties: 1}>` is `User` intersected with a
// sentinel member; with string keys, `Extract<keyof …, string>`, an object
// spread and every string-constrained mapped type surfaced `__rtFormatName`
// alongside the user's own members. With symbol keys they all come back with
// the user's members only.
//
// What this does NOT do: a property cannot be hidden from `keyof` at all, so
// the bare `keyof BrandedUser` still yields these symbols (as symbols). Every
// operation that iterates STRING keys — which is every operation that treats an
// object as data — no longer sees them.
//
// Zero runtime footprint, by construction: `declare const` emits nothing, and
// every use site imports them with `import type`, which TypeScript elides
// entirely (a computed key in a TYPE position needs no value binding). Nothing
// is imported, constructed or referenced at run time.
//
// ⚠️ These NAMES are a wire contract with the resolver. tsgo spells a
// symbol-keyed property `\xFE@<declarationName>@<symbolId>`, and
// `isSentinelProp` (ts-go-runtypes/internal/cachegen/runtype/typeid/formats.go)
// matches on the declaration name — the same constant it uses for the plain
// string spelling. Renaming one here means renaming its constant there, or the
// brand stops being recognised and silently degrades to its base type.
//
// The plain string spelling stays recognised on the Go side on purpose: it is
// what lets a hand-written `.d.ts` fixture and the fuzz suites' INDEPENDENT
// type-first oracle spell a sentinel literally without importing this module.
// Both spellings fold to the same structural id — the property name never
// reaches the hash (the walk skips it; the annotation supplies the id).

export declare const __rtFormatName: unique symbol;
export declare const __rtFormatParams: unique symbol;
export declare const __rtFormatBrand: unique symbol;
export declare const __rtNot: unique symbol;
export declare const __rtContains: unique symbol;
export declare const __rtPatternProps: unique symbol;
export declare const __rtPropNames: unique symbol;
export declare const __rtOneOf: unique symbol;
export declare const __rtUnevaluated: unique symbol;
