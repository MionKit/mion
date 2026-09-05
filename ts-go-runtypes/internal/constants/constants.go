// Package constants defines values shared across the Go internal packages —
// and, via the `cmd/gen-ts-constants` codegen tool, mirrored to the TS side.
//
// Single source of truth: any cross-cutting constant (emit module settings,
// reserved identifiers, wire markers, …) lives here and is regenerated into
// the JS workspace so the two halves never drift.
package constants

// CacheModuleSettings configures one emitted JS cache module.
type CacheModuleSettings struct {
	Name      string // function/export identifier (e.g. "runTypesModule")
	VarPrefix string // identifier prefix for emitted `export const <prefix><hash>`
	Tag       string // short family tag for emitted inner-fn name + fnID (e.g. "verr" → inner "verr_<hash>", fnID "verr")
}

// CacheModuleGroup mirrors the RTFunctionsGroup pattern: a map of named
// entries, each carrying its own settings. Future emit modules add an entry
// here so each can have its own variable prefix without touching the renderer.
type CacheModuleGroup map[string]CacheModuleSettings

// CacheModules is the registry of every emitted cache-module shape.
//
// `VarPrefix` is retained as the prefix the renderer uses for inner
// closure names inside the body of an validate validator (the
// printClosure convention — outer "get_<fnName>" wraps inner "<fnName>"
// at rtFnCompiler.ts:732). After the move to the splice-based emitter
// the prefix is NOT used to key cache entries any more: every cache is
// now `{ [rawId]: value }`, keyed by the canonical hash id directly.
var CacheModules = CacheModuleGroup{
	"runTypes": {
		Name:      "runTypesModule",
		VarPrefix: "t_",
		Tag:       "t",
	},
	"validate": {
		Name:      "validateModule",
		VarPrefix: "g_val_",
		Tag:       "val",
	},
	"validationErrors": {
		Name:      "validationErrorsModule",
		VarPrefix: "g_verr_",
		Tag:       "verr",
	},
	// The fused validators behind `{checkUnknowns: true}` — same bodies as
	// validate / validationErrors plus the unknown-key check at every object-ish
	// node. Own families (not variants) so they render their own transitive
	// subtree and disk-cache under their own tag.
	"validateStrict": {
		Name:      "validateStrictModule",
		VarPrefix: "g_vst_",
		Tag:       "vst",
	},
	"validationErrorsStrict": {
		Name:      "validationErrorsStrictModule",
		VarPrefix: "g_vest_",
		Tag:       "vest",
	},
	// createParseFn — one family per undeclared-key strategy (see the operations
	// registry for why strategies are operations here rather than an axis).
	"parse": {
		Name:      "parseModule",
		VarPrefix: "g_prs_",
		Tag:       "prs",
	},
	"parseFail": {
		Name:      "parseFailModule",
		VarPrefix: "g_prsf_",
		Tag:       "prsf",
	},
	"parseStrip": {
		Name:      "parseStripModule",
		VarPrefix: "g_prss_",
		Tag:       "prss",
	},
	"prepareForJson": {
		Name:      "prepareForJsonModule",
		VarPrefix: "g_pj_",
		Tag:       "pj",
	},
	"restoreFromJson": {
		Name:      "restoreFromJsonModule",
		VarPrefix: "g_rj_",
		Tag:       "rj",
	},
	"stringifyJson": {
		Name:      "stringifyJsonModule",
		VarPrefix: "g_sj_",
		Tag:       "sj",
	},
	"prepareForJsonSafe": {
		Name:      "prepareForJsonSafeModule",
		VarPrefix: "g_pjs_",
		Tag:       "pjs",
	},
	"compactForJson": {
		Name:      "compactForJsonModule",
		VarPrefix: "g_cj_",
		Tag:       "cj",
	},
	"compactFromJson": {
		Name:      "compactFromJsonModule",
		VarPrefix: "g_cjr_",
		Tag:       "cjr",
	},
	"hasUnknownKeys": {
		Name:      "hasUnknownKeysModule",
		VarPrefix: "g_huk_",
		Tag:       "huk",
	},
	"cloneExactShape": {
		Name:      "cloneExactShapeModule",
		VarPrefix: "g_ces_",
		Tag:       "ces",
	},
	"unknownKeyErrors": {
		Name:      "unknownKeyErrorsModule",
		VarPrefix: "g_uke_",
		Tag:       "uke",
	},
	"unknownKeysToUndefinedWire": {
		Name:      "unknownKeysToUndefinedWireModule",
		VarPrefix: "g_ukuw_",
		Tag:       "ukuw",
	},
	"toBinary": {
		Name:      "toBinaryModule",
		VarPrefix: "g_tb_",
		Tag:       "tb",
	},
	"fromBinary": {
		Name:      "fromBinaryModule",
		VarPrefix: "g_fb_",
		Tag:       "fb",
	},
	"formatTransform": {
		Name:      "formatTransformModule",
		VarPrefix: "g_fmt_",
		Tag:       "fmt",
	},
	"jsonSchema": {
		Name:      "jsonSchemaModule",
		VarPrefix: "g_jsc_",
		Tag:       "jsc",
	},
	"classSerializerReg": {
		Name:      "classSerializerRegModule",
		VarPrefix: "g_csr_",
		Tag:       "csr",
	},
	"pureFns": {
		Name:      "pureFnsModule",
		VarPrefix: "",
		Tag:       "",
	},
}

// JSON composite family tags — one per (jsonEncoder|jsonDecoder, strategy).
//
// A composite entry wraps the underlying primitives (pj/pjs/sj/uku/rj/ukuw)
// with native JSON and is keyed by the strategy's composite fnHash. It does NOT
// get a CacheModules entry: composites emit no type-walking factory and ride the
// prepareForJson / restoreFromJson module bodies (already loaded into rtUtils),
// so there is no virtual module / VarPrefix to mirror. Each strategy DOES need
// its own short tag so the on-disk cache basename (`<typehash>/<tag>.json`) is
// distinct — two strategies of one type must not collide on a single `je.json`.
//
// jsonCompositeTags maps "op|strategy" → tag. JsonCompositeByTag reverses it so
// the composite emitter recovers (operation, strategy) from a demand's tag.
var jsonCompositeTags = map[string]string{
	"jsonEncoder|clone":    "jeCL",
	"jsonEncoder|mutate":   "jeMU",
	"jsonEncoder|direct":   "jeDI",
	"jsonEncoder|compact":  "jeCO",
	"jsonDecoder|strip":    "jdST",
	"jsonDecoder|preserve": "jdPR",
	"jsonDecoder|compact":  "jdCO",
}

// JsonComposite identifies one JSON composite family: the operation name
// (jsonEncoder / jsonDecoder) and its strategy. Recovered from a family Tag via
// JsonCompositeByTag so the composite emitter knows which fixed body to emit.
type JsonComposite struct {
	OpName   string
	Strategy string
}

var jsonCompositeByTag = func() map[string]JsonComposite {
	out := make(map[string]JsonComposite, len(jsonCompositeTags))
	for key, tag := range jsonCompositeTags {
		parts := splitPipe(key)
		out[tag] = JsonComposite{OpName: parts[0], Strategy: parts[1]}
	}
	return out
}()

// splitPipe splits "op|strategy" into its two halves. Local helper to avoid a
// strings import in this file's var initialiser.
func splitPipe(key string) [2]string {
	for i := 0; i < len(key); i++ {
		if key[i] == '|' {
			return [2]string{key[:i], key[i+1:]}
		}
	}
	return [2]string{key, ""}
}

// JsonCompositeTag returns the per-strategy family Tag for a JSON composite
// operation + strategy (used as the on-disk cache basename and the demand's
// FamilyTag).
func JsonCompositeTag(opName, strategy string) (string, bool) {
	tag, ok := jsonCompositeTags[opName+"|"+strategy]
	return tag, ok
}

// JsonCompositeByTag returns the (operation, strategy) a composite family Tag
// represents, or ok=false when the tag is not a JSON composite.
func JsonCompositeByTag(tag string) (JsonComposite, bool) {
	composite, ok := jsonCompositeByTag[tag]
	return composite, ok
}

// ValidateOption describes one entry in the `ValidateOptions` bag — the
// call-site options that parameterise the generated validate / validationErrors
// validator without affecting the structural type id. Each entry pairs
// the option's JS-side property name with a single-letter token used to
// build the variant cache-key suffix (`itNL_<id>`, `valNA_<id>`,
// `itNLA_<id>`, …). The same table drives the Go scanner's option
// extraction, the emitter's variant fan-out, and (via gen-ts-constants)
// the JS runtime's cache-key construction.
type ValidateOption struct {
	Name   string // JS property name, e.g. "noLiterals"
	Letter string // single uppercase letter appended to the variant suffix, e.g. "L"
}

// numberMode (the `ValidateOptions.numberMode` string enum) selects the
// emitted base `number` kind check so validators can align with other
// libraries' number semantics. Its value is NOT a boolean, so it can't be a
// plain registry entry: the two non-default values ride as INTERNAL canonical
// option names (numberModeTypeofName / numberModeNotNaNName) appended to the
// registry below, and the default isFinite adds no variant name at all —
// keeping existing `val_<id>` / `valNL_<id>` keys byte-stable.
const (
	NumberModeOption   = "numberMode" // the JS property name on ValidateOptions
	NumberModeIsFinite = "isFinite"   // default — Number.isFinite(v)
	NumberModeTypeof   = "typeof"     // typeof v === 'number' (accepts NaN / Infinity)
	NumberModeNotNaN   = "notNaN"     // typeof v === 'number' && !Number.isNaN(v)
)

// The createParseFn `strategy` values. Unlike numberMode these do NOT ride the
// ValidateOptions variant machinery: parse is AxisNone, so the strategy IS the
// operation and each value selects a different FAMILY (see
// parseStrategyOperation in the resolver's scan). Named here so the CLI flag,
// the tsconfig merge and the site resolution all validate against one list.
const (
	ParseStrategyOption   = "strategy" // the JS property name on ParseOptions
	ParseStrategyPreserve = "preserve" // default — undeclared keys are kept
	ParseStrategyStrip    = "strip"    // undeclared keys are blanked before the restore
	ParseStrategyFail     = "fail"     // a value carrying one is rejected
)

// Internal canonical variant names for the two non-default numberMode values.
// These are NOT user-facing properties (the public property is the string
// `numberMode`); they exist so the enum rides the boolean ValidateOptions
// name-set / letter machinery unchanged.
const (
	numberModeTypeofName = "numberTypeof"
	numberModeNotNaNName = "numberNotNaN"
)

// ValidateOptions is the ordered registry of supported `ValidateOptions`
// keys. Order is load-bearing: the variant suffix concatenates letters
// in this order so existing variant keys stay stable as new options
// append to the tail (declaration-order, not alphabetic).
//
// To add a new boolean option:
//  1. Append an entry here — the scanner's extraction is table-driven
//     off this registry, so the option is read automatically.
//  2. Add the field to `ValidateOptions` in
//     packages/run-types/src/createRTFunctions.ts.
//  3. Teach the emitters to honour it (plus any per-option scanner
//     semantics, e.g. a noop-option diagnostic in analyzeCall).
//  4. Regenerate the TS mirror (`pnpm run gen:ts-constants`).
//
// A string-enum option (see numberMode above) instead maps each non-default
// value to a canonical name here and is read by a dedicated scanner arm.
var ValidateOptions = []ValidateOption{
	{Name: "noLiterals", Letter: "L"},
	{Name: "noIsArrayCheck", Letter: "A"},
	{Name: numberModeTypeofName, Letter: "T"},
	{Name: numberModeNotNaNName, Letter: "M"},
}

// NumberModeOptionName maps a numberMode value to its canonical variant
// option name (a ValidateOptions member), or "" for the default isFinite and
// for any unset / unrecognized value (both fall back to the default check).
func NumberModeOptionName(mode string) string {
	switch mode {
	case NumberModeTypeof:
		return numberModeTypeofName
	case NumberModeNotNaN:
		return numberModeNotNaNName
	default:
		return ""
	}
}

// NumberModeFromOptions returns the numberMode implied by an enabled
// option-name set (queried through has) — the inverse of NumberModeOptionName.
// Defaults to isFinite when neither variant name is present.
func NumberModeFromOptions(has func(string) bool) string {
	switch {
	case has(numberModeTypeofName):
		return NumberModeTypeof
	case has(numberModeNotNaNName):
		return NumberModeNotNaN
	default:
		return NumberModeIsFinite
	}
}

// ValidateVariantSuffix returns the canonical variant suffix for a sorted
// list of option NAMES (subset of `ValidateOptions[*].Name`). Empty input
// → empty suffix (the plain key). Unknown names are silently skipped —
// callers (scanner / emitter) should validate ahead of time.
//
// The suffix shape is `N` + concatenated letters in `ValidateOptions`
// declaration order. Example: `["noLiterals", "noIsArrayCheck"]` →
// `"NLA"`. The leading `N` ("No") disambiguates the variant prefix
// from a plain `<tag>_<id>` key.
func ValidateVariantSuffix(names []string) string {
	if len(names) == 0 {
		return ""
	}
	present := make(map[string]bool, len(names))
	for _, name := range names {
		present[name] = true
	}
	suffix := "N"
	hit := false
	for _, opt := range ValidateOptions {
		if present[opt.Name] {
			suffix += opt.Letter
			hit = true
		}
	}
	if !hit {
		return ""
	}
	return suffix
}

// HasUnknownKeysOptions is the ordered registry of supported
// `HasUnknownKeysOptions` keys — the compile-time options bag of
// `createHasUnknownKeysFn<T>(val?, options?, id?)`. Same contract as
// ValidateOptions above: declaration order is load-bearing for the variant
// suffix, and the same scanner/emitter/gen-ts mirror steps apply when adding
// an option (see the ValidateOptions comment).
//
// `runsAfterValidation` declares the caller's precondition that the value
// already PASSED this type's validate — every required prop is present — which
// makes the emitter's key-count fast path sound (`cnt(v) !== N` exactly
// separates clean from dirty) and lets it drop the per-object typeof guards.
// Calling the variant on non-validated input is undefined behavior.
//
// Unlike every ValidateOptions entry, this one describes the VALUE rather than
// the root call, so it PROPAGATES: the emitter renders the whole subtree under
// the variant (typefunctions.VariantPropagator) instead of dep-calling plain
// child entries, which is what gets a named nested type the same fast path an
// inline one has.
var HasUnknownKeysOptions = []ValidateOption{
	{Name: "runsAfterValidation", Letter: "V"},
}

// HasUnknownKeysVariantSuffix returns the canonical variant suffix for a list
// of hasUnknownKeys option NAMES (subset of `HasUnknownKeysOptions[*].Name`).
// Mirrors ValidateVariantSuffix's shape with its own lead letter: `O`
// ("options") + the letters of the present options in declaration order —
// `["runsAfterValidation"]` → `"OV"`. Empty input → empty suffix (plain key).
func HasUnknownKeysVariantSuffix(names []string) string {
	if len(names) == 0 {
		return ""
	}
	present := make(map[string]bool, len(names))
	for _, name := range names {
		present[name] = true
	}
	suffix := "O"
	hit := false
	for _, opt := range HasUnknownKeysOptions {
		if present[opt.Name] {
			suffix += opt.Letter
			hit = true
		}
	}
	if !hit {
		return ""
	}
	return suffix
}

// JsonStrategyFamilies maps a JSON "op|strategy" key to the cache family tags it
// composes. Keyed by op|strategy (not the bare strategy token) because the
// encoder and decoder can share a strategy NAME — `compact` is both a
// jsonEncoder and a jsonDecoder strategy but composes different primitives
// (cj vs cjr). Shared by the scanner (emit) and the emitter (demand); both
// readers hold the operation, so they pass the op-qualified key. Go-only (not
// mirrored to TS — gen-ts-constants emits only CacheModules).
var JsonStrategyFamilies = map[string][]string{
	"jsonEncoder|direct": {"sj"},
	// `clone` is shape-derived (prepareForJsonSafe builds a new value from the
	// declared shape), so it strips undeclared keys by construction — no separate
	// strip pass / strip variant is needed. (Was {"pjsp"} when `clone` preserved
	// extras; the preserve variant and the `stripClone`/`stripMutate` strategies
	// were removed.)
	"jsonEncoder|clone":  {"pjs"},
	"jsonEncoder|mutate": {"pj"},
	// `compact` emits declared object props as a positional array (no key names);
	// cj is the encode walk, cjr the decode walk.
	"jsonEncoder|compact":  {"cj"},
	"jsonDecoder|strip":    {"rj", "ukuw"},
	"jsonDecoder|preserve": {"rj"},
	"jsonDecoder|compact":  {"cjr"},
}

// Per-entry virtual module settings (mirrored to TS via gen-ts-constants).
// Every cache entry — runtype node, type-fn factory, JSON composite, pure fn —
// is served as its own ES module `<EntryModulePrefix><basename><EntryModuleSuffix>`
// exporting one tuple under its binding name (entrymod.ExportName —
// `<EntryBindingPrefix><identifier-escaped basename>`). The SAME name binds
// the entry everywhere: the export, every import clause, and the call-site
// binding the rewrite injects. See internal/compiler/entrymodules.
const (
	// EntryModulePrefix is the INTERNAL render-time specifier scheme every
	// entry module is named under (`rtmod:/<basename>.js`). It never reaches
	// a bundler or disk: the resolver relativizes every occurrence to a real
	// relative path (post-render for inter-module imports, post-Apply for the
	// imports injected into user files). A scheme rather than a path keeps
	// rendered module text location-independent and the golden corpus stable.
	EntryModulePrefix = "rtmod:/"
	// EntryModuleSuffix terminates every entry-module specifier; the .js
	// extension keeps downstream tooling (and import-analysis fast paths)
	// treating the virtual id as plain JS.
	EntryModuleSuffix = ".js"
	// EntryBindingPrefix prefixes every entry's binding name — the module's
	// export AND the import binding the rewrite injects into user files
	// (`<prefix><sanitized basename>`); the leading double-underscore keeps
	// collisions with user identifiers implausible.
	EntryBindingPrefix = "__rt_"
	// ServerMapperNamespace is the pure-fn namespace a NAMED request-batch mapper
	// (`inputFrom(source, 'toUserId')`) is keyed under: the batches report
	// records it as `<ServerMapperNamespace>::<name>`, the key the server
	// registers its named mappers by, so the client-side batch id and the
	// server-side mapper lookup agree without either reading the other's code.
	ServerMapperNamespace = "mionjs"
	// PureFnModuleDir is the basename directory prefix for pure-fn entry
	// modules (`pf/<ns>/<fn>`), keeping them visually distinct from the hash-
	// keyed runtype / type-fn modules.
	PureFnModuleDir = "pf"
	// RpcModuleDir is the folder under the output root that holds the batch
	// transport: `rpc/batches.generated.js` (the batch table the server
	// registers) plus `rpc/pf/<ns>/<fn>.js` (the inline inputFrom mappers it
	// imports). Generated by the SERVER build from the batch source program
	// (its own, or the `clientTsconfig` one), so the server owns every file it
	// loads and never reads a client tree.
	RpcModuleDir = "rpc"
	// BatchesModuleFile is the batch table module's name under RpcModuleDir.
	BatchesModuleFile = "batches.generated.js"
	// RpcModulePrefix is the render-time specifier scheme for the batch
	// transport module (`rtrpc:/batches.generated.js`), the sibling of
	// EntryModulePrefix: the transform appends `import 'rtrpc:/…'` to every
	// module that creates the router, and the same relativizers that turn
	// `rtmod:/` into a path under <outDir>/types turn this one into a path
	// under <outDir>/rpc.
	RpcModulePrefix = "rtrpc:/"
	// RunTypesBundleBasename names the SINGLE runtype data module
	// (`rtmod:/runtypes.js`): every reflection-demanded node lives there
	// as one tuple row, deduplicated app-wide, with per-root facade modules
	// aliasing into it. Unlike every other entry module it is NOT
	// content-addressed — the Vite plugin invalidates it when a scan reports
	// addedRunTypes. The name can't collide with hash-keyed basenames (hash
	// ids are short) or pure-fn basenames (always under PureFnModuleDir).
	RunTypesBundleBasename = "runtypes"
	// FnsBundleDir is the basename directory prefix for per-family fn-entry
	// bundle modules in allSingle module mode (`fns/<familyTag>`): every
	// entry of one family rides the family's bundle as a NAMED export
	// (`export const <BindingName(key)>=[…]`) instead of its own module.
	FnsBundleDir = "fns"
)

// ModuleMode selects how cache entries are grouped into virtual modules.
// Mirrored to TS so the Vite plugin option validates against the same set.
const (
	// ModuleModeDefault — runtype nodes ride THE single data bundle (+ per-root
	// facade modules); every fn-family / composite / pure-fn entry is its own
	// per-entry module. Today's behavior.
	ModuleModeDefault = "default"
	// ModuleModeAllSingle — bundle EVERYTHING: fn families render one bundle
	// module per family tag (`fns/<tag>`), pure fns one `pf` bundle, and the
	// reflection facades fold into the runtypes bundle as named exports.
	// Fewest modules; family bundles are mutable (invalidate on Added* flags).
	ModuleModeAllSingle = "allSingle"
	// ModuleModeAllModules — split EVERYTHING: fn entries per-entry (as
	// default) AND runtype nodes as individual per-node modules (the
	// pre-bundle layout). Escape hatch; measured slower on dense reflection
	// graphs.
	ModuleModeAllModules = "allModules"
)

// EmitMode selects what each compiled fn entry ships in its code/factory
// slots — the --emit-mode CLI flag and the Vite plugin's `emitMode` option
// validate against this set. NOT mirrored to TS (the plugin hard-codes the
// three string literals on its option type); the runtime only reads what the
// slots carry, never the mode itself.
type EmitMode string

const (
	// EmitCode (the default) ships only the body `code` string in the code
	// slot; the createRTFn slot is the `u` placeholder and the runtime rebuilds
	// the factory via `new Function('utl', code)` on first lookup.
	EmitCode EmitMode = "code"
	// EmitFunctions ships only the live `function g_<hash>(utl){…}` factory; the
	// code slot is `undefined`. The runtime uses the factory directly and
	// derives the code string lazily (from `createRTFn.toString()`) only if a
	// consumer ever reads it. Smallest factory-bearing output (no body twice).
	EmitFunctions EmitMode = "functions"
	// EmitBoth ships the code string AND the live factory (the body twice) —
	// for runtimes that disallow `new Function` (CSP) yet still read `.code`.
	EmitBoth EmitMode = "both"
)

// EmitsCode reports whether the code-string slot is populated. The zero value
// ("") behaves as EmitCode so a RenderOpts{} default emits the code string.
func (mode EmitMode) EmitsCode() bool {
	return mode == EmitCode || mode == EmitBoth || mode == ""
}

// EmitsFactory reports whether the live createRTFn factory slot is populated.
func (mode EmitMode) EmitsFactory() bool {
	return mode == EmitFunctions || mode == EmitBoth
}

// Valid reports whether mode is one of the three known values (used to
// validate the --emit-mode flag).
func (mode EmitMode) Valid() bool {
	return mode == EmitCode || mode == EmitFunctions || mode == EmitBoth
}

// InlineMode selects the child-inlining policy DefaultIsRTInlined applies to
// compound nodes (mirrored as the binary's --inline-mode flag and the Vite
// plugin's inlineMode option; values validated Go-side, NOT mirrored to TS).
type InlineMode string

const (
	// InlineModeDefault — the name rule: UNNAMED compounds (arrays, tuples,
	// object literals, unions, classes) inline into their parents
	// (statement bodies hoist to context fns at expression slots); NAMED
	// types (alias or interface) and circular types stay external as
	// dedupe-worthy shared entries. Date/Temporal builtins always inline
	// (atomic single-expression emits). The zero value behaves identically.
	InlineModeDefault InlineMode = "default"
	// InlineModeAllInternal — as the name says: EVERYTHING except circular
	// types inlines, names ignored. One function per call-site type per
	// family. Supersedes the old DEBUG_RT=INLINED env override.
	InlineModeAllInternal InlineMode = "allInternal"
)

// AllInternal reports whether the name-blind everything-inlines mode is on.
func (mode InlineMode) AllInternal() bool { return mode == InlineModeAllInternal }

// Valid reports whether mode is a recognised value ("" counts as default so
// zero-valued RenderOpts behave like production defaults).
func (mode InlineMode) Valid() bool {
	return mode == InlineModeDefault || mode == InlineModeAllInternal || mode == ""
}

// Binary size-estimate defaults. The compiler walks each binary-encoder type
// at build time and bakes a buffer-size estimate into the `tb` entry; the
// runtime `dynamic` strategy uses it as the cold-start buffer size (instead of
// the flat defaultBufferSize fallback) until per-key history warms up. Each default is
// overridable via a CLI flag / Vite plugin option; all four fold into the disk
// fingerprint so a config change re-derives every estimate.
const (
	// DefaultSizeBias weights the estimate between a type's minimum and
	// (capped) maximum footprint: estimate = min + bias·(cappedMax − min).
	// 0 = tightest (most grows), 1 = most generous (most slack). 0.8 leans
	// generous so a cold encode rarely has to grow.
	DefaultSizeBias = 0.8
	// DefaultSizeItems is the assumed element count for an unbounded
	// collection (array / Map / Set / index signature) — a typical paginated
	// page.
	DefaultSizeItems = 100
	// DefaultSizeStringBytes is the assumed UTF-8 byte length of an
	// unbounded string (no maxLength format bound).
	DefaultSizeStringBytes = 32
	// DefaultSizeMaxBytes caps any single type's estimate so a huge declared
	// bound (e.g. maxLength<10_000_000>) never seeds a multi-MB cold buffer.
	DefaultSizeMaxBytes = 64 * 1024
)

// Pattern mockSample auto-generation defaults. A format pattern with no
// declared mockSamples gets them generated at build time by the JS engine
// (deterministic per pattern); both knobs are overridable via a CLI flag /
// plugin option and fold into the disk fingerprint.
const (
	// DefaultPatternSampleCount is how many samples generation aims for per
	// pattern (0 disables generation entirely).
	DefaultPatternSampleCount = 100
	// DefaultPatternSampleRetries is the per-sample draw multiplier: the
	// whole generation budget is count × retries draws, and only a budget
	// that yields zero surviving values fails the build.
	DefaultPatternSampleRetries = 10
)

// Tuple slot-0 kind discriminators for entry-module tuples. Type-fn entries
// carry their QUOTED family tag in slot 0 instead of a number, so the runtime
// discriminates with `typeof t[0] === 'string'`.
const (
	TupleKindRunType       = 0
	TupleKindPureFn        = 2
	TupleKindMissing       = 3
	TupleKindRunTypeBundle = 4
	TupleKindRunTypeFacade = 5
)

// JsonCompositeHostTags maps each JSON-composite family tag to the family
// whose runtime entry metadata (fnID / args / defaultParamValues) the
// composite borrows: encoder strategies registered through the prepareForJson
// consumer pre-migration, decoder strategies through restoreFromJson. The
// TS-side familyMeta table mirrors this mapping by hand (see rtUtils.ts).
var JsonCompositeHostTags = func() map[string]string {
	out := make(map[string]string, len(jsonCompositeTags))
	for key, tag := range jsonCompositeTags {
		parts := splitPipe(key)
		if parts[0] == "jsonEncoder" {
			out[tag] = "pj"
		} else {
			out[tag] = "rj"
		}
	}
	return out
}()

// Version is the binary version, injected at build time via
//
//	-ldflags "-X github.com/mionkit/mion/ts-go-runtypes/internal/constants.Version=<v>"
//
// Embedded into the typeID hashing input (see internal/cachegen/runtype.assignID)
// so the same structural type gets a different short hash across binary versions —
// any on-disk cache keyed by typeID is automatically version-isolated, no per-
// version directory needed.
//
// Defaults to "dev" for local builds; the publish script overrides it from the
// root package.json version.
var Version = "dev"

// TsgoVersion records the pinned tsgolint / typescript-go revision the binary
// was built against, injected at build time via
//
//	-ldflags "-X github.com/mionkit/mion/ts-go-runtypes/internal/constants.TsgoVersion=<rev>"
//
// Unlike Version it is PURE METADATA — it is never folded into the typeID hash
// (the bundled checker revision must not perturb cache keys). Surfaced by the
// binary's --version flag and recorded in the launcher package's package.json
// "tsgo" field, so the TypeScript baseline stays discoverable without leaking
// into the semver contract. Defaults to "dev" for local builds.
var TsgoVersion = "dev"
