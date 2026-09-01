// `FriendlyText<T>` — the human-readable enrichment map for a type: a combined
// per-field LABEL + ERROR-MESSAGE mapping, authored once and committed (see
// docs/AI_ENRICHMENT.md). Pure type-level here; `createFriendlyText` (./createFriendlyText.ts)
// renders validation errors against it at runtime.
//
// The recursive `FriendlyNode` follows the `DataOnly<T>` construction
// (src/runtypes/dataOnly.ts): depth-bounded via a tuple-decrement budget, NO
// `infer` on the hot path (element/property types reached with `T[number]` /
// `T[K]`), scalar-before-object `extends` gates, and a homomorphic
// `{ [K in keyof T]?: … }` child map that preserves structure for free. The
// `#region friendlytext-extract` block is sliced VERBATIM by
// test/types/enrichHarness.ts into the instantiation-budget compile test, so
// it must reference only `lib` types + its own declarations.

import type {__rtFormatParams} from '../runtypes/sentinelKeys.ts';

// #region friendlytext-extract — FriendlyText machinery; sliced verbatim between
// these markers by test/types/enrichHarness.ts. Self-contained: `lib` + own decls only.

/** A friendly message template — a plain string with `$[…]` placeholders the
 *  renderer substitutes: `$[label]` (the field's label, or its raw name),
 *  `$[val]` (the failed constraint's bound — rendered by its TYPE format on
 *  the i18n path: currency via the renderer's `currency` option, date-family
 *  bounds via `Intl.DateTimeFormat`), `$[path]` (dotted path), `$[index]`
 *  (array element index). */
export type FriendlyTemplate = string;

/** The CLDR plural categories a plural template may carry arms for. A LOCAL
 *  union, deliberately not `Intl.LDMLPluralRule`: this `#region` block is
 *  sliced verbatim into the instantiation-budget compile test and must stay
 *  self-contained (lib + own decls only). Runtime code outside the region may
 *  use `Intl.LDMLPluralRule` directly. */
export type PluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';

/** A plural error template: one arm per CLDR category the map's language uses.
 *  `other` is mandatory (CLDR guarantees the category and it is the in-leaf
 *  backstop); the rest are optional so each locale supplies exactly the
 *  categories it needs. LANGUAGE-AGNOSTIC — the SAME type for every locale;
 *  the arms PRESENT differ per file, never the type. The renderer selects one
 *  arm via `Intl.PluralRules` on the violated bound (`$[val]`), falling to
 *  `other` when the selected category has no arm. */
export type PluralTemplate = {other: FriendlyTemplate} & Partial<Record<PluralCategory, FriendlyTemplate>>;

/** An error-template leaf: a plain template OR a plural object. Which kind
 *  appears at a given constraint is decided by the CONSTRAINT, not the author —
 *  count-bearing constraints (minLength / maxLength / min / max / lt / gt)
 *  carry a plural object, everything else a plain string. The generator emits
 *  the right kind and the Go checker enforces it, so the kind is
 *  locale-invariant and source + translations stay same-tree. */
export type TemplateLeaf = FriendlyTemplate | PluralTemplate;

/** Format params that can never FAIL — presentation metadata (`isCurrency`),
 *  the mock pool (`mockSamples`) and the value rewrite (`transform`). Everything
 *  else in a field's format params is a failable constraint and becomes a
 *  REQUIRED `rt$errors` template key. MIRROR of the Go side's `nonFailingParams`
 *  (internal/enrichment/enrich.go) — keep the two lists identical. */
type NonFailingParams = 'isCurrency' | 'mockSamples' | 'transform';

/** The count-bearing constraint keys — the only ones whose template may be a
 *  plural object. Mirror of Go's `CountBearing` (internal/enrichment/classify.go). */
type CountBearingKeys = 'minLength' | 'maxLength' | 'min' | 'max' | 'lt' | 'gt';

/** Per-constraint mode: `type` (the base kind failure) plus one REQUIRED key
 *  per failable format param — a blank `''` means "no custom message" (the
 *  opt-out; deleting a key just gets it re-scaffolded by `gen --update`).
 *  Count-bearing keys accept a plural object, the rest plain templates. NO
 *  index signature: an unknown key is an excess-property error in the IDE
 *  (FT003, moved to compile time). `rt$default` is banned here — it belongs to
 *  the exclusive mode below. */
type ConstraintTemplates<P> = {type: FriendlyTemplate} & {
  [K in Exclude<keyof P & string, NonFailingParams>]: K extends CountBearingKeys ? TemplateLeaf : FriendlyTemplate;
} & {rt$default?: never};

/** `rt$default` mode: ONE message for the whole field, whatever failed.
 *  MUTUALLY EXCLUSIVE with per-constraint messages — a node is either fully
 *  custom or fully catch-all, never a mix. Scaffolds are always per-constraint;
 *  picks which mode `gen` scaffolds FIRST; after that the node's authored
 *  mode is owned by the author and the reconcile follows it. */
type DefaultOnlyTemplates = {rt$default: FriendlyTemplate; type?: never};

/** Unbranded fields (plain `string` / `number` / …) can only fail as `type`. */
type BareTemplates = DefaultOnlyTemplates | ({type: FriendlyTemplate} & {rt$default?: never});

/** Per-field error templates, derived from the field type `F`: a branded leaf
 *  (`FormatString<{minLength: 2}>`, …) REQUIRES one template key per failable
 *  param it declares; an unbranded leaf takes `type` only; either may instead
 *  use the exclusive `rt$default` mode. Pure data — the old inline-function form
 *  was REMOVED (opaque to translation, reconcile and the checker). */
export type ErrorTemplates<F = never> = [F] extends [never]
  ? BareTemplates
  : F extends {readonly [__rtFormatParams]?: infer P}
    ? [NonNullable<P>] extends [object]
      ? DefaultOnlyTemplates | ConstraintTemplates<NonNullable<P>>
      : BareTemplates
    : BareTemplates;

/** Meta keys on every node: a human label + the field's error templates, both
 *  REQUIRED — every node must be addressed (the `@todo`/diagnostic layer enforces
 *  that the VALUES are filled, which TS can't see). `F` is the FIELD's own type:
 *  the leaf arm of `FriendlyNode` threads it through so `rt$errors` demands
 *  exactly the keys the field's format params declare. `rt$typeName` is the
 *  lone optional meta: a friendly name for a NAMED type (`PG_User` → `'User'`),
 *  defaulting to the reflected type name. The `rt$` prefix is RESERVED in
 *  enriched types (gen refuses / FT011 flags a colliding `rt$…` property), so
 *  meta keys can never be shadowed by the homomorphic child map. */
export interface FriendlyMeta<F = never> {
  rt$label: string;
  rt$errors: ErrorTemplates<F>;
  rt$typeName?: string;
}

/** Scalar / native kinds that carry only meta (no child fields). */
type FriendlyLeaf = string | number | boolean | bigint | null | undefined | Date | RegExp;

/** Recursion-budget decrement: `_FriendlyDepth[N]` is `N - 1` (`[0]` is `never`,
 *  never reached — the `Depth extends 0` guard stops first). Bounds circular /
 *  mutually-recursive types to a finite instantiation (no TS2589). */
type _FriendlyDepth = [never, 0, 1, 2, 3, 4, 5, 6, 7, 8];

/** Recursive friendly node — structural per solution A (docs/AI_ENRICHMENT.md):
 *  composite kinds reflect their structure, NOT an opaque leaf. Scalars/natives →
 *  meta only; tuples → meta + per-slot homomorphic `rt$slots` (`{[K in keyof T]}`);
 *  `Map` → meta + `rt$keys`/`rt$values`; `Set` → meta + `rt$values`; arrays → meta +
 *  `rt$items` (element node, via `T[number]`); objects → meta + a homomorphic
 *  optional child map. Branch order is most-specific-first; `Map`/`Set` gates run
 *  BEFORE the array check (a Map is not an array, but the cheap `Readonly{Map,Set}`
 *  gates keep `infer` off the hot path, mirroring `DataOnly`). NOTE: index
 *  signatures + object-member unions are OUT OF SCOPE here — index-sig objects
 *  still fall through to the homomorphic object map as today. */
export type FriendlyNode<T, Depth extends number = 8> = Depth extends 0
  ? FriendlyMeta // budget spent — keep as a leaf
  : T extends FriendlyLeaf
    ? FriendlyMeta<T> // scalar / native — no children; F drives the rt$errors keys
    : // Map BEFORE the array check: cheap `ReadonlyMap<any, any>` gate filters
      // non-Maps so the `infer K, V` never runs off the hot path (per DataOnly).
      T extends ReadonlyMap<any, any>
      ? T extends ReadonlyMap<infer K, infer V>
        ? FriendlyMeta & {rt$keys: FriendlyNode<K, _FriendlyDepth[Depth]>; rt$values: FriendlyNode<V, _FriendlyDepth[Depth]>}
        : FriendlyMeta // unreachable — gate guarantees a Map
      : T extends ReadonlySet<any>
        ? T extends ReadonlySet<infer U>
          ? FriendlyMeta & {rt$values: FriendlyNode<U, _FriendlyDepth[Depth]>}
          : FriendlyMeta // unreachable — gate guarantees a Set
        : T extends readonly unknown[]
          ? // tuple vs array: a tuple has a literal `length`, an array's `length`
            // is the broad `number`. Tuple → per-slot homomorphic `rt$slots`
            // (`{[K in keyof tuple]}` yields a tuple type — the intended
            // `rt$slots: [node, node]`); array → `rt$items` element node.
            number extends T['length']
            ? FriendlyMeta & {rt$items: FriendlyNode<T[number], _FriendlyDepth[Depth]>}
            : FriendlyMeta & {rt$slots: {[K in keyof T]: FriendlyNode<T[K], _FriendlyDepth[Depth]>}}
          : T extends object
            ? FriendlyMeta & {[K in keyof T]-?: FriendlyNode<T[K], _FriendlyDepth[Depth]>}
            : FriendlyMeta;

/** The friendly map for `T` — combined labels + per-field error templates,
 *  validated against `T` at scan time (the `ShapeCheckedArgs<T>` axis). */
export type FriendlyText<T> = FriendlyNode<T>;

// #endregion friendlytext-extract
// (`Translation<T>` was REMOVED: one type annotates every friendly-family file —
// a translation const is `FriendlyText<T>` at `i18n/<locale>/<rel>.ts` with a
// `<locale>_friendly*` name; the path + prefix carry the locale, not the type.)
