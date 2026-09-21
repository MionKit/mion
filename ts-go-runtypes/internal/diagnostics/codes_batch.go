package diagnostics

// Request-batch codes (BATxxx), raised when a `batch([...])` call (recognised by the InjectBatchId
// brand on its resolved signature) cannot be read statically, or when two batches collide.
//
// The levels split on whether the id is spliced. BAT001 / BAT002 / BAT004 / BAT005 / BAT006 drop the
// whole site, so no id is injected and `batch()` throws `batch-missing-id` before any network work:
// LevelError. BAT003 / BAT007 / BAT008 / BAT009 DO inject an id and the batch then fails against the
// server (BAT008 and BAT009 ship a call whose every request comes back a 404 `batch-unknown-id`):
// LevelRuntimeError.
const (
	// CodeBatchElementNotReadable: an element of the routes argument is not a route call the build
	// can trace to the client routes proxy. Args: [0] the reason.
	CodeBatchElementNotReadable = "BAT001"
	// CodeBatchSourceNotInBatch: an `inputFrom(source, …)` source route is not in the batch, or sits
	// AFTER the route it feeds (a route only reads the output of one that ran before it). Args:
	// [0] the source route id, [1] the target route id.
	CodeBatchSourceNotInBatch = "BAT002"
	// CodeBatchIdCollision: two different batch definitions hash to the same batch id. Args: [0] the
	// batch id. Related: the first site.
	CodeBatchIdCollision = "BAT003"
	// CodeBatchMapperNotReadable: an `inputFrom()` mapper argument is neither an inline mapper nor a
	// readable name. Args: [0] the reason.
	CodeBatchMapperNotReadable = "BAT004"
	// CodeBatchDuplicateRoute: the same route id is listed twice in one batch; the server keys the
	// body and the results by route id, so one route cannot run twice. Reported at the second
	// element. Args: [0] the route id.
	CodeBatchDuplicateRoute = "BAT005"
	// CodeBatchMappingParamOutOfRange: an `inputFrom()` sits at an argument position the target route
	// does not declare. Args: [0] the zero-based argument index, [1] the parameter count the route
	// declares, [2] the target route id.
	CodeBatchMappingParamOutOfRange = "BAT006"
	// CodeBatchMapperMissing: a batch names an inline `inputFrom()` mapper the source program
	// produced no pure function for, so the server has no body to register. Reported at the batch
	// call. Args: [0] the mapper id.
	CodeBatchMapperMissing = "BAT007"
	// CodeBatchOwnBatchIgnored: the build names a separate client project (`clientTsconfig`), so the
	// table comes from THAT program and this program's `batch()` calls never reach it. Reported at
	// each such call. Args: [0] the client tsconfig.
	CodeBatchOwnBatchIgnored = "BAT008"
	// CodeBatchNoRouterInit: batches exist and this program names `@mionjs/router`, but no module
	// calls `createMionRouter` directly (it sits behind a wrapper the build cannot see through), so
	// the table was written and nothing imports it. Args: [0] the table module's path.
	CodeBatchNoRouterInit = "BAT009"
)

func init() {
	for _, definition := range []Definition{
		{Code: CodeBatchElementNotReadable, Family: FamilyMarker, Level: LevelError, Scope: ScopeNotSource, Title: "`batch()` element is not a route call the build can read"},
		{Code: CodeBatchSourceNotInBatch, Family: FamilyMarker, Level: LevelError, Scope: ScopeNotSource, Title: "`inputFrom()` source route is not in the batch, or runs after the route it feeds"},
		{Code: CodeBatchIdCollision, Family: FamilyMarker, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "Two different batches produced the same batch id"},
		{Code: CodeBatchMapperNotReadable, Family: FamilyMarker, Level: LevelError, Scope: ScopeNotSource, Title: "`inputFrom()` mapper is not readable at build time"},
		{Code: CodeBatchDuplicateRoute, Family: FamilyMarker, Level: LevelError, Scope: ScopeNotSource, Title: "The same route is listed twice in one `batch()`"},
		{Code: CodeBatchMappingParamOutOfRange, Family: FamilyMarker, Level: LevelError, Scope: ScopeNotSource, Title: "`inputFrom()` sits at an argument position the target route does not declare"},
		{Code: CodeBatchMapperMissing, Family: FamilyMarker, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "A batch names an inline `inputFrom()` mapper the build produced no pure function for"},
		{Code: CodeBatchOwnBatchIgnored, Family: FamilyMarker, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "A `batch()` in the server program is ignored because the batch table comes from the client project named by `clientTsconfig`"},
		{Code: CodeBatchNoRouterInit, Family: FamilyMarker, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "The batch table was written but no module calls `createMionRouter` directly, so nothing imports it"},
	} {
		register(definition)
	}
}
