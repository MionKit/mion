// The sentinel KEYS every RunTypes brand rides, as `unique symbol`s so branding a type never pollutes its STRING keys: with string
// keys, `Extract<keyof …, string>`, an object spread and every string-constrained mapped type surfaced `__rtFormatName` alongside
// the user's own members. A property cannot be hidden from `keyof` at all, so the bare `keyof` still yields these symbols; every
// operation that iterates STRING keys no longer sees them.
// Zero runtime footprint by construction: `declare const` emits nothing and every use site imports them with `import type`.
// ⚠️ These NAMES are a wire contract with the resolver: `isSentinelProp`
// (ts-go-runtypes/internal/cachegen/runtype/typeid/formats.go) matches on the declaration name, so renaming one here means renaming
// its constant there, or the brand stops being recognised and silently degrades to its base type.
// The plain string spelling stays recognised on the Go side on purpose: it lets a hand-written `.d.ts` fixture and the fuzz suites'
// INDEPENDENT type-first oracle spell a sentinel without importing this module. Both spellings fold to the same structural id, the
// property name never reaching the hash.

// #region sentinel-keys-extract — sliced verbatim by test/types/substituteSelfHarness.ts, which puts it first because the
// SubstituteSelf region it appends names these symbols; the snippet has no imports.
// A locally declared symbol of the same NAME is recognised exactly like the shipped one, so the slice is a faithful stand-in.
export declare const __rtFormatName: unique symbol;
export declare const __rtFormatParams: unique symbol;
export declare const __rtFormatBrand: unique symbol;
export declare const __rtContains: unique symbol;
export declare const __rtPatternProps: unique symbol;
export declare const __rtPropNames: unique symbol;
export declare const __rtLabels: unique symbol;
// #endregion sentinel-keys-extract
