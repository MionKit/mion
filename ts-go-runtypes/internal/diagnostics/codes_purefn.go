package diagnostics

// Pure-function extractor codes (PFE9xxx). Private namespace avoids
// collision with TypeScript's own diagnostic ranges (TS2xxx / TS6xxx).
//
// PFE9001 (namespace not literal), PFE9002 (fnId not literal), PFE9003
// (factory not inline) were retired in favour of the marker-layer
// emitters CTA001 (CompTimeArgs<T> non-literal) and PFN001
// (PureFunction<F> not inline), those flow through resolver.scanCall
// now that registerPureFnFactory is discovered by marker shape rather
// than by callee name. See plan D6.
const (
	CodeBodyHashCollision = "PFE9004"
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
		{Code: CodeBodyHashCollision, Family: FamilyPureFn, Severity: SeverityError, Scope: ScopeNotSource, Title: "Duplicate registration with mismatched bodyHash"},
		{Code: CodeDestructuredParam, Family: FamilyPureFn, Severity: SeverityError, Scope: ScopeNotSource, Title: "Pure-fn factory uses destructured parameter"},

		{Code: CodePurityThis, Family: FamilyPureFn, Severity: SeverityError, Scope: ScopeNotSource, Title: "Pure-fn body references this"},
		{Code: CodePurityAwait, Family: FamilyPureFn, Severity: SeverityError, Scope: ScopeNotSource, Title: "Pure-fn body contains await"},
		{Code: CodePurityYield, Family: FamilyPureFn, Severity: SeverityError, Scope: ScopeNotSource, Title: "Pure-fn body contains yield"},
		{Code: CodePurityDynamicImport, Family: FamilyPureFn, Severity: SeverityError, Scope: ScopeNotSource, Title: "Pure-fn body uses dynamic import"},
		{Code: CodePurityForbidden, Family: FamilyPureFn, Severity: SeverityError, Scope: ScopeNotSource, Title: "Pure-fn body uses a forbidden global"},
		{Code: CodePurityClosure, Family: FamilyPureFn, Severity: SeverityError, Scope: ScopeNotSource, Title: "Pure-fn body closes over outer binding"},

		{Code: CodeMissingPureFnDep, Family: FamilyPureFn, Severity: SeverityError, Scope: ScopeNotSource, Title: "RT depends on missing pure-fn"},
		{Code: CodePurityDepNotLiteral, Family: FamilyPureFn, Severity: SeverityError, Scope: ScopeNotSource, Title: "Pure-fn dep arg not a literal"},
	} {
		register(definition)
	}
}
