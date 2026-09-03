// Wire types mirroring the Go side: the reflection model in
// internal/reflection/runtype.go (RunType and friends) and the wire envelope
// in internal/protocol/protocol.go. The interfaces below are
// hand-maintained (to keep the plugin dep-free); the ReflectionKind enum,
// KIND_REF sentinel, and REFLECTION_SUB_KIND map are code-generated from the same
// Go source (reflectionKind.generated.ts) so the kind/sub-kind discriminators can
// never drift.
//
// The shape is the canonical runtypes reflection `RunType` discriminated
// union. Child RunType slots in the JSON wire format are sentinels
// (`{kind: -1, id: N}`); consumers either re-knot themselves (raw JSON) or
// import the generated runtypes-cache.ts module which contains a fully-knotted
// graph.

// ReflectionKind + KIND_REF + REFLECTION_SUB_KIND are GENERATED from
// internal/reflection/{runtype,subkind}.go (the same source as @mionjs/run-types's
// RunTypeKind / RunTypeSubKind), re-exported here so existing
// `import {ReflectionKind} from './protocol.ts'` sites are unchanged.
import {KIND_REF, ReflectionKind, REFLECTION_SUB_KIND, type ReflectionSubKind} from './go-generated/reflectionKind.generated.ts';
export {KIND_REF, ReflectionKind, REFLECTION_SUB_KIND, type ReflectionSubKind};

// Re-export the cache-module settings generated from
// internal/constants/constants.go so callers have a single place to import
// the prefix from. Single source of truth lives in Go; the .generated.ts
// file is rebuilt via `pnpm run gen:ts-constants`.
export {
  CACHE_MODULES,
  RUNTYPES_VAR_PREFIX,
  RUNTYPES_MODULE_NAME,
  VALIDATE_VAR_PREFIX,
  VALIDATE_MODULE_NAME,
  type CacheModuleSettings,
} from './go-generated/runtypes-constants.generated.ts';

export interface ClassRef {
  // builtin: "Date" | "Map" | "Set" | "RegExp" — footer wires
  // `t.classType = globalThis.<builtin>`.
  builtin?: string;
  // user-class export name + originating module path (v2 lazy import).
  name?: string;
  module?: string;
}

// RunType is a JSON-friendly union of every reflection RunType variant.
// Optional fields are populated only when relevant to the discriminator
// `kind`.
//
// IDs are short alphanumeric hash strings (default 6 chars). Two
// structurally-equal types share the same id.
export interface RunType {
  id?: string;
  kind: ReflectionKind | typeof KIND_REF;
  subKind?: number;

  // TypeAnnotations
  typeName?: string;
  typeArguments?: RunType[];
  isCircular?: boolean;
  // True for the "non-data" kinds (function / method / call-signature /
  // symbol / never / non-serialisable class) the validators & serializers
  // ignore. The node stays in the reflected tree so reflection is complete;
  // only the node itself is flagged, never its children.
  notSupported?: boolean;

  // TypeLiteral
  literal?: unknown;

  // shared
  name?: string;
  optional?: true;
  readonly?: true;
  visibility?: number;
  isAbstract?: true;
  isStatic?: true;
  // isSafeName — property / method nodes only. True when `name` is a
  // valid JS identifier (or all digits) and consumers can emit dot access
  // (obj.foo). False/missing means bracket notation is required.
  isSafeName?: true;
  // position — parameter / tupleMember nodes only. 0-based slot index in
  // the parent. Number, not boolean, because zero is a valid slot.
  position?: number;
  defaultVal?: unknown;
  description?: string;
  flags?: string[];

  // function-like
  parameters?: RunType[];
  return?: RunType;

  // single-typed containers (array/promise/tupleMember/property/parameter)
  child?: RunType;
  index?: RunType;

  // multi-typed containers (objectLiteral/class/tuple/union/intersection/enum)
  children?: RunType[];

  // union only — children reordered so superset shapes precede their
  // subset equivalents (prevents unreachable union members at validate
  // time). Same ref objects as `children`, just rearranged.
  safeUnionChildren?: RunType[];

  // union only — set by the serialize-time discriminator detection
  // pass. Parallel to `safeUnionChildren`: entry i is a ref to the
  // discriminator property within `safeUnionChildren[i]`. Consumer
  // reads entry.name for the property key and entry.child for the
  // expected type. Slots for non-object members (simple / any) are
  // null/undefined. Absent when neither detection pass finds a
  // usable discriminator. Lives on the union (not the property node)
  // so the relationship is correctly scoped — the same canonical
  // property node may be a discriminator in one parent union but not
  // in another.
  //
  // Wire-format equivalent of the FlattenedProp[] output
  // (ref: packages/run-types/src/nodes/collection/unionDiscriminator.ts).
  // Only the strictly-new field (the property ref) lives on the wire;
  // the other FlattenedProp fields are reconstructible. Consumers
  // call `flattenUnionDiscriminators` from mion
  // to materialise the full per-member struct in one pass.
  unionDiscriminators?: (RunType | null | undefined)[];

  // The OPEN metadata extension point: object-literal members surviving an
  // intersection-collapse of a primitive with metadata objects (e.g.
  // `string & {__brand}`, `number & {dbIndex: true}`). Carried untouched for
  // consumers to read back via reflection; the engine never interprets it —
  // formatAnnotation (below) is the CLOSED, engine-executed counterpart.
  // Each entry is a ref to an objectLiteral RunType. Mirrors deepkit's
  // TypeAnnotations.decorators.
  typeMeta?: RunType[];

  // populated when a primitive is branded with a TypeFormat<Base, Name,
  // Params, ...> marker from `@mionjs/run-types/formats`. Sibling of
  // the FormatAnnotation (ref: packages/run-types/src/lib/formats.ts) —
  // the name + params pair that drives format-aware emit. The
  // structural id folds name + canonicalised params in, so two
  // distinct param sets produce two distinct cache entries while
  // equivalent param sets (regardless of object-literal key order)
  // collapse to one. Recognition rides the unforgeable unique-symbol
  // sentinels, so hand-written typeMeta objects can never trigger it.
  formatAnnotation?: FormatAnnotation;

  // enum
  enumVal?: Record<string, unknown>;
  values?: unknown[];
  indexType?: RunType;

  // class
  extendsArguments?: RunType[];
  implements?: RunType[];
  arguments?: RunType[];
  classRef?: ClassRef;

  // objectLiteral (interface form) — direct parent interface types
  // this declaration extends. Each entry is a ref to the parent's
  // RunType. Properties inherited from these parents are ALSO
  // included in `children` (the TS checker merges them via
  // GetPropertiesOfType), so the runtime path stays simple while
  // codegen can walk the inheritance tree explicitly. Empty for
  // anonymous object literals and `type` aliases.
  extends?: RunType[];

  // runtime-only — wired by the cache emitter, never present in wire JSON.
  // `classType` is a live constructor reference (e.g. globalThis.Date for
  // KindClass builtins).
  classType?: unknown;
}

// Site records one transformer-injection point. `pos` is the byte offset of
// the closing `)` of the call expression — the patcher inserts at that
// offset. `paramIndex` is the 0-based slot the injected id occupies in the
// call's argument list. `argsCount` is the number of arguments the user
// already wrote; when less than `paramIndex` the patcher pads with
// `undefined` so the id lands in the right slot.
export interface Site {
  file: string;
  pos: number;
  id: string;
  paramIndex?: number;
  argsCount?: number;
  // fnId is the value injected as the 2nd tuple element for a createX call site
  // routed through the InjectTypeFnArgs marker (a readable family/variant token
  // today; an opaque fn hash after the hashed-id migration). When present, the
  // patcher injects a `[id, fnId]` tuple instead of the bare `"id"` string.
  // Absent for reflection-only InjectRunTypeId sites.
  fnId?: string;
  // fnIds carries every fnId a MULTI-FUNCTION createX site injects when its
  // trailing InjectTypeFnArgs<T, F1, F2, …> marker names more than one function
  // family (e.g. createStandardSchema's <T,'val','verr'>). The rewrite injects
  // an ARRAY of entry-tuple bindings at the single paramIndex, in this order.
  // Present only when length > 1; single-fn / reflection sites omit it and the
  // patcher reads the lone fnId. fnId mirrors fnIds[0] when both are set.
  fnIds?: string[];
  // demand is Go-internal emit metadata (which cache entries this site requires)
  // serialized onto the Site; the plugin does not read it. Mirrored for accuracy.
  demand?: SiteDemand[];
  // trailingComma is true when the call's own argument list was written with a
  // trailing comma (e.g. a formatter-wrapped value-first marker call). The
  // injector splices the binding WITHOUT a leading comma in that case —
  // otherwise the pre-existing comma plus the injected `, …` produce an empty
  // argument `f(a, , …)`, which is invalid JS.
  trailingComma?: boolean;
  // module, when present, is the bundle-module BASENAME this site's entry
  // rides in (allSingle module mode): the rewrite imports the binding from
  // `rtmod:/<module>.js` instead of the entry's own module. The clause
  // shape is identical either way (export name == the binding). Mirrors
  // modules[0] when both are set.
  module?: string;
  // modules carries the bundle basename of EVERY fnId a multi-function site
  // injects, positionally mirroring fnIds — a multi-fn site's fnIds span
  // several families and allSingle gives each family its own bundle, so one
  // basename cannot address them all. Present only for multi-fn allSingle
  // sites; single-fn / reflection sites carry the lone value in module.
  modules?: string[];
}

// SiteDemand mirrors Go protocol.SiteDemand — emit metadata only; the plugin
// never reads it.
export interface SiteDemand {
  family: string;
  variant?: string;
  options?: string[];
  fnHash?: string;
}

// Replacement is a byte-range rewrite on a source file: replace
// [start, end) with text. Used by the pure-fn extractor to swap the
// factory argument of every `registerPureFnFactory(ns, fn, factory)`
// call for the pure fn's entry-module import binding, so the canonical
// fn body lives only in the emitted entry module.
export interface Replacement {
  file: string;
  start: number;
  end: number;
  text: string;
  // When non-empty, the virtual-module specifier the rewrite must import for
  // the substituted expression to resolve — e.g. `rtmod:/pf/rt/foo.js`.
  // `text` IS the module's export name (every entry exports under its binding
  // name), so the rewrite imports `{<text>}` directly.
  importFrom?: string;
}

// PureFnSite mirrors Go protocol.PureFnSite — one generated pure-fn entry in the
// structured build report. Host tooling that relocates pure-fn bodies across
// bundles (mion's cross-bundle serverMapFrom transport) consumes it via the
// JSON file `<genDir>/types/pure-fns-report.json` or the plugin's `onPureFnReport`
// callback. Each record is SELF-CONTAINED (`code` + `paramNames` inline) so a
// consumer never reads the generated module files — that keeps the shape stable
// across every `moduleMode`. Populated only when the pure-fn report is enabled
// (`pureFnReport` option / `onPureFnReport` callback).
export interface PureFnSite {
  // The registrar call site's factory-argument span (byte offsets).
  file: string;
  start: number;
  end: number;
  // Registry key: `rt::<hash>` (anonymous lane) | `<ns>::<name>` (named lane).
  key: string;
  // The identifier the site invoked (a primitive registrar, a framework wrapper
  // like `serverMapFrom` / `registerAcmePureFn`, or a renamed import) and the
  // nearest-package.json / ambient-module name of the file that DECLARES it — so
  // a consumer can attribute a site to the framework that exposed the registrar
  // (`@mionjs/client`, `@acme/toolkit`), even through a wrapper-only file.
  calleeName?: string;
  calleeModule?: string;
  // `named` | `anonymous`; `direct` (arg IS the pure fn, wrapped) | `factory`.
  lane?: string;
  form?: string;
  // Basename of the generated module this entry rides in: per-entry `pf/<ns>/<fn>`
  // in default/allModules mode, or the single `pf` bundle in allSingle.
  module?: string;
  // Entry payload — emitMode-honoring (`code` empty when the mode ships no body).
  paramNames?: string[];
  code?: string;
  pureFnDependencies?: string[];
}

// TransformResult mirrors Go protocol.TransformResult — the per-file output of
// the `transform` op. Two wire shapes selected by Request.emitEdits:
//   - 'go' mode (emitEdits unset): `code` is the fully rewritten source, `map`
//     its source map. The plugin plumbs {code, map} straight to the bundler.
//   - 'edits' mode (emitEdits set): `code`/`map` are absent and `importBlock` +
//     `edits` + `sourceHash` carry the raw edit list the FE applies itself (see
//     apply-edits.ts). Lighter wire: O(sites) instead of the whole file + map.
export interface TransformResult {
  code?: string;
  map?: SourceMap;
  // 'edits' mode — the deduped import block prepended at offset 0 (single
  // physical line, already relativized to <outDir>/types in files-mode).
  // Absent when the file needs no injected imports.
  importBlock?: string;
  // 'edits' mode — the flat point/span edit list (NOT the import block), in
  // UTF-16 code-unit offsets against the ORIGINAL source (the FE indexes JS
  // strings natively).
  edits?: Edit[];
  // 'edits' mode — FNV-1a/32 hash of the source bytes the offsets index. The
  // applier hashes the bundler-supplied source and, on mismatch, re-uploads it
  // (setSources) and re-requests rather than misplacing every offset.
  sourceHash?: string;
  emittedModules?: string[];
  // The source files that DECLARE the types this file's call sites reflect —
  // the edges no bundler can see, because `import type` (and a plain import
  // used only in type position) is erased and an ambient `.d.ts` type never had
  // an import edge at all. A host declares these to its bundler
  // (`addWatchFile` / `addDependency`) so editing a type re-runs the files that
  // reflect it. Absolute program paths, sorted and deduplicated.
  //
  // EMPTY MEANS UNKNOWN, NOT 'no dependencies'. Reading it as "nothing to
  // declare" ships a validator for a type that no longer exists — silently,
  // because a stale validator does not error, it accepts data the current type
  // rejects. Fall back to coarse invalidation instead.
  typeDeps?: string[];
}

// Edit mirrors Go protocol.Edit — one point insertion (start === end) or span
// replacement (start < end) in UTF-16 CODE-UNIT offsets against the original
// source. Used only by 'edits'-mode transform.
export interface Edit {
  start: number;
  end: number;
  text: string;
}

// SourceMap is a standard source-map v3 object (the shape Vite/Rollup accept).
export interface SourceMap {
  version: number;
  sources: (string | null)[];
  sourcesContent: (string | null)[];
  names: string[];
  mappings: string;
}

// FormatAnnotation carries the (name, params) pair extracted from a
// TypeFormat<Base, Name, Params, ...> brand. Wire-mirror of the Go-side
// protocol.FormatAnnotation. Params is the JSON-serialisable literal
// payload — sorted/canonicalised before participating in the cache
// key so two ordering variants of the same params object share one ID.
export interface FormatAnnotation {
  name: string;
  params?: Record<string, unknown>;
}

export interface Request {
  op: 'scanFiles' | 'dump' | 'setSources' | 'reset' | 'tsCompile' | 'transform' | 'generate' | 'enrich';
  // The op's file input: the files to scan (scanFiles), rewrite (transform),
  // or enrichment-check (enrich). The response's sites cover every listed file
  // (each tagged with .file); when the include* flags are set, runTypes /
  // runTypeCacheSource are projected over these files only (NOT the cache's
  // session-wide contents — use dump for that).
  files?: string[];
  // setSources only — { relpath: source-text }.
  sources?: Record<string, string>;
  // scanFiles only — when set, the response includes a runTypes slice
  // covering the request's files.
  includeRunTypes?: boolean;
  // scanFiles only — when set, the response carries the per-entry virtual
  // module map (entryModules) scoped to the request's files. `dump` always
  // carries the full session's modules.
  includeEntryModules?: boolean;
  // Opts the response into the `metrics` block: tsgo extendedDiagnostics
  // counters, per-phase wall times, and Go memory deltas. Mirrors the
  // Go-side Request.IncludeMetrics; zero measurement cost when unset.
  includeMetrics?: boolean;
  // generate / transform — the resolved RunTypes output root (e.g.
  // <srcDir>/.mion). `generate` writes modules under <outDir>/types/;
  // `transform` injects imports relative to it. Empty keeps virtual specifiers.
  outDir?: string;
  // scanFiles only — opts the response into the enrichment-health pass over
  // the request's files (tag hygiene + FriendlyText/MockData content +
  // breadcrumb drift), appended to diagnostics as Family.Enrich entries.
  // Off by default so the rewrite pipeline pays nothing; the lint plugin is
  // the consumer.
  checkEnrich?: boolean;
  // scanFiles only — opts the response into the RunType-family diagnostics
  // (emitted while rendering the demanded entries) WITHOUT the entry-module
  // payload. Implied by includeEntryModules; the lint plugin sets it so one
  // scan surfaces everything a build would.
  includeRtDiagnostics?: boolean;
  // transform only — switch from 'go' mode (full code + map per file) to
  // 'edits' mode: each TransformResult carries importBlock + edits + sourceHash
  // for the FE to apply itself. A per-request wire knob; the artifacts are
  // identical either way, so it never affects the disk cache.
  emitEdits?: boolean;
  // enrich carries NO fields of its own beyond `files` (empty = whole program):
  // the wire carries the event, the session carries the config — families, i18n
  // locales, and the output root ride the spawn flags (--gen-dir / --enrich-*),
  // defaulting from the tsconfig plugin entry.
}

// Metrics mirrors the Go-side protocol.Metrics — populated on a response
// only when the request set includeMetrics. The counter group mirrors
// tsc's `--extendedDiagnostics` (files / lines / identifiers / symbols /
// types / instantiations), read off the live tsgo Program post-op. The
// *Ms group is wall time per pipeline phase of the op; renderMs is keyed
// by cache kind. allocBytes / mallocs / numGC are deltas over the op;
// heapAlloc / heapInuse are post-op snapshots.
export interface Metrics {
  files?: number;
  lines?: number;
  identifiers?: number;
  symbols?: number;
  types?: number;
  instantiations?: number;
  setSourcesMs?: number;
  markerScanMs?: number;
  pureFnsMs?: number;
  prepMs?: number;
  scopedDumpMs?: number;
  renderMs?: Record<string, number>;
  totalMs?: number;
  allocBytes?: number;
  mallocs?: number;
  numGC?: number;
  heapAlloc?: number;
  heapInuse?: number;
  cacheNodes?: number;
}

export interface Response {
  id?: string;
  // Acknowledgement for ops that don't return data (setSources / resetCache).
  ok?: true;
  added?: RunType[];
  // Per-cache "did this scan change anything?" signals consumed by the
  // Vite plugin's handleHotUpdate. `addedRunTypes` is true when this
  // scan interned new RunTypes; `addedValidate` when at least one of
  // those is supported by the Validate emitter; `addedPureFns` when
  // any pure-fn entry's bodyHash flipped or appeared.
  addedRunTypes?: boolean;
  addedValidate?: boolean;
  // Sibling of addedValidate — true when at least one newly-interned
  // RunType has a supported emitTypeErrors arm, so the validationErrors
  // cache module needs invalidating.
  addedValidationErrors?: boolean;
  // Sibling of addedValidate for the JSON serializer pair. Set when at
  // least one newly-interned RunType has a supported emit arm in the
  // matching emitter — the Vite plugin invalidates each cache module
  // independently based on its own flag.
  addedPrepareForJson?: boolean;
  addedRestoreFromJson?: boolean;
  addedStringifyJson?: boolean;
  addedPrepareForJsonSafe?: boolean;
  // Siblings of addedValidate for the unknown-keys family ported from
  // the reference emitHasUnknownKeys et al. Set when at least one newly-interned
  // RunType has a supported emit arm in the matching emitter.
  addedHasUnknownKeys?: boolean;
  addedCloneExactShape?: boolean;
  addedUnknownKeyErrors?: boolean;
  addedUnknownKeysToUndefinedWire?: boolean;
  // Siblings of addedValidate for the binary serializer pair. Set when at
  // least one newly-interned RunType has a supported emit arm in the
  // matching emitter.
  addedToBinary?: boolean;
  addedFromBinary?: boolean;
  // Sibling of addedValidate for the `format` transform family — true when
  // a newly-interned RunType carries a value-transforming format.
  addedFormatTransform?: boolean;
  addedPureFns?: boolean;
  sites?: Site[];
  // Replacements is the byte-range rewrite list the Go transform
  // applies alongside Sites during OpTransform. The pure-fn extractor
  // emits one entry per accepted `registerPureFnFactory(ns, fn,
  // factory)` call: swap the factory argument for the entry-module
  // import binding (importFrom carries the specifier) so the canonical
  // fn body lives only in the emitted entry module.
  replacements?: Replacement[];
  // The structured pure-fn build report — one record per generated pure-fn
  // entry — populated on `generate` (whole program) and `scanFiles` (the
  // rescanned files' delta) when the resolver's pure-fn report is enabled.
  pureFnSites?: PureFnSite[];
  runTypes?: RunType[];
  // One rendered ES-module source per cache entry, keyed by module
  // BASENAME (the `<basename>` of `rtmod:/<basename>.js` — the cache
  // key for runtype / type-fn entries, the `pf/<ns>/<fn>` encoding for
  // pure fns). In files-mode the resolver writes these to disk under
  // `<outDir>/types/` via the `generate` op; this wire field is the
  // in-memory variant still returned by `dump` (and by `scanFiles` when the
  // request sets includeEntryModules, scoped to the request's files).
  entryModules?: Record<string, string>;
  // Manifest of live module basenames written under <outDir>/types by the
  // `generate` op (the current build's filesystem output).
  generated?: string[];
  // Sorted unique list of source files carrying at least one marker site
  // (program paths exactly as the whole-program scan recorded them), returned
  // by the `generate` op. The plugin gates its per-file transform on this set
  // so wrapper call sites (markers forwarded by another package, node_modules
  // included) rewrite with zero configuration.
  siteFiles?: string[];
  // enrich only — the computed enrichment mirror files (path + desired content +
  // added + kind). The daemon never writes; the caller writes them under its own
  // HMR-suppression window. Absent on an enrichNoEmit request (diagnostics only).
  enrichFiles?: EnrichFile[];
  // The output root `generate` actually wrote to. When the request left
  // outDir empty the resolver infers <srcDir>/.mion from the tsconfig and
  // echoes the absolute path here so the plugin can adopt it.
  outDir?: string;
  // Echo of the tsconfig plugin's failOnError on `generate` (absent when the
  // tsconfig sets none) so the dependency-free host can honor a tsconfig-only
  // setting: the plugin's own option wins, then this echo, then the true default.
  failOnError?: boolean;
  // One TransformResult per file for the `transform` op: rewritten source +
  // source map (+ the cache modules the file imports), keyed by file path.
  transformed?: Record<string, TransformResult>;
  // Diagnostics carries every non-fatal diagnostic the Go binary emits —
  // pure-fn extractor (PFE9xxx), marker scanner (MKRxxx), RT compiler
  // (IT/TE/PJ/…/FB). The Family discriminator on each entry tells the
  // consumer which subsystem produced it. The Vite plugin re-emits each
  // via `this.warn(formatTscDiagnostic(d))` so VS Code's $tsc problem
  // matcher picks them up; the build never fails on these.
  diagnostics?: Diagnostic[];
  // tsCompile only — wall-time (ms) of the embedded tsgo's bind +
  // typecheck + emit pass on the current source overlay. Bench
  // orchestrators record this alongside scanFiles latency to show the
  // pure-TypeScript compile cost next to mion' own work.
  tsCompileMs?: number;
  // Per-op performance block; present only when the request set
  // includeMetrics.
  metrics?: Metrics;
  error?: string;
}

// Severity classifies a Diagnostic's impact. Numeric on the wire to
// match the Go-side encoding; mirror the `as const` literal-union enum
// shape so consumers can `switch (d.severity)` against the named values.
export const Severity = {
  Error: 1,
  Warning: 2,
  Info: 3,
} as const;
export type Severity = (typeof Severity)[keyof typeof Severity];

// Family classifies a Diagnostic by which subsystem produced it. Same
// numeric-on-the-wire scheme as Severity. Enrich covers the opt-in
// enrichment-health pass (Request.checkEnrich): tag hygiene, FriendlyText /
// MockData content validity, and mirror breadcrumb drift.
export const Family = {
  PureFn: 1,
  Marker: 2,
  RunType: 3,
  Enrich: 4,
} as const;
export type Family = (typeof Family)[keyof typeof Family];

// DiagnosticSite is a 1-based source location. `endLine` / `endCol` are
// optional — runtype-family diagnostics (where the site is the marker
// call rather than a type declaration) leave them zero.
export interface DiagnosticSite {
  filePath: string;
  startLine: number;
  startCol: number;
  endLine?: number;
  endCol?: number;
}

export interface DiagnosticRelated extends DiagnosticSite {
  message: string;
}

// EnrichFile mirrors the Go-side protocol.EnrichFile — one computed enrichment
// mirror file from the `enrich` op: its absolute path, the desired content (the
// daemon never writes; the caller writes it), whether it is newly added (no prior
// on-disk file), and its family kind ('friendly' | 'mock').
export interface EnrichFile {
  path: string;
  content: string;
  added?: boolean;
  kind?: string;
}

// Diagnostic mirrors the Go-side diag.Diagnostic. The Family
// discriminator tells the consumer which subsystem produced it (purefn
// extractor, marker scanner, runtype RT compiler); the Code is the
// stable identifier (PFE9004, CTA001, PFN001, VL010, SJ001, …) and Severity
// classifies impact.
//
// The user-facing message is NOT carried on the wire. Per-code message
// templates live in the GENERATED dictionary `./diagnosticCatalog.generated.ts`
// (emitted from internal/diagnostics/messages.go via `pnpm run gen:diag-catalog`)
// and resolve at format time against `args` — typically 0–2 positional
// substitution values (a property name, a kind label, etc.). The Vite
// plugin renders the final tsc-style line by looking up Code+Args in the
// catalog.
export interface Diagnostic {
  code: string;
  family: Family;
  severity: Severity;
  args?: string[];
  site: DiagnosticSite;
  related?: DiagnosticRelated[];
}

export interface Dump {
  runTypes: RunType[];
  sites: Site[];
}
