package diagnostics

// Request-batch codes (BATxxx). Issued by the batches extractor when a
// `batch([...])` call (recognised by the InjectBatchId brand on its resolved
// signature) cannot be read statically, or when two batches disagree. Every
// code is an ERROR: the batch id is spliced into the call at build time and
// a batch the build cannot read would otherwise ship without one.
const (
	// CodeBatchElementNotReadable: an element of the `[...]` routes argument is
	// not a route call the build can trace to the client routes proxy. Args:
	// [0] the reason (spread element, not a route call, …).
	CodeBatchElementNotReadable = "BAT001"
	// CodeBatchMappingConflict: two batches name the SAME ordered route ids but
	// carry different input mappings, so one id would stand for two different
	// server-side plans. Args: [0] the batch id. Related: the first site.
	CodeBatchMappingConflict = "BAT002"
	// CodeBatchSourceNotInBatch: an `inputFrom(source, …)` source route is not
	// in the batch, or sits AFTER the route it feeds (a route can only read the
	// output of one that ran before it). Args: [0] the source route id, [1] the
	// target route id.
	CodeBatchSourceNotInBatch = "BAT003"
	// CodeBatchIdCollision: two different ordered route lists hash to the same
	// batch id. Args: [0] the batch id. Related: the first site.
	CodeBatchIdCollision = "BAT004"
	// CodeBatchMapperNotReadable: an `inputFrom(source, mapper | name)` argument
	// is neither an inline mapper nor a readable name. Args: [0] the reason.
	CodeBatchMapperNotReadable = "BAT005"
)

func init() {
	for _, definition := range []Definition{
		{Code: CodeBatchElementNotReadable, Family: FamilyMarker, Severity: SeverityError, Scope: ScopeNotSource, Title: "`batch()` element is not a route call the build can read"},
		{Code: CodeBatchMappingConflict, Family: FamilyMarker, Severity: SeverityError, Scope: ScopeNotSource, Title: "Two batches share the same routes but map inputs differently"},
		{Code: CodeBatchSourceNotInBatch, Family: FamilyMarker, Severity: SeverityError, Scope: ScopeNotSource, Title: "`inputFrom()` source route is not in the batch, or runs after the route it feeds"},
		{Code: CodeBatchIdCollision, Family: FamilyMarker, Severity: SeverityError, Scope: ScopeNotSource, Title: "Two different route lists produced the same batch id"},
		{Code: CodeBatchMapperNotReadable, Family: FamilyMarker, Severity: SeverityError, Scope: ScopeNotSource, Title: "`inputFrom()` mapper is not readable at build time"},
	} {
		register(definition)
	}
}
