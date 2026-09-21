package diagnostics

// Pure-function extractor codes (PFE9xxx); the private namespace avoids TypeScript's own ranges
// (TS2xxx / TS6xxx).
//
// The family is NOT fatal as a block: the levels below are what the emitter actually does. A purity
// violation compiles the offending body and ships it (walker.go emits PFE9006-PFE9011 without
// withholding the entry), and a missing dep ships a file that throws on the call. Broken OUTPUT
// rather than absent output is LevelRuntimeError: it still fails a build by default, but a consumer
// may stand it down, because the body was going to ship either way.
//
// PFE9001 (namespace not literal), PFE9002 (fnId not literal) and PFE9003 (factory not inline) were
// retired for the marker-layer CTA001 and PFN001, which flow through resolver.scanCall now that
// registerPureFnFactory is found by marker shape rather than by callee name. PFE9004 (two
// registrations under one id with different bodies) was retired when an id became the hash of the
// shipped body: one id is one body by construction.
const (
	// CodeDestructuredParam: buildPureFnEntry returns no entry, so no module is written and the call
	// site keeps its un-rewritten `registerPureFn(...)`. LevelError: there is nothing to accept.
	CodeDestructuredParam = "PFE9005"

	CodePurityThis          = "PFE9006"
	CodePurityAwait         = "PFE9007"
	CodePurityYield         = "PFE9008"
	CodePurityDynamicImport = "PFE9009"
	CodePurityForbidden     = "PFE9010"
	CodePurityClosure       = "PFE9011"

	CodeMissingPureFnDep    = "PFE9012"
	CodePurityDepNotLiteral = "PFE9013"
	// CodePureFnIdMismatch: the registration passes an explicit id that is not the one its body
	// hashes to. No entry is built and the call site keeps its own text. LevelError: accepting it
	// would split one function across two keys.
	CodePureFnIdMismatch = "PFE9014"
	// CodePureFnDependencyCycle: two pure functions reach each other through `utl.getPureFn`. An id
	// hashes the shipped body and that body carries its dependencies' ids, so each id would have to
	// contain the other. LevelError: no id, so no entry and no emitted module; it also replaces a
	// runtime hang with a build error.
	CodePureFnDependencyCycle = "PFE9015"
	// CodePureFnDepUnbuilt: an installed package ships neither `mion-pure-fns/` nor its sources, so
	// the body cannot be served. LevelError: the consumer's pure fn stays unbuilt until the package
	// is built with mion.
	CodePureFnDepUnbuilt = "PFE9016"
	// CodePureFnArtifactUnreadable: an installed package's `mion-pure-fns/` file was skipped (an
	// index of a newer format or not one, a listed module missing or without its tuple).
	// LevelWarning: the package may then look unbuilt (PFE9016) or lack an id (PFE9012); this names
	// the cause.
	CodePureFnArtifactUnreadable = "PFE9017"
	// CodePureFnArtifactConflict: two `mion-pure-fns/` of one installed package give an id a
	// different body or name. LevelError: an id is one body, so serving either would silently pick
	// one build over the other.
	CodePureFnArtifactConflict = "PFE9018"
)

func init() {
	for _, definition := range []Definition{
		{Code: CodeDestructuredParam, Family: FamilyPureFn, Level: LevelError, Scope: ScopeNotSource, Title: "Pure-fn factory uses destructured parameter"},
		{Code: CodePureFnDependencyCycle, Family: FamilyPureFn, Level: LevelError, Scope: ScopeNotSource, Title: "Pure functions depend on each other in a cycle"},

		{Code: CodePurityThis, Family: FamilyPureFn, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "Pure-fn body references this"},
		{Code: CodePurityAwait, Family: FamilyPureFn, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "Pure-fn body contains await"},
		{Code: CodePurityYield, Family: FamilyPureFn, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "Pure-fn body contains yield"},
		{Code: CodePurityDynamicImport, Family: FamilyPureFn, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "Pure-fn body uses dynamic import"},
		{Code: CodePurityForbidden, Family: FamilyPureFn, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "Pure-fn body uses a forbidden global"},
		{Code: CodePurityClosure, Family: FamilyPureFn, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "Pure-fn body closes over outer binding"},

		{Code: CodeMissingPureFnDep, Family: FamilyPureFn, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "RT depends on missing pure-fn"},
		{Code: CodePurityDepNotLiteral, Family: FamilyPureFn, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "Pure-fn dep arg not a literal"},
		{Code: CodePureFnIdMismatch, Family: FamilyPureFn, Level: LevelError, Scope: ScopeNotSource, Title: "Explicit pure-fn id does not match the body it registers"},
		{Code: CodePureFnDepUnbuilt, Family: FamilyPureFn, Level: LevelError, Scope: ScopeNotSource, Title: "Pure-fn dep lives in a package that ships no compiled pure fns"},
		{Code: CodePureFnArtifactUnreadable, Family: FamilyPureFn, Level: LevelWarning, Scope: ScopeNotSource, Title: "Pure-fn artifact of an installed package could not be read"},
		{Code: CodePureFnArtifactConflict, Family: FamilyPureFn, Level: LevelError, Scope: ScopeNotSource, Title: "Two pure-fn artifact directories of one package disagree on an id"},
	} {
		register(definition)
	}
}
