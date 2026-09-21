// `createFriendlyText<T>(map)` — renders `getValidationErrors` output into human-readable messages
// against a `FriendlyText<T>` map (see docs/AI_ENRICHMENT.md). Pure data over (map, errors), with NO
// type-id injection and NO rtUtils: error rendering needs only the map. Aggregation matches the
// validator, which accumulates, so a field yields ONE message per failed constraint — or one message
// for the whole field when the node uses the exclusive `rt$default` mode. `createFriendlyTextI18n<T>`
// is the locale-selecting wrapper over the SAME walk, and a plural leaf falls through to the source
// as a WHOLE unit. Always lenient: a partial translation renders, it never throws.

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

// Loose runtime view of a node's templates: the precise per-param typing lives on the AUTHORED map
// (ErrorTemplates<F>), and the walk only reads keys.
type ErrorTemplatesRuntime = {[key: string]: TemplateLeaf | undefined};

// Runtime view of a node: `rt$items` holds arrays and rest-tuple elements, `rt$slots` fixed-tuple
// positions, `rt$keys` / `rt$values` maps and sets.
type FriendlyNodeRuntime = {
  rt$label?: string;
  rt$errors?: ErrorTemplatesRuntime;
  rt$items?: FriendlyNodeRuntime;
  rt$slots?: FriendlyNodeRuntime[];
  rt$keys?: FriendlyNodeRuntime;
  rt$values?: FriendlyNodeRuntime;
  [field: string]: unknown;
};

// `$[name]` — the closed token set (`label` / `val` / `path` / `index`). The required bracket-close
// keeps prose punctuation untouched, and an unknown token stays verbatim.
const PLACEHOLDER = /\$\[(\w+)\]/g;

// Matches the tsconfig `i18n.sourceLocale` default, so an unconfigured runtime and an unconfigured
// build agree. Deterministic: never the host locale.
const DEFAULT_LOCALE = 'en';

// Building an Intl instance is expensive, so each is built once and reused across renders. Module-scope
// singletons BESIDE the pure walk, which caches nothing itself.
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

/** Currency style when the app supplied a code, plain localized decimal otherwise. An invalid code
 *  falls back to the plain decimal formatter, so the renderer never throws. */
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

// Keyed by TypeFormatError.name: the type says what the value is, the reader's locale says how to write it.
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

/** Selects a plural arm by the file-locale's CLDR category, with `other` as the in-leaf backstop. A
 *  non-finite bound selects `other` directly, since `select(NaN)` throws RangeError. A blank (`''` @todo)
 *  arm falls to `other` too, so a half-filled plural degrades inside its own leaf. */
function selectPlural(leaf: PluralTemplate, bound: string | number | boolean | bigint | undefined, locale: string): string {
  const count = Number(bound);
  if (!Number.isFinite(count)) return leaf.other;
  const category = cachedPluralRules(locale).select(count);
  return leaf[category] || leaf.other;
}

/** A segment's dotted-path key: a field name, an array / tuple index, or a Map / Set entry's index. */
function segmentKey(seg: RTValidationErrorPathSegment): string | number {
  if (typeof seg === 'string' || typeof seg === 'number') return seg;
  return seg.key;
}

/** Descends one segment. A fixed tuple has positional `rt$slots`; an array (and a rest tuple, whose
 *  `length` is the broad `number`) has `rt$items`. A Map / Set entry is routed by its `failed` role:
 *  `rt$keys` for a `mapKey` failure, `rt$values` for a `mapValue` / `setKey` one. */
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

/** Fallback label when a node has no `rt$label`: the last STRING segment, else the last one stringified. */
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

/** The template key: the format sub-constraint, else the format name, else `type` for a type-shape failure. */
function constraintKey(format: TypeFormatError | undefined): string {
  if (!format) return 'type';
  const tail = format.formatPath[format.formatPath.length - 1];
  return tail !== undefined ? String(tail) : format.name;
}

/** Keeps only primitive constraint values. */
function primitiveVal(val: TypeFormatError['val'] | undefined): string | number | boolean | bigint | undefined {
  const kind = typeof val;
  if (kind === 'string' || kind === 'number' || kind === 'boolean' || kind === 'bigint') {
    return val as string | number | boolean | bigint;
  }
  return undefined;
}

/** The last numeric path segment, for `$[index]`. */
function numericIndex(path: RTValidationErrorPathSegment[]): number | undefined {
  for (let i = path.length - 1; i >= 0; i--) {
    const key = segmentKey(path[i]);
    if (typeof key === 'number') return key;
  }
  return undefined;
}

interface InterpolateCtx {
  label: string;
  /** The already-rendered `$[val]` text; undefined when the error carries no bound. */
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

/** The dotted path, with a Map / Set entry also encoding its `failed` role so a key-failure and a
 *  value-failure at the SAME entry index resolve to their own node instead of colliding. */
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

// One render pass's resolved inputs. `source` is the terminal-fallback map, absent on the
// single-locale path. Built fresh per label() / errors() call by the i18n wrapper (the reactive
// `{value}` seam), once by `createFriendlyText`.
interface RenderState {
  root: FriendlyNodeRuntime;
  rootLocale: string;
  source?: FriendlyNodeRuntime;
  sourceLocale: string;
  /** True on the i18n path: `$[val]` renders by the bound's type format, where plain
   *  `createFriendlyText` stays byte-stable (`String(val)`). */
  i18n?: boolean;
  /** ISO 4217 code for `currency`-branded bounds; absent renders a plain number. */
  currency?: string;
}

/** Renders a violated bound to its `$[val]` text. On the i18n path the error's format payload says what
 *  the bound IS, so there is no per-template format syntax; an unparseable date bound (a relative
 *  `now-P1D`) stays verbatim. */
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

// resolveTemplate picks one map-node's template for a constraint key. The per-constraint and
// `rt$default` modes never coexist, so this single lookup serves both, and a plural leaf selects its arm
// with the MAP's own locale (plural leaves are atomic per map). Undefined — a missing node, a missing
// key, or a blank `''` @todo template — is the caller's cross-map fallback signal.
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

// leafTemplate renders one leaf to a non-blank string; a blank `''` (an unfilled @todo) counts as
// absent so fallback can proceed.
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

    // rt$default mode → ONE message for the whole field. The node that supplies this group's text is
    // found with the FIRST error (root/translation first, else source, resolveTemplate's precedence)
    // and rendered once with that error's bound. FT009 makes rt$default mutually exclusive with
    // per-constraint keys, so otherwise every failed constraint would render identical text.
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
      // Leaf-granular fallback: the translation's leaf, else the source's. Each map selects plural arms
      // with ITS OWN locale's rules, so a translated plural is never mixed with a source arm mid-message.
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
  /** The active locale: a plain tag, or any `{value}` ref read structurally on EVERY render. The
   *  renderer itself is not reactivity-tracked: call it inside a `computed()` / re-invoke per render. */
  locale: string | {readonly value: string};
  /** Committed translation consts by locale tag; each is a same-tree `FriendlyText<T>` map. */
  translations: Partial<Record<string, FriendlyText<T>>>;
  /** ISO 4217 code for `Currency`-branded bounds, a plain string or a `{value}` ref re-read every
   *  render. WHICH currency a value is in is app data, so it is supplied here, never in the type.
   *  Omitted, a currency bound renders as a plain localized number; a symbol is never guessed. */
  currency?: string | {readonly value: string};
  /** The language the SOURCE map is authored in (default 'en'), used to select its plural arms. */
  sourceLocale?: string;
  /** Reserved: the runtime is ALWAYS lenient; strictness lives in `mion enrich --i18n --no-emit`. */
  strict?: boolean;
}

/** Picks a translation tag by BCP-47 truncation: the exact tag, then subtags dropped right-to-left
 *  (`pt-BR` → `pt`), then any available tag sharing the base language (`zh-Hant` matches `zh-Hans`,
 *  naive by design). Undefined when nothing shares it, and the caller falls back to the source. */
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

/** The `source` map is the source language and the terminal fallback: every leaf falls through to it
 *  when the active translation leaves it blank. Never throws on a partial translation. */
export function createFriendlyTextI18n<T>(source: FriendlyText<T>, options: FriendlyI18nOptions<T>): FriendlyRenderer {
  const sourceRoot = source as FriendlyNodeRuntime;
  const sourceLocale = options.sourceLocale ?? DEFAULT_LOCALE;

  // Resolved fresh on EVERY render: the reactive `{value}` locale / currency seam.
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
