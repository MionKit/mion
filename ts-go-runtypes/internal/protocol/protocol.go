// Package protocol defines the wire envelope between the mion resolver and its callers: the
// op constants, Request/Response, scan Sites and their demand, transform results and the Dump
// manifest. The payload is internal/reflection's RunType model, whose child slots ride the JSON
// wire as ref sentinels (`{kind: -1, id: "<hash>"}`, reflection.KindRef / reflection.NewRef).
package protocol

import (
	"encoding/json"
	"io"

	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

func jsonMarshal(v any) ([]byte, error) { return json.Marshal(v) }

// Op string values are the wire contract; the TS side spells the same ones.
const (
	// OpScanFiles returns one Site per call whose signature opts into injection (a trailing
	// `InjectRunTypeId<T>` parameter with a concretely-bound T). IncludeRunTypes scopes its
	// projection to Request.Files, never the session-wide cache; OpDump returns that.
	OpScanFiles = "scanFiles"
	// OpDump returns the full cache: every RunType projected so far plus every Site recorded. Used at end-of-build.
	OpDump = "dump"
	// OpSetSources replaces the in-memory source overlay and rebuilds the Program against it.
	// Sites are reset (their byte offsets index the previous text); the structural type cache survives until OpReset.
	OpSetSources = "setSources"
	// OpReset wipes ALL resolver state (cache, sites, Program, checker, overlay) with the connection left open.
	// A setSources must follow before scanFiles works.
	OpReset = "reset"
	// OpTsCompile times the embedded tsgo's bind + typecheck + emit over the current overlay into
	// Response.TsCompileMs and discards the emit. No marker walk, no cache modules: the pure-TypeScript
	// baseline the bench orchestrators show next to scanFiles latency. Seed sources via OpSetSources first.
	OpTsCompile = "tsCompile"
	// OpTransform scans each requested file, applies the call-site rewrites, pure-fn replacements and deduped
	// import block, and returns one TransformResult per file in Response.Transformed, so a caller skips the
	// JS-side rewrite. Source text comes from the overlay (the bytes the offsets index): seed it via OpSetSources.
	OpTransform = "transform"
	// OpGenerate writes each entry module to <outDir>/types/<basename>.js instead of returning it on the wire,
	// write-on-change and pruning stale files. The root is session config (Options.GenDir > tsconfig genDir >
	// inferred <srcDir>/.mion) and echoes on Response.OutDir; Response.Generated lists the live basenames.
	// OpTransform injects relative imports to these real files when the session sets Options.TransformRelative.
	OpGenerate = "generate"
	// OpEnrich is the daemon face of the CLI `enrich` verb, so a plugin drives the scaffold + sync pass over the
	// warm connection instead of spawning. It returns the mirror CONTENT (Response.EnrichFiles) and NEVER writes.
	// Shares enrichgen.Plan + mirror.Scaffold/Reconcile with the CLI verb, so both produce byte-identical mirrors.
	OpEnrich = "enrich"
)

// Request is the union of all query operations (see resolver/dispatch).
//
// THE WIRE CARRIES EVENTS; THE SESSION CARRIES CONFIG. Every field is one of exactly three kinds:
//
//   - EVENTS — what is being asked: Op, Files, Sources.
//   - PAYLOAD SELECTORS — how much of THIS request's answer to ship back:
//     IncludeRunTypes, IncludeEntryModules, IncludeMetrics.
//   - LANE SELECTORS — which walker/emit mode THIS request runs:
//     CheckEnrich, CheckRouterRules, IncludeRtDiagnostics, EmitEdits.
//
// Anything session-constant belongs in resolver.Options instead, loaded once from a `serve` flag at
// spawn (respawn-safe for free, since the client replays the same argv).
//
// Files is the op's file input: every file to scan (scanFiles), rewrite (transform) or
// enrichment-check (enrich). Response.Sites carries entries for every listed file (each tagged with
// .File), and IncludeRunTypes / IncludeEntryModules scope their payload to THIS request's Files
// only, never a session-wide accumulation; OpDump returns the whole in-memory cache.
type Request struct {
	Op              string            `json:"op"`
	Files           []string          `json:"files,omitempty"`
	Sources         map[string]string `json:"sources,omitempty"`
	IncludeRunTypes bool              `json:"includeRunTypes,omitempty"`
	// IncludeEntryModules opts a scanFiles response into Response.EntryModules, scoped to this
	// request's Files; OpDump always carries the full session's modules.
	IncludeEntryModules bool `json:"includeEntryModules,omitempty"`
	// IncludeMetrics opts the response into the Metrics block; unset costs nothing, the dispatcher
	// skips every ReadMemStats and stopwatch.
	IncludeMetrics bool `json:"includeMetrics,omitempty"`
	// CheckEnrich adds the enrichment-health pass over this request's Files (tag hygiene,
	// FriendlyText/MockData content validity, breadcrumb drift) to Response.Diagnostics as FamilyEnrich
	// entries. Off by default so the rewrite pipeline pays nothing; the devtools lint plugin is the consumer.
	CheckEnrich bool `json:"checkEnrich,omitempty"`
	// CheckRouterRules adds the mion route rules over this request's Files (missing handler annotations, a
	// throw escaping a handler, a declared error that is not an RpcError, a property named after a prototype
	// slot) to Response.Diagnostics as FamilyMionRoute entries. Off by default, and the devtools lint plugin
	// is the only consumer: every code is Severity-Error, so a build running them would fail on a finding the
	// team may have disabled in its lint config.
	CheckRouterRules bool `json:"checkRouterRules,omitempty"`
	// IncludeRtDiagnostics renders the demanded entries for their RunType-family diagnostics (VL010, PJ001, …)
	// but drops the module payload, so one lint scan returns the full picture a build would report.
	// Implied by IncludeEntryModules.
	IncludeRtDiagnostics bool `json:"includeRtDiagnostics,omitempty"`
	// EmitEdits switches OpTransform from 'go' mode (rewritten Code + Map) to 'edits' mode: ImportBlock +
	// Edits + SourceHash per file for the FE to apply, Code/Map empty. It changes only the wire shape, never
	// the artifacts, so it must never fold into any disk-cache fingerprint. Ignored by every other op.
	EmitEdits bool `json:"emitEdits,omitempty"`
	// OpEnrich carries NO fields beyond Files (which files changed; empty = whole program): families, i18n
	// locales and the output root all ride resolver.Options, loaded once at spawn from the serve --gen-dir /
	// --enrich-* flags. The daemon owns the demanded type name → source file mapping the caller cannot do itself.
}

// Metrics is the per-op performance block, populated only when Request.IncludeMetrics is set. The
// tsc `--extendedDiagnostics` counters are post-op ABSOLUTES read off the tsgo Program: it checks
// lazily, so they cover all checker work forced so far in this Program's lifetime. The Ms fields are
// wall time per phase of THIS op. Alloc*/Mallocs/NumGC are deltas over the op (churn),
// HeapAlloc/HeapInuse post-op snapshots (retention).
type Metrics struct {
	Files          int `json:"files,omitempty"`
	Lines          int `json:"lines,omitempty"`
	Identifiers    int `json:"identifiers,omitempty"`
	Symbols        int `json:"symbols,omitempty"`
	Types          int `json:"types,omitempty"`
	Instantiations int `json:"instantiations,omitempty"`

	SetSourcesMs float64 `json:"setSourcesMs,omitempty"`
	MarkerScanMs float64 `json:"markerScanMs,omitempty"`
	PureFnsMs    float64 `json:"pureFnsMs,omitempty"`
	// PrepMs is the per-dispatch response prep: added-flag passes, provenance line/col conversion, ref-table build.
	PrepMs       float64            `json:"prepMs,omitempty"`
	ScopedDumpMs float64            `json:"scopedDumpMs,omitempty"`
	RenderMs     map[string]float64 `json:"renderMs,omitempty"`
	TotalMs      float64            `json:"totalMs,omitempty"`

	AllocBytes uint64 `json:"allocBytes,omitempty"`
	Mallocs    uint64 `json:"mallocs,omitempty"`
	NumGC      uint32 `json:"numGC,omitempty"`
	HeapAlloc  uint64 `json:"heapAlloc,omitempty"`
	HeapInuse  uint64 `json:"heapInuse,omitempty"`

	CacheNodes int `json:"cacheNodes,omitempty"`
}

// Response is returned per request. ID is the hash key into the shared dedup table and rides only
// when HasID is set (MarshalJSON below), so a consumer tells "no id" from an empty string. OK
// acknowledges the ops that return no data (setSources / reset).
type Response struct {
	ID    string                `json:"-"`
	HasID bool                  `json:"-"`
	OK    bool                  `json:"-"`
	Added []*reflection.RunType `json:"added,omitempty"`
	// AddedRunTypes is true when this scanFiles interned at least one new RunType; handleHotUpdate reads it to
	// decide whether the runTypes cache module needs invalidating after a user-file change.
	AddedRunTypes bool `json:"addedRunTypes,omitempty"`
	// AddedValidate is true when a newly-interned RunType renders a validate entry. Set per emitter, independently
	// of AddedRunTypes, so cache-by-cache invalidation stays surgical.
	AddedValidate bool `json:"addedValidate,omitempty"`
	// AddedValidationErrors mirrors AddedValidate for the ValidationErrors emitter.
	AddedValidationErrors bool `json:"addedValidationErrors,omitempty"`
	// AddedPrepareForJson / AddedRestoreFromJson mirror AddedValidate for the JSON serializer pair.
	AddedPrepareForJson  bool `json:"addedPrepareForJson,omitempty"`
	AddedRestoreFromJson bool `json:"addedRestoreFromJson,omitempty"`
	// AddedStringifyJson mirrors AddedPrepareForJson for stringifyJson, the single-pass JSON.stringify that walks
	// the type rather than `v`.
	AddedStringifyJson bool `json:"addedStringifyJson,omitempty"`
	// AddedPrepareForJsonClone mirrors AddedPrepareForJson for the safe-encode family: the non-mutating sibling
	// that strips undeclared properties into a new value, decoded by RestoreFromJson (identical wire format).
	AddedPrepareForJsonClone bool `json:"addedPrepareForJsonClone,omitempty"`
	// AddedHasUnknownKeys / AddedUnknownKeyErrors / AddedCloneExactShape mirror AddedValidate for the
	// unknown-keys family.
	AddedHasUnknownKeys   bool `json:"addedHasUnknownKeys,omitempty"`
	AddedUnknownKeyErrors bool `json:"addedUnknownKeyErrors,omitempty"`
	AddedCloneExactShape  bool `json:"addedCloneExactShape,omitempty"`
	// AddedStripUnknownKeysWire — the decoder-internal ukuWire family (the `strip` decode strategy's pre-pass).
	AddedStripUnknownKeysWire bool `json:"addedStripUnknownKeysWire,omitempty"`
	// AddedToBinary / AddedFromBinary mirror AddedPrepareForJson for the binary serializer pair.
	AddedToBinary   bool `json:"addedToBinary,omitempty"`
	AddedFromBinary bool `json:"addedFromBinary,omitempty"`
	// AddedFormatTransform mirrors AddedValidate for the `format` transform emitter: a newly-interned RunType
	// carrying a value-transforming format (string transform, domain/ip/url lowercasing).
	AddedFormatTransform bool `json:"addedFormatTransform,omitempty"`
	// AddedPureFns is true when the scan introduced or modified a pure-fn entry, checked against the resolver's
	// session-wide bodyHash index.
	AddedPureFns bool          `json:"addedPureFns,omitempty"`
	Sites        []Site        `json:"sites,omitempty"`
	Replacements []Replacement `json:"replacements,omitempty"`
	// PureFnSites is the pure-fn build report, one record per generated entry: whole program on OpGenerate, the
	// rescanned files' delta on OpScanFiles, and empty unless the resolver's pure-fn report is enabled.
	PureFnSites []PureFnSite `json:"pureFnSites,omitempty"`
	// PureFnArtifact (generate only) is the package's `mion-pure-fns/` as path to content, for the caller to
	// sync into the bundler's output dir once the bundle is on disk; empty means remove a stale one.
	PureFnArtifact map[string]string `json:"pureFnArtifact,omitempty"`
	// BatchSites is the request-batch build report, one record per `batch([...])` call site: whole program on
	// OpGenerate, the rescanned files' delta on OpScanFiles, and empty unless the build report is enabled.
	BatchSites []BatchSite           `json:"batchSites,omitempty"`
	RunTypes   []*reflection.RunType `json:"runTypes,omitempty"`
	// EntryModules is one rendered ES-module source per cache entry, keyed by module BASENAME (the `<basename>`
	// of `rtmod:/<basename>.js`: the cache key for runtype / type-fn entries, `pf/<ns>/<fn>` for pure fns).
	// Populated on OpDump (full session) and on OpScanFiles under IncludeEntryModules (the request's Files).
	EntryModules map[string]string `json:"entryModules,omitempty"`
	// Generated is the manifest of live module basenames OpGenerate wrote under <OutDir>/types.
	Generated []string `json:"generated,omitempty"`
	// SiteFiles is OpGenerate's sorted unique list of program paths carrying at least one marker site. A plugin
	// gates its per-file transform on this set, so call sites of wrappers declared in OTHER packages (node_modules
	// included) rewrite with zero configuration. Emitted via the hand-rolled MarshalJSON below (the struct tag
	// alone doesn't put it on the wire).
	SiteFiles []string `json:"siteFiles,omitempty"`
	// EnrichFiles is OpEnrich's computed mirror files; the daemon never writes, the caller writes them under its
	// own HMR-suppression window. Emitted via the hand-rolled MarshalJSON below (the struct tag alone doesn't).
	EnrichFiles []EnrichFile `json:"enrichFiles,omitempty"`
	// OutDir echoes the session-resolved output root OpGenerate wrote to (Options.GenDir > tsconfig genDir >
	// inferred). With neither override the resolver infers <srcDir>/.mion from the tsconfig (rootDir >
	// common-ancestor of the program's files > baseUrl > cwd), which the dependency-free plugin cannot compute
	// yet needs, to write .gitignore/.gitkeep and to suppress HMR under the enriched dir. With DowngradeErrors
	// this is the sanctioned resolved-config server→client echo channel.
	OutDir string `json:"outDir,omitempty"`
	// BatchesModule is the absolute path of `<OutDir>/rpc/batches.generated.js` when OpGenerate wrote one, empty
	// otherwise. The host uses it to know the module appeared or vanished; it never parses the file.
	BatchesModule string `json:"batchesModule,omitempty"`
	// BatchSourceFiles lists the files the batch table was read from when the batch source is a SEPARATE program
	// (Options.ClientTsconfig). A dev host watches them, since they sit outside its own program; empty when the
	// batch source is the session's own program, already watched.
	BatchSourceFiles []string `json:"batchSourceFiles,omitempty"`
	// BatchSourceRoots is the separate batch source program's source root(s), so a dev host also watches for
	// files CREATED there and not only for edits to the ones it knows.
	BatchSourceRoots []string `json:"batchSourceRoots,omitempty"`
	// RouterInitFiles lists the program files calling `createMionRouter`, the modules the transform appends the
	// batch import to. A dev host re-transforms them when BatchesModule first appears after they loaded without it.
	RouterInitFiles []string `json:"routerInitFiles,omitempty"`
	// DowngradeErrors echoes the tsconfig plugin's downgradeErrors on OpGenerate (nil when the tsconfig sets none)
	// so a dependency-free host can honor a tsconfig-only setting; the host's own option wins, then this echo,
	// then nothing downgraded. Either a list of codes or the single wildcard entry "*". Emitted via MarshalJSON.
	DowngradeErrors []string `json:"downgradeErrors,omitempty"`
	// Transformed carries one TransformResult per file for OpTransform, keyed by file path, scoped to the
	// request's Files.
	Transformed map[string]TransformResult `json:"transformed,omitempty"`
	// Diagnostics is the one wire channel for every non-fatal diagnostic the binary emits: the Family
	// discriminator names the subsystem, Code is the stable identifier, Severity classifies impact. A host
	// re-emits each via `diagnostics.FormatTsc(d)` so VS Code's $tsc problem matcher picks them up. The schema
	// mirrors the LSP Diagnostic shape.
	Diagnostics []diagnostics.Diagnostic `json:"diagnostics,omitempty"`
	// TsCompileMs is OpTsCompile's wall time in milliseconds, zero for every other op.
	TsCompileMs float64 `json:"tsCompileMs,omitempty"`
	// Metrics is nil, and off the wire, unless the request set IncludeMetrics.
	Metrics *Metrics `json:"metrics,omitempty"`
	Error   string   `json:"error,omitempty"`
}

// Site records one transformer-injection point. Pos is the byte offset of the call expression's closing `)`,
// where the patcher inserts. ParamIndex is the 0-based slot the injected id occupies; when ArgsCount (the
// arguments the user wrote) is lower, the patcher pads with `undefined` so the id lands in the right slot.
type Site struct {
	File       string `json:"file"`
	Pos        int    `json:"pos"`
	ID         string `json:"id"`
	ParamIndex int    `json:"paramIndex,omitempty"`
	ArgsCount  int    `json:"argsCount,omitempty"`
	// FnId is the opaque fnHash the transformer injects as the 2nd tuple element for a createX call site routed
	// through the InjectTypeFnArgs<T, Fn> marker. Empty for reflection-only InjectRunTypeId sites (getRunTypeId /
	// builders), which inject the bare id string.
	FnId string `json:"fnId,omitempty"`
	// FnIds carries every fnId a MULTI-FUNCTION createX site injects, when its trailing
	// InjectTypeFnArgs<T, F1, F2, …> marker names more than one family (createStandardSchema's <T,'val','verr'>).
	// The rewrite injects an ARRAY of entry-tuple bindings at the single ParamIndex, in this order. Present only
	// when len > 1; single-fn / reflection sites leave it nil and carry the lone value in FnId (the byte-stable
	// 1-fn wire), which mirrors FnIds[0] when both are set.
	FnIds []string `json:"fnIds,omitempty"`
	// Demand is the set of cache entries this createX site requires, computed by the scanner from the operation
	// registry. The emitter renders from it directly rather than reverse-parsing FnId, which a hash forbids. One
	// entry for a simple family or variant, several for a composite JSON strategy; empty for reflection sites.
	Demand []SiteDemand `json:"demand,omitempty"`
	// TrailingComma is true when the call's argument list was written with a trailing comma. The injector then
	// splices the binding WITHOUT a leading comma: the two commas would produce `f(a, , …)`, which is invalid JS.
	TrailingComma bool `json:"trailingComma,omitempty"`
	// Module, when non-empty, is the bundle-module BASENAME this site's entry rides in (allSingle mode): the
	// rewrite imports the binding from `rtmod:/<Module>.js` instead of the entry's own module, with an identical
	// clause shape either way (export name == the binding). Empty in default/allModules mode. Derived statically
	// from mode + site shape, so it rides every scanFiles response, the transform path that skips entry-module
	// collection included. Mirrors Modules[0] when both are set.
	Module string `json:"module,omitempty"`
	// Modules carries the bundle basename of EVERY fnId a multi-function site injects, positionally mirroring
	// FnIds: its fnIds span several families and under allSingle each family is its OWN bundle, so one basename
	// cannot address them all. Present only for a multi-fn site under allSingle; single-fn / reflection sites
	// leave it nil and carry the lone value in Module (the byte-stable 1-fn wire).
	Modules []string `json:"modules,omitempty"`
	// MockSeed is the literal `mock.seed` hint read from a CompTimeHints options slot (createMockDataFn) as
	// canonical decimal text, "" when the site carries none; it seeds the pattern mockSample pools for the types
	// this site demands. Resolver-internal and never serialized: the JS host has no use for it.
	MockSeed string `json:"-"`
}

// SiteDemand is one cache entry a createX site requires: FamilyTag/VariantSuffix/Options drive the emitter's
// rendering, FnHash names the entry it writes (`<fnHash>_<id>`).
type SiteDemand struct {
	FamilyTag     string   `json:"family"`
	VariantSuffix string   `json:"variant,omitempty"`
	Options       []string `json:"options,omitempty"`
	FnHash        string   `json:"fnHash,omitempty"`
	// RejectCircular flags the armed `{rejectCircularRefs: true}` fork of a CircularGuarded family (validate /
	// validationErrors / toBinary / jsonEncoder): the emitter renders the inline circular-reference guard for
	// exactly these entries, and it never rides a JSON primitive demand.
	RejectCircular bool `json:"rejectCircular,omitempty"`
	// ComposedBy names the JSON composite operation a primitive demand exists for; empty for a direct demand.
	ComposedBy string `json:"composedBy,omitempty"`
}

// EnrichFile is one computed mirror file returned by OpEnrich: absolute Path, the desired Content the caller
// writes, whether it is newly Added (no prior on-disk file), and its family Kind ("friendly" | "mock").
type EnrichFile struct {
	Path    string `json:"path"`
	Content string `json:"content"`
	Added   bool   `json:"added,omitempty"`
	Kind    string `json:"kind,omitempty"`
}

// PureFnSite is one generated pure-fn entry, reported for host tooling that relocates pure-fn bodies across
// bundles (mion's cross-bundle serverMapFrom transport is the motivating consumer). The record is SELF-CONTAINED,
// Code + ParamNames inline, so a consumer never reads the generated module files and the shape stays stable
// across every moduleMode. Populated only when the pure-fn report is enabled (`--pure-fn-report-wire` /
// `pureFnReport`); the normal rewrite pipeline pays nothing.
type PureFnSite struct {
	// File / Start / End are the registrar call site's factory-argument span, in the byte offsets the matching
	// Replacement carries.
	File  string `json:"file"`
	Start int    `json:"start"`
	End   int    `json:"end"`
	// Key is the id the entry is interned under: the owning package plus a hash of the body that ships
	// (`@acme/text#pf_9Zt1bRm4cVaPqL`).
	Key string `json:"key"`
	// BindingName is the identifier the registration was assigned to, empty for one written straight into a call.
	// Not part of the id (a hash is); it rides along because a report of hashes names nothing a reader can search.
	BindingName string `json:"bindingName,omitempty"`
	// CalleeName is the identifier the site invoked: `registerPureFn`, a framework wrapper like `inputFrom`, or a
	// renamed import. CalleeModule is the nearest-package.json `"name"` of the file DECLARING the callee (or its
	// ambient `declare module` name), so a consumer attributes a site to the framework that exposed the registrar
	// even through a wrapper-only file.
	CalleeName   string `json:"calleeName,omitempty"`
	CalleeModule string `json:"calleeModule,omitempty"`
	// Form is "direct" (the arg IS the pure fn, wrapped) or "factory" (the arg is a factory, emitted as-is).
	Form string `json:"form,omitempty"`
	// Module is the BASENAME of the generated module this entry rides in (per-entry `pf/<id>` in
	// default/allModules, the single `pf` bundle in allSingle), mirroring Site.Module. For consumers that want
	// the layout linkage; the record stays usable without it.
	Module string `json:"module,omitempty"`
	// ParamNames / Code are the entry payload, emitMode-honoring: Code is empty in an emitMode that ships no body
	// string, matching the module render. PureFnDependencies is the entry's direct pure-fn dep ids.
	ParamNames         []string `json:"paramNames,omitempty"`
	Code               string   `json:"code,omitempty"`
	PureFnDependencies []string `json:"pureFnDependencies,omitempty"`
}

// BatchMapping is one `inputFrom(source, mapper)` link inside a request batch: the server feeds route FromId's
// output through the mapper keyed MapperKey into argument ParamIndex of route ToId.
type BatchMapping struct {
	FromId     string `json:"fromId"`
	ToId       string `json:"toId"`
	ParamIndex int    `json:"paramIndex"`
	// MapperKey is the mapper's pure-fn id, the same one injected at that call.
	MapperKey string `json:"mapperKey"`
}

// BatchSite is one `batch([...])` call site, reported so the server build registers the batch plan under the same
// id the client bundle carries. Populated only when the build report is enabled (`--pure-fn-report-wire` /
// `pureFnReport`); the id itself is spliced into the call whether or not the report is on.
type BatchSite struct {
	// File / Start / End are the `batch(...)` call expression's span, in the byte offsets the matching injection
	// Replacement indexes.
	File  string `json:"file"`
	Start int    `json:"start"`
	End   int    `json:"end"`
	// BatchId is the injected id (`b_<hash>` of the ordered RouteIds).
	BatchId string `json:"batchId"`
	// RouteIds are the batched routes in call order (`users/getById`).
	RouteIds []string `json:"routeIds"`
	// Mappings are the `inputFrom()` links, sorted by (toId, paramIndex).
	Mappings []BatchMapping `json:"mappings,omitempty"`
	// CalleeName / CalleeModule attribute the site to the identifier it invoked and the package declaring it.
	CalleeName   string `json:"calleeName,omitempty"`
	CalleeModule string `json:"calleeModule,omitempty"`
}

// Replacement replaces the bytes [Start, End) of a source file with Text. The pure-fn extractor uses it to swap
// every `registerPureFnFactory(pureFnId, factory)` argument for the entry-module import binding, so the canonical
// body lives only in the emitted entry module and never twice in the user bundle.
type Replacement struct {
	File  string `json:"file"`
	Start int    `json:"start"`
	End   int    `json:"end"`
	Text  string `json:"text"`
	// ImportFrom, when non-empty, is the module specifier the host must import for the substituted expression to
	// resolve (`rtmod:/pf/rt/foo.js`). Text IS the export name, so the host imports `{<Text>}` directly.
	// Empty for plain text substitutions.
	ImportFrom string `json:"importFrom,omitempty"`
	// ImportBinding, when non-empty, is the export name to import when Text is not that name: a trailing-slot
	// splice whose Text carries `undefined` padding and a leading comma before the binding (the bundled-API
	// lane). Empty means Text IS the binding, as above.
	ImportBinding string `json:"importBinding,omitempty"`
}

// TransformResult is the per-file output of OpTransform, in one of two wire shapes selected by Request.EmitEdits:
//
//   - 'go' mode (EmitEdits false, the default): Code is the rewritten source and Map its source map, which the
//     host plumbs straight to the bundler.
//   - 'edits' mode (EmitEdits true): Code/Map are empty and ImportBlock + Edits + SourceHash carry the edit list
//     for the host to apply itself, a lighter wire (O(sites) instead of the whole file plus a dense map).
//
// EmittedModules is the cache-module basenames the rewritten file now imports, so a consumer emitting modules to
// disk knows which were referenced.
type TransformResult struct {
	Code string     `json:"code,omitempty"`
	Map  *SourceMap `json:"map,omitempty"`
	// ImportBlock is the deduped import block the rewrite prepends at offset 0, a single physical line already
	// relativized to <outDir>/types when files-mode is in effect; empty when the file needs no injected imports.
	// 'edits' mode only; the host prepends it verbatim.
	ImportBlock string `json:"importBlock,omitempty"`
	// Edits is the flat point/span edit list, ImportBlock excluded, in UTF-16 CODE-UNIT offsets against the
	// ORIGINAL source: the applier indexes JS strings natively, so Go converts every byte offset through
	// makeByteToChar first. 'edits' mode only.
	Edits []Edit `json:"edits,omitempty"`
	// SourceHash is an FNV-1a/32 hash of the exact source bytes the Edits offsets index (the overlay's view). The
	// applier hashes the bundler-supplied source; a mismatch means an upstream plugin edited it out from under
	// us, so the applier re-uploads the source (setSources) and re-requests rather than misplacing every edit.
	// 'edits' mode only.
	SourceHash     string   `json:"sourceHash,omitempty"`
	EmittedModules []string `json:"emittedModules,omitempty"`
	// TypeDeps is the set of source files DECLARING the types this file's call sites reflect, the edges no
	// bundler can see: `import type` (and a plain import used only in type position) is erased, and an ambient
	// `.d.ts` type never had an import edge. A host declares them to its bundler (`addWatchFile` /
	// `addDependency`) so editing a type re-runs the files that reflect it. Absolute program paths, sorted and
	// deduplicated.
	//
	// ⚠️ EMPTY MEANS UNKNOWN, NOT "no dependencies". A host reading it as "nothing to declare" silently ships a
	// validator for a type that no longer exists: a stale validator does not error, it accepts data the current
	// type rejects. Fall back to coarse invalidation instead.
	TypeDeps []string `json:"typeDeps,omitempty"`
}

// Edit is one point insertion (Start == End) or span replacement (Start < End) against the original source. The
// wire unit is a hard contract: UTF-16 code units, never bytes, never runes, since astral-plane characters make
// the three diverge. 'edits'-mode OpTransform only; the resolver's own byte offsets (Site.Pos,
// Replacement.Start/End) are converted to UTF-16 before they become Edits.
type Edit struct {
	Start int    `json:"start"`
	End   int    `json:"end"`
	Text  string `json:"text"`
}

// SourceMap is a standard source-map v3 object, the shape a bundler accepts back from a transform. Mirrors the
// EditBuffer's output so the Go-generated map is byte-for-byte interchangeable with the JS one.
type SourceMap struct {
	Version        int       `json:"version"`
	Sources        []string  `json:"sources"`
	SourcesContent []*string `json:"sourcesContent"`
	Names          []string  `json:"names"`
	Mappings       string    `json:"mappings"`
}

// Dump is the cache manifest, every projected RunType plus every Site, written by --out-json (runtypes-cache.json).
type Dump struct {
	RunTypes []*reflection.RunType `json:"runTypes"`
	Sites    []Site                `json:"sites"`
}

// WriteJSON writes the dump as pretty-printed JSON. Child slots stay `{kind: -1, id: "<hash>"}` sentinels: a
// consumer not using the generated TS module re-knots them itself.
func (dump Dump) WriteJSON(writer io.Writer) error {
	encoder := json.NewEncoder(writer)
	encoder.SetIndent("", "  ")
	return encoder.Encode(dump)
}

// responseAddedFlags is the wire definition of the per-family added-flag Response fields. Hand-written on
// purpose: the wire keys are NOT derivable from constants.CacheModules, and this table IS the wire contract.
var responseAddedFlags = []struct {
	key string
	get func(*Response) bool
}{
	{"addedRunTypes", func(response *Response) bool { return response.AddedRunTypes }},
	{"addedValidate", func(response *Response) bool { return response.AddedValidate }},
	{"addedValidationErrors", func(response *Response) bool { return response.AddedValidationErrors }},
	{"addedPrepareForJson", func(response *Response) bool { return response.AddedPrepareForJson }},
	{"addedRestoreFromJson", func(response *Response) bool { return response.AddedRestoreFromJson }},
	{"addedStringifyJson", func(response *Response) bool { return response.AddedStringifyJson }},
	{"addedPrepareForJsonClone", func(response *Response) bool { return response.AddedPrepareForJsonClone }},
	{"addedHasUnknownKeys", func(response *Response) bool { return response.AddedHasUnknownKeys }},
	{"addedUnknownKeyErrors", func(response *Response) bool { return response.AddedUnknownKeyErrors }},
	{"addedCloneExactShape", func(response *Response) bool { return response.AddedCloneExactShape }},
	{"addedStripUnknownKeysWire", func(response *Response) bool { return response.AddedStripUnknownKeysWire }},
	{"addedToBinary", func(response *Response) bool { return response.AddedToBinary }},
	{"addedFromBinary", func(response *Response) bool { return response.AddedFromBinary }},
	{"addedFormatTransform", func(response *Response) bool { return response.AddedFormatTransform }},
	{"addedPureFns", func(response *Response) bool { return response.AddedPureFns }},
}

// MarshalJSON serialises Response. ID rides only when HasID is true, so a dump response carries no misleading "".
// Map-built on purpose: encoding/json sorts map keys, so the output bytes are stable whatever the fill order.
func (response Response) MarshalJSON() ([]byte, error) {
	out := make(map[string]any, 8)
	if response.HasID {
		out["id"] = response.ID
	}
	if response.OK {
		out["ok"] = true
	}
	if len(response.Added) > 0 {
		out["added"] = response.Added
	}
	for _, flag := range responseAddedFlags {
		if flag.get(&response) {
			out[flag.key] = true
		}
	}
	if len(response.Sites) > 0 {
		out["sites"] = response.Sites
	}
	if len(response.Replacements) > 0 {
		out["replacements"] = response.Replacements
	}
	if len(response.PureFnSites) > 0 {
		out["pureFnSites"] = response.PureFnSites
	}
	if len(response.PureFnArtifact) > 0 {
		out["pureFnArtifact"] = response.PureFnArtifact
	}
	if len(response.BatchSites) > 0 {
		out["batchSites"] = response.BatchSites
	}
	if len(response.RunTypes) > 0 {
		out["runTypes"] = response.RunTypes
	}
	if len(response.EntryModules) > 0 {
		out["entryModules"] = response.EntryModules
	}
	if len(response.Generated) > 0 {
		out["generated"] = response.Generated
	}
	if len(response.SiteFiles) > 0 {
		out["siteFiles"] = response.SiteFiles
	}
	if len(response.EnrichFiles) > 0 {
		out["enrichFiles"] = response.EnrichFiles
	}
	if response.OutDir != "" {
		out["outDir"] = response.OutDir
	}
	if response.BatchesModule != "" {
		out["batchesModule"] = response.BatchesModule
	}
	if len(response.BatchSourceFiles) > 0 {
		out["batchSourceFiles"] = response.BatchSourceFiles
	}
	if len(response.BatchSourceRoots) > 0 {
		out["batchSourceRoots"] = response.BatchSourceRoots
	}
	if len(response.RouterInitFiles) > 0 {
		out["routerInitFiles"] = response.RouterInitFiles
	}
	if response.DowngradeErrors != nil {
		out["downgradeErrors"] = response.DowngradeErrors
	}
	if len(response.Transformed) > 0 {
		out["transformed"] = response.Transformed
	}
	if len(response.Diagnostics) > 0 {
		out["diagnostics"] = response.Diagnostics
	}
	if response.TsCompileMs > 0 {
		out["tsCompileMs"] = response.TsCompileMs
	}
	if response.Metrics != nil {
		out["metrics"] = response.Metrics
	}
	if response.Error != "" {
		out["error"] = response.Error
	}
	return jsonMarshal(out)
}

// PureFnDep identifies a pure-function dependency of a compiled function by its id, which already says where the
// registration lives. It never reaches the emitted JS: that wire shape stays the flat id array rtUtils consumes.
type PureFnDep struct {
	ID string
}
