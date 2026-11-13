package diagnostics

// Request-batch codes (rpc-batch-*), raised when a `batch([...])` call (recognised by the InjectBatchId
// brand on its resolved signature) cannot be read statically, or when two batches collide.
//
// Every code is LevelRuntimeError: the call still runs. A dropped site injects no id, so `batch()` throws
// `batch-missing-id` before any network work; rpc-batch-router-init-hidden 404s every request as `batch-unknown-id`.
const (
	// CodeBatchElementNotReadable: runtime-built list, or an item not a `RouteSubRequest` with a literal id. Args: [0] reason.
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
		{Code: CodeBatchElementNotReadable, Family: FamilyMarker, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "A `batch()` route list can't be determined at compile time",
			Headline: "This `batch()` route list can't be determined at compile time ({reason}); write the route calls in an array literal, each typed with its route id.",
			Summary:  "The server only runs batches compiled at build time, so the build must know a `batch()` call's route list. It reads which route each item in `batch([...])` runs from its type: a route call like `routes.users.getById(1)` is typed with its route id, wherever the client comes from (`initClient()`, `inject()`, a composable, `useNuxtApp()`, a helper). It cannot read a list built at runtime (a variable, `.map()`, a spread), a value that is not a route call, or a type that lost the id, such as `RouteSubRequest<any>` or an annotation with a `string` id. Such a batch is never compiled, so the call throws `batch-missing-id`.",
			Fix: `function getUser(id: number) {
  return routes.users.getById(id); // inferred: keeps the route id
}
batch([getUser(1), routes.orders.list()]);`,
		},
		{Code: CodeBatchSourceNotInBatch, Family: FamilyMarker, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "`inputFrom()` source route is not in the batch, or runs after the route it feeds",
			Headline: "`inputFrom()` reads route `{source}` for route `{target}`, but the source is not in this batch or runs after the target; sources must be listed before the routes they feed.",
			Summary:  "Routes in a batch run in the order you list them, and `inputFrom()` can only read a route that already ran. Put the source route in the same `batch([...])` call, before the route it feeds.",
			Fix:      "batch([user, routes.orders.list(inputFrom(user, 'toUserId'))]);",
		},
		{Code: CodeBatchIdCollision, Family: FamilyMarker, Level: LevelRuntimeError, Scope: ScopeNotSource, Raised: RaisedWholeProgram, Title: "Two different batches produced the same batch id",
			Headline: "Batch id `{id}` is shared by two different batches; reorder the routes of one of them so the ids no longer collide.",
			Summary:  "Two different batches got the same id, so the server cannot tell them apart. The id is built from the route order and the input mappings, and this almost never happens. Change the route order of one batch, or split it into two batches.",
		},
		{Code: CodeBatchMapperNotReadable, Family: FamilyMarker, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "`inputFrom()` mapper is not readable at build time",
			Headline: "`inputFrom()` mapping is not readable at build time ({reason}); pass an inline arrow function or a string literal mapper name, as an argument of a route call written in the batch or held in a variable.",
			Summary:  "The mapper you pass to `inputFrom()` must be an inline function, or a string with the name of a mapper registered on the server. A function reference, a computed string or a value from a parameter cannot be read at build time. The build reads a mapping only as an argument of a route call written in the batch or held in a variable, and only when its source and the route it feeds are each one route: one passed through a helper's arguments or written in a ternary arm would be lost.",
			Fix: `inputFrom(user, (u) => u.id);
// or the name of a mapper registered on the server
inputFrom(user, 'toUserId');`,
		},
		{Code: CodeBatchDuplicateRoute, Family: FamilyMarker, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "The same route is listed twice in one `batch()`",
			Headline: "Route `{route}` is listed twice in this `batch()`; a batch runs each route once, so drop the duplicate or move it into a second batch.",
			Summary:  "One batch cannot call the same route twice. Results come back by route, so the second call would replace the first. Keep one call per route, or split the calls into two batches.",
			Fix: `batch([routes.users.getById(1)]);
batch([routes.users.getById(2)]);`,
		},
		{Code: CodeBatchMappingParamOutOfRange, Family: FamilyMarker, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "`inputFrom()` sits at an argument position the target route does not declare",
			Headline: "`inputFrom()` sits at argument index {index} of route `{route}`, which declares only {count} parameter(s); move the mapping to an argument the route declares.",
			Summary:  "The server passes a mapped input at the argument position where you wrote `inputFrom()`, so that position (counted from zero) must be one of the route handler's parameters. Otherwise the server would reject the request at runtime.",
			Fix: `// getById(id) takes 1 argument
routes.orders.getById(inputFrom(user, 'toUserId'));`,
		},
		{Code: CodeBatchMapperMissing, Family: FamilyMarker, Level: LevelRuntimeError, Scope: ScopeNotSource, Raised: RaisedWholeProgram, Title: "A batch names an inline `inputFrom()` mapper the build produced no pure function for",
			Headline: "Batch mapper `{mapper}` has no generated pure function in this program; the server build cannot register it.",
			Summary:  "Each inline `inputFrom(source, (value) => ...)` mapper becomes a pure function the server build copies next to the batch table. This one produced nothing, so the server would answer the batch with a missing mapper error. Fix the pure function errors (`purefn-*`) at its `inputFrom()` call, or use the name of a mapper registered on the server.",
			Fix:      "inputFrom(user, 'toOrgId')",
		},
		{Code: CodeBatchTooManyCombinations, Family: FamilyMarker, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "A `batch()` may run more route combinations than one call can compile",
			Headline: "This `batch()` may run more than {max} route combinations; split it, or narrow the items that may be more than one route.",
			Summary:  "An item whose type may be more than one route (a ternary, an `if`, a helper with several returns) makes one batch per combination, and the combinations multiply. Past the limit the batch is not compiled, so the call throws `batch-missing-id`. Split the call into smaller batches, or narrow the items.",
			Fix: `const user = isAdmin ? routes.admins.getById(id) : routes.users.getById(id);
batch([user, routes.orders.list()]);`,
		},
		{Code: CodeBatchNoRouterInit, Family: FamilyMarker, Level: LevelRuntimeError, Scope: ScopeNotSource, Raised: RaisedWholeProgram, Title: "The batch table was written but no module calls `createMionRouter` directly, so nothing imports it",
			Headline: "The batch table {file} was written, but no module of this program calls `createMionRouter` directly, so nothing imports it; import it by hand in the module that creates the router.",
			Summary:  "The build adds the batch table import to every module that calls `createMionRouter` from `@mionjs/router`, following aliases, namespace imports and local re-export files. It found none, for example because a wrapper from another package creates the router, so the server never loads the table. Import the table yourself in the module that creates the router (path relative to that module), or call `createMionRouter` from a source file of this project.",
			Fix:      "import './<genDir>/rpc/batches.generated.js';",
		},
	} {
		Register(definition)
	}
}
