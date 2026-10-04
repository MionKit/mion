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
  'comment-downgrade-error-already-warning': {
    headline:
      '`@mion-downgrade-error {0}` does nothing: that code is already a warning or info, so it was never halting your build.',
    level: 'info',
    family: 'marker',
  },
  'comment-downgrade-error-not-allowed': {
    headline:
      '`@mion-downgrade-error {0}` cannot lower that code: the build produces no code for it, so carrying on would ship missing output.',
    level: 'warning',
    family: 'marker',
  },
  'comment-downgrade-error-unknown-name': {
    headline:
      '`@mion-downgrade-error {0}` names a diagnostic that does not exist; check the spelling against the name in the message you are lowering.',
    level: 'warning',
    family: 'marker',
  },
  'comment-downgrade-error-unused': {
    headline:
      'Unused `@mion-downgrade-error {0}`: nothing was reported on the line below it, so the comment is stale and can be deleted.',
    level: 'warning',
    family: 'marker',
  },
  'comment-expect-error-not-allowed': {
    headline: '`@mion-expect-error {0}` cannot silence that code: it is reported even when everything else is silenced.',
    level: 'warning',
    family: 'marker',
  },
  'comment-expect-error-unknown-name': {
    headline:
      '`@mion-expect-error {0}` names a diagnostic that does not exist; check the spelling against the name in the message you are silencing.',
    level: 'warning',
    family: 'marker',
  },
  'comment-expect-error-unused': {
    headline:
      'Unused `@mion-expect-error {0}`: nothing was reported on the line below it, so the comment is stale and can be deleted.',
    level: 'warning',
    family: 'marker',
  },
  'config-lib-missing-base': {
    headline:
      'The project `lib` declares no base ECMAScript library (loaded: {0}), so core globals like `Array` are missing and reflected types cannot be trusted.',
    level: 'runtimeError',
    family: 'marker',
  },
  'config-output-outside-out-dir': {
    headline:
      '`mion compile` refused to write {0}: it lands outside outDir ({1}) because its source sits outside rootDir; move rootDir up so every file of the program is under it, or reach that module through its package name.',
    level: 'error',
    family: 'marker',
  },
  'config-tsconfig-not-loaded': {
    headline:
      'Project tsconfig failed to load ({0}): the build, the linter, and the CLI all read this config, so nothing can run until it loads.',
    level: 'error',
    family: 'marker',
  },
  'data-non-enumerable-required': {
    headline:
      'Property `{0}` is tagged @nonEnumerable but is required: the guard only applies to optional properties, so the tag has no effect. Make it optional (`{0}?`) or remove the tag.',
    level: 'warning',
    family: 'runtype',
  },
  'data-proto-property-dropped': {
    headline: 'Property `{0}` can never be data and is dropped: the rest of the type still works.',
    level: 'warning',
    family: 'runtype',
  },
  'enrich-mirror-moved': {
    headline: 'Mirror location drift: the source maps to `{0}` but this file lives at `{1}`; re-run `mion enrich` to relocate.',
    level: 'warning',
    family: 'enrich',
  },
  'enrich-mirror-source-missing': {
    headline: 'Breadcrumb source `{0}` no longer exists ({1}): the mirror is orphaned; delete it or re-run `mion enrich`.',
    level: 'runtimeError',
    family: 'enrich',
  },
  'enrich-mirror-type-missing': {
    headline: 'Source {0} no longer declares type `{1}`; re-run `mion enrich`.',
    level: 'runtimeError',
    family: 'enrich',
  },
  'enrich-mirror-unreadable': {
    headline: 'Cannot read enrichment mirror file: {0}',
    level: 'error',
    family: 'enrich',
  },
  'enrich-mock-blank-value': {
    headline: 'Unfilled blank value: a scaffolded sample pool or range is still empty; fill in real data.',
    level: 'warning',
    family: 'enrich',
    completeness: true,
  },
  'enrich-mock-orphan-field': {
    headline: 'Stale `@rtOrphanChild` field carcass; run `mion enrich --prune` to remove it (or restore the field).',
    level: 'warning',
    family: 'enrich',
  },
  'enrich-mock-orphan-type': {
    headline: 'Stale `@rtOrphan` carcass; run `mion enrich --prune` to remove it (or restore the type).',
    level: 'warning',
    family: 'enrich',
  },
  'enrich-mock-reserved-prefix': {
    headline: 'Property `{0}` collides with the reserved `rt$` enrichment prefix: the type cannot be enriched.',
    level: 'error',
    family: 'enrich',
  },
  'enrich-mock-todo-left': {
    headline: 'Unfilled `@todo` placeholder; fill in the real sample pools/ranges, then delete the `@todo` line.',
    level: 'warning',
    family: 'enrich',
    completeness: true,
  },
  'enrich-mock-unknown-field': {
    headline: 'Unknown field `{0}`: the type does not declare it, so this MockData entry is dead.',
    level: 'warning',
    family: 'enrich',
  },
  'enrich-text-blank-value': {
    headline: 'Unfilled blank value: a scaffolded label or message is still empty; fill in the real text.',
    level: 'warning',
    family: 'enrich',
    completeness: true,
  },
  'enrich-text-default-and-messages': {
    headline: '`rt$default` is mutually exclusive with per-constraint messages; use one mode or the other.',
    level: 'warning',
    family: 'enrich',
  },
  'enrich-text-missing-message': {
    headline: 'Error key `{0}` has no message: this failure shows a generic one.',
    level: 'warning',
    family: 'enrich',
  },
  'enrich-text-orphan-field': {
    headline: 'Stale `@rtOrphanChild` field carcass; run `mion enrich --prune` to remove it (or restore the field).',
    level: 'warning',
    family: 'enrich',
  },
  'enrich-text-orphan-type': {
    headline: 'Stale `@rtOrphan` carcass; run `mion enrich --prune` to remove it (or restore the type).',
    level: 'warning',
    family: 'enrich',
  },
  'enrich-text-plural-missing-other': {
    headline: 'Plural error template is missing the mandatory `other` arm: the render has no backstop.',
    level: 'warning',
    family: 'enrich',
  },
  'enrich-text-plural-without-count': {
    headline: 'Constraint `{0}` carries no count: a plural template here has dead arms; use a plain string.',
    level: 'info',
    family: 'enrich',
  },
  'enrich-text-reserved-prefix': {
    headline: 'Property `{0}` collides with the reserved `rt$` enrichment prefix: the type cannot be enriched.',
    level: 'error',
    family: 'enrich',
  },
  'enrich-text-todo-left': {
    headline: 'Unfilled `@todo` placeholder; fill in the real labels/messages, then delete the `@todo` line.',
    level: 'warning',
    family: 'enrich',
    completeness: true,
  },
  'enrich-text-unknown-error-key': {
    headline: 'Error key `{0}` is not a declared constraint of this field: the message can never fire.',
    level: 'warning',
    family: 'enrich',
  },
  'enrich-text-unknown-field': {
    headline: 'Unknown field `{0}`: the type does not declare it, so this FriendlyText entry is dead.',
    level: 'warning',
    family: 'enrich',
  },
  'enrich-text-unknown-placeholder': {
    headline: 'Unknown placeholder `$[{0}]`: expected one of `$[label]`, `$[val]`, `$[path]`, `$[index]`.',
    level: 'warning',
    family: 'enrich',
  },
  'enrich-text-unknown-plural-arm': {
    headline: 'Unknown plural arm `{0}`: CLDR categories are `zero`, `one`, `two`, `few`, `many`, `other`.',
    level: 'warning',
    family: 'enrich',
  },
  'format-invalid-params': {
    headline: 'Invalid type-format params: {0}',
    level: 'runtimeError',
    family: 'runtype',
  },
  'format-no-js-runtime': {
    headline:
      'TypeFormat pattern /{0}/ cannot be checked: {1}; pattern validation requires a JavaScript runtime; install one or pass --js-runtime.',
    level: 'runtimeError',
    family: 'runtype',
  },
  'format-pattern-timeout': {
    headline:
      'TypeFormat pattern /{0}/ could not be evaluated in time: {1}; the build was not able to tell whether the pattern is safe.',
    level: 'runtimeError',
    family: 'runtype',
  },
  'format-pattern-unreadable': {
    headline: 'TypeFormat pattern `{0}` is a value the build cannot read, so the validator would not check it.',
    level: 'runtimeError',
    family: 'runtype',
  },
  'format-pattern-unsafe': {
    headline:
      'TypeFormat pattern /{0}/ can be made to backtrack exponentially: {1} (`{2}`); a crafted input would hang the validator.',
    level: 'runtimeError',
    family: 'runtype',
  },
  'format-sample-conflict': {
    headline:
      'Two sites share one cache entry for format `{0}` but declare different mockSamples: `{1}` here vs `{2}` at {3}. Make the pools identical, or declare one and leave the other out.',
    level: 'runtimeError',
    family: 'runtype',
  },
  'format-sample-generation-failed': {
    headline: 'Cannot auto-generate mockSamples for pattern /{0}/: {1}; declare mockSamples explicitly.',
    level: 'runtimeError',
    family: 'runtype',
  },
  'format-sample-mismatch': {
    headline: 'TypeFormat mockSample "{0}" does not match its pattern /{1}/; fix the sample or the pattern.',
    level: 'runtimeError',
    family: 'runtype',
  },
  'format-sample-out-of-bounds': {
    headline: 'TypeFormat mockSample violates a sibling constraint: {0}',
    level: 'runtimeError',
    family: 'runtype',
  },
  'internal-json-primitive-missing': {
    headline:
      'Internal error: JSON composite `{0}` references primitive entry `{1}` (type `{2}`) which was never rendered; please file an issue.',
    level: 'runtimeError',
    family: 'runtype',
  },
  'internal-kind-not-compilable': {
    headline:
      'Internal error: type `{0}` cannot be compiled here and has no diagnostic, so the function always throws; please file an issue.',
    level: 'runtimeError',
    family: 'runtype',
  },
  'json-prepare-clone-function-property-dropped': {
    headline:
      'Property `{0}` is a function: the JSON encoder does not handle function values, so this property is silently not encoded.',
    level: 'info',
    family: 'runtype',
  },
  'json-prepare-clone-function-root': {
    headline: 'Type `{0}` can never be encoded to JSON: the generated function will always fail.',
    level: 'runtimeError',
    family: 'runtype',
  },
  'json-prepare-clone-method-dropped': {
    headline: "Method `{0}` is silently not encoded: methods aren't data.",
    level: 'info',
    family: 'runtype',
  },
  'json-prepare-clone-never-root': {
    headline: 'Type `{0}` can never be encoded to JSON: the generated function will always fail.',
    level: 'runtimeError',
    family: 'runtype',
  },
  'json-prepare-clone-non-data-property-dropped': {
    headline:
      'Property `{0}` has a non-serialisable value type (symbol, Promise, or a non-serialisable built-in): the JSON encoder drops it, so this property is silently not encoded.',
    level: 'info',
    family: 'runtype',
  },
  'json-prepare-clone-non-data-root': {
    headline: 'Type `{0}` can never be encoded to JSON: the generated function will always fail.',
    level: 'runtimeError',
    family: 'runtype',
  },
  'json-prepare-clone-static-dropped': {
    headline: "Static member `{0}` is silently not encoded: statics aren't part of instance data.",
    level: 'info',
    family: 'runtype',
  },
  'json-prepare-clone-symbol-key-dropped': {
    headline: "Symbol-keyed property `{0}` is silently not encoded: symbol keys aren't JSON-representable.",
    level: 'info',
    family: 'runtype',
  },
  'json-prepare-clone-symbol-root': {
    headline: 'Type `{0}` can never be encoded to JSON: the generated function will always fail.',
    level: 'runtimeError',
    family: 'runtype',
  },
  'json-prepare-clone-union-member-dropped': {
    headline:
      "Union member(s) of type `{0}` can't be represented as data: the JSON encoder drops them, so the union is encoded as its remaining members.",
    level: 'info',
    family: 'runtype',
  },
  'json-prepare-function-property-dropped': {
    headline:
      'Property `{0}` is a function: the JSON encoder does not handle function values, so this property is silently not encoded.',
    level: 'info',
    family: 'runtype',
  },
  'json-prepare-function-root': {
    headline: 'Type `{0}` can never be encoded to JSON: the generated function will always fail.',
    level: 'runtimeError',
    family: 'runtype',
  },
  'json-prepare-method-dropped': {
    headline: "Method `{0}` is silently not encoded: methods aren't data.",
    level: 'info',
    family: 'runtype',
  },
  'json-prepare-never-root': {
    headline: 'Type `{0}` can never be encoded to JSON: the generated function will always fail.',
    level: 'runtimeError',
    family: 'runtype',
  },
  'json-prepare-non-data-property-dropped': {
    headline:
      'Property `{0}` has a non-serialisable value type (symbol, Promise, or a non-serialisable built-in): the JSON encoder drops it, so this property is silently not encoded.',
    level: 'info',
    family: 'runtype',
  },
  'json-prepare-non-data-root': {
    headline: 'Type `{0}` can never be encoded to JSON: the generated function will always fail.',
    level: 'runtimeError',
    family: 'runtype',
  },
  'json-prepare-static-dropped': {
    headline: "Static member `{0}` is silently not encoded: statics aren't part of instance data.",
    level: 'info',
    family: 'runtype',
  },
  'json-prepare-symbol-key-dropped': {
    headline: "Symbol-keyed property `{0}` is silently not encoded: symbol keys aren't JSON-representable.",
    level: 'info',
    family: 'runtype',
  },
  'json-prepare-symbol-root': {
    headline: 'Type `{0}` can never be encoded to JSON: the generated function will always fail.',
    level: 'runtimeError',
    family: 'runtype',
  },
  'json-prepare-union-member-dropped': {
    headline:
      "Union member(s) of type `{0}` can't be represented as data: the JSON encoder drops them, so the union is encoded as its remaining members.",
    level: 'info',
    family: 'runtype',
  },
  'json-restore-function-property-dropped': {
    headline:
      'Property `{0}` is a function: the JSON decoder does not handle function values, so this property is silently not decoded.',
    level: 'info',
    family: 'runtype',
  },
  'json-restore-function-root': {
    headline: 'Type `{0}` can never be decoded from JSON: the generated function will always fail.',
    level: 'runtimeError',
    family: 'runtype',
  },
  'json-restore-method-dropped': {
    headline: "Method `{0}` is silently not decoded: methods aren't data.",
    level: 'info',
    family: 'runtype',
  },
  'json-restore-never-root': {
    headline: 'Type `{0}` can never be decoded from JSON: the generated function will always fail.',
    level: 'runtimeError',
    family: 'runtype',
  },
  'json-restore-non-data-property-dropped': {
    headline:
      'Property `{0}` has a non-serialisable value type (symbol, Promise, or a non-serialisable built-in): the JSON decoder drops it, so this property is silently not decoded.',
    level: 'info',
    family: 'runtype',
  },
  'json-restore-non-data-root': {
    headline: 'Type `{0}` can never be decoded from JSON: the generated function will always fail.',
    level: 'runtimeError',
    family: 'runtype',
  },
  'json-restore-static-dropped': {
    headline: "Static member `{0}` is silently not decoded: statics aren't part of instance data.",
    level: 'info',
    family: 'runtype',
  },
  'json-restore-symbol-key-dropped': {
    headline: "Symbol-keyed property `{0}` is silently not decoded: symbol keys aren't JSON-representable.",
    level: 'info',
    family: 'runtype',
  },
  'json-restore-symbol-root': {
    headline: 'Type `{0}` can never be decoded from JSON: the generated function will always fail.',
    level: 'runtimeError',
    family: 'runtype',
  },
  'json-restore-union-member-dropped': {
    headline:
      "Union member(s) of type `{0}` can't be represented as data: the JSON decoder drops them, so the union is decoded as its remaining members.",
    level: 'info',
    family: 'runtype',
  },
  'marker-any-from-unresolved-import': {
    headline:
      'Marker type resolved to `any` because this file has an unresolved import (`{0}`): the generated functions would silently accept anything.',
    level: 'runtimeError',
    family: 'marker',
  },
  'marker-any-from-unresolved-name': {
    headline:
      'Marker type resolved to `any` that was never written: `{0}` failed to resolve (or its declaration references a name that does not), so the generated functions would silently accept anything.',
    level: 'runtimeError',
    family: 'marker',
  },
  'marker-calls-function-for-type': {
    headline:
      '`{0}()` is being called at runtime just so the marker can read its return type: side effects, throws, or async work run for nothing.',
    level: 'warning',
    family: 'marker',
  },
  'marker-comptime-arg-forbidden-construct': {
    headline: '`CompTimeArgs<T>` literal contains a forbidden construct ({0}). Only literals and nested literals are allowed.',
    level: 'runtimeError',
    family: 'marker',
  },
  'marker-comptime-arg-not-literal': {
    headline:
      '`CompTimeArgs<T>` argument must be a literal at the call site, or a `const` whose initializer is itself entirely literal (a same-module or imported `const` both work).',
    level: 'runtimeError',
    family: 'marker',
  },
  'marker-comptime-arg-too-deep': {
    headline: '`CompTimeArgs<T>` literal nesting exceeds the depth cap (16), refactor to flatten.',
    level: 'runtimeError',
    family: 'marker',
  },
  'marker-comptime-arg-widened-const': {
    headline:
      '`CompTimeArgs<T>` value comes from a `const` with a widened (non-literal) member ({0}); declare the const `as const`.',
    level: 'runtimeError',
    family: 'marker',
  },
  'marker-duplicate-function-family': {
    headline: '`InjectTypeFnArgs` names the function family `{0}` more than once; remove the duplicate key.',
    level: 'info',
    family: 'marker',
  },
  'marker-generic-missing-type-argument': {
    headline:
      'Generic type `{0}` is used without its required type argument(s): parameter `{1}` has no default, so the type cannot resolve to an id. See Related for where `{1}` is declared.',
    level: 'error',
    family: 'marker',
  },
  'marker-in-generic-function': {
    headline:
      'Marker call is inside a generic function: the type argument is unresolved, so no id can be computed at build time.',
    level: 'error',
    family: 'marker',
  },
  'marker-self-instantiating-generic': {
    headline:
      'Type `{0}` re-instantiates itself with fresh type arguments at every level (a self-instantiating generic), so its structural id never resolves. Reflect a monomorphic shape instead.',
    level: 'error',
    family: 'marker',
  },
  'marker-temporal-lib-missing': {
    headline:
      "Temporal type `{0}` resolved to `any`: the Temporal lib isn't in your tsconfig `lib`, so the generated validator would accept any value.",
    level: 'runtimeError',
    family: 'marker',
  },
  'marker-type-id-collision': {
    headline:
      'Two different types get the same id `{0}`: `{1}` from {4}, and `{2}` here. Raise the `hashLength` option to {3} so every type keeps its own id.',
    level: 'error',
    family: 'marker',
  },
  'marker-type-too-deep': {
    headline:
      'This type is too deeply nested to reflect: computing its structural id hit the recursion depth cap, so the build stops here instead of crashing.',
    level: 'error',
    family: 'marker',
  },
  'marker-unknown-function-family': {
    headline: '`InjectTypeFnArgs` names `{0}`, which is not a function family{1}',
    level: 'error',
    family: 'marker',
  },
  'marker-unresolved-type-parameter': {
    headline:
      'Type argument contains the unresolved type parameter `{0}`: a generic must be fully resolved at the marker call, so no id can be computed. See Related for where `{0}` is declared.',
    level: 'error',
    family: 'marker',
  },
  'marker-untrusted-package': {
    headline:
      '`{0}` here was declared by `{1}`, which this project does not trust as a marker package, so the type argument was dropped and this call reflects `unknown`.',
    level: 'runtimeError',
    family: 'marker',
  },
  'marker-untyped-private-member': {
    headline:
      "Private member `{0}` of class `{1}` has no type in its declaration file, so the generated functions would accept any value for it. Build the class's package with `mion compile`, which keeps private member types, or read it from its TypeScript sources.",
    level: 'runtimeError',
    family: 'marker',
  },
  'override-duplicate': {
    headline: 'Duplicate override for `{0}`: there can be exactly one override per (type, function).',
    level: 'runtimeError',
    family: 'marker',
  },
  'override-function-not-built': {
    headline:
      'Override entry `{0}` references compiled function `{1}` which did not render: this would throw at runtime, so the build stops.',
    level: 'runtimeError',
    family: 'marker',
  },
  'override-validate-affects-json': {
    headline: 'Overriding `validate` for this type also changes how JSON decoders narrow unions containing it.',
    level: 'info',
    family: 'marker',
  },
  'purefn-artifact-conflict': {
    headline: 'Pure fn `{0}` differs between `{1}` and `{2}`.',
    level: 'error',
    family: 'purefn',
  },
  'purefn-artifact-unreadable': {
    headline: '`{0}` could not be read as part of a pure-fn artifact: {1}.',
    level: 'warning',
    family: 'purefn',
  },
  'purefn-dependency-cycle': {
    headline: 'Pure functions circular dependency: `{0}` (`{1}`) reaches back into `{2}`.',
    level: 'error',
    family: 'purefn',
  },
  'purefn-dependency-not-id': {
    headline: '`{0}.{1}` dependency argument must be a pure-fn id.',
    level: 'runtimeError',
    family: 'purefn',
  },
  'purefn-destructured-param': {
    headline: 'Pure-fn factory `{0}` uses destructured parameters; only simple identifier params are supported.',
    level: 'error',
    family: 'purefn',
  },
  'purefn-forbidden-construct': {
    headline: '`{0}` is not allowed inside a pure-fn factory body.',
    level: 'runtimeError',
    family: 'purefn',
  },
  'purefn-id-mismatch': {
    headline: "Explicit pure-fn id `{0}` does not match this registration's computed id `{1}`.",
    level: 'error',
    family: 'purefn',
  },
  'purefn-imported-or-exported': {
    headline: '`PureFunction<F>` literal must not be imported or exported: the compiled copy must be the only one that can run.',
    level: 'runtimeError',
    family: 'marker',
  },
  'purefn-not-inline': {
    headline: '`PureFunction<F>` argument must be an INLINE arrow or function expression.',
    level: 'runtimeError',
    family: 'marker',
  },
  'purefn-not-registered': {
    headline: 'Pure fn `{0}` is referenced by a RT function but was never registered.',
    level: 'runtimeError',
    family: 'purefn',
  },
  'purefn-package-not-built': {
    headline: 'Pure fn `{0}` comes from `{1}`, which ships no compiled pure functions.',
    level: 'error',
    family: 'purefn',
  },
  'purefn-reads-outer-variable': {
    headline: "`{0}` is captured from outer scope inside a pure-fn factory; pure functions can't reach outside their own body.",
    level: 'runtimeError',
    family: 'purefn',
  },
  'purefn-uses-await': {
    headline: '`async`/`await` is not allowed inside a pure-fn factory body.',
    level: 'runtimeError',
    family: 'purefn',
  },
  'purefn-uses-dynamic-import': {
    headline: '`import()` is not allowed inside a pure-fn factory body.',
    level: 'runtimeError',
    family: 'purefn',
  },
  'purefn-uses-this': {
    headline: "`this` is not allowed inside a pure-fn factory body; pure functions can't depend on a calling context.",
    level: 'runtimeError',
    family: 'purefn',
  },
  'purefn-uses-yield': {
    headline: '`yield` / generators are not allowed inside a pure-fn factory body.',
    level: 'runtimeError',
    family: 'purefn',
  },
  'rpc-batch-argument-out-of-range': {
    headline:
      '`inputFrom()` sits at argument index {0} of route `{2}`, which declares only {1} parameter(s); move the mapping to an argument the route declares.',
    level: 'error',
    family: 'marker',
  },
  'rpc-batch-duplicate-route': {
    headline:
      'Route `{0}` is listed twice in this `batch()`; a batch runs each route once, so drop the duplicate or move it into a second batch.',
    level: 'error',
    family: 'marker',
  },
  'rpc-batch-element-unreadable': {
    headline:
      '`batch()` element is not a route call the build can read ({0}); write `routes.a.b(...)` inline or bind it to a `const`/`let` in this file.',
    level: 'error',
    family: 'marker',
  },
  'rpc-batch-id-collision': {
    headline:
      'Batch id `{0}` is shared by two different batches; reorder the routes of one of them so the ids no longer collide.',
    level: 'runtimeError',
    family: 'marker',
  },
  'rpc-batch-mapper-missing': {
    headline: 'Batch mapper `{0}` has no generated pure function in this program; the server build cannot register it.',
    level: 'runtimeError',
    family: 'marker',
  },
  'rpc-batch-mapper-unreadable': {
    headline:
      '`inputFrom()` mapper is not readable at build time ({0}); pass an inline arrow function or a string literal mapper name.',
    level: 'error',
    family: 'marker',
  },
  'rpc-batch-router-init-hidden': {
    headline:
      'The batch table {0} was written, but no module of this program calls `createMionRouter` directly, so nothing imports it; import it by hand in the module that creates the router.',
    level: 'runtimeError',
    family: 'marker',
  },
  'rpc-batch-source-not-before': {
    headline:
      '`inputFrom()` reads route `{0}` for route `{1}`, but the source is not in this batch or runs after the target; sources must be listed before the routes they feed.',
    level: 'error',
    family: 'marker',
  },
  'rpc-client-api-unreadable': {
    headline:
      'The API type at this dispatch site cannot be read as a mion PublicApi ({0}); bundling needs `PublicApi<typeof routes>`.',
    level: 'error',
    family: 'marker',
  },
  'rpc-client-fetch-not-set-up': {
    headline:
      "This client builds with `client.routes: 'fetch'`, so every call fetches its route's metadata, but it never sets up `useFetchMetadata`: every call fails.",
    level: 'runtimeError',
    family: 'marker',
  },
  'rpc-client-imports-server-value': {
    headline:
      '`{0}` is passed to `initClient` but imported as a value from "{1}", which can put that server module in the client bundle; use `import type`.',
    level: 'runtimeError',
    family: 'marker',
  },
  'rpc-client-middleware-not-set-up': {
    headline:
      'The route `{1}` runs the middleware `{0}`, which needs params, but this client never sets it up; every call to the route fails its validation.',
    level: 'runtimeError',
    family: 'marker',
  },
  'rpc-client-no-metadata-route': {
    headline:
      'This client fetches route metadata, but the API it calls does not place `mionFetchMetadata`, so every fetch fails.',
    level: 'runtimeError',
    family: 'marker',
  },
  'rpc-client-no-server-version': {
    headline:
      'The API types this client reads carry no server build version, so a client and server built with different ids are only caught at runtime.',
    level: 'warning',
    family: 'marker',
  },
  'rpc-client-option-widened': {
    headline: 'Option `{0}` of `{1}` is not a literal on the API type, so the bundled metadata leaves it unset.',
    level: 'warning',
    family: 'marker',
  },
  'rpc-client-optional-middleware-not-set-up': {
    headline:
      'The route `{1}` runs the middleware `{0}`, but this client never sets it up, so the middleware never gets its params.',
    level: 'runtimeError',
    family: 'marker',
  },
  'rpc-client-route-id-widened': {
    headline:
      'The route id at this call is `string` (a generic helper erased it), so nothing is bundled for it, and this client never sets up `useFetchMetadata`: the call fails.',
    level: 'runtimeError',
    family: 'marker',
  },
  'rpc-client-route-id-widened-fetched': {
    headline:
      'The route id at this call is `string` (a generic helper erased it); the call fetches its metadata from the server instead of using the bundle.',
    level: 'info',
    family: 'marker',
  },
  'rpc-client-route-not-declared': {
    headline: 'This call names the route `{0}`, which the API type does not declare; nothing is bundled for it.',
    level: 'error',
    family: 'marker',
  },
  'rpc-client-server-version-mismatch': {
    headline:
      'This client hashes its API ids to the build version {0}, but the API types it reads come from a server build with {1}: every call reports a version mismatch.',
    level: 'runtimeError',
    family: 'marker',
  },
  'rpc-client-shared-modules': {
    headline:
      'This program builds with moduleMode `allSingle`, one module per family for the whole program, so the client bundle carries every server type.',
    level: 'warning',
    family: 'marker',
  },
  'rpc-client-types-not-built-by-mion': {
    headline:
      'The API package {0} ships types only, but {1}: a client can only trust types-only packages that `mion api-types` built.',
    level: 'runtimeError',
    family: 'marker',
  },
  'rpc-client-types-other-mion-version': {
    headline: 'The API package {0} was built by mion {1}, this build runs {2}: the ids of both sides may differ.',
    level: 'warning',
    family: 'marker',
  },
  'rpc-client-version-mismatch': {
    headline:
      'This client injects the build version {0} but the API in the same program injects {1}; the client reports a version mismatch against its own server.',
    level: 'runtimeError',
    family: 'marker',
  },
  'rpc-handler-missing-param-type': {
    headline:
      'mion `{1}` handler parameter `{0}` has no type annotation; every parameter after the call context travels on the wire and must declare its type.',
    level: 'runtimeError',
    family: 'mionroute',
  },
  'rpc-handler-missing-return-type': {
    headline: 'mion `{0}` handler has no return type annotation; write the type the handler answers with.',
    level: 'runtimeError',
    family: 'mionroute',
  },
  'rpc-handler-non-data-property': {
    headline: 'Property `{0}` can never be data and is dropped from every compiled function; rename it.',
    level: 'warning',
    family: 'mionroute',
  },
  'rpc-handler-returns-non-rpc-error': {
    headline:
      'mion `{1}` handler declares it can answer with `{0}`, which is not an `RpcError`; only an `RpcError` (or a subclass such as `FatalError`) carries the mion brand.',
    level: 'runtimeError',
    family: 'mionroute',
  },
  'rpc-handler-throws': {
    headline:
      'mion `{0}` handlers must return errors, not throw them; return an `RpcError` to let the chain continue, or a `FatalError` to stop the request.',
    level: 'runtimeError',
    family: 'mionroute',
  },
  'unknown-keys-function-shared': {
    headline: 'The function in {0} cannot be copied: the copy shares it with the input.',
    level: 'warning',
    family: 'runtype',
  },
  'unknown-keys-method-not-copied': {
    headline: "Method or accessor `{0}` is not copied: the copy keeps the input's prototype, so it still works.",
    level: 'info',
    family: 'runtype',
  },
  'unknown-keys-non-data-shared': {
    headline:
      'The value in {0} cannot be copied (a Promise, a RegExp or a built-in that is not data): the copy shares it with the input.',
    level: 'warning',
    family: 'runtype',
  },
  'unknown-keys-object-union': {
    headline:
      '`removeUnknownKeys` does not support unions with object members: the emitter cannot know which declared shape to rebuild at runtime.',
    level: 'runtimeError',
    family: 'runtype',
  },
  'unknown-keys-private-fields': {
    headline:
      'The {0} has `#private` fields, which only its constructor can create: a copy would break its methods, so the function always throws.',
    level: 'runtimeError',
    family: 'runtype',
  },
  'unknown-keys-shared-value-refused': {
    headline:
      "The value in {0} can only be shared with the input and `sharedValues: 'refuse'` is set, so the function always throws.",
    level: 'runtimeError',
    family: 'runtype',
  },
  'unknown-keys-static-dropped': {
    headline: 'Static member `{0}` is not part of instance data: `removeUnknownKeys` skips it.',
    level: 'info',
    family: 'runtype',
  },
  'unknown-keys-symbol-key': {
    headline: 'Symbol-keyed {0} cannot be copied: the generated code cannot name your symbol, so the function always throws.',
    level: 'runtimeError',
    family: 'runtype',
  },
  'unknown-keys-value-shared': {
    headline: "The value in {0} is shared with the input, as `sharedValues: 'share'` asks.",
    level: 'info',
    family: 'runtype',
  },
  'validate-any-accepts-all': {
    headline: '`validate` on `any` / `unknown` always returns true: the validator accepts every value.',
    level: 'info',
    family: 'runtype',
  },
  'validate-function-property-dropped': {
    headline:
      'Property `{0}` is a function: `validate` does not handle function values, so this property is silently not validated.',
    level: 'info',
    family: 'runtype',
  },
  'validate-function-root': {
    headline: 'Type `{0}` can never be validated: the generated function will always fail.',
    level: 'runtimeError',
    family: 'runtype',
  },
  'validate-method-dropped': {
    headline: "Method `{0}` is silently not validated by `validate`: methods aren't data.",
    level: 'info',
    family: 'runtype',
  },
  'validate-non-data-property-dropped': {
    headline:
      'Property `{0}` has a non-serialisable value type (symbol, Promise, or a non-serialisable built-in): `validate` drops it, so this property is silently not validated.',
    level: 'info',
    family: 'runtype',
  },
  'validate-non-data-root': {
    headline: 'Type `{0}` can never be validated: the generated function will always fail.',
    level: 'runtimeError',
    family: 'runtype',
  },
  'validate-static-dropped': {
    headline: "Static member `{0}` is silently not validated by `validate`: statics aren't part of instance data.",
    level: 'info',
    family: 'runtype',
  },
  'validate-symbol-key-dropped': {
    headline: "Symbol-keyed property `{0}` is silently not validated by `validate`: symbol keys aren't JSON-representable.",
    level: 'info',
    family: 'runtype',
  },
  'validate-symbol-root': {
    headline: 'Type `{0}` can never be validated: the generated function will always fail.',
    level: 'runtimeError',
    family: 'runtype',
  },
  'validate-union-member-dropped': {
    headline:
      "Union member(s) of type `{0}` can't be represented as data: `validate` drops them, so the union is validated as its remaining members.",
    level: 'info',
    family: 'runtype',
  },
  'validation-errors-any-accepts-all': {
    headline: '`validationErrors` on `any` / `unknown` always returns an empty error array: nothing is checked.',
    level: 'info',
    family: 'runtype',
  },
  'validation-errors-function-property-dropped': {
    headline:
      'Property `{0}` is a function: `validationErrors` does not handle function values, so this property is silently not checked.',
    level: 'info',
    family: 'runtype',
  },
  'validation-errors-function-root': {
    headline: 'Type `{0}` can never be validated: the generated function will always fail.',
    level: 'runtimeError',
    family: 'runtype',
  },
  'validation-errors-method-dropped': {
    headline: "Method `{0}` is silently not checked by `validationErrors`: methods aren't data.",
    level: 'info',
    family: 'runtype',
  },
  'validation-errors-non-data-property-dropped': {
    headline:
      'Property `{0}` has a non-serialisable value type (symbol, Promise, or a non-serialisable built-in): `validationErrors` drops it, so this property is silently not checked.',
    level: 'info',
    family: 'runtype',
  },
  'validation-errors-non-data-root': {
    headline: 'Type `{0}` can never be validated: the generated function will always fail.',
    level: 'runtimeError',
    family: 'runtype',
  },
  'validation-errors-static-dropped': {
    headline: "Static member `{0}` is silently not checked by `validationErrors`: statics aren't part of instance data.",
    level: 'info',
    family: 'runtype',
  },
  'validation-errors-symbol-key-dropped': {
    headline: "Symbol-keyed property `{0}` is silently not checked by `validationErrors`: symbol keys aren't JSON-representable.",
    level: 'info',
    family: 'runtype',
  },
  'validation-errors-symbol-root': {
    headline: 'Type `{0}` can never be validated: the generated function will always fail.',
    level: 'runtimeError',
    family: 'runtype',
  },
};
