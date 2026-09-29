// GENERATED FILE. DO NOT EDIT. Run `pnpm miondevx core codegen diag` to refresh.
//
// The message dictionary for every diagnostic code the Go binary can emit,
// exported from the authoritative catalog in internal/diagnostics (wording lives in
// internal/diagnostics/messages.go). The wire carries only code + args; the render
// helpers in ./diagnosticCatalog.ts substitute `{0}`, `{1}`, … placeholders
// against the args array to produce the final text.

export interface DiagnosticEntry {
  /** Single-line headline. Mandatory. */
  readonly headline: string;
  /** The code's level: did the build produce the code for
   *  this thing (`error`: no), and is what it produced broken when called
   *  (`runtimeError`: yes). Read by the config validators, which refuse to
   *  downgrade an `error`. */
  readonly level: 'error' | 'runtimeError' | 'warning' | 'info';
  /** Which part of the compiler raises the code. */
  readonly family: 'purefn' | 'marker' | 'runtype' | 'enrich' | 'mionroute';
  /** Set on the unfilled-enrichment-scaffold codes. Orthogonal to level: those
   *  are warnings, and this bit is what the completeness gates promote. */
  readonly completeness?: boolean;
}

export const DIAGNOSTIC_CATALOG: Record<string, DiagnosticEntry> = {
  BAT001: {
    headline:
      '`batch()` element is not a route call the build can read ({0}); write `routes.a.b(...)` inline or bind it to a `const`/`let` in this file.',
    level: 'error',
    family: 'marker',
  },
  BAT002: {
    headline:
      '`inputFrom()` reads route `{0}` for route `{1}`, but the source is not in this batch or runs after the target; sources must be listed before the routes they feed.',
    level: 'error',
    family: 'marker',
  },
  BAT003: {
    headline:
      'Batch id `{0}` is shared by two different batches; reorder the routes of one of them so the ids no longer collide.',
    level: 'runtimeError',
    family: 'marker',
  },
  BAT004: {
    headline:
      '`inputFrom()` mapper is not readable at build time ({0}); pass an inline arrow function or a string literal mapper name.',
    level: 'error',
    family: 'marker',
  },
  BAT005: {
    headline:
      'Route `{0}` is listed twice in this `batch()`; a batch runs each route once, so drop the duplicate or move it into a second batch.',
    level: 'error',
    family: 'marker',
  },
  BAT006: {
    headline:
      '`inputFrom()` sits at argument index {0} of route `{2}`, which declares only {1} parameter(s); move the mapping to an argument the route declares.',
    level: 'error',
    family: 'marker',
  },
  BAT007: {
    headline:
      'Batch mapper `{0}` has no generated pure function in the batch source program; the server build cannot register it.',
    level: 'runtimeError',
    family: 'marker',
  },
  BAT008: {
    headline:
      'This `batch()` is ignored: the batch table is generated from the client project `{0}`, and batches written in the server program itself never reach it.',
    level: 'runtimeError',
    family: 'marker',
  },
  BAT009: {
    headline:
      'The batch table {0} was written, but no module of this program calls `createMionRouter` directly, so nothing imports it; import it by hand in the module that creates the router.',
    level: 'runtimeError',
    family: 'marker',
  },
  CFG001: {
    headline:
      'Project tsconfig failed to load ({0}): the build, the linter, and the CLI all read this config, so nothing can run until it loads.',
    level: 'error',
    family: 'marker',
  },
  CFG002: {
    headline:
      'The project `lib` declares no base ECMAScript library (loaded: {0}), so core globals like `Array` are missing and reflected types cannot be trusted.',
    level: 'runtimeError',
    family: 'marker',
  },
  CFG003: {
    headline:
      '`mion compile` refused to write {0}: it lands outside outDir ({1}) because its source sits outside rootDir; move rootDir up so every file of the program is under it, or reach that module through its package name.',
    level: 'error',
    family: 'marker',
  },
  CTA001: {
    headline:
      '`CompTimeArgs<T>` argument must be a literal at the call site, or a `const` whose initializer is itself entirely literal (a same-module or imported `const` both work).',
    level: 'runtimeError',
    family: 'marker',
  },
  CTA002: {
    headline: '`CompTimeArgs<T>` literal nesting exceeds the depth cap (16), refactor to flatten.',
    level: 'runtimeError',
    family: 'marker',
  },
  CTA003: {
    headline: '`CompTimeArgs<T>` literal contains a forbidden construct ({0}). Only literals and nested literals are allowed.',
    level: 'runtimeError',
    family: 'marker',
  },
  CTA004: {
    headline:
      '`CompTimeArgs<T>` value comes from a `const` with a widened (non-literal) member ({0}); declare the const `as const`.',
    level: 'runtimeError',
    family: 'marker',
  },
  DWN001: {
    headline:
      'Unused `@mion-downgrade-error {0}`: nothing was reported on the line below it, so the comment is stale and can be deleted.',
    level: 'warning',
    family: 'marker',
  },
  DWN002: {
    headline:
      '`@mion-downgrade-error {0}` cannot lower that code: the build produces no code for it, so carrying on would ship missing output.',
    level: 'warning',
    family: 'marker',
  },
  DWN003: {
    headline:
      '`@mion-downgrade-error {0}` names a diagnostic code that does not exist; check the spelling against the code in the message you are lowering.',
    level: 'warning',
    family: 'marker',
  },
  DWN004: {
    headline:
      '`@mion-downgrade-error {0}` does nothing: that code is already a warning or info, so it was never halting your build.',
    level: 'info',
    family: 'marker',
  },
  EXP001: {
    headline:
      'Unused `@mion-expect-error {0}`: nothing was reported on the line below it, so the comment is stale and can be deleted.',
    level: 'warning',
    family: 'marker',
  },
  EXP002: {
    headline: '`@mion-expect-error {0}` cannot silence that code: it is reported even when everything else is silenced.',
    level: 'warning',
    family: 'marker',
  },
  EXP003: {
    headline:
      '`@mion-expect-error {0}` names a diagnostic code that does not exist; check the spelling against the code in the message you are silencing.',
    level: 'warning',
    family: 'marker',
  },
  FMT001: {
    headline: 'TypeFormat mockSample "{0}" does not match its pattern /{1}/; fix the sample or the pattern.',
    level: 'runtimeError',
    family: 'runtype',
  },
  FMT002: {
    headline: 'Invalid type-format params: {0}',
    level: 'runtimeError',
    family: 'runtype',
  },
  FMT003: {
    headline: 'TypeFormat mockSample violates a sibling constraint: {0}',
    level: 'runtimeError',
    family: 'runtype',
  },
  FMT004: {
    headline:
      'TypeFormat pattern /{0}/ cannot be checked: {1}; pattern validation requires a JavaScript runtime; install one or pass --js-runtime.',
    level: 'runtimeError',
    family: 'runtype',
  },
  FMT005: {
    headline: 'Cannot auto-generate mockSamples for pattern /{0}/: {1}; declare mockSamples explicitly.',
    level: 'runtimeError',
    family: 'runtype',
  },
  FMT006: {
    headline:
      'Two sites share one cache entry for format `{0}` but declare different mockSamples: `{1}` here vs `{2}` at {3}. Make the pools identical, or declare one and leave the other out.',
    level: 'runtimeError',
    family: 'runtype',
  },
  FMT007: {
    headline:
      'TypeFormat pattern /{0}/ could not be evaluated in time: {1}; the build was not able to tell whether the pattern is safe.',
    level: 'runtimeError',
    family: 'runtype',
  },
  FMT008: {
    headline:
      'TypeFormat pattern /{0}/ can be made to backtrack exponentially: {1} (`{2}`); a crafted input would hang the validator.',
    level: 'runtimeError',
    family: 'runtype',
  },
  FT002: {
    headline: 'Unknown field `{0}`: the type does not declare it, so this FriendlyText entry is dead.',
    level: 'warning',
    family: 'enrich',
  },
  FT003: {
    headline: 'Error key `{0}` is not a declared constraint of this field: the message can never fire.',
    level: 'warning',
    family: 'enrich',
  },
  FT005: {
    headline: 'Unknown placeholder `$[{0}]`: expected one of `$[label]`, `$[val]`, `$[path]`, `$[index]`.',
    level: 'warning',
    family: 'enrich',
  },
  FT006: {
    headline: 'Plural error template is missing the mandatory `other` arm: the render has no backstop.',
    level: 'warning',
    family: 'enrich',
  },
  FT007: {
    headline: 'Unknown plural arm `{0}`: CLDR categories are `zero`, `one`, `two`, `few`, `many`, `other`.',
    level: 'warning',
    family: 'enrich',
  },
  FT008: {
    headline: 'Constraint `{0}` carries no count: a plural template here has dead arms; use a plain string.',
    level: 'info',
    family: 'enrich',
  },
  FT009: {
    headline: '`rt$default` is mutually exclusive with per-constraint messages; use one mode or the other.',
    level: 'warning',
    family: 'enrich',
  },
  FT011: {
    headline: 'Property `{0}` collides with the reserved `rt$` enrichment prefix: the type cannot be enriched.',
    level: 'error',
    family: 'enrich',
  },
  FT020: {
    headline: 'Unfilled `@todo` placeholder; fill in the real labels/messages, then delete the `@todo` line.',
    level: 'warning',
    family: 'enrich',
    completeness: true,
  },
  FT021: {
    headline: 'Stale `@rtOrphan` carcass; run `mion enrich --prune` to remove it (or restore the type).',
    level: 'warning',
    family: 'enrich',
  },
  FT022: {
    headline: 'Stale `@rtOrphanChild` field carcass; run `mion enrich --prune` to remove it (or restore the field).',
    level: 'warning',
    family: 'enrich',
  },
  FT023: {
    headline: 'Unfilled blank value: a scaffolded label or message is still empty; fill in the real text.',
    level: 'warning',
    family: 'enrich',
    completeness: true,
  },
  GE000: {
    headline: 'Cannot read enrichment mirror file: {0}',
    level: 'error',
    family: 'enrich',
  },
  GE001: {
    headline: 'Mirror location drift: the source maps to `{0}` but this file lives at `{1}`; re-run `mion enrich` to relocate.',
    level: 'warning',
    family: 'enrich',
  },
  GE002: {
    headline: 'Breadcrumb source `{0}` no longer exists ({1}): the mirror is orphaned; delete it or re-run `mion enrich`.',
    level: 'runtimeError',
    family: 'enrich',
  },
  GE003: {
    headline: 'Source {0} no longer declares type `{1}`; re-run `mion enrich`.',
    level: 'runtimeError',
    family: 'enrich',
  },
  JCP001: {
    headline:
      'Internal error: JSON composite `{0}` references primitive entry `{1}` (type `{2}`) which was never rendered; please file an issue.',
    level: 'runtimeError',
    family: 'runtype',
  },
  MD001: {
    headline: 'Unknown field `{0}`: the type does not declare it, so this MockData entry is dead.',
    level: 'warning',
    family: 'enrich',
  },
  MD011: {
    headline: 'Property `{0}` collides with the reserved `rt$` enrichment prefix: the type cannot be enriched.',
    level: 'error',
    family: 'enrich',
  },
  MD020: {
    headline: 'Unfilled `@todo` placeholder; fill in the real sample pools/ranges, then delete the `@todo` line.',
    level: 'warning',
    family: 'enrich',
    completeness: true,
  },
  MD021: {
    headline: 'Stale `@rtOrphan` carcass; run `mion enrich --prune` to remove it (or restore the type).',
    level: 'warning',
    family: 'enrich',
  },
  MD022: {
    headline: 'Stale `@rtOrphanChild` field carcass; run `mion enrich --prune` to remove it (or restore the field).',
    level: 'warning',
    family: 'enrich',
  },
  MD023: {
    headline: 'Unfilled blank value: a scaffolded sample pool or range is still empty; fill in real data.',
    level: 'warning',
    family: 'enrich',
    completeness: true,
  },
  MET001: {
    headline:
      'The API type at this dispatch site cannot be read as a mion PublicApi ({0}); bundleApi needs `PublicApi<typeof routes>`.',
    level: 'error',
    family: 'marker',
  },
  MET002: {
    headline: 'This call names the route `{0}`, which the API type does not declare; nothing is bundled for it.',
    level: 'error',
    family: 'marker',
  },
  MET003: {
    headline:
      'The route id at this call is `string` (a generic helper erased it), so nothing is bundled for it, and this client never sets up `useMethodsMetadata`: the call fails.',
    level: 'runtimeError',
    family: 'marker',
  },
  MET004: {
    headline:
      'The route id at this call is `string` (a generic helper erased it); the call fetches its metadata from the server instead of using the bundle.',
    level: 'info',
    family: 'marker',
  },
  MET005: {
    headline:
      'The API program {0} has {1} `initRoutes(...)` call(s) declaring the routes this client calls; bundleApi needs exactly one.',
    level: 'error',
    family: 'marker',
  },
  MET006: {
    headline: 'Option `{0}` of `{1}` is not a literal on the API type, so the bundled metadata leaves it unset.',
    level: 'warning',
    family: 'marker',
  },
  MET007: {
    headline:
      'This client injects the build version {0} but the API in the same program injects {1}; the client reports a version mismatch against its own server.',
    level: 'runtimeError',
    family: 'marker',
  },
  MET008: {
    headline:
      'The route `{1}` runs the middleware `{0}`, which needs params, but this client never sets it up; every call to the route fails its validation.',
    level: 'runtimeError',
    family: 'marker',
  },
  MET009: {
    headline:
      'The route `{1}` runs the middleware `{0}`, but this client never sets it up, so the middleware never gets its params.',
    level: 'runtimeError',
    family: 'marker',
  },
  MET010: {
    headline:
      'This client fetches route metadata, but the API it calls does not place `mionMethodsMetadata`, so every fetch fails.',
    level: 'runtimeError',
    family: 'marker',
  },
  MET011: {
    headline:
      "This client builds with `bundleApi: false`, so every call fetches its route's metadata, but it never sets up `useMethodsMetadata`: every call fails.",
    level: 'runtimeError',
    family: 'marker',
  },
  MKR001: {
    headline:
      '`{0}()` is being called at runtime just so the marker can read its return type: side effects, throws, or async work run for nothing.',
    level: 'warning',
    family: 'marker',
  },
  MKR003: {
    headline:
      'Marker call is inside a generic function: the type argument is unresolved, so no id can be computed at build time.',
    level: 'error',
    family: 'marker',
  },
  MKR006: {
    headline: '`InjectTypeFnArgs` names the function family `{0}` more than once; remove the duplicate key.',
    level: 'info',
    family: 'marker',
  },
  MKR007: {
    headline:
      'Marker type resolved to `any` because this file has an unresolved import (`{0}`): the generated functions would silently accept anything.',
    level: 'runtimeError',
    family: 'marker',
  },
  MKR008: {
    headline:
      'This type is too deeply nested to reflect: computing its structural id hit the recursion depth cap, so the build stops here instead of crashing.',
    level: 'error',
    family: 'marker',
  },
  MKR009: {
    headline:
      'Type `{0}` re-instantiates itself with fresh type arguments at every level (a self-instantiating generic), so its structural id never resolves. Reflect a monomorphic shape instead.',
    level: 'error',
    family: 'marker',
  },
  MKR010: {
    headline:
      'Type argument contains the unresolved type parameter `{0}`: a generic must be fully resolved at the marker call, so no id can be computed. See Related for where `{0}` is declared.',
    level: 'error',
    family: 'marker',
  },
  MKR011: {
    headline:
      'Generic type `{0}` is used without its required type argument(s): parameter `{1}` has no default, so the type cannot resolve to an id. See Related for where `{1}` is declared.',
    level: 'error',
    family: 'marker',
  },
  MKR012: {
    headline:
      '`{0}` here was declared by `{1}`, which this project does not trust as a marker package, so the type argument was dropped and this call reflects `unknown`.',
    level: 'runtimeError',
    family: 'marker',
  },
  MKR013: {
    headline:
      'Marker type resolved to `any` that was never written: `{0}` failed to resolve (or its declaration references a name that does not), so the generated functions would silently accept anything.',
    level: 'runtimeError',
    family: 'marker',
  },
  MKR014: {
    headline:
      'Two different types get the same id `{0}`: `{1}` from {4}, and `{2}` here. Raise the `hashLength` option to {3} so every type keeps its own id.',
    level: 'error',
    family: 'marker',
  },
  MKR015: {
    headline: '`InjectTypeFnArgs` names `{0}`, which is not a function family{1}',
    level: 'error',
    family: 'marker',
  },
  MRT001: {
    headline: 'mion `{0}` handler has no return type annotation; write the type the handler answers with.',
    level: 'runtimeError',
    family: 'mionroute',
  },
  MRT002: {
    headline:
      'mion `{1}` handler parameter `{0}` has no type annotation; every parameter after the call context travels on the wire and must declare its type.',
    level: 'runtimeError',
    family: 'mionroute',
  },
  MRT003: {
    headline:
      'mion `{0}` handlers must return errors, not throw them; return an `RpcError` to let the chain continue, or a `FatalError` to stop the request.',
    level: 'runtimeError',
    family: 'mionroute',
  },
  MRT004: {
    headline:
      'mion `{1}` handler declares it can answer with `{0}`, which is not an `RpcError`; only an `RpcError` (or a subclass such as `FatalError`) carries the mion brand.',
    level: 'runtimeError',
    family: 'mionroute',
  },
  MRT005: {
    headline: 'Property `{0}` can never be data and is dropped from every compiled function; rename it.',
    level: 'warning',
    family: 'mionroute',
  },
  NE001: {
    headline:
      'Property `{0}` is tagged @nonEnumerable but is required: the guard only applies to optional properties, so the tag has no effect. Make it optional (`{0}?`) or remove the tag.',
    level: 'warning',
    family: 'runtype',
  },
  OVR001: {
    headline: 'Duplicate override for `{0}`: there can be exactly one override per (type, function).',
    level: 'runtimeError',
    family: 'marker',
  },
  OVR002: {
    headline:
      'Override entry `{0}` references compiled function `{1}` which did not render: this would throw at runtime, so the build stops.',
    level: 'runtimeError',
    family: 'marker',
  },
  OVR010: {
    headline: 'Overriding `validate` for this type also changes how JSON decoders narrow unions containing it.',
    level: 'info',
    family: 'marker',
  },
  PFE9005: {
    headline: 'Pure-fn factory `{0}` uses destructured parameters; only simple identifier params are supported.',
    level: 'error',
    family: 'purefn',
  },
  PFE9006: {
    headline: "`this` is not allowed inside a pure-fn factory body; pure functions can't depend on a calling context.",
    level: 'runtimeError',
    family: 'purefn',
  },
  PFE9007: {
    headline: '`async`/`await` is not allowed inside a pure-fn factory body.',
    level: 'runtimeError',
    family: 'purefn',
  },
  PFE9008: {
    headline: '`yield` / generators are not allowed inside a pure-fn factory body.',
    level: 'runtimeError',
    family: 'purefn',
  },
  PFE9009: {
    headline: '`import()` is not allowed inside a pure-fn factory body.',
    level: 'runtimeError',
    family: 'purefn',
  },
  PFE9010: {
    headline: '`{0}` is not allowed inside a pure-fn factory body.',
    level: 'runtimeError',
    family: 'purefn',
  },
  PFE9011: {
    headline: "`{0}` is captured from outer scope inside a pure-fn factory; pure functions can't reach outside their own body.",
    level: 'runtimeError',
    family: 'purefn',
  },
  PFE9012: {
    headline: 'Pure fn `{0}` is referenced by a RT function but was never registered.',
    level: 'runtimeError',
    family: 'purefn',
  },
  PFE9013: {
    headline: '`{0}.{1}` dependency argument must be a pure-fn id.',
    level: 'runtimeError',
    family: 'purefn',
  },
  PFE9014: {
    headline: "Explicit pure-fn id `{0}` does not match this registration's computed id `{1}`.",
    level: 'error',
    family: 'purefn',
  },
  PFE9015: {
    headline: 'Pure functions circular dependency: `{0}` (`{1}`) reaches back into `{2}`.',
    level: 'error',
    family: 'purefn',
  },
  PFE9016: {
    headline: 'Pure fn `{0}` comes from `{1}`, which ships no compiled pure functions.',
    level: 'error',
    family: 'purefn',
  },
  PFE9017: {
    headline: '`{0}` could not be read as part of a pure-fn artifact: {1}.',
    level: 'warning',
    family: 'purefn',
  },
  PFE9018: {
    headline: 'Pure fn `{0}` differs between `{1}` and `{2}`.',
    level: 'error',
    family: 'purefn',
  },
  PFN001: {
    headline: '`PureFunction<F>` argument must be an INLINE arrow or function expression.',
    level: 'runtimeError',
    family: 'marker',
  },
  PFN002: {
    headline: '`PureFunction<F>` literal must not be imported or exported: the compiled copy must be the only one that can run.',
    level: 'runtimeError',
    family: 'marker',
  },
  PJ001: {
    headline: 'Type `{0}` can never be encoded to JSON: the generated function will always fail.',
    level: 'runtimeError',
    family: 'runtype',
  },
  PJ002: {
    headline: 'Type `{0}` can never be encoded to JSON: the generated function will always fail.',
    level: 'runtimeError',
    family: 'runtype',
  },
  PJ003: {
    headline: 'Type `{0}` can never be encoded to JSON: the generated function will always fail.',
    level: 'runtimeError',
    family: 'runtype',
  },
  PJ005: {
    headline: 'Type `{0}` can never be encoded to JSON: the generated function will always fail.',
    level: 'runtimeError',
    family: 'runtype',
  },
  PJ010: {
    headline:
      'Property `{0}` is a function: the JSON encoder does not handle function values, so this property is silently not encoded.',
    level: 'info',
    family: 'runtype',
  },
  PJ011: {
    headline: "Method `{0}` is silently not encoded: methods aren't data.",
    level: 'info',
    family: 'runtype',
  },
  PJ012: {
    headline: "Static member `{0}` is silently not encoded: statics aren't part of instance data.",
    level: 'info',
    family: 'runtype',
  },
  PJ013: {
    headline: "Symbol-keyed property `{0}` is silently not encoded: symbol keys aren't JSON-representable.",
    level: 'info',
    family: 'runtype',
  },
  PJ014: {
    headline:
      "Union member(s) of type `{0}` can't be represented as data: the JSON encoder drops them, so the union is encoded as its remaining members.",
    level: 'info',
    family: 'runtype',
  },
  PJ015: {
    headline:
      'Property `{0}` has a non-serialisable value type (symbol, Promise, or a non-serialisable built-in): the JSON encoder drops it, so this property is silently not encoded.',
    level: 'info',
    family: 'runtype',
  },
  PJS001: {
    headline: 'Type `{0}` can never be encoded to JSON: the generated function will always fail.',
    level: 'runtimeError',
    family: 'runtype',
  },
  PJS002: {
    headline: 'Type `{0}` can never be encoded to JSON: the generated function will always fail.',
    level: 'runtimeError',
    family: 'runtype',
  },
  PJS003: {
    headline: 'Type `{0}` can never be encoded to JSON: the generated function will always fail.',
    level: 'runtimeError',
    family: 'runtype',
  },
  PJS005: {
    headline: 'Type `{0}` can never be encoded to JSON: the generated function will always fail.',
    level: 'runtimeError',
    family: 'runtype',
  },
  PJS010: {
    headline:
      'Property `{0}` is a function: the JSON encoder does not handle function values, so this property is silently not encoded.',
    level: 'info',
    family: 'runtype',
  },
  PJS011: {
    headline: "Method `{0}` is silently not encoded: methods aren't data.",
    level: 'info',
    family: 'runtype',
  },
  PJS012: {
    headline: "Static member `{0}` is silently not encoded: statics aren't part of instance data.",
    level: 'info',
    family: 'runtype',
  },
  PJS013: {
    headline: "Symbol-keyed property `{0}` is silently not encoded: symbol keys aren't JSON-representable.",
    level: 'info',
    family: 'runtype',
  },
  PJS014: {
    headline:
      "Union member(s) of type `{0}` can't be represented as data: the JSON encoder drops them, so the union is encoded as its remaining members.",
    level: 'info',
    family: 'runtype',
  },
  PJS015: {
    headline:
      'Property `{0}` has a non-serialisable value type (symbol, Promise, or a non-serialisable built-in): the JSON encoder drops it, so this property is silently not encoded.',
    level: 'info',
    family: 'runtype',
  },
  RJ001: {
    headline: 'Type `{0}` can never be decoded from JSON: the generated function will always fail.',
    level: 'runtimeError',
    family: 'runtype',
  },
  RJ002: {
    headline: 'Type `{0}` can never be decoded from JSON: the generated function will always fail.',
    level: 'runtimeError',
    family: 'runtype',
  },
  RJ003: {
    headline: 'Type `{0}` can never be decoded from JSON: the generated function will always fail.',
    level: 'runtimeError',
    family: 'runtype',
  },
  RJ005: {
    headline: 'Type `{0}` can never be decoded from JSON: the generated function will always fail.',
    level: 'runtimeError',
    family: 'runtype',
  },
  RJ010: {
    headline:
      'Property `{0}` is a function: the JSON decoder does not handle function values, so this property is silently not decoded.',
    level: 'info',
    family: 'runtype',
  },
  RJ011: {
    headline: "Method `{0}` is silently not decoded: methods aren't data.",
    level: 'info',
    family: 'runtype',
  },
  RJ012: {
    headline: "Static member `{0}` is silently not decoded: statics aren't part of instance data.",
    level: 'info',
    family: 'runtype',
  },
  RJ013: {
    headline: "Symbol-keyed property `{0}` is silently not decoded: symbol keys aren't JSON-representable.",
    level: 'info',
    family: 'runtype',
  },
  RJ014: {
    headline:
      "Union member(s) of type `{0}` can't be represented as data: the JSON decoder drops them, so the union is decoded as its remaining members.",
    level: 'info',
    family: 'runtype',
  },
  RJ015: {
    headline:
      'Property `{0}` has a non-serialisable value type (symbol, Promise, or a non-serialisable built-in): the JSON decoder drops it, so this property is silently not decoded.',
    level: 'info',
    family: 'runtype',
  },
  RUK001: {
    headline:
      '`removeUnknownKeys` does not support unions with object members: the emitter cannot know which declared shape to rebuild at runtime.',
    level: 'runtimeError',
    family: 'runtype',
  },
  RUK004: {
    headline: 'Symbol-keyed {0} cannot be copied: the generated code cannot name your symbol, so the function always throws.',
    level: 'runtimeError',
    family: 'runtype',
  },
  RUK005: {
    headline:
      'The {0} has `#private` fields, which only its constructor can create: a copy would break its methods, so the function always throws.',
    level: 'runtimeError',
    family: 'runtype',
  },
  RUK006: {
    headline:
      "The value in {0} can only be shared with the input and `sharedValues: 'refuse'` is set, so the function always throws.",
    level: 'runtimeError',
    family: 'runtype',
  },
  RUK010: {
    headline: 'The function in {0} cannot be copied: the copy shares it with the input.',
    level: 'warning',
    family: 'runtype',
  },
  RUK011: {
    headline: "Method or accessor `{0}` is not copied: the copy keeps the input's prototype, so it still works.",
    level: 'info',
    family: 'runtype',
  },
  RUK012: {
    headline: 'Static member `{0}` is not part of instance data: `removeUnknownKeys` skips it.',
    level: 'info',
    family: 'runtype',
  },
  RUK015: {
    headline:
      'The value in {0} cannot be copied (a Promise, a RegExp or a built-in that is not data): the copy shares it with the input.',
    level: 'warning',
    family: 'runtype',
  },
  RUK016: {
    headline: "The value in {0} is shared with the input, as `sharedValues: 'share'` asks.",
    level: 'info',
    family: 'runtype',
  },
  SRV001: {
    headline:
      '`{0}` is passed to `initClient` but imported as a value from "{1}", which can put that server module in the client bundle; use `import type`.',
    level: 'runtimeError',
    family: 'marker',
  },
  TMP001: {
    headline:
      "Temporal type `{0}` resolved to `any`: the Temporal lib isn't in your tsconfig `lib`, so the generated validator would accept any value.",
    level: 'runtimeError',
    family: 'marker',
  },
  UPN001: {
    headline: 'Property `{0}` can never be data and is dropped: the rest of the type still works.',
    level: 'warning',
    family: 'runtype',
  },
  VE001: {
    headline: 'Type `{0}` can never be validated: the generated function will always fail.',
    level: 'runtimeError',
    family: 'runtype',
  },
  VE002: {
    headline: 'Type `{0}` can never be validated: the generated function will always fail.',
    level: 'runtimeError',
    family: 'runtype',
  },
  VE003: {
    headline: 'Type `{0}` can never be validated: the generated function will always fail.',
    level: 'runtimeError',
    family: 'runtype',
  },
  VE010: {
    headline:
      'Property `{0}` is a function: `validationErrors` does not handle function values, so this property is silently not checked.',
    level: 'info',
    family: 'runtype',
  },
  VE011: {
    headline: "Method `{0}` is silently not checked by `validationErrors`: methods aren't data.",
    level: 'info',
    family: 'runtype',
  },
  VE012: {
    headline: "Static member `{0}` is silently not checked by `validationErrors`: statics aren't part of instance data.",
    level: 'info',
    family: 'runtype',
  },
  VE013: {
    headline: "Symbol-keyed property `{0}` is silently not checked by `validationErrors`: symbol keys aren't JSON-representable.",
    level: 'info',
    family: 'runtype',
  },
  VE015: {
    headline:
      'Property `{0}` has a non-serialisable value type (symbol, Promise, or a non-serialisable built-in): `validationErrors` drops it, so this property is silently not checked.',
    level: 'info',
    family: 'runtype',
  },
  VE020: {
    headline: '`validationErrors` on `any` / `unknown` always returns an empty error array: nothing is checked.',
    level: 'info',
    family: 'runtype',
  },
  VL001: {
    headline: 'Type `{0}` can never be validated: the generated function will always fail.',
    level: 'runtimeError',
    family: 'runtype',
  },
  VL002: {
    headline: 'Type `{0}` can never be validated: the generated function will always fail.',
    level: 'runtimeError',
    family: 'runtype',
  },
  VL003: {
    headline: 'Type `{0}` can never be validated: the generated function will always fail.',
    level: 'runtimeError',
    family: 'runtype',
  },
  VL010: {
    headline:
      'Property `{0}` is a function: `validate` does not handle function values, so this property is silently not validated.',
    level: 'info',
    family: 'runtype',
  },
  VL011: {
    headline: "Method `{0}` is silently not validated by `validate`: methods aren't data.",
    level: 'info',
    family: 'runtype',
  },
  VL012: {
    headline: "Static member `{0}` is silently not validated by `validate`: statics aren't part of instance data.",
    level: 'info',
    family: 'runtype',
  },
  VL013: {
    headline: "Symbol-keyed property `{0}` is silently not validated by `validate`: symbol keys aren't JSON-representable.",
    level: 'info',
    family: 'runtype',
  },
  VL014: {
    headline:
      "Union member(s) of type `{0}` can't be represented as data: `validate` drops them, so the union is validated as its remaining members.",
    level: 'info',
    family: 'runtype',
  },
  VL015: {
    headline:
      'Property `{0}` has a non-serialisable value type (symbol, Promise, or a non-serialisable built-in): `validate` drops it, so this property is silently not validated.',
    level: 'info',
    family: 'runtype',
  },
  VL021: {
    headline: '`validate` on `any` / `unknown` always returns true: the validator accepts every value.',
    level: 'info',
    family: 'runtype',
  },
};
