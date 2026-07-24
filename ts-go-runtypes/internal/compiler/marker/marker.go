// Package marker detects whether a TypeScript type matches one of the
// recognised marker brands. Three kinds are supported:
//
//  1. InjectRunTypeId<T> — the trailing-parameter brand that opts a
//     function into compile-time type-id injection by the
//     ts-runtypes transformer.
//  2. CompTimeArgs<T> — brands a parameter whose corresponding argument
//     must be a literal at the call site (or via a module-scope `const`
//     whose initializer is itself entirely literal).
//  3. PureFunction<F> — brands a function-typed parameter whose argument
//     must be a literal function definition AND must pass purity rules.
//
// The detection is two-layered for every kind:
//  1. Name match — the type alias' symbol name must equal the configured
//     marker name (defaults below).
//  2. Module-of-origin match — the alias must be declared inside the
//     configured marker package (default "@ts-runtypes/core"). This
//     stops a user's own `type InjectRunTypeId<T> = ...` (or similarly
//     named local brand) from accidentally triggering rewrites.
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
	"github.com/mionkit/ts-runtypes/internal/diagnostics"
	"github.com/mionkit/ts-runtypes/internal/textpos"
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
	// KindInjectTypeFnArgs is the trailing-slot injection marker used by the
	// createX factories. Like KindInjectRunTypeId it injects at the trailing
	// parameter, but carries a second type-arg (Fn) naming the function, so the
	// transformer injects a `[typeId, fnId]` tuple and the backend emits only
	// the demanded function family.
	KindInjectTypeFnArgs
	// KindCompTimeFnArgs brands the parameter whose literal value selects the
	// createX function variant (the ValidateOptions bag for validate/validationErrors, the
	// JSON strategy for the encoder/decoder). Same literal-only validation as
	// KindCompTimeArgs, but it ALSO tells the scanner which parameter to read
	// when computing the injected fnHash.
	KindCompTimeFnArgs
	// KindInjectPureFnHash is the anonymous pure-fn injection marker
	// (InjectPureFnHash<F>). Like KindInjectRunTypeId it rides the callee
	// signature so it propagates through wrappers, but the injected value is a
	// content hash of the sibling PureFunction<F> factory BODY — `"rt::<fnHash>"`.
	// The purefunctions extractor recognises the registerAnonymousPureFn call
	// shape by this brand and splices the hash in; the resolver's marker walk
	// does not inject for it (no createX id/fnId), so it carries no scanCall case.
	KindInjectPureFnHash
	// KindPureFunctionFactory brands a function argument as a FACTORY
	// `(utl) => fn` (the registerPureFnFactory / registerAnonymousPureFnFactory
	// lanes). Same inline + purity rules as KindPureFunction, but it tells the
	// extractor to emit the factory AS-IS. The plain KindPureFunction is the
	// DIRECT form — the argument is the pure fn itself, wrapped into `() => fn`.
	// The marker on the pure-fn parameter is what carries the factory-vs-direct
	// intent through a wrapper.
	KindPureFunctionFactory
)

// DefaultName is the symbol name the resolver looks for for the
// injection marker. Used by DefaultSpecs when building the canonical
// marker set.
const DefaultName = "InjectRunTypeId"

// DefaultInjectTypeFnArgsName is the symbol name for the createX trailing-slot
// marker that carries the function id (InjectTypeFnArgs<T, Fn>).
const DefaultInjectTypeFnArgsName = "InjectTypeFnArgs"

// DefaultCompTimeArgsName is the symbol name for the CompTimeArgs brand.
const DefaultCompTimeArgsName = "CompTimeArgs"

// DefaultCompTimeFnArgsName is the symbol name for the CompTimeFnArgs brand —
// the fn-selecting variant of CompTimeArgs used by the createX factories.
const DefaultCompTimeFnArgsName = "CompTimeFnArgs"

// DefaultPureFunctionName is the symbol name for the PureFunction brand (the
// DIRECT form — the argument is the pure fn itself).
const DefaultPureFunctionName = "PureFunction"

// DefaultPureFunctionFactoryName is the symbol name for the PureFunctionFactory
// brand (the FACTORY form — the argument is a `(utl) => fn` factory).
const DefaultPureFunctionFactoryName = "PureFunctionFactory"

// DefaultInjectPureFnHashName is the symbol name for the anonymous pure-fn
// injection marker (InjectPureFnHash<F>).
const DefaultInjectPureFnHashName = "InjectPureFnHash"

// DefaultModule is the package the marker types must be declared in.
const DefaultModule = "@ts-runtypes/core"

// Spec describes a single marker the scanner should recognise.
type Spec struct {
	// Name is the symbol name of the marker type alias.
	Name string
	// Module is the package the alias is declared in. The check passes
	// when the alias' declaration is either inside `declare module
	// "<Module>"` (ambient form, used by synthetic test fixtures) or in a
	// file whose enclosing on-disk package.json has its `"name"` field
	// equal to <Module> (real packages — workspace or installed).
	Module string
	// Kind is the marker family this spec maps to.
	Kind Kind
	// BrandProperty, when non-empty, is the name of the phantom brand
	// property on the alias. Used as a fallback when alias info is lost
	// (e.g. CompTimeArgs<A | B> distributes its intersection over the
	// union — the alias name drops away but the brand property survives
	// on every member). Empty disables the fallback.
	BrandProperty string
}

// Brand property names for each marker kind. Kept in sync with the
// public TypeScript declarations in
// packages/ts-runtypes/src/markers.ts.
const (
	BrandInjectRunTypeId     = "__rtInjectRunTypeIdBrand"
	BrandCompTimeArgs        = "__rtCompTimeArgsBrand"
	BrandCompTimeFnArgs      = "__rtCompTimeFnArgsBrand"
	BrandPureFunction        = "__rtPureFunctionBrand"
	BrandPureFunctionFactory = "__rtPureFunctionFactoryBrand"
	BrandInjectTypeFnArgs    = "__rtInjectTypeFnArgsBrand"
	BrandInjectPureFnHash    = "__rtInjectPureFnHashBrand"
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
		{Name: DefaultInjectPureFnHashName, Module: DefaultModule, Kind: KindInjectPureFnHash, BrandProperty: BrandInjectPureFnHash},
	}
}

// Options configures marker detection. The Specs slice is the only
// configuration surface — populated from DefaultSpecs() by
// WithDefaults when empty. Callers that need to add or rename markers
// (e.g. tests pinning a non-default module) construct Specs directly.
type Options struct {
	// Specs, when non-empty, replaces the entire marker set. When empty
	// WithDefaults fills it with DefaultSpecs().
	Specs []Spec
	// FS, when non-nil, is the virtual filesystem the package-name gate reads
	// package.json through (DeclaredInModule → packageNameForFile). A marker
	// declared in an OVERLAY / in-memory node_modules package (the wasm
	// playground, in-memory test overlays) is invisible to os.ReadFile, so
	// without this the module-of-origin gate fails and the marker's type
	// argument is lost (T resolves to `unknown`). nil falls back to os.ReadFile
	// (real on-disk resolution, the plugin path over a user's real node_modules).
	FS vfspkg.FS
}

// WithDefaults populates Specs from DefaultSpecs() when empty. Returns
// opts otherwise.
func WithDefaults(opts Options) Options {
	if len(opts.Specs) == 0 {
		opts.Specs = DefaultSpecs()
	}
	return opts
}

// DetectAny inspects a parameter type against every configured marker
// spec and returns the matching spec's Kind plus the brand's type
// argument when one matches. Used by the resolver to dispatch
// per-parameter validation (CompTimeArgs / PureFunction) in a single walk.
//
// When typeChecker is non-nil and the alias-name match fails, the
// spec's BrandProperty is checked against the type's own properties as
// a fallback — covers CompTimeArgs<A|B> where TS distributes the
// intersection over the union and the alias name drops off, but the
// brand property survives on each member.
func DetectAny(typeChecker *checker.Checker, paramType *checker.Type, opts Options) (Kind, *checker.Type, bool) {
	if paramType == nil {
		return 0, nil, false
	}
	opts = WithDefaults(opts)
	for _, spec := range opts.Specs {
		if typeArgument, ok := matchAliasSpec(paramType, spec, opts.FS); ok {
			return spec.Kind, typeArgument, true
		}
		if checker.Type_flags(paramType)&checker.TypeFlagsUnion != 0 {
			for _, member := range paramType.Types() {
				if typeArgument, ok := matchAliasSpec(member, spec, opts.FS); ok {
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

// matchedByBrand reports whether paramType (or any union member when it
// is a union) carries the brand property unique to spec. Used as a
// last-resort fallback when the alias name has been lost due to
// intersection-over-union distribution.
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

// SpecForKind returns the spec for kind from opts (filled with DefaultSpecs when
// empty). Exposed so the resolver can read a marker's Name/Module for type-node
// based detection — used for CompTimeArgs, whose zero-cost identity TS definition
// (`type CompTimeArgs<T> = T`) drops the alias from the resolved type, so it is
// detected off the parameter's syntactic `CompTimeArgs<…>` annotation instead.
func SpecForKind(opts Options, kind Kind) (Spec, bool) {
	return specForKind(WithDefaults(opts).Specs, kind)
}

// aliasForSpec returns tsType's alias when its symbol name and declaring
// module match spec — the shared first layer of every alias-based marker
// match (DetectAny's Kind matching, the InjectTypeFnArgs fn-key read).
func aliasForSpec(tsType *checker.Type, spec Spec, fs vfspkg.FS) (*checker.TypeAlias, bool) {
	alias := checker.Type_alias(tsType)
	if alias == nil {
		return nil, false
	}
	symbol := alias.Symbol()
	if symbol == nil || symbol.Name != spec.Name {
		return nil, false
	}
	if !DeclaredInModule(symbol, spec.Module, fs) {
		return nil, false
	}
	return alias, true
}

func matchAliasSpec(tsType *checker.Type, spec Spec, fs vfspkg.FS) (*checker.Type, bool) {
	alias, ok := aliasForSpec(tsType, spec, fs)
	if !ok {
		return nil, false
	}
	typeArguments := alias.TypeArguments()
	if len(typeArguments) == 0 {
		return nil, false
	}
	return typeArguments[0], true
}

// FnKeysForInjectTypeFnArgs returns the Fn type-arguments (every argument after
// `T`) of an InjectTypeFnArgs<T, F1, F2, …> alias as their string-literal values
// (e.g. ["val"], or ["val", "verr"] for a multi-function marker). ok is false
// when paramType is not that alias, the spec is absent, or no Fn argument is a
// string literal. Used by the scanner to compute the precise fnId(s) injected at
// a createX call site — one per named family, in declaration order.
func FnKeysForInjectTypeFnArgs(typeChecker *checker.Checker, paramType *checker.Type, opts Options) ([]string, bool) {
	if paramType == nil {
		return nil, false
	}
	opts = WithDefaults(opts)
	spec, found := specForKind(opts.Specs, KindInjectTypeFnArgs)
	if !found {
		return nil, false
	}
	if keys, ok := fnKeysFromAlias(paramType, spec, opts.FS); ok {
		return keys, true
	}
	// An optional `id?:` parameter resolves to `InjectTypeFnArgs<…> | undefined`,
	// so the alias rides on the non-undefined union member — mirror DetectAny's
	// union-member walk to find it.
	if checker.Type_flags(paramType)&checker.TypeFlagsUnion != 0 {
		for _, member := range paramType.Types() {
			if keys, ok := fnKeysFromAlias(member, spec, opts.FS); ok {
				return keys, true
			}
		}
	}
	return nil, false
}

// fnKeysFromAlias reads the Fn type-arguments (every argument after `T`) of an
// InjectTypeFnArgs alias as string-literal values. A single-function marker
// (`InjectTypeFnArgs<T, 'val'>`) yields one key; a multi-function marker
// (`InjectTypeFnArgs<T, 'val', 'verr'>`) yields several, in declaration order.
// Non-literal slots — e.g. the `never`-defaulted F2/F3 of the alias when the
// caller supplied fewer keys — are skipped, so the same reader handles every
// arity. Returns ok=false unless tsType carries the matching alias with at
// least one string-literal Fn argument.
func fnKeysFromAlias(tsType *checker.Type, spec Spec, fs vfspkg.FS) ([]string, bool) {
	alias, ok := aliasForSpec(tsType, spec, fs)
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

// IsFreeTypeParameter reports whether tsType is a still-unresolved type
// parameter (e.g. inside a generic wrapper body where the marker's `T` is the
// wrapper's own type variable). Such sites must be skipped — there's no
// id to inject when `T` isn't yet bound.
func IsFreeTypeParameter(tsType *checker.Type) bool {
	if tsType == nil {
		return false
	}
	return checker.Type_flags(tsType)&checker.TypeFlagsTypeParameter != 0
}

// freeParamScanDepth bounds FindFreeTypeParameter's walk. Deep enough for any
// realistic data shape; the bound (not the visited set) is what terminates on a
// self-instantiating generic, whose fresh per-level types never repeat — those
// are reported separately by the structural-id depth backstop (MKR009).
const freeParamScanDepth = 64

// freeParamMaxHops caps the named-type breadcrumbs carried on the diagnostic so
// a deep chain stays readable (the param declaration is always included).
const freeParamMaxHops = 3

// FreeTypeParamFinding describes one still-unresolved type parameter found in a
// marker type argument's data-reachable graph: the parameter's name plus the
// Related sites the diagnostic carries — the parameter's DECLARATION first
// ("`T` is declared here"), then up to freeParamMaxHops named-type hops the
// walk passed through (outermost first), so a failure buried levels down a
// generics chain points at the exact links.
type FreeTypeParamFinding struct {
	ParamName string
	Related   []diagnostics.Related
}

// FindFreeTypeParameter walks the DATA-reachable positions of tsType — union /
// intersection members, instantiation type arguments (arrays, tuples, Map / Set /
// Promise, generic references), properties, and index signatures — and reports
// the first still-unresolved type parameter it finds (`A<T>`, `T[]`, `{a: T}`
// inside a generic body). Such a type must be rejected at the marker call
// (MKR010): the free parameter takes a different type at every call site of the
// surrounding generic, so a single build-time id would alias them all. NOTE the
// checker applies type-parameter DEFAULTS at use sites before we see the type
// (a bare `A` over `interface A<S = string>` arrives as `A<string>`), so a
// defaulted generic used bare never reaches this walk — but a default does NOT
// resolve the parameter inside the generic's own body, so `A<T>` under
// `function f<T = string>` is still found (and must be).
//
// Signature INTERIORS are deliberately exempt: a function-typed property or
// method is dropped from the data projection (methods aren't data), and a
// generic method's own type parameters (`map<U>`) are bound per CALL of the
// method — never resolvable at reflection time by design, and rejecting them
// would break ordinary types like `find<T>(query: string): T[]`.
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

	// Record a breadcrumb when descending THROUGH a named type, so a param found
	// deeper down the generics chain points at each link. Hop slices are
	// capacity-capped on append so sibling branches never alias.
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
	// Intersections fall through: GetPropertiesOfType below sees the combined
	// members, and a constituent reference's type arguments surface there too.
	if flags&(checker.TypeFlagsObject|checker.TypeFlagsIntersection) == 0 {
		return FreeTypeParamFinding{}, false
	}

	// Instantiation type arguments (arrays, tuples, Map/Set/Promise, generic
	// references). GetTypeArguments panics on non-reference objects — gate on
	// the reference flag, same as serialize.go / bridge.go.
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

// namedTypeHop returns the user-visible name + declaration site of a type worth
// recording as a generics-chain breadcrumb (alias name preferred — an alias
// instantiation's own symbol is the anonymous literal). Mirrors the
// user-visible-name filtering in cachegen/runtype/typeid (replicated: importing
// it from here would cross product areas for two tiny helpers).
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

// symbolDeclarationSite returns the line/col Site of a symbol's first
// resolvable declaration, using the declaration file's own name (the
// declaration may live in a different file than the marker call).
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

// DeclaredInModule reports whether symbol was declared inside the given
// module. Two forms count:
//
//   - `declare module "<module>" { type ... }` (ambient form) — used by
//     synthetic test fixtures that don't have a real on-disk package.json
//     (Go fixtures under internal/testfixtures, inline-source vite-plugin
//     tests, etc).
//   - A `.d.ts` / `.ts` file whose enclosing on-disk package.json declares
//     `"name": "<module>"`. Covers both the consumer case
//     (node_modules/<module>/dist/index.d.ts) and the workspace
//     self-import case (packages/<dir>/src/index.ts where the package's
//     name happens to equal <module>). The directory name on disk is
//     irrelevant — only the `"name"` field is consulted, matching how
//     Node module resolution defines a package's identity.
//
// Earlier versions of this function compared the source-file path
// against `"/" + module + "/"`. That heuristic broke for workspace
// self-imports (the on-disk directory `packages/ts-runtypes/` does
// not literally contain the published name `@ts-runtypes/core`),
// forcing tests to insert an ambient-module overlay file as a
// workaround. The package.json walk removes that workaround and uses
// the same identity check as the rest of the JS ecosystem.
// The `fs` argument is the resolver's virtual filesystem: when non-nil the
// package.json walk reads through it (so overlay / in-memory node_modules
// packages are recognised); nil falls back to os.ReadFile (real on-disk
// resolution). The ambient-module form needs no filesystem access at all.
func DeclaredInModule(symbol *ast.Symbol, module string, fs vfspkg.FS) bool {
	if symbol == nil || module == "" {
		return false
	}
	for _, declaration := range symbol.Declarations {
		if findAmbientModuleName(declaration) == module {
			return true
		}
		sourceFile := ast.GetSourceFileOfNode(declaration)
		if sourceFile == nil {
			continue
		}
		if packageNameForFile(sourceFile.FileName(), fs) == module {
			return true
		}
	}
	return false
}

// DeclaringModuleOfNode returns the module a declaration node belongs to: the
// nearest enclosing ambient `declare module "<name>"` wrapper (the synthetic
// test-fixture form), else the `"name"` of the nearest package.json walking up
// from the node's source file. "" when neither is found. It is the read
// counterpart of DeclaredInModule (which checks a KNOWN module) — callers that
// need to REPORT which module a callee was declared in (the pure-fn build
// report's calleeModule) use this. `fs` is the resolver's virtual filesystem
// (overlay / in-memory packages); nil falls back to os.ReadFile.
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

// packageNameCache memoises directory→package-name results for the on-disk
// (os.ReadFile) walk across the life of a resolver process. The on-disk
// package.json for any given directory doesn't change mid-run, so caching is
// safe and avoids repeating identical fs walks for every marker-detection call.
// Storing "" is itself a cached answer (meaning "no package.json found walking
// up from here"). Only the nil-FS (on-disk) path is cached: overlay/virtual FS
// reads are already cheap (in-memory) and their contents can change per
// setSources, so caching them by directory alone would risk cross-overlay
// staleness.
var packageNameCache sync.Map // map[string]string

// packageNameForFile returns the `"name"` field of the nearest package.json
// found by walking parent directories from filePath, or "" when no package.json
// is found, the file is unreadable, or it has no name. The first package.json
// hit going up wins — Node's package identity rule. We do NOT keep walking past
// a package.json that lacks a `"name"` field; that file still declares a package
// boundary, just a nameless one (so the marker check fails closed for files in
// such a "package"). When fs is non-nil the walk reads package.json through it
// (overlay / in-memory packages); nil reads the real on-disk filesystem.
func packageNameForFile(filePath string, fs vfspkg.FS) string {
	if filePath == "" {
		return ""
	}
	dir := tspath.GetDirectoryPath(tspath.NormalizePath(filePath))
	if fs == nil {
		if cached, ok := packageNameCache.Load(dir); ok {
			return cached.(string)
		}
		name := lookupPackageNameUpward(dir, nil)
		packageNameCache.Store(dir, name)
		return name
	}
	return lookupPackageNameUpward(dir, fs)
}

// lookupPackageNameUpward climbs from dir toward the filesystem root, returning
// the `"name"` of the first readable package.json it finds. Stops at the root
// (when GetDirectoryPath is a fixed point). Returns "" for any of: file does not
// exist, JSON unparseable, name missing or empty. Reads through fs when non-nil,
// otherwise os.ReadFile.
func lookupPackageNameUpward(dir string, fs vfspkg.FS) string {
	current := dir
	for {
		if content, ok := readPackageJSON(tspath.CombinePaths(current, "package.json"), fs); ok {
			var pkg struct {
				Name string `json:"name"`
			}
			if err := json.Unmarshal([]byte(content), &pkg); err == nil {
				return pkg.Name
			}
			return ""
		}
		parent := tspath.GetDirectoryPath(current)
		if parent == current || parent == "" {
			return ""
		}
		current = parent
	}
}

// readPackageJSON reads path via fs (overlay / virtual filesystem) when non-nil,
// otherwise via os.ReadFile (real disk). ok is false when the file is absent or
// unreadable.
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

// findAmbientModuleName walks the parent chain looking for the nearest
// `declare module "<name>" { ... }` wrapping node. Returns "" if the
// declaration isn't inside an ambient module.
func findAmbientModuleName(node *ast.Node) string {
	for node != nil {
		if node.Kind == ast.KindModuleDeclaration {
			moduleDecl := node.AsModuleDeclaration()
			// Skip `namespace X { ... }` — only string-literal-named modules
			// (i.e. ambient module declarations) count.
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
