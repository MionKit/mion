package diagnostics

// Request-batch codes (rpc-batch-*), raised when a `batch([...])` call (recognised by the InjectBatchId
// brand on its resolved signature) cannot be read statically, or when two batches collide.
//
// Every code is LevelRuntimeError: the call still runs. A dropped site injects no id, so `batch()` throws
// `batch-missing-id` before any network work; rpc-batch-router-init-hidden 404s every request as `batch-unknown-id`.
const (
	// CodeBatchElementNotReadable: the route list is built at runtime, or an element's type is not a `RouteSubRequest`
	// with a string-literal id. Args: [0] reason.
	CodeBatchElementNotReadable = "rpc-batch-element-unreadable"
	// CodeBatchSourceNotInBatch: an `inputFrom(source, …)` source route is not in the batch, or sits
	// AFTER the route it feeds (a route only reads the output of one that ran before it). Args:
	// [0] the source route id, [1] the target route id.
	CodeBatchSourceNotInBatch = "rpc-batch-source-not-before"
	// CodeBatchIdCollision: two different batch definitions hash to the same batch id. Args: [0] the
	// batch id. Related: the first site.
	CodeBatchIdCollision = "rpc-batch-id-collision"
	// CodeBatchMapperNotReadable: an `inputFrom()` mapper argument is neither an inline mapper nor a
	// readable name. Args: [0] the reason.
	CodeBatchMapperNotReadable = "rpc-batch-mapper-unreadable"
	// CodeBatchDuplicateRoute: the same route id is listed twice in one batch; the server keys the
	// body and the results by route id, so one route cannot run twice. Reported at the second
	// element. Args: [0] the route id.
	CodeBatchDuplicateRoute = "rpc-batch-duplicate-route"
	// CodeBatchMappingParamOutOfRange: an `inputFrom()` sits at an argument position the target route
	// does not declare. Args: [0] the zero-based argument index, [1] the parameter count the route
	// declares, [2] the target route id.
	CodeBatchMappingParamOutOfRange = "rpc-batch-argument-out-of-range"
	// CodeBatchMapperMissing: a batch names an inline `inputFrom()` mapper the source program
	// produced no pure function for, so the server has no body to register. Reported at the batch
	// call. Args: [0] the mapper id.
	CodeBatchMapperMissing = "rpc-batch-mapper-missing"
	// CodeBatchNoRouterInit: batches exist and this program names `@mionjs/router`, but no module
	// calls `createMionRouter` directly (it sits behind a wrapper the build cannot see through), so
	// the table was written and nothing imports it. Args: [0] the table module's path.
	CodeBatchNoRouterInit = "rpc-batch-router-init-hidden"
	// CodeBatchTooManyCombinations: the items' possible routes multiply past the per-call batch cap. Args: [0] the cap.
	CodeBatchTooManyCombinations = "rpc-batch-too-many-combinations"
)

func init() {
	for _, definition := range []Definition{
		{Code: CodeBatchElementNotReadable, Family: FamilyMarker, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "A `batch()` route list can't be determined at compile time"},
		{Code: CodeBatchSourceNotInBatch, Family: FamilyMarker, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "`inputFrom()` source route is not in the batch, or runs after the route it feeds"},
		{Code: CodeBatchIdCollision, Family: FamilyMarker, Level: LevelRuntimeError, Scope: ScopeNotSource, Raised: RaisedWholeProgram, Title: "Two different batches produced the same batch id"},
		{Code: CodeBatchMapperNotReadable, Family: FamilyMarker, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "`inputFrom()` mapper is not readable at build time"},
		{Code: CodeBatchDuplicateRoute, Family: FamilyMarker, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "The same route is listed twice in one `batch()`"},
		{Code: CodeBatchMappingParamOutOfRange, Family: FamilyMarker, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "`inputFrom()` sits at an argument position the target route does not declare"},
		{Code: CodeBatchMapperMissing, Family: FamilyMarker, Level: LevelRuntimeError, Scope: ScopeNotSource, Raised: RaisedWholeProgram, Title: "A batch names an inline `inputFrom()` mapper the build produced no pure function for"},
		{Code: CodeBatchTooManyCombinations, Family: FamilyMarker, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "A `batch()` may run more route combinations than one call can compile"},
		{Code: CodeBatchNoRouterInit, Family: FamilyMarker, Level: LevelRuntimeError, Scope: ScopeNotSource, Raised: RaisedWholeProgram, Title: "The batch table was written but no module calls `createMionRouter` directly, so nothing imports it"},
	} {
		register(definition)
	}
}
