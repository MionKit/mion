package diagnostics

// Request-batch codes (BATxxx). Issued by the request-batch extractor when a
// `batch([...])` call (recognised by the InjectBatchId brand on its resolved
// signature) cannot be read statically, or when two batches collide. Every
// code is an ERROR: the batch id is spliced into the call at build time and
// a batch the build cannot read would otherwise ship without one.
const (
	// CodeBatchElementNotReadable: an element of the `[...]` routes argument is
	// not a route call the build can trace to the client routes proxy. Args:
	// [0] the reason (spread element, not a route call, …).
	CodeBatchElementNotReadable = "BAT001"
	// CodeBatchSourceNotInBatch: an `inputFrom(source, …)` source route is not
	// in the batch, or sits AFTER the route it feeds (a route can only read the
	// output of one that ran before it). Args: [0] the source route id, [1] the
	// target route id.
	CodeBatchSourceNotInBatch = "BAT002"
	// CodeBatchIdCollision: two different batch definitions (routes or
	// mappings) hash to the same batch id. Args: [0] the batch id. Related: the
	// first site.
	CodeBatchIdCollision = "BAT003"
	// CodeBatchMapperNotReadable: an `inputFrom(source, mapper | name)` argument
	// is neither an inline mapper nor a readable name. Args: [0] the reason.
	CodeBatchMapperNotReadable = "BAT004"
	// CodeBatchDuplicateRoute: the same route id is listed twice in one batch.
	// The server keys the request body and the results by route id, so a batch
	// cannot run one route twice. Reported at the second element. Args: [0] the
	// route id.
	CodeBatchDuplicateRoute = "BAT005"
	// CodeBatchMappingParamOutOfRange: an `inputFrom()` sits at an argument
	// position the target route does not declare (its handler takes fewer
	// parameters). Args: [0] the zero-based argument index, [1] the number of
	// parameters the route declares, [2] the target route id.
	CodeBatchMappingParamOutOfRange = "BAT006"
)

func init() {
	for _, definition := range []Definition{
		{Code: CodeBatchElementNotReadable, Family: FamilyMarker, Severity: SeverityError, Scope: ScopeNotSource, Title: "`batch()` element is not a route call the build can read"},
		{Code: CodeBatchSourceNotInBatch, Family: FamilyMarker, Severity: SeverityError, Scope: ScopeNotSource, Title: "`inputFrom()` source route is not in the batch, or runs after the route it feeds"},
		{Code: CodeBatchIdCollision, Family: FamilyMarker, Severity: SeverityError, Scope: ScopeNotSource, Title: "Two different batches produced the same batch id"},
		{Code: CodeBatchMapperNotReadable, Family: FamilyMarker, Severity: SeverityError, Scope: ScopeNotSource, Title: "`inputFrom()` mapper is not readable at build time"},
		{Code: CodeBatchDuplicateRoute, Family: FamilyMarker, Severity: SeverityError, Scope: ScopeNotSource, Title: "The same route is listed twice in one `batch()`"},
		{Code: CodeBatchMappingParamOutOfRange, Family: FamilyMarker, Severity: SeverityError, Scope: ScopeNotSource, Title: "`inputFrom()` sits at an argument position the target route does not declare"},
	} {
		register(definition)
	}
}
