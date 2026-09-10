package diagnostics

// Pure-function extractor codes (PFE9xxx). Private namespace avoids
// collision with TypeScript's own diagnostic ranges (TS2xxx / TS6xxx).
//
// The family used to be fatal as a block, hardcoded by name in four places. The
// levels below are what the emitter ACTUALLY does, which is not the same thing:
// only PFE9005 withholds output. A purity violation compiles the offending body
// and ships it (walker.go: "Build never fails; the entry still emits even when
// violations exist"), a hash collision rewrites both call sites to one body, and
// a missing dep ships a file that throws on the call. Those are broken OUTPUT,
// not absent output, so they are LevelRuntimeError: still failing every build by
// default, but standing one down is now a choice a consumer is allowed to make,
// because the build was going to ship that body either way.
//
// PFE9001 (namespace not literal), PFE9002 (fnId not literal), PFE9003
// (factory not inline) were retired in favour of the marker-layer
// emitters CTA001 (CompTimeArgs<T> non-literal) and PFN001
// (PureFunction<F> not inline), those flow through resolver.scanCall
// now that registerPureFnFactory is discovered by marker shape rather
// than by callee name. See plan D6.
const (
	// CodeBodyHashCollision: two registrations share a body hash. The winner's
	// entry is kept and BOTH call sites are rewritten to it, so the loser silently
	// resolves the winner's body. LevelRuntimeError: output, and it is wrong.
	CodeBodyHashCollision = "PFE9004"
	// CodeDestructuredParam: the one code in this file that withholds output.
	// buildPureFnEntry returns no entry, so no `pf/<ns>/<name>.js` module is
	// written and the call site keeps its un-rewritten `registerPureFn(...)`.
	// LevelError: there is nothing to accept.
	CodeDestructuredParam = "PFE9005"

	CodePurityThis          = "PFE9006"
	CodePurityAwait         = "PFE9007"
	CodePurityYield         = "PFE9008"
	CodePurityDynamicImport = "PFE9009"
	CodePurityForbidden     = "PFE9010"
	CodePurityClosure       = "PFE9011"

	CodeMissingPureFnDep    = "PFE9012"
	CodePurityDepNotLiteral = "PFE9013"
)

func init() {
	for _, definition := range []Definition{
		{Code: CodeBodyHashCollision, Family: FamilyPureFn, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "Duplicate registration with mismatched bodyHash"},
		{Code: CodeDestructuredParam, Family: FamilyPureFn, Level: LevelError, Scope: ScopeNotSource, Title: "Pure-fn factory uses destructured parameter"},

		{Code: CodePurityThis, Family: FamilyPureFn, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "Pure-fn body references this"},
		{Code: CodePurityAwait, Family: FamilyPureFn, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "Pure-fn body contains await"},
		{Code: CodePurityYield, Family: FamilyPureFn, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "Pure-fn body contains yield"},
		{Code: CodePurityDynamicImport, Family: FamilyPureFn, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "Pure-fn body uses dynamic import"},
		{Code: CodePurityForbidden, Family: FamilyPureFn, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "Pure-fn body uses a forbidden global"},
		{Code: CodePurityClosure, Family: FamilyPureFn, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "Pure-fn body closes over outer binding"},

		{Code: CodeMissingPureFnDep, Family: FamilyPureFn, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "RT depends on missing pure-fn"},
		{Code: CodePurityDepNotLiteral, Family: FamilyPureFn, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "Pure-fn dep arg not a literal"},
	} {
		register(definition)
	}
}
