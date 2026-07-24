package diagnostics

// Marker-scanner codes (MKRxxx). Issued by the resolver when a marker call
// compiles correctly but uses an anti-pattern.
const (
	CodeMarkerFunctionCallArg         = "MKR001"
	CodeMarkerFreeTypeParameter       = "MKR003"
	CodeValidateOptionsNoLiteralsNoop = "MKR004"
	CodeValidateOptionsNoArrayNoop    = "MKR005"
	CodeMarkerDuplicateFnKey          = "MKR006"
	CodeMarkerAnyFromUnresolvedImport = "MKR007"
	// CodeStructuralIdDepthExceeded fires when the structural-id walk hits its
	// recursion depth cap with NO classifiable cause: written nesting past the cap.
	// Deterministic failure in place of a fatal Go stack overflow. Anchors at the
	// reflection call site, same as the other MKR codes.
	CodeStructuralIdDepthExceeded = "MKR008"
	// CodeMarkerSelfInstantiatingGeneric is the cause-classified variant of the
	// depth cap: instantiations of ONE named type dominate the overflowing walk —
	// a self-instantiating generic (e.g. a generic method returning a fresh
	// instantiation of its own container, lib.esnext's IteratorObject shape). Its
	// per-level type parameters are bound per call site and can never resolve at
	// build time, so no finite structural id exists. Args: [0] the type's name.
	CodeMarkerSelfInstantiatingGeneric = "MKR009"
	// CodeMarkerUnresolvedTypeParameter is the nested sibling of MKR003: the
	// marker's type argument is not itself a bare type parameter (that is MKR003),
	// but CONTAINS a still-free one in a data position (`A<T>`, `T[]`, `{a: T}`
	// inside a generic body). Without the check the free param silently collapses
	// to `unknown` and every instantiation context shares one aliased id. Args:
	// [0] the parameter name; Related: the parameter's declaration + generics-chain
	// hops. Signature interiors (generic methods' own params) are exempt.
	CodeMarkerUnresolvedTypeParameter = "MKR010"
	// CodeMarkerUnresolvedGenericType is the SYNTACTIC guard of the unresolved-generics
	// model: a written generic reference with fewer type arguments than the
	// declaration's default-less parameters (`getRunTypeId<A2>()` over
	// `interface A2<S>`). tsc rejects it (TS2314) but the no-typecheck dev lane
	// doesn't, and the checker yields plain `any` — so the scan reads the WRITTEN
	// argument list instead. A parameter WITH a default never trips it (the
	// checker resolves defaults at use sites). Args: [0] type name, [1] parameter
	// name; Related: the default-less parameter's declaration + alias hops.
	CodeMarkerUnresolvedGenericType = "MKR011"
)

// CompTimeArgs-marker codes (CTAxxx). Issued by the resolver when a
// CompTimeArgs<T>-branded parameter receives an argument the Go scanner
// cannot statically evaluate at build time.
const (
	CodeCompTimeArgsNonLiteral         = "CTA001"
	CodeCompTimeArgsDepthExceeded      = "CTA002"
	CodeCompTimeArgsForbiddenConstruct = "CTA003"
	CodeCompTimeArgsWidenedConst       = "CTA004"
)

// PureFunction-marker codes (PFNxxx). Issued by the resolver when a
// PureFunction<F>-branded parameter receives something other than an
// inline arrow / function expression. Purity violations themselves are
// reported via the existing PFE9006-PFE9011 codes from the purefns
// package, reused unchanged.
const (
	CodePureFunctionNotLiteral     = "PFN001"
	CodePureFunctionExternalHandle = "PFN002"
)

// Project-configuration codes (CFGxxx). Issued when the process cannot load
// the project tsconfig that was named (or discovered) for it — the config
// every lane derives its Programs from. Strict like tsc: never downgraded or
// swallowed; the daemon fails the op with this code tagged in the message
// (lint hosts synthesize the catalog diagnostic from it — args: [detail],
// e.g. "tsconfig parse failed: <first tsgo diagnostic>") and CLI lanes exit.
// FamilyMarker: the scan subsystem owns it — the marker scan is what could
// not run — keeping the wire enum and its TS mirror untouched.
const (
	CodeTsconfigLoadFailed = "CFG001"
)

func init() {
	for _, definition := range []Definition{
		{Code: CodeMarkerFunctionCallArg, Family: FamilyMarker, Severity: SeverityWarning, Title: "Marker invokes a function just to read its return type"},
		{Code: CodeMarkerFreeTypeParameter, Family: FamilyMarker, Severity: SeverityError, Title: "Marker call inside a generic function — type argument is unresolved"},
		{Code: CodeValidateOptionsNoLiteralsNoop, Family: FamilyMarker, Severity: SeverityWarning, Title: "`ValidateOptions.noLiterals` has no effect on this type — the option is a no-op"},
		{Code: CodeValidateOptionsNoArrayNoop, Family: FamilyMarker, Severity: SeverityWarning, Title: "`ValidateOptions.noIsArrayCheck` has no effect on this type — the option is a no-op"},
		{Code: CodeMarkerDuplicateFnKey, Family: FamilyMarker, Severity: SeverityError, Title: "`InjectTypeFnArgs` names the same function family more than once"},
		{Code: CodeMarkerAnyFromUnresolvedImport, Family: FamilyMarker, Severity: SeverityError, Title: "Marker type resolved to `any` — an import in this file failed to resolve"},
		{Code: CodeStructuralIdDepthExceeded, Family: FamilyMarker, Severity: SeverityError, Title: "Type is too deeply nested — structural-id computation hit its depth cap"},
		{Code: CodeMarkerSelfInstantiatingGeneric, Family: FamilyMarker, Severity: SeverityError, Title: "Type re-instantiates itself with fresh type arguments — a self-instantiating generic cannot resolve to a structural id"},
		{Code: CodeMarkerUnresolvedTypeParameter, Family: FamilyMarker, Severity: SeverityError, Title: "Marker type argument contains an unresolved type parameter — generics must be fully resolved at the call site"},
		{Code: CodeMarkerUnresolvedGenericType, Family: FamilyMarker, Severity: SeverityError, Title: "Generic type used without its required type arguments — a default-less parameter cannot be resolved"},
		{Code: CodeCompTimeArgsNonLiteral, Family: FamilyMarker, Severity: SeverityError, Title: "CompTimeArgs<T> argument must be a literal at the call site or const-bound to a literal"},
		{Code: CodeCompTimeArgsDepthExceeded, Family: FamilyMarker, Severity: SeverityError, Title: "CompTimeArgs<T> literal nesting exceeds depth cap (16) — refactor to flatten"},
		{Code: CodeCompTimeArgsForbiddenConstruct, Family: FamilyMarker, Severity: SeverityError, Title: "CompTimeArgs<T> literal contains a forbidden construct (computed property, function call, ternary, template substitution, or a non-mergeable spread)"},
		{Code: CodeCompTimeArgsWidenedConst, Family: FamilyMarker, Severity: SeverityError, Title: "CompTimeArgs<T> const argument has a widened (non-literal) member — declare the const `as const` so its values stay literal"},
		{Code: CodePureFunctionNotLiteral, Family: FamilyMarker, Severity: SeverityError, Title: "PureFunction<F> argument must be an inline arrow or function expression"},
		{Code: CodePureFunctionExternalHandle, Family: FamilyMarker, Severity: SeverityError, Title: "PureFunction<F> literal must not be imported or exported — bind it to an inline or module-private function so only the compiled copy can run"},
		{Code: CodeTsconfigLoadFailed, Family: FamilyMarker, Severity: SeverityError, Title: "Project tsconfig failed to load — every lane reads this config, so the operation stops"},
	} {
		register(definition)
	}
}
