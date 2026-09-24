// Package constants is the single source of truth for the values shared across the Go internal packages: any
// cross-cutting constant (emit module settings, reserved identifiers, wire markers, …) lives here, and
// `cmd/gen-ts-constants` regenerates the ones the JS workspace needs so the two halves cannot drift.
package constants

// CacheModuleSettings configures one emitted JS cache module.
type CacheModuleSettings struct {
	Name      string // function/export identifier (e.g. "runTypesModule")
	VarPrefix string // identifier prefix for emitted `export const <prefix><hash>`
	Tag       string // short family tag: emitted inner-fn name and the demand's FamilyTag (e.g. "verr" → inner "verr_<hash>")
}

// CacheModuleGroup maps each named cache module to its settings, so a future emit module is an entry here rather
// than a change to the renderer.
type CacheModuleGroup map[string]CacheModuleSettings

// CacheModules is the registry of every emitted cache-module shape.
//
// `VarPrefix` is retained for the TS mirror only: the renderer names factories `g_<fnHash>_<id>` and no cache is
// keyed by the prefix — every cache is `{ [rawId]: value }`, keyed by the canonical hash id directly.
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
	// The union-scoped validators behind `{checkUnionUnknowns: true}`: a key check on UNION MEMBER arms and nowhere else.
	"validateUnionKeys": {
		Name:      "validateUnionKeysModule",
		VarPrefix: "g_vuk_",
		Tag:       "vuk",
	},
	"validationErrorsUnionKeys": {
		Name:      "validationErrorsUnionKeysModule",
		VarPrefix: "g_veuk_",
		Tag:       "veuk",
	},
	"prepareForJsonMutate": {
		Name:      "prepareForJsonMutateModule",
		VarPrefix: "g_pj_",
		Tag:       "pj",
	},
	"restoreFromJsonMutate": {
		Name:      "restoreFromJsonMutateModule",
		VarPrefix: "g_rj_",
		Tag:       "rj",
	},
	"prepareForJsonClone": {
		Name:      "prepareForJsonCloneModule",
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
	"restoreFromJsonClone": {
		Name:      "restoreFromJsonCloneModule",
		VarPrefix: "g_rjs_",
		Tag:       "rjs",
	},
	"removeUnknownKeys": {
		Name:      "removeUnknownKeysModule",
		VarPrefix: "g_ruk_",
		Tag:       "ruk",
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
// A composite entry wraps the primitives JsonStrategyFamilies lists with native JSON and is keyed by the
// strategy's composite fnHash. It gets NO CacheModules entry: composites emit no type-walking factory and ride
// the prepareForJson / restoreFromJsonMutate module bodies, so there is no virtual module or VarPrefix to mirror.
// Each strategy still needs its own short tag so the on-disk cache basename (`<typehash>/<tag>.json`) stays
// distinct: two strategies of one type must not collide on a single `je.json`.
//
// jsonCompositeTags maps "op|strategy" → tag; JsonCompositeByTag reverses it so the composite emitter recovers
// (operation, strategy) from a demand's tag.
var jsonCompositeTags = map[string]string{
	"jsonEncoder|clone":   "jeCL",
	"jsonEncoder|mutate":  "jeMU",
	"jsonEncoder|compact": "jeCO",
	"jsonDecoder|clone":   "jdCL",
	"jsonDecoder|mutate":  "jdMU",
	"jsonDecoder|compact": "jdCO",
}

// JsonComposite identifies one JSON composite family: the operation name (jsonEncoder / jsonDecoder) and its
// strategy, recovered from a family Tag so the composite emitter knows which fixed body to emit.
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

// splitPipe splits "op|strategy" into its two halves; local, to keep a strings import out of this file's var initialiser.
func splitPipe(key string) [2]string {
	for i := 0; i < len(key); i++ {
		if key[i] == '|' {
			return [2]string{key[:i], key[i+1:]}
		}
	}
	return [2]string{key, ""}
}

// JsonCompositeTag returns the per-strategy family Tag for a JSON composite operation + strategy, which is also
// the on-disk cache basename and the demand's FamilyTag.
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

// ValidateOption is one entry of the `ValidateOptions` bag: the call-site options that parameterise the generated
// validate / validationErrors validator without affecting the structural type id. Each pairs the option's JS-side
// property name with the single letter that builds the variant suffix of the canonical key the fnHash is derived
// from. One table drives both the scanner's option extraction and the emitter's variant fan-out.
type ValidateOption struct {
	Name   string // JS property name, e.g. "numberTypeof"
	Letter string // single uppercase letter appended to the variant suffix, e.g. "T"
	Group  string // entries sharing a non-empty Group are values of one option, so a call site sets at most one
}

// numberMode (the `ValidateOptions.numberMode` string enum) selects the emitted base `number` check so validators
// can align with other libraries' number semantics. Its value is not a boolean, so it cannot be a plain registry
// entry: the two non-default values ride as INTERNAL canonical option names appended to the registry below, and
// the default isFinite adds no variant name at all, keeping existing keys byte-stable.
const (
	NumberModeOption   = "numberMode" // the JS property name on ValidateOptions
	NumberModeIsFinite = "isFinite"   // default — Number.isFinite(v)
	NumberModeTypeof   = "typeof"     // typeof v === 'number' (accepts NaN / Infinity)
	NumberModeNotNaN   = "notNaN"     // typeof v === 'number' && !Number.isNaN(v)
)

// Internal canonical variant names for the two non-default numberMode values.
// These are NOT user-facing properties (the public property is the string
// `numberMode`); they exist so the enum rides the boolean ValidateOptions
// name-set / letter machinery unchanged.
const (
	numberModeTypeofName = "numberTypeof"
	numberModeNotNaNName = "numberNotNaN"
)

// ValidateOptions is the ordered registry of supported `ValidateOptions` keys. Order is load-bearing: the variant
// suffix concatenates letters in this order (declaration order, not alphabetic), so existing variant keys stay
// stable as new options append to the tail.
//
// To add a new boolean option:
//  1. Append an entry here — the scanner's extraction is table-driven off this registry.
//  2. Add the field to `ValidateOptions` in packages/run-types/src/createRTFunctions.ts.
//  3. Teach the emitters to honour it, plus any per-option scanner semantics.
//
// A string-enum option (see numberMode above) instead maps each non-default value to a canonical name here and is
// read by a dedicated scanner arm.
var ValidateOptions = []ValidateOption{
	{Name: numberModeTypeofName, Letter: "T", Group: NumberModeOption},
	{Name: numberModeNotNaNName, Letter: "M", Group: NumberModeOption},
}

// OptionSubsets returns the power set of table's names, minus any subset holding two entries of one Group.
func OptionSubsets(table []ValidateOption) [][]string {
	subsets := make([][]string, 0, 1<<len(table))
	for mask := 0; mask < (1 << len(table)); mask++ {
		var subset []string
		groups := map[string]bool{}
		possible := true
		for i, opt := range table {
			if mask&(1<<i) == 0 {
				continue
			}
			if opt.Group != "" {
				if groups[opt.Group] {
					possible = false
					break
				}
				groups[opt.Group] = true
			}
			subset = append(subset, opt.Name)
		}
		if possible {
			subsets = append(subsets, subset)
		}
	}
	return subsets
}

// NumberModeOptionName maps a numberMode value to its canonical variant option name (a ValidateOptions member),
// or "" for the default isFinite and for any unset / unrecognized value, which fall back to the default check.
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

// NumberModeFromOptions returns the numberMode implied by an enabled option-name set (queried through has), the
// inverse of NumberModeOptionName; isFinite when neither variant name is present.
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

// ValidateVariantSuffix returns `N` plus the option letters in `ValidateOptions` declaration order (`["numberTypeof"]` → `"NT"`).
// Unknown names are silently skipped, so the scanner / emitter must validate ahead of time.
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

// JsonStrategyFamilies maps a JSON "op|strategy" key to the cache family tags it composes. Op-qualified rather
// than keyed by the bare strategy token because encoder and decoder share strategy NAMES: `compact` is both, and
// composes different primitives (cj vs cjr). Shared by the scanner (emit) and the emitter (demand), both of which
// hold the operation. Go-only, not mirrored to TS.
var JsonStrategyFamilies = map[string][]string{
	// `clone` is shape-derived (prepareForJsonClone builds a new value from the declared shape), so it strips
	// undeclared keys by construction: no separate strip pass or strip variant is needed.
	"jsonEncoder|clone":  {"pjs"},
	"jsonEncoder|mutate": {"pj"},
	// `compact` emits declared object props as a positional array (no key names);
	// cj is the encode walk, cjr the decode walk.
	"jsonEncoder|compact": {"cj"},
	"jsonDecoder|clone":   {"rjs"},
	"jsonDecoder|mutate":  {"rj"},
	"jsonDecoder|compact": {"cjr"},
}

// Per-entry virtual module settings (mirrored to TS via gen-ts-constants). Every cache entry — runtype node,
// type-fn factory, JSON composite, pure fn — is served as its own ES module
// `<EntryModulePrefix><basename><EntryModuleSuffix>` exporting one tuple under its binding name
// (entrymod.ExportName, `<EntryBindingPrefix><identifier-escaped basename>`). The SAME name binds the entry
// everywhere: the export, every import clause, and the call-site binding the rewrite injects.
// See internal/compiler/entrymodules.
const (
	// EntryModulePrefix is the INTERNAL render-time specifier scheme every entry module is named under
	// (`rtmod:/<basename>.js`). It never reaches a bundler or disk: the resolver relativizes every occurrence to
	// a real relative path (post-render for inter-module imports, post-Apply for imports injected into user
	// files). A scheme rather than a path keeps rendered module text location-independent and the corpus stable.
	EntryModulePrefix = "rtmod:/"
	// EntryModuleSuffix terminates every entry-module specifier; the .js extension keeps downstream tooling (and
	// import-analysis fast paths) treating the virtual id as plain JS.
	EntryModuleSuffix = ".js"
	// EntryBindingPrefix prefixes every entry's binding name, the module's export AND the import binding the
	// rewrite injects into user files; the leading double-underscore keeps collisions with user identifiers
	// implausible.
	EntryBindingPrefix = "__rt_"
	// PureFnModuleDir is the basename directory prefix for pure-fn entry modules (`pf/<ns>/<fn>`), keeping them
	// distinct from the hash-keyed runtype / type-fn modules.
	PureFnModuleDir = "pf"
	// PureFnHashPrefix joins a pure-fn id's owning package to its body hash: `@acme/text#pf_9Zt1bRm4cVaPqL`.
	// One spelling on both sides: the build writes it into every id, a consumer's compiler splits ids on it.
	// A package name holds no `#`, so the last occurrence always splits an id.
	PureFnHashPrefix = "#pf_"
	// PureFnArtifactDir is what every mion build writes into its output dir: its own `pf/` cache modules
	// (`<package>/<hash>.js`, as generate wrote them) plus the index below. A consumer's compiler serves an
	// installed package's pure fns from here alone, never its bundle, and `files: ["dist"]` ships it.
	PureFnArtifactDir = "mion-pure-fns"
	// PureFnArtifactIndexFile lists every shipped id with its binding name and source file: a `.d.ts` import
	// carries a name, never an id, and is resolved through it.
	PureFnArtifactIndexFile = "index.json"
	// RpcModuleDir holds the batch transport under the output root: `rpc/batches.generated.js` (the batch table
	// the server registers) plus `rpc/pf/<ns>/<fn>.js` (the inline inputFrom mappers it imports). Generated by
	// the SERVER build from the batch source program (its own, or the `clientTsconfig` one), so the server owns
	// every file it loads and never reads a client tree.
	RpcModuleDir = "rpc"
	// ApiModuleDir holds what a mion CLIENT build bundles under `bundleApi`: one module per route or middleware the
	// program calls (`api/m/<id>.js`, its metadata plus the compiled function tuples it imports from the client
	// mirror under `api/types/`), one module per dispatch-site shape (`api/s/<id>.js`, the route with its
	// middleware chain, or the union a batch runs) and `api/manifest.json`, the id table `mion api-check` compares
	// against the server's.
	ApiModuleDir = "api"
	// ApiManifestFile is the id manifest's name under ApiModuleDir, written by BOTH builds: the server's from its
	// initRoutes call, the client's from the routes it bundled.
	ApiManifestFile = "manifest.json"
	// ApiLaneFile is the BASENAME of the module a CLIENT build writes under ApiModuleDir to put the client on the
	// lane it compiled for: it calls `setBundleApiMode` and is imported for its side effect into every file
	// calling `initClient`, the way the batch table reaches a server. The lane is a build option, so the build is
	// the one place it is set.
	ApiLaneFile = "lane"
	// ApiModulePrefix is the render-time specifier scheme for a bundled API module (`rtapi:/s/<id>.js`), the
	// sibling of EntryModulePrefix: the transform imports it at a dispatch site, and the relativizers that turn
	// `rtmod:/` into a path under <outDir>/types turn this one into a path under <outDir>/api.
	ApiModulePrefix = "rtapi:/"
	// BatchesModuleFile is the batch table module's name under RpcModuleDir.
	BatchesModuleFile = "batches.generated.js"
	// RpcModulePrefix is the render-time specifier scheme for the batch transport module
	// (`rtrpc:/batches.generated.js`): the transform appends `import 'rtrpc:/…'` to every module that creates the
	// router, and the relativizers that turn `rtmod:/` into a path under <outDir>/types turn this one into a path
	// under <outDir>/rpc.
	RpcModulePrefix = "rtrpc:/"
	// RunTypesBundleBasename names the SINGLE runtype data module (`rtmod:/runtypes.js`): every
	// reflection-demanded node lives there as one tuple row, deduplicated app-wide, with per-root facade modules
	// aliasing into it. Unlike every other entry module it is NOT content-addressed, so a host invalidates it
	// when a scan reports addedRunTypes. The name cannot collide with hash-keyed basenames (hash ids are short)
	// or pure-fn basenames (always under PureFnModuleDir).
	RunTypesBundleBasename = "runtypes"
	// FnsBundleDir is the basename directory prefix for per-family fn-entry bundle modules in allSingle mode
	// (`fns/<familyTag>`): every entry of a family rides the family's bundle as a NAMED export
	// (`export const <BindingName(key)>=[…]`) instead of its own module.
	FnsBundleDir = "fns"
)

// ModuleMode selects how cache entries are grouped into virtual modules. Mirrored to TS so the plugin option
// validates against the same set.
const (
	// ModuleModeDefault — runtype nodes ride THE single data bundle (plus per-root facade modules); every
	// fn-family / composite / pure-fn entry is its own per-entry module.
	ModuleModeDefault = "default"
	// ModuleModeAllSingle — bundle EVERYTHING: one bundle module per family tag (`fns/<tag>`), one `pf` bundle
	// for pure fns, and the reflection facades folded into the runtypes bundle as named exports. Fewest modules;
	// family bundles are mutable, so they invalidate on the Added* flags.
	ModuleModeAllSingle = "allSingle"
	// ModuleModeAllModules — split EVERYTHING: fn entries per-entry as in default, AND runtype nodes as
	// individual per-node modules. Escape hatch; measured slower on dense reflection graphs.
	ModuleModeAllModules = "allModules"
)

// BundleApiMode is the client build's `bundleApi` option: whether the metadata and compiled functions of the
// routes a mion client calls are bundled in at build time. The --bundle-api CLI flag, the tsconfig plugin key and
// the devtools option validate against this set; the value is injected at the client's initClient site so the
// runtime picks the matching lane.
type BundleApiMode string

const (
	// BundleApiOff (the default) bundles nothing: the client fetches its metadata from the server on first use.
	BundleApiOff BundleApiMode = ""
	// BundleApiBundled bundles every route the program calls; the client never asks the server for metadata and
	// refuses a route it did not bundle.
	BundleApiBundled BundleApiMode = "bundled"
	// BundleApiMixed bundles the same set, and the client still fetches the routes the bundle lacks.
	BundleApiMixed BundleApiMode = "mixed"
)

// Enabled reports whether the client lane bundles anything.
func (mode BundleApiMode) Enabled() bool {
	return mode == BundleApiBundled || mode == BundleApiMixed
}

func (mode BundleApiMode) Valid() bool {
	return mode == BundleApiOff || mode.Enabled()
}

// EmitMode selects what each compiled fn entry ships in its code/factory slots; the --emit-mode CLI flag and the
// plugin's `emitMode` option validate against this set. NOT mirrored to TS (the plugin hard-codes the three
// string literals on its option type); the runtime reads only what the slots carry, never the mode itself.
type EmitMode string

const (
	// EmitCode (the default) ships only the body `code` string; the createRTFn slot is the `u` placeholder and
	// the runtime rebuilds the factory via `new Function('utl', code)` on first lookup.
	EmitCode EmitMode = "code"
	// EmitFunctions ships only the live `function g_<hash>(utl){…}` factory, with an `undefined` code slot: the
	// runtime uses the factory directly and derives the code string from `createRTFn.toString()` only if a
	// consumer reads it. Smallest factory-bearing output, since the body never ships twice.
	EmitFunctions EmitMode = "functions"
	// EmitBoth ships the code string AND the live factory (the body twice), for runtimes that disallow
	// `new Function` (CSP) yet still read `.code`.
	EmitBoth EmitMode = "both"
)

// EmitsCode reports whether the code-string slot is populated; the zero value ("") behaves as EmitCode, so a
// RenderOpts{} default emits the code string.
func (mode EmitMode) EmitsCode() bool {
	return mode == EmitCode || mode == EmitBoth || mode == ""
}

// EmitsFactory reports whether the live createRTFn factory slot is populated.
func (mode EmitMode) EmitsFactory() bool {
	return mode == EmitFunctions || mode == EmitBoth
}

// Valid reports whether mode is one of the three known values, for the --emit-mode flag.
func (mode EmitMode) Valid() bool {
	return mode == EmitCode || mode == EmitFunctions || mode == EmitBoth
}

// InlineMode selects the child-inlining policy DefaultIsRTInlined applies to compound nodes; exposed as the
// --inline-mode flag and the plugin's inlineMode option, validated Go-side and NOT mirrored to TS.
type InlineMode string

const (
	// InlineModeDefault — the name rule: UNNAMED compounds (arrays, tuples, object literals, unions, classes)
	// inline into their parents, with statement bodies hoisted to context fns at expression slots, while NAMED
	// types (alias or interface) and circular types stay external as dedupe-worthy shared entries. Date/Temporal
	// builtins always inline (atomic single-expression emits). The zero value behaves identically.
	InlineModeDefault InlineMode = "default"
	// InlineModeAllInternal — EVERYTHING except circular types inlines, names ignored: one function per
	// call-site type per family.
	InlineModeAllInternal InlineMode = "allInternal"
)

// AllInternal reports whether the name-blind everything-inlines mode is on.
func (mode InlineMode) AllInternal() bool { return mode == InlineModeAllInternal }

// Valid reports whether mode is a recognised value; "" counts as default, so a zero-valued RenderOpts behaves
// like production.
func (mode InlineMode) Valid() bool {
	return mode == InlineModeDefault || mode == InlineModeAllInternal || mode == ""
}

// Pattern mockSample auto-generation defaults. A format pattern with no declared mockSamples gets them generated
// at build time by the JS engine, deterministic per pattern; both knobs are overridable by a CLI flag / plugin
// option and fold into the disk fingerprint.
const (
	// DefaultPatternSampleCount is how many samples generation aims for per pattern (0 disables it entirely).
	DefaultPatternSampleCount = 100
	// DefaultPatternSampleRetries is the per-sample draw multiplier: the budget is count × retries draws, and
	// only a budget yielding zero surviving values fails the build.
	DefaultPatternSampleRetries = 10
)

// Tuple slot-0 kind discriminators for entry-module tuples. Type-fn entries carry their QUOTED family tag in
// slot 0 instead of a number, so the runtime discriminates with `typeof t[0] === 'string'`.
const (
	TupleKindRunType       = 0
	TupleKindPureFn        = 2
	TupleKindMissing       = 3
	TupleKindRunTypeBundle = 4
	TupleKindRunTypeFacade = 5
)

// JsonCompositeHostTags maps each JSON-composite family tag to the family whose runtime entry metadata (fnID /
// args / defaultParamValues) the composite borrows: encoder strategies borrow prepareForJson, decoder strategies
// restoreFromJsonMutate. The TS-side familyMeta table (entryTuple.ts) mirrors this mapping by hand.
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
// It is embedded into the typeID hashing input (internal/cachegen/runtype.assignID), so the same structural type
// hashes differently across binary versions and any on-disk cache keyed by typeID is version-isolated without a
// per-version directory. Defaults to "dev" locally; the publish script overrides it from the root package.json.
var Version = "dev"

// TsgoVersion records the pinned tsgolint / typescript-go revision the binary was built against, injected at
// build time via
//
//	-ldflags "-X github.com/mionkit/mion/ts-go-runtypes/internal/constants.TsgoVersion=<rev>"
//
// Unlike Version it is PURE METADATA, never folded into the typeID hash: the bundled checker revision must not
// perturb cache keys. Reported by the binary's --version flag and recorded in the launcher package.json's "tsgo"
// field, so the TypeScript baseline stays discoverable without entering the semver contract. "dev" locally.
var TsgoVersion = "dev"
