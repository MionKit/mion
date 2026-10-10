// GENERATED FILE. DO NOT EDIT. Run `pnpm miondevx core codegen diag` to refresh.
//
// The message dictionary for every diagnostic code the Go binary can emit,
// exported from the authoritative catalog in internal/diagnostics (wording lives in
// internal/diagnostics/messages.go). The wire carries only code + args; the render
// helpers in ./diagnosticCatalog.ts fill each `{name}` slot with the arg at its
// index in `slots`.

export interface DiagnosticEntry {
  /** Single-line headline. Mandatory. */
  readonly headline: string;
  /** The headline's `{name}` slots in first-appearance order, the order of the wire args. */
  readonly slots?: readonly string[];
  /** The code's level: did the build produce the code for
   *  this thing (`error`: no), and is what it produced broken when called
   *  (`runtimeError`: yes). Read by the config validators, which refuse to
   *  downgrade an `error`. */
  readonly level: 'error' | 'runtimeError' | 'warning' | 'info';
  /** Which part of the compiler raises the code. */
  readonly family: 'purefn' | 'marker' | 'runtype' | 'enrich' | 'mionroute' | 'drizzle';
  /** Set on the unfilled-enrichment-scaffold codes. Orthogonal to level: those
   *  are warnings, and this bit is what the completeness gates promote. */
  readonly completeness?: boolean;
}

export const DIAGNOSTIC_CATALOG: Record<string, DiagnosticEntry> = {
  'comment-downgrade-error-already-warning': {
    headline:
      '`@mion-downgrade-error {name}` does nothing: that code is already a warning or info, so it was never halting your build.',
    level: 'info',
    family: 'marker',
    slots: ['name'],
  },
  'comment-downgrade-error-not-allowed': {
    headline:
      '`@mion-downgrade-error {name}` cannot lower that code: the build produces no code for it, so carrying on would ship missing output.',
    level: 'warning',
    family: 'marker',
    slots: ['name'],
  },
  'comment-downgrade-error-unknown-name': {
    headline:
      '`@mion-downgrade-error {name}` names a diagnostic that does not exist; check the spelling against the name in the message you are lowering.',
    level: 'warning',
    family: 'marker',
    slots: ['name'],
  },
  'comment-downgrade-error-unused': {
    headline:
      'Unused `@mion-downgrade-error {name}`: nothing was reported on the line below it, so the comment is stale and can be deleted.',
    level: 'warning',
    family: 'marker',
    slots: ['name'],
  },
  'comment-expect-error-not-allowed': {
    headline: '`@mion-expect-error {name}` cannot silence that code: it is reported even when everything else is silenced.',
    level: 'warning',
    family: 'marker',
    slots: ['name'],
  },
  'comment-expect-error-unknown-name': {
    headline:
      '`@mion-expect-error {name}` names a diagnostic that does not exist; check the spelling against the name in the message you are silencing.',
    level: 'warning',
    family: 'marker',
    slots: ['name'],
  },
  'comment-expect-error-unused': {
    headline:
      'Unused `@mion-expect-error {name}`: nothing was reported on the line below it, so the comment is stale and can be deleted.',
    level: 'warning',
    family: 'marker',
    slots: ['name'],
  },
  'config-lib-missing-base': {
    headline:
      'The project `lib` declares no base ECMAScript library (loaded: {libs}), so core globals like `Array` are missing and reflected types cannot be trusted.',
    level: 'runtimeError',
    family: 'marker',
    slots: ['libs'],
  },
  'config-output-outside-out-dir': {
    headline:
      '`mion compile` refused to write {file}: it lands outside outDir ({outDir}) because its source sits outside rootDir; move rootDir up so every file of the program is under it, or reach that module through its package name.',
    level: 'error',
    family: 'marker',
    slots: ['file', 'outDir'],
  },
  'config-tsconfig-not-loaded': {
    headline:
      'Project tsconfig failed to load ({reason}): the build, the linter, and the CLI all read this config, so nothing can run until it loads.',
    level: 'error',
    family: 'marker',
    slots: ['reason'],
  },
  'data-non-enumerable-required': {
    headline:
      'Property `{property}` is tagged @nonEnumerable but is required: the guard only applies to optional properties, so the tag has no effect. Make it optional (`{property}?`) or remove the tag.',
    level: 'warning',
    family: 'runtype',
    slots: ['property'],
  },
  'data-proto-property-dropped': {
    headline: 'Property `{property}` can never be data and is dropped: the rest of the type still works.',
    level: 'warning',
    family: 'runtype',
    slots: ['property'],
  },
  'drizzle-mixed-types': {
    headline:
      'This file defines a slim Mion schema or model and imports heavy Drizzle types or toDrizzle. A client importing a model from this file also type-checks its toDrizzle and query code in a full check, and bundles drizzle-orm on a value import. Move toDrizzle and heavy Drizzle imports to a separate query or database file.',
    level: 'runtimeError',
    family: 'drizzle',
  },
  'drizzle-type-not-allowed': {
    headline:
      'Public handler {position} uses a Drizzle ORM type. Use a slim @mionjs/drizzle-orm model or a plain public type to keep client type checking small.',
    level: 'warning',
    family: 'drizzle',
    slots: ['position'],
  },
  'enrich-mirror-moved': {
    headline:
      'Mirror location drift: the source maps to `{expected}` but this file lives at `{actual}`; re-run `mion enrich` to relocate.',
    level: 'warning',
    family: 'enrich',
    slots: ['expected', 'actual'],
  },
  'enrich-mirror-source-missing': {
    headline:
      'Breadcrumb source `{source}` no longer exists ({reason}): the mirror is orphaned; delete it or re-run `mion enrich`.',
    level: 'runtimeError',
    family: 'enrich',
    slots: ['source', 'reason'],
  },
  'enrich-mirror-type-missing': {
    headline: 'Source {source} no longer declares type `{type}`; re-run `mion enrich`.',
    level: 'runtimeError',
    family: 'enrich',
    slots: ['source', 'type'],
  },
  'enrich-mirror-unreadable': {
    headline: 'Cannot read enrichment mirror file: {reason}',
    level: 'error',
    family: 'enrich',
    slots: ['reason'],
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
    headline: 'Property `{property}` collides with the reserved `rt$` enrichment prefix: the type cannot be enriched.',
    level: 'error',
    family: 'enrich',
    slots: ['property'],
  },
  'enrich-mock-todo-left': {
    headline: 'Unfilled `@todo` placeholder; fill in the real sample pools/ranges, then delete the `@todo` line.',
    level: 'warning',
    family: 'enrich',
    completeness: true,
  },
  'enrich-mock-unknown-field': {
    headline: 'Unknown field `{field}`: the type does not declare it, so this MockData entry is dead.',
    level: 'warning',
    family: 'enrich',
    slots: ['field'],
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
    headline: 'Error key `{key}` has no message: this failure shows a generic one.',
    level: 'warning',
    family: 'enrich',
    slots: ['key'],
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
    headline: 'Constraint `{constraint}` carries no count: a plural template here has dead arms; use a plain string.',
    level: 'info',
    family: 'enrich',
    slots: ['constraint'],
  },
  'enrich-text-reserved-prefix': {
    headline: 'Property `{property}` collides with the reserved `rt$` enrichment prefix: the type cannot be enriched.',
    level: 'error',
    family: 'enrich',
    slots: ['property'],
  },
  'enrich-text-todo-left': {
    headline: 'Unfilled `@todo` placeholder; fill in the real labels/messages, then delete the `@todo` line.',
    level: 'warning',
    family: 'enrich',
    completeness: true,
  },
  'enrich-text-unknown-error-key': {
    headline: 'Error key `{key}` is not a declared constraint of this field: the message can never fire.',
    level: 'warning',
    family: 'enrich',
    slots: ['key'],
  },
  'enrich-text-unknown-field': {
    headline: 'Unknown field `{field}`: the type does not declare it, so this FriendlyText entry is dead.',
    level: 'warning',
    family: 'enrich',
    slots: ['field'],
  },
  'enrich-text-unknown-placeholder': {
    headline: 'Unknown placeholder `$[{placeholder}]`: expected one of `$[label]`, `$[val]`, `$[path]`, `$[index]`.',
    level: 'warning',
    family: 'enrich',
    slots: ['placeholder'],
  },
  'enrich-text-unknown-plural-arm': {
    headline: 'Unknown plural arm `{arm}`: CLDR categories are `zero`, `one`, `two`, `few`, `many`, `other`.',
    level: 'warning',
    family: 'enrich',
    slots: ['arm'],
  },
  'format-invalid-params': {
    headline: 'Invalid type-format params: {reason}',
    level: 'runtimeError',
    family: 'runtype',
    slots: ['reason'],
  },
  'format-no-js-runtime': {
    headline:
      'TypeFormat pattern /{pattern}/ cannot be checked: {reason}; pattern validation requires a JavaScript runtime; install one or pass --js-runtime.',
    level: 'runtimeError',
    family: 'runtype',
    slots: ['pattern', 'reason'],
  },
  'format-pattern-timeout': {
    headline:
      'TypeFormat pattern /{pattern}/ could not be evaluated in time: {reason}; the build was not able to tell whether the pattern is safe.',
    level: 'runtimeError',
    family: 'runtype',
    slots: ['pattern', 'reason'],
  },
  'format-pattern-unreadable': {
    headline: 'TypeFormat pattern `{pattern}` is a value the build cannot read, so the validator would not check it.',
    level: 'runtimeError',
    family: 'runtype',
    slots: ['pattern'],
  },
  'format-pattern-unsafe': {
    headline:
      'TypeFormat pattern /{pattern}/ can be made to backtrack exponentially: {reason} (`{input}`); a crafted input would hang the validator.',
    level: 'runtimeError',
    family: 'runtype',
    slots: ['pattern', 'reason', 'input'],
  },
  'format-sample-conflict': {
    headline:
      'Two sites share one cache entry for format `{format}` but declare different mockSamples: `{samples}` here vs `{otherSamples}` at {otherSite}. Make the pools identical, or declare one and leave the other out.',
    level: 'runtimeError',
    family: 'runtype',
    slots: ['format', 'samples', 'otherSamples', 'otherSite'],
  },
  'format-sample-generation-failed': {
    headline: 'Cannot auto-generate mockSamples for pattern /{pattern}/: {reason}; declare mockSamples explicitly.',
    level: 'runtimeError',
    family: 'runtype',
    slots: ['pattern', 'reason'],
  },
  'format-sample-mismatch': {
    headline: 'TypeFormat mockSample "{sample}" does not match its pattern /{pattern}/; fix the sample or the pattern.',
    level: 'runtimeError',
    family: 'runtype',
    slots: ['sample', 'pattern'],
  },
  'format-sample-out-of-bounds': {
    headline: 'TypeFormat mockSample violates a sibling constraint: {reason}',
    level: 'runtimeError',
    family: 'runtype',
    slots: ['reason'],
  },
  'internal-json-primitive-missing': {
    headline:
      'Internal error: JSON composite `{composite}` references primitive entry `{primitive}` (type `{type}`) which was never rendered; please file an issue.',
    level: 'runtimeError',
    family: 'runtype',
    slots: ['composite', 'primitive', 'type'],
  },
  'internal-kind-not-compilable': {
    headline:
      'Internal error: type `{type}` cannot be compiled here and has no diagnostic, so the function always throws; please file an issue.',
    level: 'runtimeError',
    family: 'runtype',
    slots: ['type'],
  },
  'json-prepare-clone-function-property-dropped': {
    headline:
      'Property `{property}` is a function: the JSON encoder does not handle function values, so this property is silently not encoded.',
    level: 'info',
    family: 'runtype',
    slots: ['property'],
  },
  'json-prepare-clone-function-root': {
    headline: 'Type `{type}` can never be encoded to JSON: the generated function will always fail.',
    level: 'runtimeError',
    family: 'runtype',
    slots: ['type'],
  },
  'json-prepare-clone-method-dropped': {
    headline: "Method `{method}` is silently not encoded: methods aren't data.",
    level: 'info',
    family: 'runtype',
    slots: ['method'],
  },
  'json-prepare-clone-never-root': {
    headline: 'Type `{type}` can never be encoded to JSON: the generated function will always fail.',
    level: 'runtimeError',
    family: 'runtype',
    slots: ['type'],
  },
  'json-prepare-clone-non-data-property-dropped': {
    headline:
      'Property `{property}` has a non-serialisable value type (symbol, Promise, or a non-serialisable built-in): the JSON encoder drops it, so this property is silently not encoded.',
    level: 'info',
    family: 'runtype',
    slots: ['property'],
  },
  'json-prepare-clone-non-data-root': {
    headline: 'Type `{type}` can never be encoded to JSON: the generated function will always fail.',
    level: 'runtimeError',
    family: 'runtype',
    slots: ['type'],
  },
  'json-prepare-clone-static-dropped': {
    headline: "Static member `{member}` is silently not encoded: statics aren't part of instance data.",
    level: 'info',
    family: 'runtype',
    slots: ['member'],
  },
  'json-prepare-clone-symbol-key-dropped': {
    headline: "Symbol-keyed property `{property}` is silently not encoded: symbol keys aren't JSON-representable.",
    level: 'info',
    family: 'runtype',
    slots: ['property'],
  },
  'json-prepare-clone-symbol-root': {
    headline: 'Type `{type}` can never be encoded to JSON: the generated function will always fail.',
    level: 'runtimeError',
    family: 'runtype',
    slots: ['type'],
  },
  'json-prepare-clone-union-member-dropped': {
    headline:
      "Union member(s) of type `{type}` can't be represented as data: the JSON encoder drops them, so the union is encoded as its remaining members.",
    level: 'info',
    family: 'runtype',
    slots: ['type'],
  },
  'json-prepare-function-property-dropped': {
    headline:
      'Property `{property}` is a function: the JSON encoder does not handle function values, so this property is silently not encoded.',
    level: 'info',
    family: 'runtype',
    slots: ['property'],
  },
  'json-prepare-function-root': {
    headline: 'Type `{type}` can never be encoded to JSON: the generated function will always fail.',
    level: 'runtimeError',
    family: 'runtype',
    slots: ['type'],
  },
  'json-prepare-method-dropped': {
    headline: "Method `{method}` is silently not encoded: methods aren't data.",
    level: 'info',
    family: 'runtype',
    slots: ['method'],
  },
  'json-prepare-never-root': {
    headline: 'Type `{type}` can never be encoded to JSON: the generated function will always fail.',
    level: 'runtimeError',
    family: 'runtype',
    slots: ['type'],
  },
  'json-prepare-non-data-property-dropped': {
    headline:
      'Property `{property}` has a non-serialisable value type (symbol, Promise, or a non-serialisable built-in): the JSON encoder drops it, so this property is silently not encoded.',
    level: 'info',
    family: 'runtype',
    slots: ['property'],
  },
  'json-prepare-non-data-root': {
    headline: 'Type `{type}` can never be encoded to JSON: the generated function will always fail.',
    level: 'runtimeError',
    family: 'runtype',
    slots: ['type'],
  },
  'json-prepare-static-dropped': {
    headline: "Static member `{member}` is silently not encoded: statics aren't part of instance data.",
    level: 'info',
    family: 'runtype',
    slots: ['member'],
  },
  'json-prepare-symbol-key-dropped': {
    headline: "Symbol-keyed property `{property}` is silently not encoded: symbol keys aren't JSON-representable.",
    level: 'info',
    family: 'runtype',
    slots: ['property'],
  },
  'json-prepare-symbol-root': {
    headline: 'Type `{type}` can never be encoded to JSON: the generated function will always fail.',
    level: 'runtimeError',
    family: 'runtype',
    slots: ['type'],
  },
  'json-prepare-union-member-dropped': {
    headline:
      "Union member(s) of type `{type}` can't be represented as data: the JSON encoder drops them, so the union is encoded as its remaining members.",
    level: 'info',
    family: 'runtype',
    slots: ['type'],
  },
  'json-restore-function-property-dropped': {
    headline:
      'Property `{property}` is a function: the JSON decoder does not handle function values, so this property is silently not decoded.',
    level: 'info',
    family: 'runtype',
    slots: ['property'],
  },
  'json-restore-function-root': {
    headline: 'Type `{type}` can never be decoded from JSON: the generated function will always fail.',
    level: 'runtimeError',
    family: 'runtype',
    slots: ['type'],
  },
  'json-restore-method-dropped': {
    headline: "Method `{method}` is silently not decoded: methods aren't data.",
    level: 'info',
    family: 'runtype',
    slots: ['method'],
  },
  'json-restore-never-root': {
    headline: 'Type `{type}` can never be decoded from JSON: the generated function will always fail.',
    level: 'runtimeError',
    family: 'runtype',
    slots: ['type'],
  },
  'json-restore-non-data-property-dropped': {
    headline:
      'Property `{property}` has a non-serialisable value type (symbol, Promise, or a non-serialisable built-in): the JSON decoder drops it, so this property is silently not decoded.',
    level: 'info',
    family: 'runtype',
    slots: ['property'],
  },
  'json-restore-non-data-root': {
    headline: 'Type `{type}` can never be decoded from JSON: the generated function will always fail.',
    level: 'runtimeError',
    family: 'runtype',
    slots: ['type'],
  },
  'json-restore-static-dropped': {
    headline: "Static member `{member}` is silently not decoded: statics aren't part of instance data.",
    level: 'info',
    family: 'runtype',
    slots: ['member'],
  },
  'json-restore-symbol-key-dropped': {
    headline: "Symbol-keyed property `{property}` is silently not decoded: symbol keys aren't JSON-representable.",
    level: 'info',
    family: 'runtype',
    slots: ['property'],
  },
  'json-restore-symbol-root': {
    headline: 'Type `{type}` can never be decoded from JSON: the generated function will always fail.',
    level: 'runtimeError',
    family: 'runtype',
    slots: ['type'],
  },
  'json-restore-union-member-dropped': {
    headline:
      "Union member(s) of type `{type}` can't be represented as data: the JSON decoder drops them, so the union is decoded as its remaining members.",
    level: 'info',
    family: 'runtype',
    slots: ['type'],
  },
  'marker-any-from-unresolved-import': {
    headline:
      'Marker type resolved to `any` because this file has an unresolved import (`{import}`): the generated functions would silently accept anything.',
    level: 'runtimeError',
    family: 'marker',
    slots: ['import'],
  },
  'marker-any-from-unresolved-name': {
    headline:
      'Marker type resolved to `any` that was never written: `{name}` failed to resolve (or its declaration references a name that does not), so the generated functions would silently accept anything.',
    level: 'runtimeError',
    family: 'marker',
    slots: ['name'],
  },
  'marker-calls-function-for-type': {
    headline:
      '`{function}()` is being called at runtime just so the marker can read its return type: side effects, throws, or async work run for nothing.',
    level: 'warning',
    family: 'marker',
    slots: ['function'],
  },
  'marker-comptime-arg-forbidden-construct': {
    headline:
      '`CompTimeArgs<T>` literal contains a forbidden construct ({construct}). Only literals and nested literals are allowed.',
    level: 'runtimeError',
    family: 'marker',
    slots: ['construct'],
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
      '`CompTimeArgs<T>` value comes from a `const` with a widened (non-literal) member ({member}); declare the const `as const`.',
    level: 'runtimeError',
    family: 'marker',
    slots: ['member'],
  },
  'marker-duplicate-function-family': {
    headline: '`InjectTypeFnArgs` names the function family `{family}` more than once; remove the duplicate key.',
    level: 'info',
    family: 'marker',
    slots: ['family'],
  },
  'marker-generic-missing-type-argument': {
    headline:
      'Generic type `{type}` is used without its required type argument(s): parameter `{typeParam}` has no default, so the type cannot resolve to an id. See Related for where `{typeParam}` is declared.',
    level: 'error',
    family: 'marker',
    slots: ['type', 'typeParam'],
  },
  'marker-in-generic-function': {
    headline:
      'Marker call is inside a generic function: the type argument is unresolved, so no id can be computed at build time.',
    level: 'error',
    family: 'marker',
  },
  'marker-self-instantiating-generic': {
    headline:
      'Type `{type}` re-instantiates itself with fresh type arguments at every level (a self-instantiating generic), so its structural id never resolves. Reflect a monomorphic shape instead.',
    level: 'error',
    family: 'marker',
    slots: ['type'],
  },
  'marker-temporal-lib-missing': {
    headline:
      "Temporal type `{type}` resolved to `any`: the Temporal lib isn't in your tsconfig `lib`, so the generated validator would accept any value.",
    level: 'runtimeError',
    family: 'marker',
    slots: ['type'],
  },
  'marker-type-id-collision': {
    headline:
      'Two different types get the same id `{id}`: `{firstType}` from {firstSite}, and `{secondType}` here. Raise the `hashLength` option to {hashLength} so every type keeps its own id.',
    level: 'error',
    family: 'marker',
    slots: ['id', 'firstType', 'firstSite', 'secondType', 'hashLength'],
  },
  'marker-type-too-deep': {
    headline:
      'This type is too deeply nested to reflect: computing its structural id hit the recursion depth cap, so the build stops here instead of crashing.',
    level: 'error',
    family: 'marker',
  },
  'marker-unknown-function-family': {
    headline: '`InjectTypeFnArgs` names `{family}`, which is not a function family{hint}',
    level: 'error',
    family: 'marker',
    slots: ['family', 'hint'],
  },
  'marker-unresolved-type-parameter': {
    headline:
      'Type argument contains the unresolved type parameter `{typeParam}`: a generic must be fully resolved at the marker call, so no id can be computed. See Related for where `{typeParam}` is declared.',
    level: 'error',
    family: 'marker',
    slots: ['typeParam'],
  },
  'marker-untrusted-package': {
    headline:
      '`{name}` here was declared by `{package}`, which this project does not trust as a marker package, so the type argument was dropped and this call reflects `unknown`.',
    level: 'runtimeError',
    family: 'marker',
    slots: ['name', 'package'],
  },
  'marker-untyped-private-member': {
    headline:
      "Private member `{member}` of class `{class}` has no type in its declaration file, so the generated functions would accept any value for it. Build the class's package with `mion compile`, which keeps private member types, or read it from its TypeScript sources.",
    level: 'runtimeError',
    family: 'marker',
    slots: ['member', 'class'],
  },
  'override-duplicate': {
    headline: 'Duplicate override for `{key}`: there can be exactly one override per (type, function).',
    level: 'runtimeError',
    family: 'marker',
    slots: ['key'],
  },
  'override-function-not-built': {
    headline:
      'Override entry `{entry}` references compiled function `{function}` which did not render: this would throw at runtime, so the build stops.',
    level: 'runtimeError',
    family: 'marker',
    slots: ['entry', 'function'],
  },
  'override-validate-affects-json': {
    headline: 'Overriding `validate` for this type also changes how JSON decoders narrow unions containing it.',
    level: 'info',
    family: 'marker',
  },
  'purefn-artifact-conflict': {
    headline: 'Pure fn `{fn}` differs between `{first}` and `{second}`.',
    level: 'error',
    family: 'purefn',
    slots: ['fn', 'first', 'second'],
  },
  'purefn-artifact-unreadable': {
    headline: '`{file}` could not be read as part of a pure-fn artifact: {reason}.',
    level: 'warning',
    family: 'purefn',
    slots: ['file', 'reason'],
  },
  'purefn-dependency-cycle': {
    headline: 'Pure functions circular dependency: `{fn}` (`{id}`) reaches back into `{target}`.',
    level: 'error',
    family: 'purefn',
    slots: ['fn', 'id', 'target'],
  },
  'purefn-dependency-not-id': {
    headline: '`{namespace}.{fn}` dependency argument must be a pure-fn id.',
    level: 'runtimeError',
    family: 'purefn',
    slots: ['namespace', 'fn'],
  },
  'purefn-destructured-param': {
    headline: 'Pure-fn factory `{factory}` uses destructured parameters; only simple identifier params are supported.',
    level: 'error',
    family: 'purefn',
    slots: ['factory'],
  },
  'purefn-forbidden-construct': {
    headline: '`{construct}` is not allowed inside a pure-fn factory body.',
    level: 'runtimeError',
    family: 'purefn',
    slots: ['construct'],
  },
  'purefn-id-mismatch': {
    headline: "Explicit pure-fn id `{id}` does not match this registration's computed id `{computedId}`.",
    level: 'error',
    family: 'purefn',
    slots: ['id', 'computedId'],
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
    headline: 'Pure fn `{fn}` is referenced by a RT function but was never registered.',
    level: 'runtimeError',
    family: 'purefn',
    slots: ['fn'],
  },
  'purefn-package-not-built': {
    headline: 'Pure fn `{fn}` comes from `{package}`, which ships no compiled pure functions.',
    level: 'error',
    family: 'purefn',
    slots: ['fn', 'package'],
  },
  'purefn-reads-outer-variable': {
    headline:
      "`{name}` is captured from outer scope inside a pure-fn factory; pure functions can't reach outside their own body.",
    level: 'runtimeError',
    family: 'purefn',
    slots: ['name'],
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
      '`inputFrom()` sits at argument index {index} of route `{route}`, which declares only {count} parameter(s); move the mapping to an argument the route declares.',
    level: 'error',
    family: 'marker',
    slots: ['index', 'route', 'count'],
  },
  'rpc-batch-duplicate-route': {
    headline:
      'Route `{route}` is listed twice in this `batch()`; a batch runs each route once, so drop the duplicate or move it into a second batch.',
    level: 'error',
    family: 'marker',
    slots: ['route'],
  },
  'rpc-batch-element-unreadable': {
    headline:
      '`batch()` element is not a route call the build can read ({reason}); write `routes.a.b(...)` inline or bind it to a `const`/`let` in this file.',
    level: 'error',
    family: 'marker',
    slots: ['reason'],
  },
  'rpc-batch-id-collision': {
    headline:
      'Batch id `{id}` is shared by two different batches; reorder the routes of one of them so the ids no longer collide.',
    level: 'runtimeError',
    family: 'marker',
    slots: ['id'],
  },
  'rpc-batch-mapper-missing': {
    headline: 'Batch mapper `{mapper}` has no generated pure function in this program; the server build cannot register it.',
    level: 'runtimeError',
    family: 'marker',
    slots: ['mapper'],
  },
  'rpc-batch-mapper-unreadable': {
    headline:
      '`inputFrom()` mapper is not readable at build time ({reason}); pass an inline arrow function or a string literal mapper name.',
    level: 'error',
    family: 'marker',
    slots: ['reason'],
  },
  'rpc-batch-router-init-hidden': {
    headline:
      'The batch table {file} was written, but no module of this program calls `createMionRouter` directly, so nothing imports it; import it by hand in the module that creates the router.',
    level: 'runtimeError',
    family: 'marker',
    slots: ['file'],
  },
  'rpc-batch-source-not-before': {
    headline:
      '`inputFrom()` reads route `{source}` for route `{target}`, but the source is not in this batch or runs after the target; sources must be listed before the routes they feed.',
    level: 'error',
    family: 'marker',
    slots: ['source', 'target'],
  },
  'rpc-client-api-unreadable': {
    headline:
      'The API type at this dispatch site cannot be read as a mion PublicApi ({reason}); bundling needs `PublicApi<typeof routes>`.',
    level: 'error',
    family: 'marker',
    slots: ['reason'],
  },
  'rpc-client-fetch-not-set-up': {
    headline:
      "This client builds with `client.routes: 'fetch'`, so every call fetches its route's metadata, but it never sets up `useFetchMetadata`: every call fails.",
    level: 'runtimeError',
    family: 'marker',
  },
  'rpc-client-imports-server-value': {
    headline:
      '`{name}` is passed to `initClient` but imported as a value from "{module}", which can put that server module in the client bundle; use `import type`.',
    level: 'runtimeError',
    family: 'marker',
    slots: ['name', 'module'],
  },
  'rpc-client-middleware-not-set-up': {
    headline:
      'The route `{route}` runs the middleware `{middleware}`, which needs params, but this client never sets it up; every call to the route fails its validation.',
    level: 'runtimeError',
    family: 'marker',
    slots: ['route', 'middleware'],
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
    headline: 'Option `{option}` of `{route}` is not a literal on the API type, so the bundled metadata leaves it unset.',
    level: 'warning',
    family: 'marker',
    slots: ['option', 'route'],
  },
  'rpc-client-optional-middleware-not-set-up': {
    headline:
      'The route `{route}` runs the middleware `{middleware}`, but this client never sets it up, so the middleware never gets its params.',
    level: 'runtimeError',
    family: 'marker',
    slots: ['route', 'middleware'],
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
    headline: 'This call names the route `{route}`, which the API type does not declare; nothing is bundled for it.',
    level: 'error',
    family: 'marker',
    slots: ['route'],
  },
  'rpc-client-server-version-mismatch': {
    headline:
      'This client hashes its API ids to the build version {clientVersion}, but the API types it reads come from a server build with {serverVersion}: every call reports a version mismatch.',
    level: 'runtimeError',
    family: 'marker',
    slots: ['clientVersion', 'serverVersion'],
  },
  'rpc-client-shared-modules': {
    headline:
      'This program builds with moduleMode `allSingle`, one module per family for the whole program, so the client bundle carries every server type.',
    level: 'warning',
    family: 'marker',
  },
  'rpc-client-types-not-built-by-mion': {
    headline:
      'The API package {package} ships types only, but {reason}: a client can only trust types-only packages that `mion api-types` built.',
    level: 'runtimeError',
    family: 'marker',
    slots: ['package', 'reason'],
  },
  'rpc-client-types-other-mion-version': {
    headline:
      'The API package {package} was built by mion {builtWith}, this build runs {running}: the ids of both sides may differ.',
    level: 'warning',
    family: 'marker',
    slots: ['package', 'builtWith', 'running'],
  },
  'rpc-client-version-mismatch': {
    headline:
      'This client injects the build version {clientVersion} but the API in the same program injects {apiVersion}; the client reports a version mismatch against its own server.',
    level: 'runtimeError',
    family: 'marker',
    slots: ['clientVersion', 'apiVersion'],
  },
  'rpc-handler-missing-param-type': {
    headline:
      'mion `{handler}` handler parameter `{param}` has no type annotation; every parameter after the call context travels on the wire and must declare its type.',
    level: 'runtimeError',
    family: 'mionroute',
    slots: ['handler', 'param'],
  },
  'rpc-handler-missing-return-type': {
    headline: 'mion `{handler}` handler has no return type annotation; write the type the handler answers with.',
    level: 'runtimeError',
    family: 'mionroute',
    slots: ['handler'],
  },
  'rpc-handler-non-data-property': {
    headline: 'Property `{property}` can never be data and is dropped from every compiled function; rename it.',
    level: 'warning',
    family: 'mionroute',
    slots: ['property'],
  },
  'rpc-handler-returns-non-rpc-error': {
    headline:
      'mion `{handler}` handler declares it can answer with `{errorType}`, which is not an `RpcError`; only an `RpcError` (or a subclass such as `FatalError`) carries the mion brand.',
    level: 'runtimeError',
    family: 'mionroute',
    slots: ['handler', 'errorType'],
  },
  'rpc-handler-throws': {
    headline:
      'mion `{handler}` handlers must return errors, not throw them; return an `RpcError` to let the chain continue, or a `FatalError` to stop the request.',
    level: 'runtimeError',
    family: 'mionroute',
    slots: ['handler'],
  },
  'unknown-keys-function-shared': {
    headline: 'The function in {target} cannot be copied: the copy shares it with the input.',
    level: 'warning',
    family: 'runtype',
    slots: ['target'],
  },
  'unknown-keys-method-not-copied': {
    headline: "Method or accessor `{member}` is not copied: the copy keeps the input's prototype, so it still works.",
    level: 'info',
    family: 'runtype',
    slots: ['member'],
  },
  'unknown-keys-non-data-shared': {
    headline:
      'The value in {target} cannot be copied (a Promise, a RegExp or a built-in that is not data): the copy shares it with the input.',
    level: 'warning',
    family: 'runtype',
    slots: ['target'],
  },
  'unknown-keys-object-union': {
    headline:
      '`removeUnknownKeys` does not support unions with object members: the emitter cannot know which declared shape to rebuild at runtime.',
    level: 'runtimeError',
    family: 'runtype',
  },
  'unknown-keys-private-fields': {
    headline:
      'The {target} has `#private` fields, which only its constructor can create: a copy would break its methods, so the function always throws.',
    level: 'runtimeError',
    family: 'runtype',
    slots: ['target'],
  },
  'unknown-keys-shared-value-refused': {
    headline:
      "The value in {target} can only be shared with the input and `sharedValues: 'refuse'` is set, so the function always throws.",
    level: 'runtimeError',
    family: 'runtype',
    slots: ['target'],
  },
  'unknown-keys-static-dropped': {
    headline: 'Static member `{member}` is not part of instance data: `removeUnknownKeys` skips it.',
    level: 'info',
    family: 'runtype',
    slots: ['member'],
  },
  'unknown-keys-symbol-key': {
    headline:
      'Symbol-keyed {target} cannot be copied: the generated code cannot name your symbol, so the function always throws.',
    level: 'runtimeError',
    family: 'runtype',
    slots: ['target'],
  },
  'unknown-keys-value-shared': {
    headline: "The value in {target} is shared with the input, as `sharedValues: 'share'` asks.",
    level: 'info',
    family: 'runtype',
    slots: ['target'],
  },
  'validate-any-accepts-all': {
    headline: '`validate` on `any` / `unknown` always returns true: the validator accepts every value.',
    level: 'info',
    family: 'runtype',
  },
  'validate-function-property-dropped': {
    headline:
      'Property `{property}` is a function: `validate` does not handle function values, so this property is silently not validated.',
    level: 'info',
    family: 'runtype',
    slots: ['property'],
  },
  'validate-function-root': {
    headline: 'Type `{type}` can never be validated: the generated function will always fail.',
    level: 'runtimeError',
    family: 'runtype',
    slots: ['type'],
  },
  'validate-method-dropped': {
    headline: "Method `{method}` is silently not validated by `validate`: methods aren't data.",
    level: 'info',
    family: 'runtype',
    slots: ['method'],
  },
  'validate-non-data-property-dropped': {
    headline:
      'Property `{property}` has a non-serialisable value type (symbol, Promise, or a non-serialisable built-in): `validate` drops it, so this property is silently not validated.',
    level: 'info',
    family: 'runtype',
    slots: ['property'],
  },
  'validate-non-data-root': {
    headline: 'Type `{type}` can never be validated: the generated function will always fail.',
    level: 'runtimeError',
    family: 'runtype',
    slots: ['type'],
  },
  'validate-static-dropped': {
    headline: "Static member `{member}` is silently not validated by `validate`: statics aren't part of instance data.",
    level: 'info',
    family: 'runtype',
    slots: ['member'],
  },
  'validate-symbol-key-dropped': {
    headline:
      "Symbol-keyed property `{property}` is silently not validated by `validate`: symbol keys aren't JSON-representable.",
    level: 'info',
    family: 'runtype',
    slots: ['property'],
  },
  'validate-symbol-root': {
    headline: 'Type `{type}` can never be validated: the generated function will always fail.',
    level: 'runtimeError',
    family: 'runtype',
    slots: ['type'],
  },
  'validate-union-member-dropped': {
    headline:
      "Union member(s) of type `{type}` can't be represented as data: `validate` drops them, so the union is validated as its remaining members.",
    level: 'info',
    family: 'runtype',
    slots: ['type'],
  },
  'validation-errors-any-accepts-all': {
    headline: '`validationErrors` on `any` / `unknown` always returns an empty error array: nothing is checked.',
    level: 'info',
    family: 'runtype',
  },
  'validation-errors-function-property-dropped': {
    headline:
      'Property `{property}` is a function: `validationErrors` does not handle function values, so this property is silently not checked.',
    level: 'info',
    family: 'runtype',
    slots: ['property'],
  },
  'validation-errors-function-root': {
    headline: 'Type `{type}` can never be validated: the generated function will always fail.',
    level: 'runtimeError',
    family: 'runtype',
    slots: ['type'],
  },
  'validation-errors-method-dropped': {
    headline: "Method `{method}` is silently not checked by `validationErrors`: methods aren't data.",
    level: 'info',
    family: 'runtype',
    slots: ['method'],
  },
  'validation-errors-non-data-property-dropped': {
    headline:
      'Property `{property}` has a non-serialisable value type (symbol, Promise, or a non-serialisable built-in): `validationErrors` drops it, so this property is silently not checked.',
    level: 'info',
    family: 'runtype',
    slots: ['property'],
  },
  'validation-errors-non-data-root': {
    headline: 'Type `{type}` can never be validated: the generated function will always fail.',
    level: 'runtimeError',
    family: 'runtype',
    slots: ['type'],
  },
  'validation-errors-static-dropped': {
    headline: "Static member `{member}` is silently not checked by `validationErrors`: statics aren't part of instance data.",
    level: 'info',
    family: 'runtype',
    slots: ['member'],
  },
  'validation-errors-symbol-key-dropped': {
    headline:
      "Symbol-keyed property `{property}` is silently not checked by `validationErrors`: symbol keys aren't JSON-representable.",
    level: 'info',
    family: 'runtype',
    slots: ['property'],
  },
  'validation-errors-symbol-root': {
    headline: 'Type `{type}` can never be validated: the generated function will always fail.',
    level: 'runtimeError',
    family: 'runtype',
    slots: ['type'],
  },
};
