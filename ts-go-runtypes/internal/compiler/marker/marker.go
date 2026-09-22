// Package marker detects whether a TypeScript type is one of the marker brands (one Kind each,
// listed below). Detection is two-layered: the alias' symbol name must match the spec's name, AND
// the alias must be declared in an accepted package, so a user's own `type InjectRunTypeId<T> = …`
// never triggers rewrites. Options.Packages ADDS accepted packages (the default is always kept, so
// the knob can never take working markers away); Options.SkipPackageCheck drops layer 2 altogether.
package marker

import (
	"encoding/json"
	"os"
	"strings"
	"sync"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/microsoft/typescript-go/shim/tspath"
	vfspkg "github.com/microsoft/typescript-go/shim/vfs"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/textpos"
)

// Kind enumerates the marker brands the scanner knows about.
type Kind int

const (
	// KindInjectRunTypeId is the trailing-id injection marker.
	KindInjectRunTypeId Kind = iota
	// KindCompTimeArgs requires the argument to be a literal at the call
	// site or via a module-scope const-of-literals chain.
	KindCompTimeArgs
	// KindPureFunction requires the argument to be an inline function
	// definition that passes the purity rules.
	KindPureFunction
	// KindInjectTypeFnArgs is the createX trailing-slot marker: a second type-arg (Fn) names the
	// function, so the transformer injects a `[typeId, fnId]` tuple and the backend emits only the
	// demanded function family.
	KindInjectTypeFnArgs
	// KindCompTimeFnArgs brands the parameter whose literal value selects the createX function
	// variant. Same literal-only validation as KindCompTimeArgs, and it names the parameter the
	// scanner reads when computing the injected fnHash.
	KindCompTimeFnArgs
	// KindInjectPureFnId (InjectPureFnId<F>) rides the callee signature so it propagates through
	// wrappers; the injected value is the id of the sibling PureFunction<F> registration (its
	// package, its file, the name it is bound to). The purefunctions extractor splices the id in;
	// the resolver's marker walk does not inject for it, so it carries no scanCall case.
	KindInjectPureFnId
	// KindPureFunctionFactory brands a FACTORY argument `(utl) => fn` (the registerPureFnFactory
	// lane). Same inline + purity rules as KindPureFunction, but the extractor emits the factory
	// AS-IS, where the DIRECT KindPureFunction argument is wrapped into `() => fn`. The marker on
	// the pure-fn parameter is what carries the factory-vs-direct intent through a wrapper.
	KindPureFunctionFactory
	// KindCompTimeHints marks a parameter the build READS best-effort but never validates — the
	// lenient sibling of KindCompTimeArgs. A dynamic argument stays legal and is simply invisible:
	// no CTA0xx enforcement, no fn-variant selection, nothing folds into any id. Identity alias like
	// CompTimeArgs, so detection is syntactic. Current reader: createMockDataFn's options bag.
	KindCompTimeHints
	// KindInjectBatchId (InjectBatchId<Routes>) rides the callee signature like KindInjectPureFnId;
	// the injected value is a deterministic `"b_<hash>"` id over the ORDERED route ids the sibling
	// `[...Routes]` argument names. The batches extractor splices it in, so no scanCall case.
	KindInjectBatchId
	// KindInjectApiMetadata (InjectApiMetadata<Api, Id>) brands the trailing parameter of a client
	// dispatch point (`.call()`, `.prefill()`, `.typeErrors()`, a batch's `.call()`) and, without an
	// Id, of `initClient`. The apimeta lane reads the API type and the route id off the alias's type
	// arguments and fills the slot with an import of the generated metadata module. No scanCall case.
	KindInjectApiMetadata
	// KindInjectBuildVersion (InjectBuildVersion<Api>) rides the trailing parameter of `initRoutes` and
	// `initClient`: a hash over the compiled ids of every method the Api declares, so both ends of one API
	// agree and a changed route type disagrees. No scanCall case, the apiversion extractor splices it in.
	KindInjectBuildVersion
	// KindPureFnId (PureFnId<ID>) brands the VALUE a pure-fn registrar returns, not an injection (no
	// scanCall case): it is what lets a build recognise an id handed to a `CompTimeArgs<PureFnId>`
	// lookup when the value comes from a call or from a `.d.ts` with no initializer to read.
	KindPureFnId
)

// DefaultName is the symbol name of the id-injection marker.
const DefaultName = "InjectRunTypeId"

// DefaultInjectTypeFnArgsName is the symbol name of the createX trailing-slot marker.
const DefaultInjectTypeFnArgsName = "InjectTypeFnArgs"

// DefaultCompTimeArgsName is the symbol name of the CompTimeArgs brand.
const DefaultCompTimeArgsName = "CompTimeArgs"

// DefaultCompTimeFnArgsName is the symbol name of the fn-selecting variant of CompTimeArgs.
const DefaultCompTimeFnArgsName = "CompTimeFnArgs"

// DefaultCompTimeHintsName is the symbol name of the lenient, read-only sibling of CompTimeArgs.
const DefaultCompTimeHintsName = "CompTimeHints"

// DefaultPureFunctionName is the symbol name of the DIRECT pure-fn brand.
const DefaultPureFunctionName = "PureFunction"

// DefaultPureFunctionFactoryName is the symbol name of the `(utl) => fn` FACTORY brand.
const DefaultPureFunctionFactoryName = "PureFunctionFactory"

// DefaultInjectPureFnIdName is the symbol name of the pure-fn id injection marker.
const DefaultInjectPureFnIdName = "InjectPureFnId"

// DefaultPureFnIdName is the symbol name of the branded id a pure-fn registrar returns.
const DefaultPureFnIdName = "PureFnId"

// DefaultInjectBatchIdName is the symbol name of the request-batch id injection marker.
const DefaultInjectBatchIdName = "InjectBatchId"

// DefaultInjectApiMetadataName is the symbol name of the client's API metadata injection marker.
const DefaultInjectApiMetadataName = "InjectApiMetadata"

// DefaultInjectBuildVersionName is the symbol name of the API build version injection marker.
const DefaultInjectBuildVersionName = "InjectBuildVersion"

// DefaultModule is the package the marker types must be declared in.
const DefaultModule = "@mionjs/run-types"

// Spec describes a single marker the scanner should recognise.
type Spec struct {
	// Name is the symbol name of the marker type alias.
	Name string
	// Module is the package the alias is declared in: either inside `declare module "<Module>"`
	// (ambient form, synthetic test fixtures) or in a file whose enclosing package.json `"name"` is
	// <Module> (real packages, workspace or installed).
	Module string
	// Kind is the marker family this spec maps to.
	Kind Kind
	// BrandProperty is the phantom brand property on the alias, a fallback for when alias info is
	// lost (CompTimeArgs<A | B> distributes its intersection over the union, dropping the alias name
	// while the brand survives on every member). Empty disables the fallback.
	BrandProperty string
}

// Brand property names per marker kind, kept in sync with packages/run-types/src/markers.ts.
const (
	BrandInjectRunTypeId     = "__rtInjectRunTypeIdBrand"
	BrandCompTimeArgs        = "__rtCompTimeArgsBrand"
	BrandCompTimeFnArgs      = "__rtCompTimeFnArgsBrand"
	BrandPureFunction        = "__rtPureFunctionBrand"
	BrandPureFunctionFactory = "__rtPureFunctionFactoryBrand"
	BrandInjectTypeFnArgs    = "__rtInjectTypeFnArgsBrand"
	BrandInjectPureFnId      = "__rtInjectPureFnIdBrand"
	BrandInjectBatchId       = "__rtInjectBatchIdBrand"
	BrandInjectApiMetadata   = "__rtInjectApiMetadataBrand"
	BrandInjectBuildVersion  = "__rtInjectBuildVersionBrand"
	BrandPureFnId            = "__rtPureFnIdBrand"
)

// DefaultSpecs returns the canonical marker set: one spec per supported
// Kind, all sourced from DefaultModule.
func DefaultSpecs() []Spec {
	return []Spec{
		{Name: DefaultName, Module: DefaultModule, Kind: KindInjectRunTypeId, BrandProperty: BrandInjectRunTypeId},
		{Name: DefaultCompTimeArgsName, Module: DefaultModule, Kind: KindCompTimeArgs, BrandProperty: BrandCompTimeArgs},
		{Name: DefaultCompTimeFnArgsName, Module: DefaultModule, Kind: KindCompTimeFnArgs, BrandProperty: BrandCompTimeFnArgs},
		{Name: DefaultPureFunctionName, Module: DefaultModule, Kind: KindPureFunction, BrandProperty: BrandPureFunction},
		{Name: DefaultPureFunctionFactoryName, Module: DefaultModule, Kind: KindPureFunctionFactory, BrandProperty: BrandPureFunctionFactory},
		{Name: DefaultInjectTypeFnArgsName, Module: DefaultModule, Kind: KindInjectTypeFnArgs, BrandProperty: BrandInjectTypeFnArgs},
		{Name: DefaultInjectPureFnIdName, Module: DefaultModule, Kind: KindInjectPureFnId, BrandProperty: BrandInjectPureFnId},
		{Name: DefaultInjectBatchIdName, Module: DefaultModule, Kind: KindInjectBatchId, BrandProperty: BrandInjectBatchId},
		{Name: DefaultInjectApiMetadataName, Module: DefaultModule, Kind: KindInjectApiMetadata, BrandProperty: BrandInjectApiMetadata},
		{Name: DefaultInjectBuildVersionName, Module: DefaultModule, Kind: KindInjectBuildVersion, BrandProperty: BrandInjectBuildVersion},
		{Name: DefaultPureFnIdName, Module: DefaultModule, Kind: KindPureFnId, BrandProperty: BrandPureFnId},
		// CompTimeHints is an identity alias with no phantom brand, so detection is syntactic instead
		// (the comptimeargs node check) and BrandProperty stays empty.
		{Name: DefaultCompTimeHintsName, Module: DefaultModule, Kind: KindCompTimeHints},
	}
}

// Options configures marker detection: Specs is the marker set, Packages and SkipPackageCheck the
// project-configurable module-of-origin gate every spec is matched through (tsconfig `markers`, the
// bundler plugin's `markers` option and --marker-packages / --no-marker-package-check land here).
type Options struct {
	// Specs, when non-empty, replaces the entire marker set; empty means DefaultSpecs().
	Specs []Spec
	// Packages names ADDITIONAL packages allowed to declare the marker types, on top of each spec's
	// own Module. Purely additive by design, so the knob can never silently take a working call site
	// away. Ignored when SkipPackageCheck is set.
	Packages []string
	// SkipPackageCheck drops the module-of-origin gate entirely — a type is a marker on its NAME
	// alone. The escape hatch for setups the package gate cannot express; it also means any local
	// `type InjectRunTypeId<T> = …` starts driving rewrites, so prefer Packages.
	SkipPackageCheck bool
	// FS is the virtual filesystem the package-name gate reads package.json through. A marker
	// declared in an OVERLAY / in-memory node_modules package (the wasm playground, test overlays)
	// is invisible to os.ReadFile, so without this the gate fails and the marker's type argument is
	// lost (T resolves to `unknown`). nil falls back to os.ReadFile.
	FS vfspkg.FS
	// Cwd is the working directory a path is reported relative to when a file belongs to no NAMED
	// package (an overlay, a scratch project). Empty reports the path as-is, minus its leading slash.
	Cwd string
	// PureFnBindings resolves a name declared in a `.d.ts` to the pure-fn id the declaring package's
	// BUILT files register it under: a tsc-emitted `.d.ts` carries no id for a registration the build
	// injected one into. nil (no program, a test) leaves such a binding unresolved.
	PureFnBindings PureFnBindingResolver
}

// PureFnBindingResolver answers Options.PureFnBindings; the index over a built
// package's compiled files implements it.
type PureFnBindingResolver interface {
	BindingID(dtsPath, name string) (id string, ok bool)
	// UnbuiltPackage names the `.d.ts`'s package when it ships no compiled pure fns and no sources: PFE9016, not an unreadable dep.
	UnbuiltPackage(dtsPath string) (name string, unbuilt bool)
}

// WithDefaults populates Specs from DefaultSpecs() when empty.
func WithDefaults(opts Options) Options {
	if len(opts.Specs) == 0 {
		opts.Specs = DefaultSpecs()
	}
	return opts
}

// PackageSet returns every package name accepted as a marker declaration site:
// each spec's own Module plus Options.Packages, deduped, in that order. Empty
// Specs fall back to DefaultModule so a zero-value Options still gates on the
// real marker package rather than on nothing.
func (opts Options) PackageSet() []string {
	packages := make([]string, 0, len(opts.Specs)+len(opts.Packages)+1)
	seen := map[string]bool{}
	// Trim here rather than trusting callers: Packages arrives from a tsconfig array and a bundler
	// option too, and a stray " " would become a package name nothing can ever match.
	add := func(name string) {
		name = strings.TrimSpace(name)
		if name == "" || seen[name] {
			return
		}
		seen[name] = true
		packages = append(packages, name)
	}
	if len(opts.Specs) == 0 {
		add(DefaultModule)
	}
	for _, spec := range opts.Specs {
		add(spec.Module)
	}
	for _, name := range opts.Packages {
		add(name)
	}
	return packages
}

// DeclaredInMarkerPackage reports whether symbol satisfies the module-of-origin gate: declared in
// any package from PackageSet, or anywhere at all when SkipPackageCheck is set. Every caller asking
// "did the marker package declare this?" goes through here (the marker scanner, the builders'
// RunType recognition, DataOnly, the enrichment AST check), so a project's configured packages can
// never reach some of them and miss others.
func (opts Options) DeclaredInMarkerPackage(symbol *ast.Symbol) bool {
	if symbol == nil {
		return false
	}
	if opts.SkipPackageCheck {
		return true
	}
	return DeclaredInAnyModule(symbol, opts.PackageSet(), opts.FS)
}

// DetectAny matches a parameter type against every configured marker spec, returning the matching
// Kind and the brand's type argument. With a non-nil typeChecker, a failed alias-name match falls
// back to the spec's BrandProperty: CompTimeArgs<A|B> distributes the intersection over the union,
// which drops the alias name while the brand property survives on each member.
func DetectAny(typeChecker *checker.Checker, paramType *checker.Type, opts Options) (Kind, *checker.Type, bool) {
	if paramType == nil {
		return 0, nil, false
	}
	opts = WithDefaults(opts)
	for _, spec := range opts.Specs {
		if typeArgument, ok := matchAliasSpec(paramType, spec, opts); ok {
			return spec.Kind, typeArgument, true
		}
		if checker.Type_flags(paramType)&checker.TypeFlagsUnion != 0 {
			for _, member := range paramType.Types() {
				if typeArgument, ok := matchAliasSpec(member, spec, opts); ok {
					return spec.Kind, typeArgument, true
				}
			}
		}
		if typeChecker != nil && spec.BrandProperty != "" {
			if matchedByBrand(typeChecker, paramType, spec) {
				return spec.Kind, nil, true
			}
		}
	}
	return 0, nil, false
}

// NearMiss describes a type whose alias NAME is exactly a marker's but whose
// declaration failed the module-of-origin gate: the marker the user clearly
// meant, and the package that actually declared it.
type NearMiss struct {
	// MarkerName is the marker spec's name (e.g. "InjectRunTypeId").
	MarkerName string
	// DeclaringModule is the package the alias was declared in, "" when the
	// declaration belongs to no package at all.
	DeclaringModule string
}

// DetectNearMiss reports a type that LOOKS like a marker but was rejected by the package gate. Only
// consult it when DetectAny found nothing: a name match plus a gate failure is the one shape that
// silently costs the user their type argument (the call still emits a site, reflecting `unknown`).
// It deliberately stays silent when SkipPackageCheck is set, and when the alias came from the SAME
// package as the file using it — a project's own local brand, exactly what the gate keeps inert.
func DetectNearMiss(paramType *checker.Type, opts Options, usingFileModule string) (NearMiss, bool) {
	if paramType == nil || opts.SkipPackageCheck {
		return NearMiss{}, false
	}
	opts = WithDefaults(opts)
	candidates := []*checker.Type{paramType}
	if checker.Type_flags(paramType)&checker.TypeFlagsUnion != 0 {
		candidates = append(candidates, paramType.Types()...)
	}
	for _, candidate := range candidates {
		alias := checker.Type_alias(candidate)
		if alias == nil {
			continue
		}
		symbol := alias.Symbol()
		if symbol == nil {
			continue
		}
		for _, spec := range opts.Specs {
			if symbol.Name != spec.Name || opts.DeclaredInMarkerPackage(symbol) {
				continue
			}
			declaringModule := declaringModuleOfSymbol(symbol, opts.FS)
			if declaringModule == "" || declaringModule == usingFileModule {
				continue
			}
			return NearMiss{MarkerName: spec.Name, DeclaringModule: declaringModule}, true
		}
	}
	return NearMiss{}, false
}

// declaringModuleOfSymbol returns the module of symbol's first declaration that
// belongs to one — the ambient `declare module` name, else the enclosing
// package.json `"name"`.
func declaringModuleOfSymbol(symbol *ast.Symbol, fs vfspkg.FS) string {
	for _, declaration := range symbol.Declarations {
		if module := DeclaringModuleOfNode(declaration, fs); module != "" {
			return module
		}
	}
	return ""
}

// matchedByBrand reports whether paramType (or any union member) carries spec's brand property —
// the last-resort fallback for an alias name lost to intersection-over-union distribution.
func matchedByBrand(typeChecker *checker.Checker, paramType *checker.Type, spec Spec) bool {
	if checker.Type_flags(paramType)&checker.TypeFlagsUnion != 0 {
		for _, member := range paramType.Types() {
			if hasBrandProperty(typeChecker, member, spec.BrandProperty) {
				return true
			}
		}
		return false
	}
	return hasBrandProperty(typeChecker, paramType, spec.BrandProperty)
}

func hasBrandProperty(typeChecker *checker.Checker, tsType *checker.Type, brandProperty string) bool {
	if tsType == nil {
		return false
	}
	return checker.Checker_getPropertyOfType(typeChecker, tsType, brandProperty) != nil
}

func specForKind(specs []Spec, kind Kind) (Spec, bool) {
	for _, spec := range specs {
		if spec.Kind == kind {
			return spec, true
		}
	}
	return Spec{}, false
}

// SpecForKind returns the spec for kind from opts. Exposed for type-NODE based detection: the
// identity definition `type CompTimeArgs<T> = T` drops the alias from the resolved type, so that
// marker is detected off the parameter's written `CompTimeArgs<…>` annotation instead.
func SpecForKind(opts Options, kind Kind) (Spec, bool) {
	return specForKind(WithDefaults(opts).Specs, kind)
}

// aliasForSpec returns tsType's alias when its symbol name and declaring module match spec — the
// shared first layer of every alias-based marker match.
func aliasForSpec(tsType *checker.Type, spec Spec, opts Options) (*checker.TypeAlias, bool) {
	alias := checker.Type_alias(tsType)
	if alias == nil {
		return nil, false
	}
	symbol := alias.Symbol()
	if symbol == nil || symbol.Name != spec.Name {
		return nil, false
	}
	if !opts.DeclaredInMarkerPackage(symbol) {
		return nil, false
	}
	return alias, true
}

func matchAliasSpec(tsType *checker.Type, spec Spec, opts Options) (*checker.Type, bool) {
	alias, ok := aliasForSpec(tsType, spec, opts)
	if !ok {
		return nil, false
	}
	typeArguments := alias.TypeArguments()
	if len(typeArguments) == 0 {
		return nil, false
	}
	return typeArguments[0], true
}

// FnKeysForInjectTypeFnArgs returns the string-literal Fn type-arguments (every argument after `T`)
// of an InjectTypeFnArgs<T, F1, F2, …> alias, in declaration order — one fnId per named family at a
// createX call site. ok is false when paramType is not that alias or no Fn argument is a literal.
func FnKeysForInjectTypeFnArgs(typeChecker *checker.Checker, paramType *checker.Type, opts Options) ([]string, bool) {
	if paramType == nil {
		return nil, false
	}
	opts = WithDefaults(opts)
	spec, found := specForKind(opts.Specs, KindInjectTypeFnArgs)
	if !found {
		return nil, false
	}
	if keys, ok := fnKeysFromAlias(paramType, spec, opts); ok {
		return keys, true
	}
	// An optional `id?:` parameter resolves to `InjectTypeFnArgs<…> | undefined`, so the alias rides
	// on the non-undefined union member — mirror DetectAny's union-member walk to find it.
	if checker.Type_flags(paramType)&checker.TypeFlagsUnion != 0 {
		for _, member := range paramType.Types() {
			if keys, ok := fnKeysFromAlias(member, spec, opts); ok {
				return keys, true
			}
		}
	}
	return nil, false
}

// fnKeysFromAlias reads the Fn type-arguments of an InjectTypeFnArgs alias as string-literal values.
// Non-literal slots (the `never`-defaulted F2/F3 when the caller supplied fewer keys) are skipped,
// so one reader handles every arity. ok is false without at least one string-literal Fn argument.
func fnKeysFromAlias(tsType *checker.Type, spec Spec, opts Options) ([]string, bool) {
	alias, ok := aliasForSpec(tsType, spec, opts)
	if !ok {
		return nil, false
	}
	typeArguments := alias.TypeArguments()
	if len(typeArguments) < 2 {
		return nil, false
	}
	var keys []string
	for _, fnType := range typeArguments[1:] {
		if fnType == nil || checker.Type_flags(fnType)&checker.TypeFlagsStringLiteral == 0 {
			continue
		}
		value, ok := fnType.AsLiteralType().Value().(string)
		if !ok {
			continue
		}
		keys = append(keys, value)
	}
	if len(keys) == 0 {
		return nil, false
	}
	return keys, true
}

// ApiMetadataArgs reads the two type arguments of an InjectApiMetadata<Api, Id> alias: the API type
// and the Id (a string literal, a union of them for a batch, `string` when a generic helper widened
// it). The initClient anchor writes no Id, so id is nil there. An optional `apiMetadata?:` parameter
// resolves to a union, so its members are walked exactly like FnKeysForInjectTypeFnArgs.
func ApiMetadataArgs(paramType *checker.Type, opts Options) (api *checker.Type, id *checker.Type, ok bool) {
	if paramType == nil {
		return nil, nil, false
	}
	opts = WithDefaults(opts)
	spec, found := specForKind(opts.Specs, KindInjectApiMetadata)
	if !found {
		return nil, nil, false
	}
	if api, id, ok = apiMetadataArgsFromAlias(paramType, spec, opts); ok {
		return api, id, true
	}
	if checker.Type_flags(paramType)&checker.TypeFlagsUnion != 0 {
		for _, member := range paramType.Types() {
			if api, id, ok = apiMetadataArgsFromAlias(member, spec, opts); ok {
				return api, id, true
			}
		}
	}
	return nil, nil, false
}

func apiMetadataArgsFromAlias(tsType *checker.Type, spec Spec, opts Options) (*checker.Type, *checker.Type, bool) {
	alias, ok := aliasForSpec(tsType, spec, opts)
	if !ok {
		return nil, nil, false
	}
	typeArguments := alias.TypeArguments()
	if len(typeArguments) == 0 || typeArguments[0] == nil {
		return nil, nil, false
	}
	if len(typeArguments) == 1 {
		return typeArguments[0], nil, true
	}
	return typeArguments[0], typeArguments[1], true
}

// IsFreeTypeParameter reports whether tsType is a still-unresolved type parameter (the marker's `T`
// inside a generic wrapper body). Such a site must be skipped: there is no id to inject.
func IsFreeTypeParameter(tsType *checker.Type) bool {
	if tsType == nil {
		return false
	}
	return checker.Type_flags(tsType)&checker.TypeFlagsTypeParameter != 0
}

// IsErrorLikeAny reports whether tsType is an `any` the AUTHOR DID NOT WRITE: the checker's own
// error type, produced when a written type name fails to resolve. It mirrors tsgo's unexported
// checker.isErrorType — the error type is the intrinsic named "error" (a deliberate `any` is the
// intrinsic named "any"), and the only OTHER any-flagged types carrying an alias are the ones the
// checker manufactures for a reference to an unresolved alias symbol, error-like too.
func IsErrorLikeAny(tsType *checker.Type) bool {
	if tsType == nil || tsType.Flags()&checker.TypeFlagsAny == 0 {
		return false
	}
	if tsType.Alias() != nil {
		return true
	}
	// Alias-free any-flagged types are all intrinsics; the checker creates no other kind.
	return tsType.AsIntrinsicType().IntrinsicName() == "error"
}

// freeParamScanDepth bounds FindFreeTypeParameter's walk. The bound, not the visited set, is what
// terminates on a self-instantiating generic, whose fresh per-level types never repeat — those are
// reported separately by the structural-id depth backstop (MKR009).
const freeParamScanDepth = 64

// freeParamMaxHops caps the named-type breadcrumbs carried on the diagnostic so
// a deep chain stays readable (the param declaration is always included).
const freeParamMaxHops = 3

// FreeTypeParamFinding describes one still-unresolved type parameter found in a marker type
// argument's graph. Related holds the parameter's DECLARATION first, then up to freeParamMaxHops
// named-type hops the walk passed through, outermost first.
type FreeTypeParamFinding struct {
	ParamName string
	Related   []diagnostics.Related
}

// FindFreeTypeParameter walks the DATA-reachable positions of tsType and reports the first
// still-unresolved type parameter (`A<T>`, `T[]`, `{a: T}` inside a generic body). Such a type must
// be rejected at the marker call (MKR010): the free parameter takes a different type at every call
// site of the surrounding generic, so a single build-time id would alias them all.
//
// NOTE the checker applies type-parameter DEFAULTS at use sites before we see the type, so a bare
// defaulted generic never reaches this walk, while `A<T>` under `function f<T = string>` still does.
// Signature INTERIORS are exempt: a function-typed property is dropped from the data projection, and
// a generic method's own parameters bind per CALL — rejecting them would break `find<T>(): T[]`.
func FindFreeTypeParameter(typeChecker *checker.Checker, tsType *checker.Type) (FreeTypeParamFinding, bool) {
	return findFreeTypeParameter(typeChecker, tsType, map[*checker.Type]bool{}, nil, 0)
}

func findFreeTypeParameter(typeChecker *checker.Checker, tsType *checker.Type, visited map[*checker.Type]bool, hops []diagnostics.Related, depth int) (FreeTypeParamFinding, bool) {
	if tsType == nil || depth > freeParamScanDepth || visited[tsType] {
		return FreeTypeParamFinding{}, false
	}
	visited[tsType] = true

	if IsFreeTypeParameter(tsType) {
		finding := FreeTypeParamFinding{}
		if symbol := tsType.Symbol(); symbol != nil {
			finding.ParamName = symbol.Name
			if site, ok := symbolDeclarationSite(symbol); ok {
				finding.Related = append(finding.Related, diagnostics.Related{
					Site:    site,
					Message: "type parameter `" + symbol.Name + "` is declared here — it has no binding at this call",
				})
			}
		}
		finding.Related = append(finding.Related, hops...)
		return finding, true
	}

	// Record a breadcrumb when descending THROUGH a named type, so a param found deeper down the
	// chain points at each link. Hop slices are capacity-capped on append so siblings never alias.
	if len(hops) < freeParamMaxHops {
		if hopName, hopSite, ok := namedTypeHop(tsType); ok {
			hops = append(hops[:len(hops):len(hops)], diagnostics.Related{
				Site:    hopSite,
				Message: "reached via `" + hopName + "`, declared here",
			})
		}
	}

	flags := checker.Type_flags(tsType)
	if flags&checker.TypeFlagsUnion != 0 {
		for _, member := range tsType.Distributed() {
			if finding, found := findFreeTypeParameter(typeChecker, member, visited, hops, depth+1); found {
				return finding, found
			}
		}
		return FreeTypeParamFinding{}, false
	}
	// Intersections fall through: GetPropertiesOfType below sees the combined members.
	if flags&(checker.TypeFlagsObject|checker.TypeFlagsIntersection) == 0 {
		return FreeTypeParamFinding{}, false
	}

	// GetTypeArguments panics on non-reference objects, so gate on the reference flag.
	if tsType.ObjectFlags()&checker.ObjectFlagsReference != 0 {
		for _, typeArgument := range typeChecker.GetTypeArguments(tsType) {
			if finding, found := findFreeTypeParameter(typeChecker, typeArgument, visited, hops, depth+1); found {
				return finding, found
			}
		}
	}
	for _, propertySymbol := range typeChecker.GetPropertiesOfType(tsType) {
		propertyType := typeChecker.GetTypeOfSymbol(propertySymbol)
		if propertyType == nil {
			continue
		}
		// Function-typed property / method — signature interior, exempt (see doc).
		if len(typeChecker.GetSignaturesOfType(propertyType, checker.SignatureKindCall)) > 0 &&
			len(typeChecker.GetPropertiesOfType(propertyType)) == 0 {
			continue
		}
		if finding, found := findFreeTypeParameter(typeChecker, propertyType, visited, hops, depth+1); found {
			return finding, found
		}
	}
	for _, indexInfo := range typeChecker.GetIndexInfosOfType(tsType) {
		if finding, found := findFreeTypeParameter(typeChecker, indexInfo.KeyType(), visited, hops, depth+1); found {
			return finding, found
		}
		if finding, found := findFreeTypeParameter(typeChecker, indexInfo.ValueType(), visited, hops, depth+1); found {
			return finding, found
		}
	}
	return FreeTypeParamFinding{}, false
}

// namedTypeHop returns the user-visible name + declaration site to record as a generics-chain
// breadcrumb; the alias name is preferred because an alias instantiation's own symbol is the
// anonymous literal. Mirrors the user-visible-name filtering in cachegen/runtype/typeid, replicated
// rather than imported so the two product areas stay apart for two tiny helpers.
func namedTypeHop(tsType *checker.Type) (string, diagnostics.Site, bool) {
	if alias := checker.Type_alias(tsType); alias != nil {
		if symbol := alias.Symbol(); symbol != nil && userVisibleTypeName(symbol.Name) {
			if site, ok := symbolDeclarationSite(symbol); ok {
				return symbol.Name, site, true
			}
		}
	}
	if symbol := tsType.Symbol(); symbol != nil && userVisibleTypeName(symbol.Name) {
		if site, ok := symbolDeclarationSite(symbol); ok {
			return symbol.Name, site, true
		}
	}
	return "", diagnostics.Site{}, false
}

// symbolDeclarationSite returns the line/col Site of a symbol's first resolvable declaration, named
// by the declaration's own file — it may live in a different file than the marker call.
func symbolDeclarationSite(symbol *ast.Symbol) (diagnostics.Site, bool) {
	for _, declaration := range symbol.Declarations {
		if declaration == nil {
			continue
		}
		sourceFile := ast.GetSourceFileOfNode(declaration)
		if sourceFile == nil {
			continue
		}
		return textpos.NodeSite(sourceFile.FileName(), sourceFile, declaration), true
	}
	return diagnostics.Site{}, false
}

// userVisibleTypeName rejects tsgo-internal symbol names (late-bound 0xFE
// prefix, "__type"/"__object" anonymous literals) that would make a useless
// breadcrumb.
func userVisibleTypeName(name string) bool {
	return name != "" && name[0] != 0xFE && !strings.HasPrefix(name, "__")
}

// DeclaredInModule reports whether symbol was declared inside the given module. Two forms count:
// the ambient `declare module "<module>"` (synthetic test fixtures with no on-disk package.json),
// and a file whose enclosing package.json declares `"name": "<module>"` — the directory name on disk
// is irrelevant, only `"name"`, which is how Node defines a package's identity and is what makes a
// workspace self-import work. `fs` is the resolver's virtual filesystem, so overlay / in-memory
// packages are recognised; nil falls back to os.ReadFile. The ambient form needs no filesystem.
func DeclaredInModule(symbol *ast.Symbol, module string, fs vfspkg.FS) bool {
	if module == "" {
		return false
	}
	return DeclaredInAnyModule(symbol, []string{module}, fs)
}

// DeclaredInAnyModule is DeclaredInModule over a SET of accepted module names. Each declaration's
// module resolves ONCE and is then compared against the set, so accepting N packages costs one
// package.json walk per declaration, not N.
func DeclaredInAnyModule(symbol *ast.Symbol, modules []string, fs vfspkg.FS) bool {
	if symbol == nil || len(modules) == 0 {
		return false
	}
	accepted := make(map[string]bool, len(modules))
	for _, module := range modules {
		if module != "" {
			accepted[module] = true
		}
	}
	if len(accepted) == 0 {
		return false
	}
	for _, declaration := range symbol.Declarations {
		if accepted[findAmbientModuleName(declaration)] {
			return true
		}
		sourceFile := ast.GetSourceFileOfNode(declaration)
		if sourceFile == nil {
			continue
		}
		if accepted[packageNameForFile(sourceFile.FileName(), fs)] {
			return true
		}
	}
	return false
}

// DeclaringModuleOfNode returns the module a declaration node belongs to: the nearest enclosing
// ambient `declare module "<name>"`, else the `"name"` of the nearest package.json above the node's
// source file. It is the read counterpart of DeclaredInModule (which checks a KNOWN module), for
// callers that must REPORT the module a callee was declared in. `fs` as in DeclaredInModule.
func DeclaringModuleOfNode(node *ast.Node, fs vfspkg.FS) string {
	if node == nil {
		return ""
	}
	if name := findAmbientModuleName(node); name != "" {
		return name
	}
	sourceFile := ast.GetSourceFileOfNode(node)
	if sourceFile == nil {
		return ""
	}
	return packageNameForFile(sourceFile.FileName(), fs)
}

// packageNameCache memoises directory→package-name for the on-disk walk, for the life of the
// process; "" is itself a cached answer. Only the nil-FS path is cached: an overlay's contents can
// change per setSources, so caching those by directory alone would risk cross-overlay staleness.
var packageNameCache sync.Map // map[string]packageOfDir

// packageOfDir is one cache row. Root is set whenever a package.json was found, even a nameless one
// (it still declares the boundary); both fields empty means none was found.
type packageOfDir struct {
	Name string
	Root string
}

// PackageOfFile returns the `"name"` of the nearest package.json above filePath and the directory
// holding it. The first one going up wins, Node's package identity rule, and the walk does NOT
// continue past a package.json without a `"name"`: it still declares the boundary, so the name comes
// back empty while root points at it. Both empty means none was found. `fs` as in DeclaredInModule.
func PackageOfFile(filePath string, fs vfspkg.FS) (name, rootDir string) {
	if filePath == "" {
		return "", ""
	}
	dir := tspath.GetDirectoryPath(tspath.NormalizePath(filePath))
	if fs == nil {
		if cached, ok := packageNameCache.Load(dir); ok {
			row := cached.(packageOfDir)
			return row.Name, row.Root
		}
		name, rootDir = lookupPackageUpward(dir, nil)
		packageNameCache.Store(dir, packageOfDir{Name: name, Root: rootDir})
		return name, rootDir
	}
	return lookupPackageUpward(dir, fs)
}

// packageNameForFile is the name-only half of PackageOfFile, the shape the
// marker module-of-origin gate wants.
func packageNameForFile(filePath string, fs vfspkg.FS) string {
	name, _ := PackageOfFile(filePath, fs)
	return name
}

// lookupPackageUpward climbs from dir to the filesystem root, returning the `"name"` of the first
// readable package.json and the directory holding it. The name is "" when the JSON is unparseable
// or names nothing; both values are "" when no package.json exists on the chain.
func lookupPackageUpward(dir string, fs vfspkg.FS) (name, rootDir string) {
	current := dir
	for {
		if content, ok := readPackageJSON(tspath.CombinePaths(current, "package.json"), fs); ok {
			var pkg struct {
				Name string `json:"name"`
			}
			if err := json.Unmarshal([]byte(content), &pkg); err == nil {
				return pkg.Name, current
			}
			return "", current
		}
		parent := tspath.GetDirectoryPath(current)
		if parent == current || parent == "" {
			return "", ""
		}
		current = parent
	}
}

// readPackageJSON reads path through fs when non-nil, otherwise os.ReadFile; ok is false when the
// file is absent or unreadable.
func readPackageJSON(path string, fs vfspkg.FS) (string, bool) {
	if fs != nil {
		return fs.ReadFile(path)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return "", false
	}
	return string(data), true
}

// findAmbientModuleName returns the nearest enclosing `declare module "<name>"`, "" when there is
// none.
func findAmbientModuleName(node *ast.Node) string {
	for node != nil {
		if node.Kind == ast.KindModuleDeclaration {
			moduleDecl := node.AsModuleDeclaration()
			// Skip `namespace X { … }`: only string-literal-named modules are ambient modules.
			if moduleDecl != nil && moduleDecl.Keyword != ast.KindNamespaceKeyword {
				name := moduleDecl.Name()
				if name != nil && ast.IsStringLiteral(name) {
					return name.Text()
				}
			}
		}
		if node.Kind == ast.KindSourceFile {
			return ""
		}
		node = node.Parent
	}
	return ""
}

// CalleeIdentifierName is the name a call expression calls, written bare (`call(…)`) or through a
// property access (`route.call(…)`); empty when neither. A lane's cheap textual pre-filter runs on
// it, before the resolved signature decides anything.
func CalleeIdentifierName(callExpr *ast.CallExpression) string {
	if callExpr == nil || callExpr.Expression == nil {
		return ""
	}
	expr := callExpr.Expression
	switch expr.Kind {
	case ast.KindIdentifier:
		return expr.Text()
	case ast.KindPropertyAccessExpression:
		if name := expr.AsPropertyAccessExpression().Name(); name != nil {
			return name.Text()
		}
	}
	return ""
}
