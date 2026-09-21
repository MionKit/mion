// `FriendlyText<T>` — the per-field LABEL + ERROR-MESSAGE map for a type, authored once and committed
// (see docs/AI_ENRICHMENT.md); `createFriendlyText` renders validation errors against it at runtime.
// The recursive `FriendlyNode` follows the `DataOnly<T>` construction (src/runtypes/dataOnly.ts):
// depth-bounded via a tuple-decrement budget, NO `infer` on the hot path, scalar-before-object gates,
// homomorphic child map. The `#region friendlytext-extract` block is sliced VERBATIM by
// test/types/enrichHarness.ts, so it must reference only `lib` types + its own declarations.

import type {__rtFormatParams} from '../runtypes/sentinelKeys.ts';

// #region friendlytext-extract — FriendlyText machinery; sliced verbatim between
// these markers by test/types/enrichHarness.ts. Self-contained: `lib` + own decls only.

/** A template string with the `$[…]` placeholders the renderer substitutes: `$[label]` (the field's
 *  label, or its raw name), `$[val]` (the failed constraint's bound), `$[path]`, `$[index]`. */
export type FriendlyTemplate = string;

/** The CLDR plural categories. A LOCAL union, not `Intl.LDMLPluralRule`, because the sliced `#region`
 *  must stay self-contained; runtime code outside the region may use `Intl.LDMLPluralRule` directly. */
export type PluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';

/** One arm per CLDR category the map's language uses. `other` is mandatory: CLDR guarantees it and it is
 *  the in-leaf backstop. LANGUAGE-AGNOSTIC — the same type for every locale, only the arms present differ.
 *  The renderer selects an arm via `Intl.PluralRules` on the violated bound. */
export type PluralTemplate = {other: FriendlyTemplate} & Partial<Record<PluralCategory, FriendlyTemplate>>;

/** Which kind appears at a constraint is decided by the CONSTRAINT, not the author: count-bearing
 *  constraints carry a plural object, everything else a plain string. The generator emits the right kind
 *  and the Go checker enforces it, so the kind is locale-invariant. */
export type TemplateLeaf = FriendlyTemplate | PluralTemplate;

/** Format params that can never FAIL; everything else in a field's format params becomes a REQUIRED
 *  `rt$errors` template key. MIRROR of Go's `nonFailingParams` (internal/enrichment/enrich.go). */
type NonFailingParams = 'isCurrency' | 'mockSamples' | 'transform';

/** The count-bearing constraint keys — the only ones whose template may be a
 *  plural object. Mirror of Go's `CountBearing` (internal/enrichment/classify.go). */
type CountBearingKeys = 'minLength' | 'maxLength' | 'min' | 'max' | 'lt' | 'gt';

/** Per-constraint mode: `type` plus one REQUIRED key per failable format param. A blank `''` is the
 *  opt-out (deleting a key just gets it re-scaffolded by `mion enrich --update`). NO index signature, so
 *  an unknown key is an excess-property error in the IDE (FT003). `rt$default` belongs to the mode below. */
type ConstraintTemplates<P> = {type: FriendlyTemplate} & {
  [K in Exclude<keyof P & string, NonFailingParams>]: K extends CountBearingKeys ? TemplateLeaf : FriendlyTemplate;
} & {rt$default?: never};

/** `rt$default` mode: ONE message for the whole field, whatever failed. MUTUALLY EXCLUSIVE with
 *  per-constraint messages. `mion enrich` scaffolds per-constraint first; after that the node's authored
 *  mode is owned by the author and the reconcile follows it. */
type DefaultOnlyTemplates = {rt$default: FriendlyTemplate; type?: never};

/** Unbranded fields (plain `string` / `number` / …) can only fail as `type`. */
type BareTemplates = DefaultOnlyTemplates | ({type: FriendlyTemplate} & {rt$default?: never});

/** Per-field error templates derived from the field type `F`: a branded leaf REQUIRES one key per
 *  failable param it declares, an unbranded leaf takes `type` only, either may use `rt$default` instead.
 *  Pure data: an inline-function form would be opaque to translation, reconcile and the checker. */
export type ErrorTemplates<F = never> = [F] extends [never]
  ? BareTemplates
  : F extends {readonly [__rtFormatParams]?: infer P}
    ? [NonNullable<P>] extends [object]
      ? DefaultOnlyTemplates | ConstraintTemplates<NonNullable<P>>
      : BareTemplates
    : BareTemplates;

/** Label and error templates are both REQUIRED, so every node must be addressed; that the VALUES are
 *  filled is enforced by the `@todo` / diagnostic layer, which TS can't see. `F` is the FIELD's own type,
 *  threaded through so `rt$errors` demands exactly the keys its format params declare. `rt$typeName`
 *  gives a NAMED type a friendly name, defaulting to the reflected one. The `rt$` prefix is RESERVED in
 *  enriched types (`mion enrich` refuses / FT011 flags a colliding property), so the child map can't shadow it. */
export interface FriendlyMeta<F = never> {
  rt$label: string;
  rt$errors: ErrorTemplates<F>;
  rt$typeName?: string;
}

/** Scalar / native kinds that carry only meta (no child fields). */
type FriendlyLeaf = string | number | boolean | bigint | null | undefined | Date | RegExp;

/** Recursion-budget decrement (`[0]` is `never`, unreachable — the `Depth extends 0` guard stops first),
 *  bounding circular / mutually-recursive types to a finite instantiation (no TS2589). */
type _FriendlyDepth = [never, 0, 1, 2, 3, 4, 5, 6, 7, 8];

/** Recursive friendly node — structural per solution A (docs/AI_ENRICHMENT.md): composite kinds reflect
 *  their structure, NOT an opaque leaf. Branch order is most-specific-first, and the `Map` / `Set` gates
 *  run BEFORE the array check to keep `infer` off the hot path (mirroring `DataOnly`). Index signatures
 *  and object-member unions are OUT OF SCOPE: an index-sig object falls through to the object map. */
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

/** The friendly map for `T`, validated against `T` at scan time (the `ShapeCheckedArgs<T>` axis). */
export type FriendlyText<T> = FriendlyNode<T>;

// #endregion friendlytext-extract
// One type annotates every friendly-family file: a translation const is `FriendlyText<T>` at
// `i18n/<locale>/<rel>.ts` with a `<locale>_friendly*` name, so the path and prefix carry the locale.
