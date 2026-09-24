// Wire types mirroring Go's internal/reflection/runtype.go and internal/protocol/protocol.go.
// The interfaces are hand-maintained to keep the plugin dep-free; the ReflectionKind enum,
// KIND_REF sentinel and REFLECTION_SUB_KIND map are generated from the same Go source, so the
// kind/sub-kind discriminators cannot drift. Child RunType slots on the wire are sentinels
// (`{kind: -1, id: N}`); consumers re-knot them, or import the generated cache module whose
// graph is already knotted.

// Generated from internal/reflection/{runtype,subkind}.go, the same source as @mionjs/run-types's
// RunTypeKind / RunTypeSubKind; re-exported here so `import {ReflectionKind} from './protocol.ts'` sites are unchanged.
import {KIND_REF, ReflectionKind, REFLECTION_SUB_KIND, type ReflectionSubKind} from './go-generated/reflectionKind.generated.ts';
export {KIND_REF, ReflectionKind, REFLECTION_SUB_KIND, type ReflectionSubKind};

// Cache-module settings generated from internal/constants/constants.go, the single source of
// truth; regenerate with `pnpm miondevx core codegen constants`.
export {
  CACHE_MODULES,
  RUNTYPES_VAR_PREFIX,
  RUNTYPES_MODULE_NAME,
  VALIDATE_VAR_PREFIX,
  VALIDATE_MODULE_NAME,
  type CacheModuleSettings,
} from './go-generated/runtypes-constants.generated.ts';

export interface ClassRef {
  // "Date" | "Map" | "Set" | "RegExp"; the footer wires `t.classType = globalThis.<builtin>`.
  builtin?: string;
  // user-class export name + originating module path (v2 lazy import).
  name?: string;
  module?: string;
}

// RunType is a JSON-friendly union of every reflection variant; optional fields follow the `kind` discriminator.
// `id` is a short alphanumeric structural hash (default 7 chars), so two structurally-equal types share one id.
export interface RunType {
  id?: string;
  kind: ReflectionKind | typeof KIND_REF;
  subKind?: number;

  // TypeAnnotations
  typeName?: string;
  typeArguments?: RunType[];
  isCircular?: boolean;
  // True for the non-data kinds validators and serializers ignore: function / method / call-signature /
  // symbol / never / non-serialisable class. The node stays in the tree; only it is flagged, never its children.
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
  // Property / method nodes only: `name` is a valid identifier or all digits, so dot access works.
  // Missing means bracket notation is required.
  isSafeName?: true;
  // Parameter / tupleMember nodes only: 0-based slot index, a number rather than a flag because zero is a valid slot.
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

  // Union only: the same refs as `children`, reordered so supersets precede subsets and no member is unreachable at validate time.
  safeUnionChildren?: RunType[];

  // Union only, parallel to `safeUnionChildren`: entry i refs the discriminator property of member i,
  // null for a non-object member. Read entry.name for the key and entry.child for the expected type.
  // Absent when no usable discriminator was found. Lives on the union, not the property node: the same
  // canonical property may discriminate one parent union and not another.
  unionDiscriminators?: (RunType | null | undefined)[];

  // The OPEN extension point: objectLiteral refs left by collapsing an intersection like `string & {__brand}`.
  // The engine never interprets them (formatAnnotation below is the CLOSED counterpart); mirrors deepkit's TypeAnnotations.decorators.
  typeMeta?: RunType[];

  // Set when a primitive is branded with a TypeFormat<Base, Name, Params, ...> marker from `@mionjs/run-types/formats`.
  // The structural id folds name + canonicalised params in, so key order never splits one entry into two.
  // Recognition rides the unforgeable unique-symbol sentinels, so a hand-written typeMeta object can never trigger it.
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

  // objectLiteral (interface form): refs to the directly extended interfaces, empty for anonymous literals and `type` aliases.
  // Inherited properties are ALSO in `children`, so the runtime path stays flat while codegen can walk the inheritance tree.
  extends?: RunType[];

  // Runtime-only live constructor (globalThis.Date for a KindClass builtin), wired by the cache emitter; never in wire JSON.
  classType?: unknown;
}

// Site is one injection point: `pos` is the byte offset of the call's closing `)`, where the patcher inserts.
// `paramIndex` is the 0-based slot the injected id takes; when `argsCount` falls short of it the patcher pads with `undefined`.
export interface Site {
  file: string;
  pos: number;
  id: string;
  paramIndex?: number;
  argsCount?: number;
  // The opaque fn hash an InjectTypeFnArgs site injects, never the family name the marker spells.
  // Present means the patcher injects a `[id, fnId]` tuple, not the bare `"id"`; absent means a reflection-only site.
  fnId?: string;
  // Every fnId a multi-function InjectTypeFnArgs<T, F1, F2, …> site injects, e.g. createStandardSchema's <T,'val','verr'>:
  // an ARRAY of entry-tuple bindings at the single paramIndex, in this order. fnId mirrors fnIds[0] when both are set.
  fnIds?: string[];
  // Go-internal emit metadata, mirrored for accuracy; the plugin does not read it.
  demand?: SiteDemand[];
  // True when the argument list was already written with a trailing comma, so the injector splices WITHOUT a leading one.
  // Otherwise the two commas produce an empty argument `f(a, , …)`, which is invalid JS.
  trailingComma?: boolean;
  // allSingle mode: the bundle-module BASENAME to import the binding from (`rtmod:/<module>.js`) instead of the entry's
  // own module; the clause shape is identical either way. Mirrors modules[0] when both are set.
  module?: string;
  // One bundle basename per fnId, positional with fnIds: allSingle gives each family its own bundle, so a single
  // `module` cannot address a multi-fn site. Present only for multi-fn allSingle sites.
  modules?: string[];
}

// SiteDemand mirrors Go protocol.SiteDemand: emit metadata only, the plugin never reads it.
export interface SiteDemand {
  family: string;
  variant?: string;
  options?: string[];
  fnHash?: string;
}

// Replacement replaces [start, end) with text: the pure-fn extractor swaps every
// `registerPureFnFactory(ns, fn, factory)` factory argument for the entry-module import binding,
// so the canonical fn body lives only in the emitted entry module.
export interface Replacement {
  file: string;
  start: number;
  end: number;
  text: string;
  // The virtual-module specifier the substituted expression needs (`rtmod:/pf/rt/foo.js`);
  // `text` IS its export name, so the rewrite imports `{<text>}` directly.
  importFrom?: string;
  // The export name to import when `text` is not it (a trailing-slot splice padded with `undefined`,
  // the bundled-API lane). Absent means `text` is the binding.
  importBinding?: string;
}

// PureFnSite mirrors Go protocol.PureFnSite: one generated pure-fn entry, delivered through the
// `onPureFnReport` callback or `<genDir>/types/pure-fns-report.json`, only when the report is enabled.
// Each record is SELF-CONTAINED (`code` + `paramNames` inline), so a consumer never reads a generated
// module file and the shape holds across every `moduleMode`.
export interface PureFnSite {
  // The registrar call site's factory-argument span (byte offsets).
  file: string;
  start: number;
  end: number;
  // The pure fn's id: the package that owns it and a hash of the body that
  // ships (`@acme/text#pf_9Zt1bRm4cVaPqL`).
  key: string;
  // The identifier the registration was assigned to, absent when written straight into a call.
  // Not part of the id; carried because a report of hashes names nothing a reader can search for.
  bindingName?: string;
  // The identifier the site invoked (a registrar, a wrapper like `inputFrom`, a renamed import) and the
  // nearest-package.json / ambient-module name of the file that DECLARES it, so a consumer can attribute
  // a site to the framework that exposed the registrar even through a wrapper-only file.
  calleeName?: string;
  calleeModule?: string;
  // `direct` (arg IS the pure fn, wrapped) | `factory` (arg is a factory).
  form?: string;
  // Generated module basename: per-entry `pf/<id>` in default/allModules mode, the single `pf` bundle in allSingle.
  module?: string;
  // Entry payload — emitMode-honoring (`code` empty when the mode ships no body).
  paramNames?: string[];
  code?: string;
  pureFnDependencies?: string[];
}

// BatchMapping mirrors Go protocol.BatchMapping: one `inputFrom(source, mapper)` link inside a request batch.
// The server feeds route `fromId`'s output through the mapper `mapperKey` into argument `paramIndex` of route `toId`.
export interface BatchMapping {
  fromId: string;
  toId: string;
  paramIndex: number;
  // The mapper's pure-fn id, the same one injected at that call.
  mapperKey: string;
}

// BatchSite mirrors Go protocol.BatchSite: one `batch([...])` call site, so the server build registers
// the plan under the same id the client bundle carries. Delivered through `onBatchReport` or
// `<genDir>/types/batches-report.json`, only when the build report is enabled; the id is injected regardless.
export interface BatchSite {
  // The `batch(...)` call expression's span (byte offsets).
  file: string;
  start: number;
  end: number;
  // The injected id: `b_<hash>` of the ordered route ids.
  batchId: string;
  // The batched routes in call order (`users/getById`).
  routeIds: string[];
  // The `inputFrom()` links, sorted by (toId, paramIndex).
  mappings?: BatchMapping[];
  // The identifier the site invoked (`batch`, or a framework wrapper) and the
  // package that declares it.
  calleeName?: string;
  calleeModule?: string;
}

// TransformResult mirrors Go protocol.TransformResult, one per file, in the wire shape Request.emitEdits selects:
//   - 'go' mode (unset): `code` + `map`, which the plugin plumbs straight to the bundler.
//   - 'edits' mode (set): `importBlock` + `edits` + `sourceHash` for apply-edits.ts, O(sites) instead of file + map.
export interface TransformResult {
  code?: string;
  map?: SourceMap;
  // 'edits' mode: the deduped import block prepended at offset 0, one physical line, relativized to
  // <outDir>/types in files mode. Absent when the file needs no injected imports.
  importBlock?: string;
  // 'edits' mode: the flat point/span edit list, NOT the import block, in UTF-16 code-unit offsets
  // against the ORIGINAL source (the FE indexes JS strings natively).
  edits?: Edit[];
  // 'edits' mode: FNV-1a/32 hash of the source bytes the offsets index.
  // On mismatch the applier re-uploads the source (setSources) and re-requests, rather than misplacing every offset.
  sourceHash?: string;
  emittedModules?: string[];
  // The source files that DECLARE the types this file's call sites reflect: edges no bundler can see, since
  // `import type` is erased and an ambient `.d.ts` type never had one. A host declares these to its bundler
  // (`addWatchFile` / `addDependency`) so editing a type re-runs the files that reflect it. Absolute, sorted, deduped.
  // EMPTY MEANS UNKNOWN, NOT 'no dependencies': read as "nothing to declare" it ships a stale validator,
  // silently, since a stale validator does not error, it accepts data the current type rejects.
  // Fall back to coarse invalidation instead.
  typeDeps?: string[];
}

// Edit mirrors Go protocol.Edit: a point insertion (start === end) or span replacement (start < end),
// in UTF-16 CODE-UNIT offsets against the original source. 'edits'-mode transform only.
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

// FormatAnnotation mirrors Go protocol.FormatAnnotation: the (name, params) pair from a TypeFormat<> brand.
// Params is sorted and canonicalised before it feeds the cache key, so two orderings of one params object share an ID.
export interface FormatAnnotation {
  name: string;
  params?: Record<string, unknown>;
}

export interface Request {
  op: 'scanFiles' | 'dump' | 'setSources' | 'reset' | 'tsCompile' | 'transform' | 'generate' | 'enrich';
  // The op's file input: the files to scan (scanFiles), rewrite (transform) or enrichment-check (enrich).
  // The response's sites cover every listed file, each tagged with .file; the include* flags project
  // runTypes / entryModules over these files only, never the session-wide cache (use dump for that).
  files?: string[];
  // setSources only — { relpath: source-text }.
  sources?: Record<string, string>;
  // scanFiles only: the response includes a runTypes slice covering the request's files.
  includeRunTypes?: boolean;
  // scanFiles only: the response carries the per-entry virtual module map scoped to the request's files.
  // `dump` always carries the full session's modules.
  includeEntryModules?: boolean;
  // Opts into the `metrics` block: tsgo extendedDiagnostics counters, per-phase wall times, Go memory deltas.
  // Mirrors the Go-side Request.IncludeMetrics; zero measurement cost when unset.
  includeMetrics?: boolean;
  // generate / transform: the resolved RunTypes output root (e.g. <srcDir>/.mion). `generate` writes modules
  // under <outDir>/types/, `transform` injects imports relative to it. Empty keeps virtual specifiers.
  outDir?: string;
  // scanFiles only: the enrichment-health pass (tag hygiene, FriendlyText/MockData content, breadcrumb drift),
  // appended to diagnostics as Family.Enrich. Off by default so the rewrite pipeline pays nothing; the lint plugin consumes it.
  checkEnrich?: boolean;
  // scanFiles only: the mion route rules (handler annotations, a throw escaping a handler, a declared error that is
  // not an RpcError, a property named after a prototype slot), appended as Family.MionRoute. Off by default, because
  // every one is an error-severity code and a build running them would fail on a finding the team may have turned off in lint.
  checkRouterRules?: boolean;
  // scanFiles only: the RunType-family diagnostics WITHOUT the entry-module payload. Implied by includeEntryModules;
  // the lint plugin sets it so one scan surfaces everything a build would.
  includeRtDiagnostics?: boolean;
  // transform only: 'edits' mode instead of 'go' mode. A per-request wire knob, because the artifacts are identical
  // either way, so it never affects the disk cache.
  emitEdits?: boolean;
  // enrich carries NOTHING beyond `files` (empty = whole program): the families, i18n locales and output root ride
  // the spawn flags (--gen-dir / --enrich-*), defaulting from the tsconfig plugin entry.
}

// Metrics mirrors Go protocol.Metrics, present only when the request set includeMetrics.
// The counters mirror tsc's `--extendedDiagnostics`, read off the live tsgo Program post-op;
// the *Ms group is wall time per pipeline phase and renderMs is keyed by cache kind.
// allocBytes / mallocs / numGC are deltas over the op; heapAlloc / heapInuse are post-op snapshots.
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
  // Acknowledgement for ops that return no data (setSources / reset).
  ok?: true;
  added?: RunType[];
  // "Did this scan change anything?" signals: addedRunTypes when the scan interned new RunTypes, addedPureFns
  // for any new pure-fn entry (an edited body arrives as a new id). Either one regenerates the cache modules.
  addedRunTypes?: boolean;
  addedPureFns?: boolean;
  sites?: Site[];
  // The byte-range rewrites the Go transform applies alongside Sites during OpTransform: one per accepted
  // `registerPureFnFactory(ns, fn, factory)` call, swapping the factory argument for the entry-module import binding.
  replacements?: Replacement[];
  // The pure-fn build report: whole program on `generate`, the rescanned files' delta on `scanFiles`,
  // populated only when the resolver's pure-fn report is enabled.
  pureFnSites?: PureFnSite[];
  // generate only: the package's `mion-pure-fns/` as path to content, for the adapter to sync into the
  // bundler's output dir once the bundle is on disk. Empty when the package registers none, so a stale one is removed.
  pureFnArtifact?: Record<string, string>;
  // The request-batch build report: whole program on `generate`, the rescanned files' delta on `scanFiles`,
  // populated only when the resolver's build report is enabled.
  batchSites?: BatchSite[];
  runTypes?: RunType[];
  // One rendered ES module per cache entry, keyed by the basename in `rtmod:/<basename>.js` (the `pf/<ns>/<fn>`
  // encoding for pure fns). The in-memory variant, returned by `dump` and by `scanFiles` under includeEntryModules;
  // in files-mode `generate` writes the same modules under `<outDir>/types/` instead.
  entryModules?: Record<string, string>;
  // Manifest of live module basenames the `generate` op wrote under <outDir>/types.
  generated?: string[];
  // Sorted unique source files carrying at least one marker site, from the `generate` op, as program paths.
  // The plugin gates its per-file transform on this set, so wrapper call sites in another package
  // (node_modules included) rewrite with zero configuration.
  siteFiles?: string[];
  // enrich only: the computed mirror files (path + content + added + kind).
  // The daemon never writes; the caller writes them under its own HMR-suppression window.
  enrichFiles?: EnrichFile[];
  // The output root `generate` actually wrote to: with outDir left empty the resolver infers <srcDir>/.mion
  // from the tsconfig and echoes the absolute path here, so the plugin can adopt it.
  outDir?: string;
  // The batch transport, `generate` only. `batchesModule` is the absolute `<outDir>/rpc/batches.generated.js`,
  // absent unless the batch source program holds a batch and this program creates the router.
  // `batchSourceFiles` are the SEPARATE (`clientTsconfig`) batch source program's files carrying a batch or an
  // inline mapper, for the dev host to watch; `routerInitFiles` are the createMionRouter files the transform
  // appends the table import to.
  batchesModule?: string;
  batchSourceFiles?: string[];
  // the separate batch source's source root(s): a file CREATED there must
  // trigger a regenerate too
  batchSourceRoots?: string[];
  routerInitFiles?: string[];
  // Echo of the tsconfig plugin's downgradeErrors on `generate`, absent when the tsconfig sets none, so a
  // dependency-free host can honor a tsconfig-only setting: the plugin's own option wins, then this echo,
  // then nothing downgraded. Either a list of codes or the single wildcard entry '*'.
  downgradeErrors?: string[];
  // One TransformResult per file for the `transform` op, keyed by file path.
  transformed?: Record<string, TransformResult>;
  // Every non-fatal diagnostic the Go binary emits: pure-fn extractor (PFE9xxx), marker scanner (MKRxxx),
  // RT compiler (IT/TE/PJ/…/FB); the Family discriminator says which subsystem produced it.
  // The Vite plugin re-emits each via `this.warn(formatTscDiagnostic(d))` for VS Code's $tsc problem matcher;
  // the build never fails on these.
  diagnostics?: Diagnostic[];
  // tsCompile only: wall-time (ms) of the embedded tsgo's bind + typecheck + emit pass on the current source
  // overlay, so a bench can show the pure-TypeScript compile cost next to mion's own work.
  tsCompileMs?: number;
  // Present only when the request set includeMetrics.
  metrics?: Metrics;
  error?: string;
}

// Level answers: did the build produce the code for this thing (Error: no), and is what it produced broken
// when called (RuntimeError: yes). Anything deciding whether a finding may be downgraded or silenced reads
// THIS, never severity. It rides the wire rather than the generated catalog because a locally built binary
// can run ahead of that catalog, and a build-halt decision must not depend on the two being in sync.
export const Level = {
  Error: 1,
  RuntimeError: 2,
  Warning: 3,
} as const;
export type Level = (typeof Level)[keyof typeof Level];

// Severity is the LABEL form of Level: the word the tsc-shaped output line and VS Code's problem matcher
// need, so both error levels read as "error" here. Numeric on the wire to match the Go-side encoding; the
// `as const` literal-union shape lets consumers `switch (d.severity)` against the named values.
export const Severity = {
  Error: 1,
  Warning: 2,
  Info: 3,
} as const;
export type Severity = (typeof Severity)[keyof typeof Severity];

// Family classifies a Diagnostic by the subsystem that produced it, numeric on the wire like Severity.
// Enrich covers the opt-in enrichment-health pass (Request.checkEnrich): tag hygiene, FriendlyText / MockData
// content validity, mirror breadcrumb drift. MionRoute covers the opt-in route rules (Request.checkRouterRules).
export const Family = {
  PureFn: 1,
  Marker: 2,
  RunType: 3,
  Enrich: 4,
  MionRoute: 5,
} as const;
export type Family = (typeof Family)[keyof typeof Family];

// DiagnosticSite is a 1-based source location; runtype-family diagnostics leave `endLine` / `endCol` zero,
// their site being the marker call rather than a type declaration.
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

// EnrichFile mirrors Go protocol.EnrichFile: one computed mirror file from the `enrich` op, with the content
// the caller writes (the daemon never does), `added` when no on-disk file existed, `kind` 'friendly' | 'mock'.
export interface EnrichFile {
  path: string;
  content: string;
  added?: boolean;
  kind?: string;
}

// Diagnostic mirrors the Go-side diag.Diagnostic; `code` is the stable identifier (PFE9004, CTA001, VL010, …).
// The user-facing message is NOT carried on the wire: per-code templates live in the generated
// `./go-generated/diagnosticCatalog.generated.ts` (from internal/diagnostics/messages.go via
// `pnpm miondevx core codegen diag`) and resolve at format time against `args`, 0-2 positional values.
export interface Diagnostic {
  code: string;
  family: Family;
  severity: Severity;
  level: Level;
  args?: string[];
  site: DiagnosticSite;
  related?: DiagnosticRelated[];
  // Set when a source-level `@mion-downgrade-error` comment claimed this finding; level and severity stay
  // whatever the catalog says, so whoever decides to halt reads this alongside its own `downgradeErrors`.
  // Twin of the Go-side Diagnostic.Downgraded.
  downgraded?: boolean;
}

export interface Dump {
  runTypes: RunType[];
  sites: Site[];
}
