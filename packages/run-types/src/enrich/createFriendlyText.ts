// `createFriendlyText<T>(map)` — renders `getValidationErrors` output into
// human-readable messages using a `FriendlyText<T>` map (see docs/AI_ENRICHMENT.md).
//
// Pure data over (map, errors): for each error it walks `error.path` into the map,
// picks a template by the `(format.name, formatPath-tail)` discriminator (`type`
// for the base type-shape failure), and interpolates `$[…]` placeholders. NO
// type-id injection and NO rtUtils — error rendering needs only the map. (UI field
// enumeration, which needs the runtype, is the deferred registry-accessor path.)
//
// Aggregation matches the validator: `getValidationErrors` accumulates, so a
// field can carry several errors and yields ONE message per failed constraint
// (a list) — or ONE message per field when the node uses the exclusive
// `rt$default` mode ({rt$default: '…'} instead of per-constraint keys).
//
// `createFriendlyTextI18n<T>(source, options)` — the locale-selecting wrapper over
// the SAME walk (docs/todos → docs/done friendly-type-i18n). The source map IS
// the source language and the terminal fallback; a translation is another
// same-tree `FriendlyText<T>` const. Per leaf, an untranslated / @todo-blank
// template falls through to the source; a plural leaf falls through as a WHOLE
// unit (its own `other` backstops missing arms first). Plural arms are selected
// via `Intl.PluralRules` on the violated bound.
//
// `$[val]` rendering is TYPE-DRIVEN on the i18n path: the error's format
// payload says what the bound IS — a number with the `isCurrency` param (the
// emitter echoes it onto the error) renders via
// `Intl.NumberFormat(locale, {style: 'currency', currency})` with the
// app-supplied `currency` option (no option → plain localized number, never a
// guessed symbol); a date-family format name renders via
// `Intl.DateTimeFormat(locale)`; everything else stays `String(val)`. There is
// no per-template format syntax — the type is the single source of truth.
// Always lenient — a partial translation renders, it never throws.

import type {RTValidationError, RTValidationErrorPathSegment, TypeFormatError} from '../createRTFunctions.ts';
import type {FriendlyText, PluralTemplate, TemplateLeaf} from './friendlyText.ts';

/** A rendered, human-readable validation message for one failure. */
export interface FriendlyMessage {
  /** Dotted path to the field (`profile.email`); `''` for the root. */
  path: string;
  /** The field's friendly label, or its raw last path segment as fallback. */
  label: string;
  /** The interpolated message. */
  message: string;
}

/** What `createFriendlyText` returns. */
export interface FriendlyRenderer {
  /** The friendly label for a path (dotted string or a raw segment array). */
  label(path: string | RTValidationErrorPathSegment[]): string;
  /** Render a `getValidationErrors` result into friendly messages. */
  errors(errs: RTValidationError[]): FriendlyMessage[];
}

// Runtime view of a node — the authored map is a plain object with `rt$label` /
// `rt$errors` meta keys plus child-field keys (`rt$items` for arrays and rest-tuple
// elements, `rt$slots` for fixed-tuple positions, `rt$keys` / `rt$values` for
// maps/sets).
// Loose runtime view of a node's templates: the precise per-param typing lives
// on the AUTHORED map (ErrorTemplates<F>); the walk only reads keys.
type ErrorTemplatesRuntime = {[key: string]: TemplateLeaf | undefined};

type FriendlyNodeRuntime = {
  rt$label?: string;
  rt$errors?: ErrorTemplatesRuntime;
  rt$items?: FriendlyNodeRuntime;
  rt$slots?: FriendlyNodeRuntime[];
  rt$keys?: FriendlyNodeRuntime;
  rt$values?: FriendlyNodeRuntime;
  [field: string]: unknown;
};

// `$[name]` — the closed token set (`label` / `val` / `path` / `index`). The
// required bracket-close means a literal colon in prose (`ratio 3:1` outside
// any `$[…]`) is never touched; an unknown token stays verbatim.
const PLACEHOLDER = /\$\[(\w+)\]/g;

// The default locale when none is configured: matches the tsconfig
// `i18n.sourceLocale` default, so an unconfigured runtime and an unconfigured
// build agree. Deterministic (never the host locale).
const DEFAULT_LOCALE = 'en';

// Memoized Intl instances (the i18next addCached model): building
// NumberFormat/PluralRules/… is expensive, so each is built once and reused
// across renders. Module-scope singletons BESIDE the pure walk — the walk
// itself caches nothing. Plural rules key on the locale alone; the bound
// formatters key on `${locale}\0${currency}` / `${locale}\0${style group}`.
const pluralRulesCache = new Map<string, Intl.PluralRules>();
const boundNumberFormatCache = new Map<string, Intl.NumberFormat>();
const boundDateFormatCache = new Map<string, Intl.DateTimeFormat>();

function cachedPluralRules(locale: string): Intl.PluralRules {
  let rules = pluralRulesCache.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(locale, {type: 'cardinal'});
    pluralRulesCache.set(locale, rules);
  }
  return rules;
}

/** The `Intl.NumberFormat` for a currency-branded bound: currency style when
 *  the app supplied a code, plain localized decimal otherwise. An invalid code
 *  falls back to the plain decimal formatter — the renderer never throws. */
function cachedBoundNumberFormat(locale: string, currency: string | undefined): Intl.NumberFormat {
  const key = locale + '\0' + (currency ?? '');
  let format = boundNumberFormatCache.get(key);
  if (!format) {
    try {
      format = currency ? new Intl.NumberFormat(locale, {style: 'currency', currency}) : new Intl.NumberFormat(locale);
    } catch {
      format = new Intl.NumberFormat(locale);
    }
    boundNumberFormatCache.set(key, format);
  }
  return format;
}

// Date-family format names → the Intl.DateTimeFormat options a bound of that
// format renders with. Keyed by TypeFormatError.name — the type says what the
// value is, the reader's locale says how to write it.
const DATE_BOUND_OPTIONS: Record<string, Intl.DateTimeFormatOptions> = {
  date: {dateStyle: 'medium'},
  temporalPlainDate: {dateStyle: 'medium'},
  temporalPlainYearMonth: {year: 'numeric', month: 'long'},
  dateTime: {dateStyle: 'medium', timeStyle: 'short'},
  nativeDate: {dateStyle: 'medium', timeStyle: 'short'},
  temporalInstant: {dateStyle: 'medium', timeStyle: 'short'},
  temporalZonedDateTime: {dateStyle: 'medium', timeStyle: 'short'},
  temporalPlainDateTime: {dateStyle: 'medium', timeStyle: 'short'},
  time: {timeStyle: 'short'},
  temporalPlainTime: {timeStyle: 'short'},
};

function cachedBoundDateFormat(locale: string, formatName: string): Intl.DateTimeFormat {
  const key = locale + '\0' + formatName;
  let format = boundDateFormatCache.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(locale, DATE_BOUND_OPTIONS[formatName]);
    boundDateFormatCache.set(key, format);
  }
  return format;
}

/** Select a plural template's arm for the violated bound: the file-locale's
 *  CLDR category via `Intl.PluralRules`, `other` as the in-leaf backstop. A
 *  non-finite bound selects `other` directly (`select(NaN)` throws
 *  RangeError). A blank (`''` @todo) arm falls to `other` too, so a
 *  half-filled plural degrades inside its own leaf before the caller falls
 *  back across maps. */
function selectPlural(leaf: PluralTemplate, bound: string | number | boolean | bigint | undefined, locale: string): string {
  const count = Number(bound);
  if (!Number.isFinite(count)) return leaf.other;
  const category = cachedPluralRules(locale).select(count);
  return leaf[category] || leaf.other;
}

/** A path segment's dotted-path key: a string field name, an array / tuple
 *  index, or a Map / Set entry's iteration index (its numeric `key`). */
function segmentKey(seg: RTValidationErrorPathSegment): string | number {
  if (typeof seg === 'string' || typeof seg === 'number') return seg;
  return seg.key;
}

/** Descend one segment: string → child field; number → `rt$slots[i]` for a fixed
 *  tuple, else `rt$items` (array / rest-tuple element); Map / Set entry → `rt$keys`
 *  (a `mapKey` failure) or `rt$values` (a `mapValue` / `setKey` failure), routed
 *  by the segment's `failed` role. A fixed tuple has positional `rt$slots`; an
 *  array (and a rest tuple, whose `length` is the broad `number`) has `rt$items`. */
function descend(node: FriendlyNodeRuntime | undefined, seg: RTValidationErrorPathSegment): FriendlyNodeRuntime | undefined {
  if (!node) return undefined;
  if (typeof seg === 'string') return node[seg] as FriendlyNodeRuntime | undefined;
  if (typeof seg === 'number') return node.rt$slots ? node.rt$slots[seg] : node.rt$items;
  return seg.failed === 'mapKey' ? node.rt$keys : node.rt$values;
}

function nodeAt(root: FriendlyNodeRuntime, path: RTValidationErrorPathSegment[]): FriendlyNodeRuntime | undefined {
  let node: FriendlyNodeRuntime | undefined = root;
  for (const seg of path) node = descend(node, seg);
  return node;
}

/** Fallback label when a node has no `rt$label`: the last STRING segment (the
 *  field name) if any, else the last segment stringified. */
function rawLabel(path: RTValidationErrorPathSegment[]): string {
  for (let i = path.length - 1; i >= 0; i--) {
    if (typeof path[i] === 'string') return path[i] as string;
  }
  const tail = path.length ? segmentKey(path[path.length - 1]) : undefined;
  return tail === undefined ? '' : String(tail);
}

function pathToString(path: RTValidationErrorPathSegment[]): string {
  return path.map((seg) => String(segmentKey(seg))).join('.');
}

/** The template key for an error: the format sub-constraint (`formatPath` tail),
 *  else the format name, else `type` for a base type-shape failure. */
function constraintKey(format: TypeFormatError | undefined): string {
  if (!format) return 'type';
  const tail = format.formatPath[format.formatPath.length - 1];
  return tail !== undefined ? String(tail) : format.name;
}

/** Keep only primitive constraint values; arrays/objects → undefined. */
function primitiveVal(val: TypeFormatError['val'] | undefined): string | number | boolean | bigint | undefined {
  const kind = typeof val;
  if (kind === 'string' || kind === 'number' || kind === 'boolean' || kind === 'bigint') {
    return val as string | number | boolean | bigint;
  }
  return undefined;
}

/** The last numeric path segment (array index or Map / Set entry index), for
 *  `$[index]`. */
function numericIndex(path: RTValidationErrorPathSegment[]): number | undefined {
  for (let i = path.length - 1; i >= 0; i--) {
    const key = segmentKey(path[i]);
    if (typeof key === 'number') return key;
  }
  return undefined;
}

interface InterpolateCtx {
  label: string;
  /** The already-rendered `$[val]` text (type-driven on the i18n path);
   *  undefined when the error carries no bound. */
  valText?: string;
  path: string;
  index?: number;
}

function interpolate(template: string, ctx: InterpolateCtx): string {
  return template.replace(PLACEHOLDER, (whole: string, name: string) => {
    if (name === 'label') return ctx.label;
    if (name === 'val') return ctx.valText ?? '';
    if (name === 'path') return ctx.path;
    if (name === 'index') return ctx.index === undefined ? '' : String(ctx.index);
    return whole;
  });
}

interface PathGroup {
  path: RTValidationErrorPathSegment[];
  pathStr: string;
  errors: RTValidationError[];
}

/** Grouping signature: the dotted path, but a Map / Set entry also encodes its
 *  `failed` role so a key-failure and a value-failure at the SAME entry index
 *  resolve to their own (`rt$keys` vs `rt$values`) node instead of colliding. */
function groupSignature(path: RTValidationErrorPathSegment[]): string {
  return path.map((seg) => (typeof seg === 'object' ? `${seg.key} ${seg.failed ?? ''}` : String(seg))).join('.');
}

/** Group errors by path (role-aware for Map / Set), preserving first-seen order. */
function groupByPath(errs: RTValidationError[]): PathGroup[] {
  const groups: PathGroup[] = [];
  const bySignature = new Map<string, PathGroup>();
  for (const err of errs) {
    const signature = groupSignature(err.path);
    let group = bySignature.get(signature);
    if (!group) {
      group = {path: err.path, pathStr: pathToString(err.path), errors: []};
      bySignature.set(signature, group);
      groups.push(group);
    }
    group.errors.push(err);
  }
  return groups;
}

// One render pass's resolved inputs: the map to read (a translation, or the
// source itself), the locale whose CLDR rules select plural arms in that map,
// the terminal-fallback source map (absent on the single-locale path), the
// source's own plural-rules locale, and — on the i18n path — the type-driven
// bound rendering flag + the app-supplied currency code. Built fresh per
// label()/errors() call by the i18n wrapper (the reactive `{value}` seam),
// once by `createFriendlyText`.
interface RenderState {
  root: FriendlyNodeRuntime;
  rootLocale: string;
  source?: FriendlyNodeRuntime;
  sourceLocale: string;
  /** True on the `createFriendlyTextI18n` path: `$[val]` renders by the bound's
   *  type format. Plain `createFriendlyText` stays byte-stable (`String(val)`). */
  i18n?: boolean;
  /** ISO 4217 code for `currency`-branded bounds; absent → plain number. */
  currency?: string;
}

/** Render a violated bound to its `$[val]` text. Plain path: `String(val)`.
 *  i18n path: the error's format payload says what the bound IS — the
 *  `isCurrency` mark (echoed off the number format's param) renders via the
 *  locale's currency/decimal `Intl.NumberFormat`; a date-family bound parses
 *  and renders via `Intl.DateTimeFormat` (an unparseable bound — e.g. a
 *  relative `now-P1D` — stays verbatim); anything else stays `String(val)`. */
function renderBoundText(
  state: RenderState,
  format: TypeFormatError | undefined,
  val: string | number | boolean | bigint | undefined
): string | undefined {
  if (val === undefined) return undefined;
  if (!state.i18n || !format) return String(val);
  if (format.isCurrency) {
    const numeric = Number(val);
    if (!Number.isFinite(numeric)) return String(val);
    return cachedBoundNumberFormat(state.rootLocale, state.currency).format(numeric);
  }
  if (DATE_BOUND_OPTIONS[format.name] && (typeof val === 'string' || typeof val === 'number')) {
    const date = new Date(val);
    if (Number.isNaN(date.getTime())) return String(val);
    return cachedBoundDateFormat(state.rootLocale, format.name).format(date);
  }
  return String(val);
}

const labelFor = (node: FriendlyNodeRuntime | undefined, path: RTValidationErrorPathSegment[]): string =>
  node?.rt$label || rawLabel(path);

// resolveTemplate picks one map-node's template string for a constraint key:
// `rt$errors[key]` (per-constraint mode), else the node's `rt$errors.rt$default`
// (the exclusive catch-all mode — the two never coexist, so this single lookup
// serves both); a plural leaf selects its arm with the MAP's locale (never the
// other map's — plural leaves are atomic per map). Returns undefined when the
// node yields nothing renderable (missing node / missing key / blank `''`
// @todo templates), which is the caller's cross-map fallback signal.
function resolveTemplate(
  node: FriendlyNodeRuntime | undefined,
  key: string,
  val: string | number | boolean | bigint | undefined,
  mapLocale: string
): string | undefined {
  const errorTemplates = node?.rt$errors;
  if (!errorTemplates) return undefined;
  return leafTemplate(errorTemplates[key], val, mapLocale) ?? leafTemplate(errorTemplates.rt$default, val, mapLocale);
}

// leafTemplate renders one template leaf to a non-blank string, or undefined —
// a blank `''` (an unfilled @todo) counts as absent so fallback can proceed.
function leafTemplate(
  leaf: string | PluralTemplate | undefined,
  val: string | number | boolean | bigint | undefined,
  mapLocale: string
): string | undefined {
  if (leaf === undefined) return undefined;
  const template = typeof leaf === 'string' ? leaf : selectPlural(leaf, val, mapLocale);
  return template || undefined;
}

function renderLabel(state: RenderState, path: string | RTValidationErrorPathSegment[]): string {
  const segs = typeof path === 'string' ? (path === '' ? [] : path.split('.')) : path;
  const node = nodeAt(state.root, segs);
  if (node?.rt$label) return node.rt$label;
  const sourceNode = state.source ? nodeAt(state.source, segs) : undefined;
  return labelFor(sourceNode, segs);
}

function renderErrors(state: RenderState, errs: RTValidationError[]): FriendlyMessage[] {
  const out: FriendlyMessage[] = [];
  for (const group of groupByPath(errs)) {
    const node = nodeAt(state.root, group.path);
    const sourceNode = state.source ? nodeAt(state.source, group.path) : undefined;
    const label = node?.rt$label || sourceNode?.rt$label || rawLabel(group.path);

    const index = numericIndex(group.path);

    // rt$default (exclusive catch-all) mode → ONE message for the whole field,
    // whatever failed. Find the node that actually supplies this group's text
    // (root/translation first, else source — resolveTemplate's precedence) using the
    // FIRST error, and if it carries a rt$default template render it ONCE with that
    // error's bound for $[val]. FT009 makes rt$default mutually exclusive with
    // per-constraint keys, so otherwise every failed constraint would render
    // identical text.
    const first = group.errors[0];
    const firstVal = primitiveVal(first.format?.val);
    const rootProvides = resolveTemplate(node, constraintKey(first.format), firstVal, state.rootLocale) !== undefined;
    const defaultNode = rootProvides ? node : sourceNode;
    const defaultLocale = rootProvides ? state.rootLocale : state.sourceLocale;
    const catchAll = leafTemplate(defaultNode?.rt$errors?.rt$default, firstVal, defaultLocale);
    if (catchAll !== undefined) {
      out.push({
        path: group.pathStr,
        label,
        message: interpolate(catchAll, {
          label,
          valText: renderBoundText(state, first.format, firstVal),
          path: group.pathStr,
          index,
        }),
      });
      continue;
    }

    // Per-constraint mode: one message per failed constraint.
    for (const err of group.errors) {
      const key = constraintKey(err.format);
      const val = primitiveVal(err.format?.val);
      // Leaf-granular fallback: the translation's leaf, else the source's.
      // Each map selects plural arms with ITS OWN locale's rules, so a
      // translated plural is atomic (never a target `few` mixed with a source
      // `other` mid-message).
      const template =
        resolveTemplate(node, key, val, state.rootLocale) ?? resolveTemplate(sourceNode, key, val, state.sourceLocale);
      const message = template
        ? interpolate(template, {
            label,
            valText: renderBoundText(state, err.format, val),
            path: group.pathStr,
            index,
          })
        : `${label || 'value'} is invalid`;
      out.push({path: group.pathStr, label, message});
    }
  }
  return out;
}

export function createFriendlyText<T>(map: FriendlyText<T>): FriendlyRenderer {
  const state: RenderState = {
    root: map as FriendlyNodeRuntime,
    rootLocale: DEFAULT_LOCALE,
    sourceLocale: DEFAULT_LOCALE,
  };
  return {
    label: (path) => renderLabel(state, path),
    errors: (errs) => renderErrors(state, errs),
  };
}

/** Options for `createFriendlyTextI18n`. */
export interface FriendlyI18nOptions<T> {
  /** The active locale: a plain tag, or any `{value}` ref (e.g. a Vue Ref) —
   *  read structurally on EVERY render, so switching the ref re-renders with
   *  zero API churn. (The renderer itself is not reactivity-tracked: call it
   *  inside a `computed()` / re-invoke `errors()` per render.) */
  locale: string | {readonly value: string};
  /** Committed translation consts by locale tag (`{es: es_friendlyUser}`).
   *  Values are same-tree `FriendlyText<T>` maps authored in that locale. */
  translations: Partial<Record<string, FriendlyText<T>>>;
  /** ISO 4217 code (`'EUR'`) for rendering `Currency`-branded bounds — a plain
   *  string or any `{value}` ref (re-read on EVERY render, like `locale`).
   *  WHICH currency a value is in is app data, so it is supplied here, never
   *  in the type. Omitted → a currency bound renders as a plain localized
   *  number; a symbol is never guessed. */
  currency?: string | {readonly value: string};
  /** The language the SOURCE map is authored in (default 'en') — the
   *  `Intl.PluralRules` used when a plural leaf renders from the source. */
  sourceLocale?: string;
  /** Reserved: the runtime is ALWAYS lenient (per-leaf fallback to source);
   *  strictness lives in `mion enrich --i18n --no-emit`. */
  strict?: boolean;
}

/** Pick the best translation tag for a requested locale via BCP-47 truncation:
 *  exact tag first, then subtags dropped right-to-left (`pt-BR` → `pt`), then
 *  any available tag whose own truncation shares the base language (`zh-Hant`
 *  matches a `zh-Hans` file when nothing closer exists — naive by design).
 *  Returns undefined when nothing shares the base language (the caller falls
 *  back to the source). */
export function resolveLocale<T>(locale: string, translations: Partial<Record<string, FriendlyText<T>>>): string | undefined {
  if (!locale) return undefined;
  const have = (tag: string) => translations[tag] !== undefined;
  // Exact, then right-to-left truncation of the requested tag.
  const parts = locale.split('-');
  for (let keep = parts.length; keep >= 1; keep--) {
    const candidate = parts.slice(0, keep).join('-');
    if (have(candidate)) return candidate;
  }
  // Base-language match against the AVAILABLE tags (zh-Hant → zh-Hans).
  const baseLanguage = parts[0].toLowerCase();
  for (const tag of Object.keys(translations)) {
    if (translations[tag] !== undefined && tag.split('-')[0].toLowerCase() === baseLanguage) return tag;
  }
  return undefined;
}

/** The locale-selecting wrapper over the one pure `createFriendlyText` walk. The
 *  `source` map is the source language and the terminal fallback; every leaf
 *  (labels, error templates) falls through to it when the active translation
 *  leaves it blank. Never throws on a partial translation. */
export function createFriendlyTextI18n<T>(source: FriendlyText<T>, options: FriendlyI18nOptions<T>): FriendlyRenderer {
  const sourceRoot = source as FriendlyNodeRuntime;
  const sourceLocale = options.sourceLocale ?? DEFAULT_LOCALE;

  // Resolved fresh on EVERY render — the reactive `{value}` locale/currency seam.
  const state = (): RenderState => {
    const active = typeof options.locale === 'object' ? options.locale.value : options.locale;
    const matched = resolveLocale<T>(active, options.translations);
    const translation = matched !== undefined ? (options.translations[matched] as FriendlyNodeRuntime) : undefined;
    return {
      root: translation ?? sourceRoot,
      rootLocale: translation ? (matched as string) : sourceLocale,
      source: translation ? sourceRoot : undefined,
      sourceLocale,
      i18n: true,
      currency: typeof options.currency === 'object' ? options.currency.value : options.currency,
    };
  };

  return {
    label: (path) => renderLabel(state(), path),
    errors: (errs) => renderErrors(state(), errs),
  };
}
