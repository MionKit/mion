package diagnostics

// Marker-scanner codes (MKRxxx), raised when a marker call compiles correctly but uses an
// anti-pattern.
//
// The levels split on whether the scan still emits a SITE for the call. No site means no cache entry
// and no injected id, so the call ships un-rewritten and throws `no id injected`: LevelError
// (MKR003, MKR008, MKR009, MKR010, MKR011, MKR014, MKR015). A site built from a type that was read wrongly
// ships a validator that accepts everything: LevelRuntimeError (MKR007, MKR012, MKR013, and
// TMP001 / CFG002 elsewhere).
const (
	CodeMarkerFunctionCallArg         = "MKR001"
	CodeMarkerFreeTypeParameter       = "MKR003"
	CodeValidateOptionsNoLiteralsNoop = "MKR004"
	CodeValidateOptionsNoArrayNoop    = "MKR005"
	// CodeMarkerDuplicateFnKey: LevelWarning, because the scan DEDUPES the repeated key and emits the
	// site normally, so what ships is correct and only the source has a copy-paste slip.
	CodeMarkerDuplicateFnKey          = "MKR006"
	CodeMarkerAnyFromUnresolvedImport = "MKR007"
	// CodeStructuralIdDepthExceeded fires when the structural-id walk hits its depth cap with no
	// classifiable cause, a deterministic failure in place of a fatal Go stack overflow. Anchors at
	// the reflection call site, like the other MKR codes.
	CodeStructuralIdDepthExceeded = "MKR008"
	// CodeMarkerSelfInstantiatingGeneric is the cause-classified depth cap: instantiations of ONE
	// named type dominate the overflowing walk (lib.esnext's IteratorObject shape). Its per-level
	// type parameters bind per call site, so no finite structural id exists. Args: [0] the type name.
	CodeMarkerSelfInstantiatingGeneric = "MKR009"
	// CodeMarkerUnresolvedTypeParameter is the nested sibling of MKR003: the type argument CONTAINS a
	// still-free type parameter in a data position (`A<T>`, `T[]`, `{a: T}`), which without the check
	// collapses to `unknown` so every instantiation context shares one aliased id. Signature
	// interiors (a generic method's own params) are exempt. Args: [0] the parameter name; Related:
	// its declaration + generics-chain hops.
	CodeMarkerUnresolvedTypeParameter = "MKR010"
	// CodeMarkerUnresolvedGenericType is the SYNTACTIC guard: a written generic reference with fewer
	// type arguments than the declaration's default-less parameters. tsc rejects it (TS2314) but the
	// no-typecheck dev lane does not, and the checker yields plain `any`, so the scan reads the
	// WRITTEN argument list instead. A parameter WITH a default never trips it. Args: [0] type name,
	// [1] parameter name; Related: the parameter's declaration + alias hops.
	CodeMarkerUnresolvedGenericType = "MKR011"
	// CodeMarkerUntrustedPackage fires on a type named exactly like a marker but declared by a
	// package the project has not trusted, which the module-of-origin gate rejects. The
	// brand-property fallback still emits a site, so the call reflects `unknown` instead of the
	// user's type: LevelRuntimeError, since `unknown` compiles to the accept-everything noop. A
	// same-named brand declared by the USING file's own package never trips it, the local-brand case
	// the gate keeps inert. Args: [0] the marker name, [1] the declaring package.
	CodeMarkerUntrustedPackage = "MKR012"
	// CodeMarkerUnresolvedTypeName: the marker's type checked as the checker's ERROR type, `any` the
	// author never wrote, because a written type name failed to resolve. Third member of the
	// silent-any guard family (TMP001 the Temporal-lib cause, MKR007 the unresolved-import cause,
	// this the bare-name cause). A written `any` and a resolved `type Loose = any` are the true `any`
	// intrinsic, never the error type, so deliberate `any` stays legal. Args: [0] the written type
	// name (or the reflect-form value's identifier).
	CodeMarkerUnresolvedTypeName = "MKR013"
	// CodeMarkerUnresolvedFnName: an `InjectTypeFnArgs<T, Fn>` marker names a function family that
	// does not exist. Nothing is emitted for that slot and the wrapper gets an empty handle, so the
	// call degrades to its no-plugin fallback: LevelError, no code was produced for what the marker
	// asked for. Args: [0] the unknown token, [1] the closest real token ("" when nothing is close).
	CodeMarkerUnresolvedFnName = "MKR015"
	// CodeTypeIdCollision: two DIFFERENT types produced the same short type id at the configured
	// `hashLength`. Every generated name, cache key and disk path is that id, so nothing downstream
	// could tell them apart; the build stops instead and the fix is one option away. Args: [0] the
	// shared id, [1] the shape that took it first, [2] the shape that collided, [3] the hashLength to
	// try next, [4] where the first shape came from. Related: the site that took the id first,
	// present only when that was a marker call; an inner node has no site and reads as "another
	// site" in [4].
	CodeTypeIdCollision = "MKR014"
)

// CompTimeArgs-marker codes (CTAxxx), raised when a CompTimeArgs<T>-branded parameter receives an
// argument the scanner cannot evaluate at build time.
//
// All four are LevelRuntimeError: the typeId is injected and the entry ships, but the option readers
// fall back to their DEFAULTS, so what ships is compiled under options the author did not write.
const (
	CodeCompTimeArgsNonLiteral         = "CTA001"
	CodeCompTimeArgsDepthExceeded      = "CTA002"
	CodeCompTimeArgsForbiddenConstruct = "CTA003"
	CodeCompTimeArgsWidenedConst       = "CTA004"
)

// PureFunction-marker codes (PFNxxx), raised when a PureFunction<F>-branded parameter receives
// anything but an inline arrow / function expression; purity violations themselves report as
// PFE9006-PFE9011.
//
// LevelRuntimeError: the typeId entry ships, but the pure-fn walker bails, so the generated
// `utl.getPureFn(key)` names a module that was never written and throws when called.
const (
	CodePureFunctionNotLiteral     = "PFN001"
	CodePureFunctionExternalHandle = "PFN002"
)

// Project-configuration codes (CFGxxx), raised when the project tsconfig every lane derives its
// Programs from cannot be loaded. Strict like tsc, never downgraded or swallowed: the daemon fails
// the op with the code tagged in the message (a lint host synthesizes the catalog diagnostic from
// it, args: [detail]) and CLI lanes exit. FamilyMarker because the marker scan is what could not
// run, which keeps the wire enum and its TS mirror untouched.
const (
	CodeTsconfigLoadFailed = "CFG001"
	// CodeUnsupportedLibSelection: the project's `lib` leaves the required globals undeclared
	// (`lib: []`, `noLib`, or a by-feature lib with no base edition). Reflection is then UNSOUND and
	// silently so: with no `Array` global, `number[]` checks as an empty object and the validator
	// accepts anything. The silent-`any` guards cannot see it, since MKR013 keys on a written type
	// NAME and array sugar writes none. LevelRuntimeError: the cache tree is written and ships, just
	// built on types that cannot be trusted. Args: [0] the loaded lib files, or "(none)".
	CodeUnsupportedLibSelection = "CFG002"
	// CodeEmitOutsideRootDir: `mion compile` would write an emitted file outside the tsconfig
	// `outDir`, because the program reaches a source file outside its `rootDir`. tsc refuses the same
	// program (TS6059). LevelError, never a warning: the offending path is deleted from the write
	// map, so the file the written importer names never lands. Args: [0] the refused output path,
	// [1] the outDir.
	CodeEmitOutsideRootDir = "CFG003"
)

func init() {
	for _, definition := range []Definition{
		{Code: CodeMarkerFunctionCallArg, Family: FamilyMarker, Level: LevelWarning, Scope: ScopeNotSource, Title: "Marker invokes a function just to read its return type"},
		{Code: CodeMarkerFreeTypeParameter, Family: FamilyMarker, Level: LevelError, Scope: ScopeRoot, Title: "Marker call inside a generic function: type argument is unresolved"},
		{Code: CodeValidateOptionsNoLiteralsNoop, Family: FamilyMarker, Level: LevelWarning, Scope: ScopeNotSource, Title: "`ValidateOptions.noLiterals` has no effect on this type: the option is a no-op"},
		{Code: CodeValidateOptionsNoArrayNoop, Family: FamilyMarker, Level: LevelWarning, Scope: ScopeNotSource, Title: "`ValidateOptions.noIsArrayCheck` has no effect on this type: the option is a no-op"},
		{Code: CodeMarkerDuplicateFnKey, Family: FamilyMarker, Level: LevelWarning, Scope: ScopeNotSource, Title: "`InjectTypeFnArgs` names the same function family more than once"},
		{Code: CodeMarkerAnyFromUnresolvedImport, Family: FamilyMarker, Level: LevelRuntimeError, Scope: ScopeGraph, Title: "Marker type resolved to `any`: an import in this file failed to resolve"},
		{Code: CodeStructuralIdDepthExceeded, Family: FamilyMarker, Level: LevelError, Scope: ScopeGraph, Title: "Type is too deeply nested: structural-id computation hit its depth cap"},
		{Code: CodeMarkerSelfInstantiatingGeneric, Family: FamilyMarker, Level: LevelError, Scope: ScopeGraph, Title: "Type re-instantiates itself with fresh type arguments: a self-instantiating generic cannot resolve to a structural id"},
		{Code: CodeMarkerUnresolvedTypeParameter, Family: FamilyMarker, Level: LevelError, Scope: ScopeGraph, Title: "Marker type argument contains an unresolved type parameter: generics must be fully resolved at the call site"},
		{Code: CodeMarkerUnresolvedGenericType, Family: FamilyMarker, Level: LevelError, Scope: ScopeGraph, Title: "Generic type used without its required type arguments: a default-less parameter cannot be resolved"},
		{Code: CodeMarkerUntrustedPackage, Family: FamilyMarker, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "Marker-named type declared by an untrusted package: the type argument was dropped, so the call reflects `unknown`"},
		{Code: CodeMarkerUnresolvedTypeName, Family: FamilyMarker, Level: LevelRuntimeError, Scope: ScopeGraph, Title: "Marker type resolved to `any` that was never written: a type name failed to resolve"},
		{Code: CodeMarkerUnresolvedFnName, Family: FamilyMarker, Level: LevelError, Scope: ScopeNotSource, Title: "`InjectTypeFnArgs` names a function family that does not exist"},
		{Code: CodeTypeIdCollision, Family: FamilyMarker, Level: LevelError, Scope: ScopeNotSource, Title: "Two different types produced the same short type id: raise `hashLength`"},
		{Code: CodeCompTimeArgsNonLiteral, Family: FamilyMarker, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "CompTimeArgs<T> argument must be a literal at the call site or const-bound to a literal"},
		{Code: CodeCompTimeArgsDepthExceeded, Family: FamilyMarker, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "CompTimeArgs<T> literal nesting exceeds depth cap (16), refactor to flatten"},
		{Code: CodeCompTimeArgsForbiddenConstruct, Family: FamilyMarker, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "CompTimeArgs<T> literal contains a forbidden construct (computed property, function call, ternary, template substitution, or a non-mergeable spread)"},
		{Code: CodeCompTimeArgsWidenedConst, Family: FamilyMarker, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "CompTimeArgs<T> const argument has a widened (non-literal) member, declare the const `as const` so its values stay literal"},
		{Code: CodePureFunctionNotLiteral, Family: FamilyMarker, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "PureFunction<F> argument must be an inline arrow or function expression"},
		{Code: CodePureFunctionExternalHandle, Family: FamilyMarker, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "PureFunction<F> literal must not be imported or exported, bind it to an inline or module-private function so only the compiled copy can run"},
		{Code: CodeTsconfigLoadFailed, Family: FamilyMarker, Level: LevelError, Scope: ScopeNotSource, Title: "Project tsconfig failed to load: every lane reads this config, so the operation stops"},
		{Code: CodeUnsupportedLibSelection, Family: FamilyMarker, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "The project's TypeScript `lib` leaves the required globals undeclared, so reflected types cannot be trusted"},
		{Code: CodeEmitOutsideRootDir, Family: FamilyMarker, Level: LevelError, Scope: ScopeNotSource, Title: "An emitted file would land outside `outDir` because its source sits outside `rootDir`; it is not written"},
	} {
		register(definition)
	}
}
