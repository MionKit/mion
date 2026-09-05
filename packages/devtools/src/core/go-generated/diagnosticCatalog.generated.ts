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
  /** Catalog severity: the default lint-rule tier this code routes to. */
  readonly severity: 'error' | 'warning' | 'info';
  /** Optional multi-line detail block (explanation + code-example fix). */
  readonly detail?: string;
}

export const DIAGNOSTIC_CATALOG: Record<string, DiagnosticEntry> = {
  BAT001: {
    headline:
      '`batch()` element is not a route call the build can read ({0}); write `routes.a.b(...)` inline or bind it to a `const`/`let` in this file.',
    severity: 'error',
    detail:
      'The build computes the batch id from the ORDERED list of route ids the\n`[...]` argument names, so every element must be a call on the client\nroutes proxy (`routes.users.getById(...)`) that it can trace statically,\neither written inline or bound to a `const` / `let` in the same file.\nA spread, a call on something that is not the routes proxy, a function\nparameter, or a binding without a route-call initializer cannot be read.\n\nFix: write the route call inline, or bind it first:\n-  batch([...prepared, routes.orders.list()]);\n+  const user = routes.users.getById(id);\n+  batch([user, routes.orders.list()]);',
  },
  BAT002: {
    headline:
      '`inputFrom()` reads route `{0}` for route `{1}`, but the source is not in this batch or runs after the target; sources must be listed before the routes they feed.',
    severity: 'error',
    detail:
      "Routes in a batch run in the order they are listed, and a route can only\nread the output of one that already ran. The source route must be an\nelement of the same `batch([...])` call and sit before the route whose\ninput it maps into.\n\nFix: list the source route first:\n-  batch([routes.orders.list(inputFrom(user, 'toUserId')), user]);\n+  batch([user, routes.orders.list(inputFrom(user, 'toUserId'))]);",
  },
  BAT003: {
    headline:
      'Batch id `{0}` is shared by two different batches; reorder the routes of one of them so the ids no longer collide.',
    severity: 'error',
    detail:
      'The batch id is a hash of the ordered route ids and the input mappings.\nTwo different batches hashing to the same id is a theoretical event, but\nif it ever happened the server could not tell the two plans apart.\n\nFix: change the route order of one batch, or split it into two batches.',
  },
  BAT004: {
    headline:
      '`inputFrom()` mapper is not readable at build time ({0}); pass an inline arrow function or a string literal mapper name.',
    severity: 'error',
    detail:
      "The build records which mapper feeds each batched route: an inline\nfunction is registered by content hash, a string names a mapper the\nserver registered. Anything else (a function reference, a computed\nstring, a value from a parameter) cannot be read statically.\n\nFix: inline the mapper or name it:\n-  inputFrom(user, pickId);\n+  inputFrom(user, (u) => u.id);\n+  inputFrom(user, 'toUserId');",
  },
  BAT005: {
    headline:
      'Route `{0}` is listed twice in this `batch()`; a batch runs each route once, so drop the duplicate or move it into a second batch.',
    severity: 'error',
    detail:
      'The server keys the batch request and its results by route id, so one\nbatch cannot run the same route twice: the second call would overwrite the\nfirst and only one result could come back.\n\nFix: keep one call per route, or split the calls into two batches:\n-  batch([routes.users.getById(1), routes.users.getById(2)]);\n+  batch([routes.users.getById(1)]);\n+  batch([routes.users.getById(2)]);',
  },
  BAT006: {
    headline:
      '`inputFrom()` sits at argument index {0} of route `{2}`, which declares only {1} parameter(s); move the mapping to an argument the route declares.',
    severity: 'error',
    detail:
      "The server feeds a mapped input into the target route at the argument\nposition the client wrote it, so that position must be one of the route\nhandler's parameters (indexes are zero-based). Today the server rejects\nsuch a request at run time; the build reports it here so it never ships.\n\nFix: pass the mapping at a declared parameter position:\n-  routes.orders.getById(1, inputFrom(user, 'toUserId'));   // getById(id) takes 1 argument\n+  routes.orders.getById(inputFrom(user, 'toUserId'));",
  },
  CES001: {
    headline:
      '`cloneExactShape` does not support unions with object members: the emitter cannot know which declared shape to rebuild at runtime.',
    severity: 'error',
    detail:
      'A clone built from the declared shape needs to know WHICH union arm the\nruntime value matches; v1 has no arm discrimination, and silently keeping\nunknown keys would defeat the strip guarantee, so the build fails instead.\n\nWorkarounds: narrow the value to one arm before cloning (one\n`createCloneExactShapeFn<Arm>()` per arm), or restructure the union into a\nsingle object with optional properties.',
  },
  CES003: {
    headline: '`cloneExactShape` cannot clone a function-typed value.',
    severity: 'error',
    detail:
      "Functions aren't data: there is no declared shape to rebuild. Function-typed\nPROPERTIES are dropped from the clone (CES010/CES011); a function at the root\nor a propagating position fails the build.",
  },
  CES010: {
    headline:
      'Property `{0}` is a function: `cloneExactShape` cannot rebuild it, so it is kept on the clone, SHARED BY REFERENCE.',
    severity: 'warning',
    detail:
      "Declared members are never dropped (only UNDECLARED keys are; that is the\nstrip guarantee). Functions cannot be rebuilt from a declared shape, so the\nclone's property points at the SAME function as the input's. Class METHODS\ndiffer: they ride the shared prototype and are not copied as own props\n(CES011).",
  },
  CES011: {
    headline: "Method `{0}` is not copied onto the clone's own properties: methods ride the prototype.",
    severity: 'warning',
    detail:
      'For a plain class instance the clone preserves the PROTOTYPE\n(`Object.create(Object.getPrototypeOf(v))`), so methods keep working via the\nprototype chain; they are simply not copied as own properties. For object\nliterals a method-typed member is omitted like any function value.',
  },
  CES012: {
    headline: 'Static member `{0}` is not part of instance data: `cloneExactShape` skips it.',
    severity: 'warning',
    detail: 'Statics live on the class, not the instance; the clone rebuilds instance\ndata only.',
  },
  CES015: {
    headline:
      'Property `{0}` has a value type `cloneExactShape` cannot rebuild (symbol, Promise, or a non-serialisable built-in): it is kept on the clone, SHARED BY REFERENCE.',
    severity: 'warning',
    detail:
      "Declared members are never dropped (only UNDECLARED keys are; that is the\nstrip guarantee). A value the emitter cannot rebuild passes through by\nreference instead: the clone's property points at the SAME handle as the\ninput's, so mutations through it are visible on both sides. Register\n`overrideCloneExactShape<T>()` if this type needs custom copying.",
  },
  CFG001: {
    headline:
      'Project tsconfig failed to load ({0}): the build, the linter, and the CLI all read this config, so nothing can run until it loads.',
    severity: 'error',
    detail:
      'RunTypes derives every type query from your project tsconfig, the same\nfile your build uses. A tsconfig that was named (or found next to your\nproject) but is missing or does not parse stops the operation, exactly\nlike `tsc --project` would, instead of silently falling back to defaults\nthat could resolve your types differently.\n\nFix: repair the tsconfig (the message names the first parse problem),\nor point the tooling at the right file (the plugin/lint `tsconfig`\nsetting, or the CLI `--tsconfig` flag).',
  },
  CFG002: {
    headline:
      'The project `lib` declares no base ECMAScript library (loaded: {0}), so core globals like `Array` are missing and reflected types cannot be trusted.',
    severity: 'error',
    detail:
      'RunTypes reflects your types through the standard library your tsconfig\nselects. With no base edition in `lib`, TypeScript never declares `Array`,\n`Object`, `String` and friends, and the checker resolves `number[]` to an\nempty object instead. Nothing errors: the build succeeds and the generated\nvalidator accepts any value.\n\nThat is the one failure shape RunTypes refuses to ship, so the operation\nstops here instead.\n\nFix: name a base edition in your tsconfig `lib` (`["ES2022"]`, or\n`["ES2022", "DOM"]` for browser code), or drop `lib` entirely and let\n`target` pick it. A by-feature entry such as `"esnext.disposable"` adds to a\nbase edition, it cannot replace one.',
  },
  CLS001: {
    headline:
      'class `{0}` is serialized structurally; register it via `registerClassSerializer({0}, { deserialize })` to round-trip a real instance.',
    severity: 'warning',
    detail:
      "By default a user class is serialized by its declared properties and\ndecoded back to a prototype-less plain object: `instanceof {0}` is\nfalse on the decoded value, and any class methods / getters are gone.\nThis is fine when you only care about the data.\n\nTo round-trip a real `{0}` instance, register it once, passing the class\nitself (not a name string):\n  import {registerClassSerializer} from '@mionjs/run-types';\n\n  // zero-arg constructor: nothing else needed\n  registerClassSerializer({0});\n\n  // non-empty constructor: only `deserialize` is required\n  registerClassSerializer({0}, {\n    deserialize: (data) => new {0}(/* rebuild from data */),\n  });\n\n`serialize` is optional (default: structural, same as any interface);\n`deserialize` is optional for a zero-arg class (default:\n`Object.assign(new {0}(), data)`). The same registration is used by the\nJSON and binary families. `validate` / `getValidationErrors` are\nunaffected: they always validate structurally.",
  },
  CTA001: {
    headline:
      '`CompTimeArgs<T>` argument must be a literal at the call site, or a `const` whose initializer is itself entirely literal (a same-module or imported `const` both work).',
    severity: 'error',
    detail:
      "The build resolves the argument before running, so it needs to read its\nvalue from the source. Function-call results, property accesses, ternary\nexpressions, and `let`/`var` bindings can't be evaluated at build time.\nAccepted: an inline literal, or a `const` whose initializer is itself\nfully literal, including a `const` imported from another module. (An\nobject `const` must be `as const` so its members stay literal; see CTA004.)\n\nFix: inline at the call site:\n-  const opts = getOpts();\n-  const isUser = createValidateFn<User>(undefined, opts);\n+  const isUser = createValidateFn<User>(undefined, {mode: 'unsafe'});\n\nFix: use a const of literals (here or in another module):\n  const opts = {mode: 'unsafe'} as const;   // literal initializer ✓\n  const isUser = createValidateFn<User>(undefined, opts);",
  },
  CTA002: {
    headline: '`CompTimeArgs<T>` literal nesting exceeds the depth cap (16), refactor to flatten.',
    severity: 'error',
    detail:
      'Deeply nested literal walks are capped at 16 levels to keep the build\npredictable. If you hit this, the value is almost certainly not what\nyou want at compile time: split it across multiple smaller\n`CompTimeArgs<T>` arguments, or flatten the nesting.',
  },
  CTA003: {
    headline: '`CompTimeArgs<T>` literal contains a forbidden construct ({0}). Only literals and nested literals are allowed.',
    severity: 'error',
    detail:
      "The Go scanner cannot statically evaluate computed property names,\nfunction calls, ternary expressions, or template-string substitutions.\nInside a `CompTimeArgs<T>` literal every node must be a direct literal\n(string / number / bigint / boolean / null / undefined / regex / arrow /\nobject literal / array literal) or a const-traced identifier that\nresolves to one.\n\nSpread IS allowed when its operand resolves to a literal container of the\nmatching kind: a `const`-bound (or imported) object literal for an\nobject spread, an array literal for an array spread:\n  const base = {strict: true};\n  const a = {...base, mode: 'unsafe'};        // ok, merges a const fragment\n\nA spread is still rejected when the operand can't be statically merged:\na dynamic value, or a shape mismatch:\n  -  const a = {...getDefaults(), mode: 'unsafe'};   // dynamic operand\n  -  const a = {...[1, 2], mode: 'unsafe'};          // object spread of an array",
  },
  CTA004: {
    headline:
      '`CompTimeArgs<T>` value comes from a `const` with a widened (non-literal) member ({0}); declare the const `as const`.',
    severity: 'error',
    detail:
      "A `const` used as a CompTimeArgs / CompTimeFnArgs argument (a whole option\nbag, or a builder child) must carry LITERAL value types, so the value the\nbuild reads matches the type TypeScript resolves the call against. Without\n`as const`, an object literal's members widen (`{strategy: 'mutate'}`\nbecomes `{strategy: string}`), which can let the type system select one\nfunction variant while the build injects another.\n\nWhole imported consts now resolve cross-module (like a spread fragment), so\nthis rule keeps that path sound.\n\nFix: add `as const`:\n-  const preset = {strategy: 'mutate'};\n+  const preset = {strategy: 'mutate'} as const;\n   createJsonEncoderFn(undefined, preset);",
  },
  FB001: {
    headline: 'Type `{0}` can never be deserialised from binary: the generated function will always fail.',
    severity: 'error',
    detail:
      "`never` is the empty type: no value can ever inhabit it. A field\ntyped `never` cannot carry a runtime value, so there is nothing to\nencode/decode/validate.\n\nFix: use `unknown` if you really want to accept any value:\n  interface User {\n-   tag: never;\n+   tag: unknown;  // narrow before use\n  }\n\nFix: pick a concrete type matching your real data:\n  interface User {\n-   tag: never;\n+   tag: 'pending' | 'active' | 'done';\n  }",
  },
  FB002: {
    headline: 'Type `{0}` can never be deserialised from binary: the generated function will always fail.',
    severity: 'error',
    detail:
      'A standard-library class carries runtime state that does not survive a JSON\nor binary round-trip: its instance identity is lost the moment it is\nserialised, so at a root position there is nothing left to work with.\n\nA few have an agreed data form and ARE supported: `Date`, `Map`,\n`Set` and the Temporal types. Everything else the standard library declares\n(`URL`, `Intl.DateTimeFormat`, `WeakMap`, `Promise`, the typed arrays and\n`Buffer`) has none, and is refused here rather than guessed at.\n\nFix: describe the data form yourself and convert at the boundary:\n  // for URL:\n  const data = yourUrl.href;             // string\n  // for typed arrays:\n  const data = Array.from(yourBuffer);   // number[]\n\nFix: change the field type to a shape made of data:\n  interface User {\n-   home: URL;\n+   home: string;\n  }',
  },
  FB003: {
    headline: 'Type `{0}` can never be deserialised from binary: the generated function will always fail.',
    severity: 'error',
    detail:
      "Functions have no value form to serialise: their closure, prototype,\nand bound state aren't representable in JSON or binary.\n\nFix: drop the function from your type, or replace it with the data the\nfunction would produce:\n  interface User {\n-   getName: () => string;\n+   name: string;\n  }",
  },
  FB004: {
    headline: 'Type `{0}` can never be deserialised from binary: the generated function will always fail.',
    severity: 'error',
    detail:
      "Arrays of un-serialisable elements (`symbol[]`, `(() => void)[]`,\n`Map<K, V>[]`, etc.) can't be encoded: every element would need to be\nrepresentable, and these aren't. Dropping individual elements would\nchange the array length, so the encoder refuses rather than silently\nshipping a different shape.\n\nFix: change the element type to something serialisable:\n  -  type Items = (() => void)[];\n+  type Items = string[];",
  },
  FB005: {
    headline: 'Type `{0}` can never be deserialised from binary: the generated function will always fail.',
    severity: 'error',
    detail:
      'A standard-library class carries runtime state that does not survive a JSON\nor binary round-trip: its instance identity is lost the moment it is\nserialised, so at a root position there is nothing left to work with.\n\nA few have an agreed data form and ARE supported: `Date`, `Map`,\n`Set` and the Temporal types. Everything else the standard library declares\n(`URL`, `Intl.DateTimeFormat`, `WeakMap`, `Promise`, the typed arrays and\n`Buffer`) has none, and is refused here rather than guessed at.\n\nFix: describe the data form yourself and convert at the boundary:\n  // for URL:\n  const data = yourUrl.href;             // string\n  // for typed arrays:\n  const data = Array.from(yourBuffer);   // number[]\n\nFix: change the field type to a shape made of data:\n  interface User {\n-   home: URL;\n+   home: string;\n  }',
  },
  FB006: {
    headline: 'Type `{0}` can never be deserialised from binary: the generated function will always fail.',
    severity: 'error',
    detail:
      "Every `symbol` value carries a unique runtime identity (`Symbol() !==\nSymbol()` even with the same description). That identity disappears the\nmoment it's serialised, and two symbols can't be compared across realms,\nworkers, or process boundaries. A validator that asserts \"this is a\nsymbol\" gives a false sense of safety: the value can't actually\nround-trip.\n\nFix: use a stable string key (often a literal union):\n  -  type Status = symbol;\n+  type Status = 'pending' | 'active' | 'done';",
  },
  FB010: {
    headline:
      'Property `{0}` is a function: `fromBinary` does not handle function values, so this property is silently not deserialised.',
    severity: 'warning',
    detail:
      '`fromBinary` works on JSON-shaped data; functions don\'t survive JSON, so\nthe emitter drops them. The rest of the object\'s behaviour is unaffected.\n\nThis is by design, see the "one contract: serializable data only"\nsection in CLAUDE.md. If you need a stricter checker that fails on\nmissing/extra function-typed members, watch the project roadmap.',
  },
  FB011: {
    headline: "Method `{0}` is silently not deserialised by `fromBinary`: methods aren't data.",
    severity: 'warning',
    detail:
      "Class and object methods aren't part of the serialisable shape, so\n`fromBinary` excludes them. The rest of the type still works.\n\nIf you wanted the method's return value validated/serialised, expose it\nas a data property instead.",
  },
  FB012: {
    headline: "Static member `{0}` is silently not deserialised by `fromBinary`: statics aren't part of instance data.",
    severity: 'warning',
    detail:
      'Class static members live on the class, not on individual instances.\n`fromBinary` operates on instance shape, so statics are excluded.',
  },
  FB013: {
    headline: "Symbol-keyed property `{0}` is silently not deserialised by `fromBinary`: symbol keys aren't JSON-representable.",
    severity: 'warning',
    detail:
      "JSON only supports string keys; symbol-keyed properties are dropped\nfrom the serialised form. `fromBinary` follows the same rule.\n\nFix: use a string key:\n  -  [Symbol.for('id')]: string;\n+  id: string;",
  },
  FB014: {
    headline:
      "Union member(s) of type `{0}` can't be represented as data: `fromBinary` drops them, so the union is deserialised as its remaining members.",
    severity: 'warning',
    detail:
      'A union projects to its serialisable members only: `DataOnly<Date | symbol>`\nis `Date`. The dropped member(s) ({0}) carry no JSON-shaped value (symbol,\nfunction, Promise, or a non-serialisable built-in like `Map` / `Set` /\ntyped arrays), so `fromBinary` deserialised only the members that remain.\n\nThis is by design, see the "one contract: serializable data only"\nsection in CLAUDE.md. If EVERY member of the union is non-serialisable the\nprojection is `never`, and `fromBinary` throws at build time instead.',
  },
  FB015: {
    headline:
      'Property `{0}` has a non-serialisable value type (symbol, Promise, or a non-serialisable built-in): `fromBinary` drops it, so this property is silently not deserialised.',
    severity: 'warning',
    detail:
      '`fromBinary` works on JSON-shaped data. A property whose value is a symbol,\na Promise, or a non-serialisable built-in (a typed array, `ArrayBuffer`, or any other\nstandard-library class such as `URL` or `Intl.DateTimeFormat`) carries\nno JSON-shaped value, so it is dropped: `DataOnly<{ {0}: symbol }>` is `{}`.\nThe rest of the object\'s behaviour is unaffected.\n\nNote the difference from a property that is only STRUCTURALLY unserialisable\n(`{0}: symbol[]` or `{0}: Map<string, symbol>`), which CANNOT be safely\ndropped (DataOnly keeps it as `never[]`): there `fromBinary` throws at build\ntime instead.\n\nThis is by design, see the "one contract: serializable data only"\nsection in CLAUDE.md.',
  },
  FMT001: {
    headline: 'TypeFormat mockSample "{0}" does not match its pattern /{1}/; fix the sample or the pattern.',
    severity: 'error',
  },
  FMT002: {
    headline: 'Invalid type-format params: {0}',
    severity: 'error',
  },
  FMT003: {
    headline: 'TypeFormat mockSample violates a sibling constraint: {0}',
    severity: 'error',
    detail:
      "A mockSample is meant to be a canonical VALID value for the format, so it\nmust satisfy the format's own statically checkable siblings (length /\nminLength / maxLength, and the plain-string allowedChars / disallowedChars /\ndisallowedValues ops). A sample that its siblings reject means\n`createMockDataFn` would either produce an invalid value or filter every\nsample out and throw at mock time.\n\nLengths are counted in UTF-16 code units, exactly as the emitted validator's\n`.length` check counts them.\n\nFix: adjust the offending sample(s), or relax the constraint:\n  -  String<{minLength: 5; pattern: {source: '^b+$'; mockSamples: ['b', 'bb']}}>\n+  String<{minLength: 1; pattern: {source: '^b+$'; mockSamples: ['b', 'bb']}}>",
  },
  FMT004: {
    headline:
      'TypeFormat pattern /{0}/ cannot be checked: {1}; pattern validation requires a JavaScript runtime; install one or pass --js-runtime.',
    severity: 'error',
    detail:
      "Pattern checks (does the regex compile, do the mockSamples match it) run on\na real JS engine (the same `new RegExp` the emitted validator uses at\nruntime), driven by the resolver as a small sidecar under a JavaScript\nruntime. No runtime could be started, so the pattern is unverifiable and\nthe build fails closed rather than ship samples it can't verify.\n\nFix: install node or bun (both are found automatically on PATH), or point\nthe --js-runtime flag or the MION_JS_RUNTIME environment variable at any\nother runtime that can run the bundled checker (deno and most\nnode-compatible runtimes work). Projects with no patterns never need this.",
  },
  FMT005: {
    headline: 'Cannot auto-generate mockSamples for pattern /{0}/: {1}; declare mockSamples explicitly.',
    severity: 'error',
    detail:
      "A pattern with no declared mockSamples gets them generated at build time:\nthe JS engine draws candidate strings from the regex (patternSampleCount of\nthem, a fresh pool per build, or a reproducible one when a literal\n{mock: {seed}} rides a createMockDataFn call site) and keeps the ones the\nreal compiled pattern and the declared length bounds accept. This one\nproduced nothing: generation is disabled (patternSampleCount 0), the\ngenerator cannot handle a construct in the pattern (lookarounds are the\nusual case), or every draw in the retry budget (patternSampleCount ×\npatternSampleRetries) failed the pattern's own constraints.\n\nFix: declare the samples yourself; they are validated against the pattern\nat build time, so they stay trustworthy:\n-  String<{pattern: {source: '(?<=x)y'}}>\n+  String<{pattern: {source: '(?<=x)y'; mockSamples: ['xy']}}>\n\nOr, if generation was disabled on purpose, re-enable it by raising\npatternSampleCount above 0 (and patternSampleRetries if the pattern is\nheavily constrained).",
  },
  FMT006: {
    headline:
      'Two sites share one cache entry for format `{0}` but declare different mockSamples: `{1}` here vs `{2}` at {3}. Make the pools identical, or declare one and leave the other out.',
    severity: 'error',
    detail:
      "mockSamples describe how to GENERATE a sample value; they are not part of\nwhat the format validates. So two formats identical apart from their pools\nare the same validator, and they intern as ONE cache entry. That dedup is\ndeliberate, and it is why the samples are excluded from the structural id.\n\nThe catch is that one entry can only carry one pool. When both sites declare\none and the pools differ, the entry keeps whichever it saw first, so which\npool survives depends on scan order, and adding or reordering unrelated\ncode elsewhere can flip it. Rather than pick silently, the build stops here.\n\nFix: declare the same pool at both sites:\n-  type A = String<{maxLength: 5; mockSamples: ['aaa']}>;\n-  type B = String<{maxLength: 5; mockSamples: ['bbb']}>;\n+  type A = String<{maxLength: 5; mockSamples: ['aaa']}>;\n+  type B = String<{maxLength: 5; mockSamples: ['aaa']}>;\n\nFix: or declare it once and leave the other alone; a site that declares\nnothing is not an opinion, so the declared pool is adopted for the shared\nentry:\n  type A = String<{maxLength: 5; mockSamples: ['aaa']}>;\n  type B = String<{maxLength: 5}>;\n\nIf the two really are different types, give them something the id DOES\nfold (a distinct pattern, bound, or brand) so they stop sharing an entry.",
  },
  FMT007: {
    headline:
      'TypeFormat pattern /{0}/ could not be evaluated in time: {1}; the build was not able to tell whether the pattern is safe.',
    severity: 'error',
    detail:
      'Pattern checks run each mockSample through the real compiled regex on a JS\nengine, with a time budget per sample so a pattern that backtracks\ncatastrophically cannot hang the build. This sample ran out of budget, and\nout of the larger retry budget too. Either the pattern really is runaway\n(nested quantifiers such as `(a+)+` on a long input are the usual case) or\nthe machine was too busy to finish a fine match in time.\n\nThis verdict is never cached: the next build re-evaluates the pattern, so a\none-off load spike clears itself. If it keeps failing on an idle machine,\nrewrite the pattern to avoid ambiguous nested repetition, or shorten the\nsample it times out on.',
  },
  FMT008: {
    headline:
      'TypeFormat pattern /{0}/ can be made to backtrack exponentially: {1} (`{2}`); a crafted input would hang the validator.',
    severity: 'error',
    detail:
      "A `pattern` becomes a real regular expression inside the generated\nvalidator and runs on every value that validator sees. JavaScript matches\nwith a backtracking engine, so a pattern that can match the same text in\nmore than one way tries every combination before it gives up. On an input\nthat ALMOST matches, a few dozen characters are enough to hang the\nprocess, and the validator is the thing meant to keep bad input out.\n\nThe check is static, so it runs on every machine, unlike the sample time\nbudget, which needs a runtime that can interrupt a running match.\n\nFix: make each turn of the loop match one way only, usually by giving the\nrepeated part a boundary the rest cannot match:\n-  String<{pattern: {source: '^(\\\\w+\\\\s?)*$'}}>\n+  String<{pattern: {source: '^\\\\w+(?:\\\\s\\\\w+)*$'}}>\n\nIf the pattern really is safe and the check has it wrong, say so on the\npattern and the build accepts it:\n  String<{pattern: {source: '...'; unsafePattern: true}}>",
  },
  FT002: {
    headline: 'Unknown field `{0}`: the type does not declare it, so this FriendlyText entry is dead.',
    severity: 'error',
    detail:
      "The FriendlyText map names a field the source type does not have\n(removed, renamed, or a typo). Its labels and messages can never be\nused.\n\nExample: `nick` no longer exists on the type:\n  interface User { name: string }\n  export const friendlyUser: FriendlyText<User> = {\n    name: {rt$label: 'Name'},\n-   nick: {rt$label: 'Nickname'},\n  };\n\nFix: remove the entry, or re-run the reconcile so the mirror follows\nthe type (a renamed field carries its authored values along):\n  mion enrich <source.ts> <Type> --update",
  },
  FT003: {
    headline: 'Error key `{0}` is not a declared constraint of this field: the message can never fire.',
    severity: 'warning',
    detail:
      "`rt$errors` keys must name a failure the field can actually produce:\n`type`, `rt$default`, or one of the field's declared format constraints\n(`minLength`, `pattern`, `min`, …). An undeclared key is dead\nconfiguration.\n\nExample: the field has no `maxLength` constraint:\n  interface User { name: string & FormatString<{minLength: 2}> }\n  export const friendlyUser: FriendlyText<User> = {\n    name: {\n      rt$errors: {\n        minLength: 'Name needs at least 2 characters',\n-       maxLength: 'Name is too long',\n      },\n    },\n  };\n\nFix: remove the key, or declare the matching constraint on the field's\nTypeFormat so the message has a failure to describe.",
  },
  FT005: {
    headline: 'Unknown placeholder `$[{0}]`: expected one of `$[label]`, `$[val]`, `$[path]`, `$[index]`.',
    severity: 'warning',
    detail:
      "Error-message templates substitute a fixed placeholder set; an unknown\nname renders literally instead of substituting.\n\nExample:\n- rt$errors: {minLength: '$[name] is too short'}\n+ rt$errors: {minLength: '$[label] is too short'}\n\nFix: use one of the recognised placeholders, or write the literal text\nwithout the `$[…]` wrapper.",
  },
  FT006: {
    headline: 'Plural error template is missing the mandatory `other` arm: the render has no backstop.',
    severity: 'error',
    detail:
      "Plural templates render the CLDR arm matching the count, and `other` is\nthe arm every locale falls back to. Without it some counts have no\nmessage at all.\n\nExample:\n  rt$errors: {\n    minLength: {\n      one: 'Needs one more character',\n+     other: 'Needs $[val] more characters',\n    },\n  }\n\nFix: add the `other` arm to the plural object.",
  },
  FT007: {
    headline: 'Unknown plural arm `{0}`: CLDR categories are `zero`, `one`, `two`, `few`, `many`, `other`.',
    severity: 'warning',
    detail:
      "Plural template keys must be CLDR plural categories; anything else can\nnever be selected by any locale's plural rules.\n\nExample:\n  rt$errors: {\n    minLength: {\n-     single: 'Needs one more character',\n+     one: 'Needs one more character',\n      other: 'Needs $[val] more characters',\n    },\n  }\n\nFix: rename the arm to one of the six categories, or remove it.",
  },
  FT008: {
    headline: 'Constraint `{0}` carries no count: a plural template here has dead arms; use a plain string.',
    severity: 'warning',
    detail:
      "Only count-bearing constraints (`minLength`, `maxLength`, `min`, `max`,\n…) can select a plural arm. On a non-count constraint only `other` ever\nrenders, so the remaining arms are dead configuration.\n\nExample: `pattern` has no count:\n  rt$errors: {\n-   pattern: {one: 'One bad character', other: 'Invalid characters'},\n+   pattern: 'Only letters and numbers are allowed',\n  }\n\nFix: replace the plural object with a plain string message.",
  },
  FT009: {
    headline: '`rt$default` is mutually exclusive with per-constraint messages; use one mode or the other.',
    severity: 'error',
    detail:
      "An `rt$errors` record is either ONE `rt$default` catch-all or a set of\nper-constraint keys, mirroring the TypeScript union. Mixing them makes\nthe intent ambiguous (which message wins?).\n\nExample:\n  rt$errors: {\n-   rt$default: 'Invalid name',\n    minLength: 'Name is too short',\n  }\n\nFix: keep `{rt$default: '…'}` alone, or keep the per-constraint keys\nand drop `rt$default`.",
  },
  FT011: {
    headline: 'Property `{0}` collides with the reserved `rt$` enrichment prefix: the type cannot be enriched.',
    severity: 'error',
    detail:
      '`rt$`-prefixed keys are reserved for enrichment meta (`rt$label`,\n`rt$errors`, `rt$items`, …); a source property with that prefix is\nindistinguishable from node meta, so gen refuses the type and the\nFriendlyType checker reports it here.\n\nFix: rename the property (a plain `$` prefix is fine; only `rt$` is\nreserved):\n  interface Config {\n-   rt$mode: string;\n+   $mode: string;\n  }',
  },
  FT020: {
    headline: 'Unfilled `@todo` placeholder; fill in the real labels/messages, then delete the `@todo` line.',
    severity: 'error',
    detail:
      "The generator stamps a `@todo` line on every freshly-scaffolded const in\na FriendlyText mirror file. It means \"this skeleton still carries\ngenerated blanks\". A clean, committed mirror has none.\n\nExample: a fresh scaffold:\n  /** @rtType User#a1b2c3 @rtIds {name: d4e5f6} */\n- // @todo: generated skeleton, fill in real data, then delete this line\n  export const friendlyUser: FriendlyText<User> = {\n-   name: {rt$label: ''},\n+   name: {rt$label: 'Name'},\n  };\n\nFix: author the real labels and error messages for the const, then\ndelete the whole `@todo` line (the compiler never removes it for you).",
  },
  FT021: {
    headline: 'Stale `@rtOrphan` carcass; run `mion enrich --prune` to remove it (or restore the type).',
    severity: 'error',
    detail:
      'The reconcile commented this FriendlyText const out because its source\ntype was deleted or renamed. The carcass preserves your authored labels\nand messages so a reappearing type can restore them, but a clean,\ncommitted mirror has none.\n\nFix: if the type is really gone, prune the carcass:\n  mion enrich --prune\n\nFix: if the type was renamed, re-run the reconcile; a matching carcass\nis restored with your values intact:\n  mion enrich <source.ts> <NewName> --update',
  },
  FT022: {
    headline: 'Stale `@rtOrphanChild` field carcass; run `mion enrich --prune` to remove it (or restore the field).',
    severity: 'error',
    detail:
      "The reconcile commented this field out because the source type no longer\ndeclares it. The carcass preserves your authored value inline, but a\nclean, committed mirror has none.\n\nExample:\n  export const friendlyUser: FriendlyText<User> = {\n-   /* @rtOrphanChild nick: {rt$label: 'Nickname'}, */\n    name: {rt$label: 'Name'},\n  };\n\nFix: if the field is really gone: `mion enrich --prune`.\nFix: if the field was renamed, re-run `--update`; the authored value\nmoves to the renamed field when the ids match.",
  },
  FT023: {
    headline: 'Unfilled blank value: a scaffolded label or message is still empty; fill in the real text.',
    severity: 'error',
    detail:
      "An empty string (`''`) at a `rt$label` / `rt$errors` slot is a generated\nblank that never got authored: it ships blank to the UI wherever the\nfriendly text is shown, so it is exactly as incomplete as a `@todo`\nmarker. This is why removing the `@todo` line without filling the values\nis not \"done\".\n\nExample:\n  export const friendlyUser: FriendlyText<User> = {\n-   name: {rt$label: ''},\n+   name: {rt$label: 'Name'},\n  };\n\nFix: author the real label / message. Only the completeness gate\n(`mion enrich --require-complete`) fails on it; a plain\n`--no-emit` health check reports it without failing.",
  },
  GE000: {
    headline: 'Cannot read enrichment mirror file: {0}',
    severity: 'error',
    detail:
      'The drift check could not read this mirror file (permissions, a broken\nsymlink, or a race with a concurrent write).\n\nFix: make the file readable and re-run `mion enrich --no-emit`.',
  },
  GE001: {
    headline: 'Mirror location drift: the source maps to `{0}` but this file lives at `{1}`; re-run `mion enrich` to relocate.',
    severity: 'warning',
    detail:
      'Each source file mirrors to ONE computed path per family under the\nenrich root (friendly/… and mock/…, plus per-locale translation twins).\nThis file is not at its computed location, usually after a source move,\na genDir change, or a pre-split combined mirror that still needs\nmigrating.\n\nFix: re-run the generator; it writes the per-family files at the right\npaths and migrates a legacy combined mirror:\n  mion enrich <source.ts> <Type> --update',
  },
  GE002: {
    headline: 'Breadcrumb source `{0}` no longer exists ({1}): the mirror is orphaned; delete it or re-run `mion enrich`.',
    severity: 'error',
    detail:
      "The mirror's `import type { … } from '<source>'` breadcrumb resolves to\na file that is gone. Its consts describe types that no longer exist\nanywhere.\n\nFix: if the source was deleted, delete the mirror file (both family\nfiles and any translation twins).\nFix: if the source moved, re-run the generator from the new location\nand prune the old mirror.",
  },
  GE003: {
    headline: 'Source {0} no longer declares type `{1}`; re-run `mion enrich`.',
    severity: 'error',
    detail:
      'The mirror imports a type name its source file no longer declares (the\ntype was renamed or removed). The reconcile turns its consts into\n`@rtOrphan` carcasses so your authored values survive.\n\nFix: re-run the reconcile against the current source, then prune any\ncarcasses that should not come back:\n  mion enrich <source.ts> <Type> --update\n  mion enrich --prune',
  },
  HUK010: {
    headline:
      'Property `{0}` is a function: `hasUnknownKeys` does not handle function values, so this property is silently not checked.',
    severity: 'warning',
    detail:
      '`hasUnknownKeys` works on JSON-shaped data; functions don\'t survive JSON, so\nthe emitter drops them. The rest of the object\'s behaviour is unaffected.\n\nThis is by design, see the "one contract: serializable data only"\nsection in CLAUDE.md. If you need a stricter checker that fails on\nmissing/extra function-typed members, watch the project roadmap.',
  },
  JCP001: {
    headline:
      'Internal error: JSON composite `{0}` references primitive entry `{1}` (type `{2}`) which was never rendered; please file an issue.',
    severity: 'error',
  },
  MD001: {
    headline: 'Unknown field `{0}`: the type does not declare it, so this MockData entry is dead.',
    severity: 'error',
    detail:
      "The MockData map names a field the source type does not have (removed,\nrenamed, or a typo). Its pool/range can never feed a generated mock.\n\nExample: `nick` no longer exists on the type:\n  interface User { name: string }\n  export const mockUser: MockData<User> = {\n    name: {pool: ['Ada', 'Linus']},\n-   nick: {pool: ['ada99']},\n  };\n\nFix: remove the entry, or re-run the reconcile so the mirror follows\nthe type:\n  mion enrich <source.ts> <Type> --update",
  },
  MD011: {
    headline: 'Property `{0}` collides with the reserved `rt$` enrichment prefix: the type cannot be enriched.',
    severity: 'error',
    detail:
      '`rt$`-prefixed keys are reserved for enrichment meta (`rt$items`,\n`rt$length`, `rt$optional`, …); a source property with that prefix is\nindistinguishable from node meta, so gen refuses the type and the\nMockData checker reports it here.\n\nFix: rename the property (a plain `$` prefix is fine; only `rt$` is\nreserved):\n  interface Config {\n-   rt$size: number;\n+   $size: number;\n  }',
  },
  MD020: {
    headline: 'Unfilled `@todo` placeholder; fill in the real sample pools/ranges, then delete the `@todo` line.',
    severity: 'error',
    detail:
      "The generator stamps a `@todo` line on every freshly-scaffolded const in\na MockData mirror file. It means \"this skeleton still carries generated\nblanks\". A clean, committed mirror has none.\n\nExample: a fresh scaffold:\n  /** @rtType User#a1b2c3 @rtIds {name: d4e5f6} */\n- // @todo: generated skeleton, fill in real data, then delete this line\n  export const mockUser: MockData<User> = {\n-   name: {pool: []},\n+   name: {pool: ['Ada Lovelace', 'Linus Torvalds']},\n  };\n\nFix: author realistic sample pools/ranges for the const, then delete\nthe whole `@todo` line (the compiler never removes it for you).",
  },
  MD021: {
    headline: 'Stale `@rtOrphan` carcass; run `mion enrich --prune` to remove it (or restore the type).',
    severity: 'error',
    detail:
      'The reconcile commented this MockData const out because its source type\nwas deleted or renamed. The carcass preserves your authored pools and\nranges so a reappearing type can restore them, but a clean, committed\nmirror has none.\n\nFix: if the type is really gone, prune the carcass:\n  mion enrich --prune\n\nFix: if the type was renamed, re-run the reconcile; a matching carcass\nis restored with your values intact:\n  mion enrich <source.ts> <NewName> --update',
  },
  MD022: {
    headline: 'Stale `@rtOrphanChild` field carcass; run `mion enrich --prune` to remove it (or restore the field).',
    severity: 'error',
    detail:
      "The reconcile commented this field out because the source type no longer\ndeclares it. The carcass preserves your authored value inline, but a\nclean, committed mirror has none.\n\nExample:\n  export const mockUser: MockData<User> = {\n-   /* @rtOrphanChild nick: {pool: ['ada99']}, */\n    name: {pool: ['Ada', 'Linus']},\n  };\n\nFix: if the field is really gone: `mion enrich --prune`.\nFix: if the field was renamed, re-run `--update`; the authored value\nmoves to the renamed field when the ids match.",
  },
  MD023: {
    headline: 'Unfilled blank value: a scaffolded sample pool or range is still empty; fill in real data.',
    severity: 'error',
    detail:
      "An empty pool (`pool: []`) is a generated blank that never got authored:\nit mocks nothing, so it is exactly as incomplete as a `@todo` marker.\nThis is why removing the `@todo` line without filling the values is not\n\"done\".\n\nExample:\n  export const mockUser: MockData<User> = {\n-   name: {pool: []},\n+   name: {pool: ['Ada Lovelace', 'Linus Torvalds']},\n  };\n\nFix: author realistic sample data. Only the completeness gate\n(`mion enrich --require-complete`) fails on it; a plain\n`--no-emit` health check reports it without failing.",
  },
  MKR001: {
    headline:
      '`{0}()` is being called at runtime just so the marker can read its return type: side effects, throws, or async work run for nothing.',
    severity: 'warning',
    detail:
      'Reflect-form markers (`createValidateFn(value)`, `getRunTypeId(value)`)\ninvoke their argument expression at runtime; the value is then discarded;\nonly its inferred type is used.\n\nFix: use the static form with `ReturnType<>`:\n  -  const isUser = createValidateFn({0}());\n+  const isUser = createValidateFn<ReturnType<typeof {0}>>();\n\nFix: pass an existing value of the desired type:\n  const existingUser: User = ...;\n  const isUser = getRunTypeId(existingUser);',
  },
  MKR003: {
    headline:
      'Marker call is inside a generic function: the type argument is unresolved, so no id can be computed at build time.',
    severity: 'error',
    detail:
      "The build can only compute an id for a concrete type (`User`,\n`{name: string}`, etc.). A type parameter like `T` is abstract: it\ntakes a different value at each call site of the surrounding function,\nso a single id can't represent it.\n\nFix: inline the marker at each concrete call site:\n  function isUser(value: unknown) {\n    return createValidateFn<User>()(value);\n  }\n\nFix: accept a pre-computed id from the caller:\n  function makeChecker<T>(id: InjectRunTypeId<T>) {\n    return createValidateFn<T>(id);\n  }\n  const isUser = makeChecker<User>(getRunTypeId<User>());",
  },
  MKR004: {
    headline: "`noLiterals: true` has no effect here: the type argument doesn't resolve to literal values.",
    severity: 'warning',
    detail:
      "The `noLiterals` validate option skips the exact-value check that literal\ntypes (`'admin'`, `42`, `true`) compile to. This call's type argument\nresolves to a non-literal type, so there is no literal check to skip and\nthe option is a silent no-op.\n\nFix: drop the option:\n-  const isRole = createValidateFn<string>({noLiterals: true});\n+  const isRole = createValidateFn<string>();\n\nOr, if you meant to relax a literal union, point the option at the type\nthat actually carries the literals:\n  const isRole = createValidateFn<'admin' | 'user'>({noLiterals: true});",
  },
  MKR005: {
    headline: '`noIsArrayCheck: true` has no effect here: the type argument is not an array type.',
    severity: 'warning',
    detail:
      "The `noIsArrayCheck` validate option skips the `Array.isArray` guard that\narray types compile to. This call's type argument resolves to a non-array\ntype, so there is no guard to skip and the option is a silent no-op.\n\nFix: drop the option:\n-  const isUser = createValidateFn<User>({noIsArrayCheck: true});\n+  const isUser = createValidateFn<User>();\n\nOr point it at the array type you meant:\n  const isUsers = createValidateFn<User[]>({noIsArrayCheck: true});",
  },
  MKR006: {
    headline: '`InjectTypeFnArgs` names the function family `{0}` more than once; remove the duplicate key.',
    severity: 'error',
    detail:
      "An `InjectTypeFnArgs<T, …>` marker names each function family it needs for\n`T` once, in declaration order; the build injects one entry-module tuple\nper name and the wrapper forwards each to its factory. Naming a family\ntwice would inject a redundant identical tuple with no consumer, so it is\nalmost always a copy-paste slip and the build stops.\n\nFix: name each family at most once:\n-  id?: InjectTypeFnArgs<T, 'verr', 'jsonDecoder', 'verr'>;\n+  id?: InjectTypeFnArgs<T, 'verr', 'jsonDecoder', 'jsonEncoder'>;",
  },
  MKR007: {
    headline:
      'Marker type resolved to `any` because this file has an unresolved import (`{0}`): the generated functions would silently accept anything.',
    severity: 'error',
    detail:
      "TypeScript could not resolve the import, so the type it should have\nprovided checked as `any` at this marker call. A validator over `any` is\nthe always-true identity, a mock over `any` is `undefined`, and encoders\npass values through untouched, with no runtime signal that anything is\nwrong. This usually means the build tool and the type scanner resolve\nmodules differently (e.g. an extensionless relative import under\n`moduleResolution: NodeNext`, a missing dependency, or a `paths` alias the\nscan tsconfig doesn't declare).\n\nFix: make the import resolve for the type scanner:\n-  import {User} from './user.runtype';\n+  import {User} from './user.runtype.ts';\n\nOr align the tsconfig the plugin scans with the one your bundler uses.\nIf the `any` is genuinely intentional, write the marker over an alias\ndeclared in resolving code (e.g. `type Loose = any`) in a file with no\nfailing imports.",
  },
  MKR008: {
    headline:
      'This type is too deeply nested to reflect: computing its structural id hit the recursion depth cap, so the build stops here instead of crashing.',
    severity: 'error',
    detail:
      'The build computes a structural id by walking the type, and the walk is\ncapped at a depth far beyond any realistic shape. Hitting the cap with no\nsingle recurring type on the path means literally written (or generated)\nnesting hundreds of levels deep.\n\nFix: reflect a concrete, bounded projection of the type (e.g. the element\nor data type you actually send), or restructure the recursion so the same\nnamed type recurs by reference (a plain recursive interface is fine).',
  },
  MKR009: {
    headline:
      'Type `{0}` re-instantiates itself with fresh type arguments at every level (a self-instantiating generic), so its structural id never resolves. Reflect a monomorphic shape instead.',
    severity: 'error',
    detail:
      "A generic method's own type parameters (the `U` in `map<U>(fn: (x: T) => U):\nIter<U>`) are bound at each CALL of the method, so they can never be resolved\nwhile reflecting the containing type, and when such a method returns a fresh\ninstantiation of its own container, the type graph grows a new level forever.\nRenaming the type parameters does not resolve them; the fix is a monomorphic\n(fully resolved) recursive shape, which closes by reference:\n\n-  interface Iter<T> { map<U>(fn: (x: T) => U): Iter<U> }\n+  interface NumberIter { map(fn: (x: string) => number): NumberIter }\n\nOrdinary generics are unaffected: instantiated types (Map<string, User>, a\nconcrete Iter<string>'s data members) and generic methods that do not\nre-instantiate their container reflect fine. Validators also drop methods\nentirely (methods aren't data), so reflecting just the data shape usually\nsidesteps the problem.",
  },
  MKR010: {
    headline:
      'Type argument contains the unresolved type parameter `{0}`: a generic must be fully resolved at the marker call, so no id can be computed. See Related for where `{0}` is declared.',
    severity: 'error',
    detail:
      "The build can only compute an id for a fully concrete type. `{0}` is a type\nparameter of the surrounding generic: it takes a different type at each call\nsite, so a single build-time id would alias every instantiation onto one\n(wrong) shape. A parameter DEFAULT does not help here: defaults resolve where\na caller omits the argument, never inside the generic's own body.\n\nFix: resolve the generic before reflecting it:\n  interface Box<T> { value: T }\n  type BoxString = Box<string>;\n  const isBoxString = createValidateFn<BoxString>();   // resolved, ok\n\nFix: or accept a pre-computed id from the caller and inline the marker at\neach concrete call site (same patterns as MKR003):\n  function makeChecker<T>(id: InjectRunTypeId<T>) {\n    return createValidateFn<T>(id);\n  }\n  const isBox = makeChecker<Box<string>>(getRunTypeId<Box<string>>());\n\nGeneric METHODS on a concrete type (`find<T>(query: string): T[]`) are\nunaffected: their own type parameters are bound per call of the method and\nmethods aren't data.",
  },
  MKR011: {
    headline:
      'Generic type `{0}` is used without its required type argument(s): parameter `{1}` has no default, so the type cannot resolve to an id. See Related for where `{1}` is declared.',
    severity: 'error',
    detail:
      "TypeScript itself rejects this usage (TS2314), but dev-server builds don't\nrun the type checker, so the scan reads the written type arguments and stops\nthe build here instead of silently reflecting `any` (a validator over `any`\naccepts everything).\n\nFix: pass the missing type argument:\n-  const isA = createValidateFn<A>();\n+  const isA = createValidateFn<A<string>>();\n\nFix: or give the parameter a default, which the compiler resolves at every\nbare use site:\n-  interface A<S extends string> { a: S }\n+  interface A<S extends string = string> { a: S }\n   const isA = createValidateFn<A>();   // now resolves to A<string>",
  },
  MKR012: {
    headline:
      '`{0}` here was declared by `{1}`, which this project does not trust as a marker package, so the type argument was dropped and this call reflects `unknown`.',
    severity: 'warning',
    detail:
      'A marker only counts when it is BOTH named correctly and declared by a\ntrusted package, so a same-named type of your own never drives rewrites.\nThis one has the right name but comes from a package that is not on the\nlist, so its type argument was ignored: the call still compiles and still\ngenerates a function, but for `unknown` rather than for your type — a\nvalidator over `unknown` accepts everything.\n\nFix: trust the package in your tsconfig plugin entry:\n   {\n     "name": "mion",\n+    "markers": {"packages": ["{1}"]}\n   }\n\nThe list is additive, so `@mionjs/run-types` keeps working alongside it.\nThe same setting exists on the bundler plugin (`markers`) and as the\n`--marker-packages` CLI flag.\n\nIf the package re-exports the markers rather than declaring its own\n(`export type {InjectRunTypeId} from \'@mionjs/run-types\'`), no setting is\nneeded — a re-export keeps RunTypes as the declaring package, so check\nwhether the package meant to re-export instead.',
  },
  MKR013: {
    headline:
      'Marker type resolved to `any` that was never written: `{0}` failed to resolve (or its declaration references a name that does not), so the generated functions would silently accept anything.',
    severity: 'error',
    detail:
      "The type checker keeps a distinct internal ERROR type for names it could\nnot resolve; it behaves like `any`, so without this guard the validator\nbecomes the always-true identity, the mock `undefined`, and encoders pass\nvalues through — with exit code 0 and no signal. A deliberately written\n`any`, and an alias like `type Loose = any`, are the real `any` and never\ntrip this.\n\nCommon causes and fixes:\n- A typo in the type name: fix the spelling.\n- A dependency whose types are not installed: install/declare them.\n- An ambient declaration (`declare interface ...` in a `.d.ts`) that is\n  not part of the scanned program: make sure the `.d.ts` is matched by the\n  tsconfig `include`/`files` set. The dev server and lint read that file\n  list when they start, so after ADDING a new `.d.ts`, restart the dev\n  server (or the editor's lint process) for it to be seen.",
  },
  MKR014: {
    headline:
      'Two different types get the same id `{0}`: `{1}` from {4}, and `{2}` here. Raise the `hashLength` option to {3} so every type keeps its own id.',
    severity: 'error',
    detail:
      'Every type is given a short id hashed from its shape, and that id names the\ngenerated functions, the cache keys and the files on disk. Two types sharing\none id means nothing downstream can tell them apart, so the build stops here\ninstead of shipping one type\'s validator under the other\'s name.\n\nThe ids are exactly `hashLength` characters long by contract, so this is\nnever fixed by quietly making one of them longer. One more character is\nsixty-two times the room, and the fix is a single option:\n\nFix: raise it in your tsconfig, under the plugin entry:\n  {"compilerOptions": {"plugins": [{"name": "mion", "hashLength": {3}}]}}\n\nFix: or on the bundler plugin, for one build:\n  mionVitePlugin({hashLength: {3}})\n\nThe Related: line above points at the call site that took the id first.',
  },
  NE001: {
    headline:
      'Property `{0}` is tagged @nonEnumerable but is required: the guard only applies to optional properties, so the tag has no effect. Make it optional (`{0}?`) or remove the tag.',
    severity: 'error',
    detail:
      "The runtime enumerability guard (which lets a value omit a property from\nthe wire when it isn't an enumerable own property) is applied ONLY to\noptional properties. That keeps the decoder's `DataOnly<T>` return type\nhonest: a guarded property is always one the type already allows to be\nabsent. A `@nonEnumerable` tag on a REQUIRED property is therefore ignored;\nthe property still serializes unconditionally.\n\nFix: make the property optional:\n-  /** @nonEnumerable */ token: string;\n+  /** @nonEnumerable */ token?: string;",
  },
  OVR001: {
    headline: 'Duplicate override for `{0}`: there can be exactly one override per (type, function).',
    severity: 'error',
    detail:
      'Two `overrideX<T>()` declarations target the same type and the same\nfunction family. Which one wins would depend on scan order, so a second\noverride is rejected regardless of its body. The Related: line above\npoints at the override that was registered first.\n\nFix: keep one canonical override and delete the other:\n-  overrideValidate<User>((utl) => (value) => checkA(value));  // first\n-  overrideValidate<User>((utl) => (value) => checkB(value));  // duplicate\n+  overrideValidate<User>((utl) => (value) => checkA(value) && checkB(value));',
  },
  OVR002: {
    headline:
      'Override entry `{0}` references compiled function `{1}` which did not render: this would throw at runtime, so the build stops.',
    severity: 'error',
    detail:
      "An override redirect body loads its compiled function from the cache\n(`usePureFn('cfn::…')`), but that module never rendered into the entry\ngraph. Calling the override would throw at runtime, so the build surfaces\nthe miss now. This is an internal emitter tripwire and should never fire\nin normal operation.\n\nFix: re-run with a clean cache first (delete the .runtypes cache dir /\nrestart the dev server). If it persists, the emitter dropped a module it\nshould have rendered: please open an issue with the type + override that\ntriggers it.",
  },
  OVR010: {
    headline: 'Overriding `validate` for this type also changes how JSON and binary decoders narrow unions containing it.',
    severity: 'warning',
    detail:
      "`validate` is a shared dependency across function families: JSON and\nbinary union decoders call the member validators to pick the matching\nbranch. An `overrideValidate<T>()` therefore reaches past\n`createValidateFn<T>()`: decoders of any union containing T now narrow\nwith YOUR function.\n\nThis is informational; the build proceeds. If the override should only\naffect direct validation, give the union members a discriminant so\ndecoders never fall back to member validation:\n  type Event = {kind: 'click'; x: number} | {kind: 'key'; code: string};",
  },
  PFE9004: {
    headline: 'Duplicate `registerPureFnFactory` for `{0}` with a different body; only one definition can win.',
    severity: 'error',
    detail:
      'Two calls register the same `namespace::functionId` key but the factory\nbodies differ. The cache can only hold one definition, so one call site\nsilently loses its version at runtime.\n\nFix: make all registrations identical, or pick one canonical site and\ndelete the others. The Related: line above points at the first\nregistration the extractor saw.',
  },
  PFE9005: {
    headline: 'Pure-fn factory `{0}` uses destructured parameters; only simple identifier params are supported.',
    severity: 'error',
    detail:
      "The build inlines parameter references by name when it materialises the\nfactory. Destructuring patterns (`({a, b})`, `([x, y])`) don't have a\nsingle name to substitute.\n\nFix: destructure inside the body:\n  -  registerPureFnFactory('ns::fn', (utl) => ({a, b}) => ...);\n+  registerPureFnFactory('ns::fn', (utl) => (params) => {\n+    const {a, b} = params;\n+    return ...;\n+  });",
  },
  PFE9006: {
    headline:
      "`this` is not allowed inside a `registerPureFnFactory` factory body; pure functions can't depend on a calling context.",
    severity: 'error',
    detail:
      "Pure functions are materialised standalone at build time; there's no\n`this` to bind to.\n\nFix: replace `this` with an explicit parameter, or move the function\nout of the class/object method that owns the `this`:\n  registerPureFnFactory('ns::fn', (utl) => (self, input) => {\n    return self.field + input;\n  });",
  },
  PFE9007: {
    headline: '`async`/`await` is not allowed inside a `registerPureFnFactory` factory body.',
    severity: 'error',
    detail:
      "Pure functions must run synchronously so the build can call them at\ncompile time. `async` introduces a Promise that won't resolve until\nruntime.\n\nFix: make the factory synchronous; move async work to the caller:\n  registerPureFnFactory('ns::fn', (utl) => {\n-   return async (input) => { const r = await heavy(); return r; };\n+   return (resolvedValue) => transform(resolvedValue);\n  });",
  },
  PFE9008: {
    headline: '`yield` / generators are not allowed inside a `registerPureFnFactory` factory body.',
    severity: 'error',
    detail:
      "Generators carry resumption state that can't be materialised\nstatically.\n\nFix: return an array or a plain iterable instead:\n  registerPureFnFactory('ns::fn', (utl) => (input) => {\n    return [...computeAll(input)];\n  });",
  },
  PFE9009: {
    headline: '`import()` is not allowed inside a `registerPureFnFactory` factory body.',
    severity: 'error',
    detail:
      'Dynamic imports load modules at runtime, the build needs every\ndependency available statically.\n\nFix: use a top-level `import` statement, or pass the imported module\nin as a parameter.',
  },
  PFE9010: {
    headline: '`{0}` is not allowed inside a `registerPureFnFactory` factory body.',
    severity: 'error',
    detail:
      "Globals like `eval`, `Function`, `fetch`, `XMLHttpRequest`, `require`,\n`process`, `globalThis`, `window`, `document` are blocked from pure-fn\nbodies: they either execute arbitrary code or depend on a runtime\nenvironment the build can't reproduce.\n\nFix: remove the reference, or pass the needed value in as a parameter.",
  },
  PFE9011: {
    headline:
      "`{0}` is captured from outer scope inside a `registerPureFnFactory` factory; pure functions can't reach outside their own body.",
    severity: 'error',
    detail:
      "The build inlines factory bodies without their lexical environment, so\nany free variable becomes `undefined` at runtime.\n\nFix: pass `{0}` in as a parameter:\n  registerPureFnFactory('ns::fn', (utl) => ({0}, value) => ...);\n\nFix: inline its value if it's a known constant:\n  registerPureFnFactory('ns::fn', (utl) => (value) => {\n    const {0} = 42;\n    ...\n  });\n\nFix: import `{0}` directly inside the factory if it's a module export.",
  },
  PFE9012: {
    headline:
      "Pure-fn `{0}` is referenced by a RT function but never registered; call `registerPureFnFactory('{1}::{2}', …)` first.",
    severity: 'error',
    detail:
      "A RT validator/encoder calls `utl.usePureFn('{0}')` (or similar) but\nno `registerPureFnFactory` call with that namespace+function pair was\nfound in any scanned source file.\n\nFix: register the function in the expected location ({3}, if known).\nMake sure the file is included in the scan set.",
  },
  PFE9013: {
    headline: '`{0}.{1}` dependency argument must be a string literal or a same-scope `const` string.',
    severity: 'error',
    detail:
      "`utl.usePureFn` / `utl.getPureFn` need a static key so the build can\nverify the referenced pure-fn is registered.\n\nFix:\n  -  const key = buildKey();\n-  return utl.usePureFn(key)(input);\n+  return utl.usePureFn('rt::myFn')(input);",
  },
  PFN001: {
    headline: '`PureFunction<F>` argument must be an INLINE arrow or function expression.',
    severity: 'error',
    detail:
      "The build extracts and AOT-compiles the function body, so it must see the\nliteral inline at the call site. A named reference (even a module-private\n`const f = …` or `function f(){}`) is not accepted, because the literal\nmust have no handle anything else can reach; the compiled copy is then the\nonly one that can run. (An imported or exported literal is rejected as PFN002.)\n\nFix: inline the function at the call site:\n-  const validate = (v: unknown) => typeof v === 'string';\n-  registerValidator(validate);\n+  registerValidator((v: unknown) => typeof v === 'string');",
  },
  PFN002: {
    headline: '`PureFunction<F>` literal must not be imported or exported: the compiled copy must be the only one that can run.',
    severity: 'error',
    detail:
      "The build extracts and AOT-compiles the function body, and the compiled\ncopy is the single source of truth. If the original literal stays reachable\nas a value (imported from another module, or exported so another module can\nimport it), a caller could invoke the un-compiled function and diverge from\nthe compiled behaviour.\n\nUnder the literal-only rule a named binding isn't allowed at all (see PFN001),\nso the fix is to inline the function at the call site:\n-  import {validate} from './validators';   // imported, rejected\n-  export const validate = (v) => …;        // exported, rejected\n+  registerValidator((v: unknown) => typeof v === 'string');   // inline, ok",
  },
  PJ001: {
    headline: 'Type `{0}` can never be encoded to JSON: the generated function will always fail.',
    severity: 'error',
    detail:
      "`never` is the empty type: no value can ever inhabit it. A field\ntyped `never` cannot carry a runtime value, so there is nothing to\nencode/decode/validate.\n\nFix: use `unknown` if you really want to accept any value:\n  interface User {\n-   tag: never;\n+   tag: unknown;  // narrow before use\n  }\n\nFix: pick a concrete type matching your real data:\n  interface User {\n-   tag: never;\n+   tag: 'pending' | 'active' | 'done';\n  }",
  },
  PJ002: {
    headline: 'Type `{0}` can never be encoded to JSON: the generated function will always fail.',
    severity: 'error',
    detail:
      'A standard-library class carries runtime state that does not survive a JSON\nor binary round-trip: its instance identity is lost the moment it is\nserialised, so at a root position there is nothing left to work with.\n\nA few have an agreed data form and ARE supported: `Date`, `Map`,\n`Set` and the Temporal types. Everything else the standard library declares\n(`URL`, `Intl.DateTimeFormat`, `WeakMap`, `Promise`, the typed arrays and\n`Buffer`) has none, and is refused here rather than guessed at.\n\nFix: describe the data form yourself and convert at the boundary:\n  // for URL:\n  const data = yourUrl.href;             // string\n  // for typed arrays:\n  const data = Array.from(yourBuffer);   // number[]\n\nFix: change the field type to a shape made of data:\n  interface User {\n-   home: URL;\n+   home: string;\n  }',
  },
  PJ003: {
    headline: 'Type `{0}` can never be encoded to JSON: the generated function will always fail.',
    severity: 'error',
    detail:
      "Functions have no value form to serialise: their closure, prototype,\nand bound state aren't representable in JSON or binary.\n\nFix: drop the function from your type, or replace it with the data the\nfunction would produce:\n  interface User {\n-   getName: () => string;\n+   name: string;\n  }",
  },
  PJ004: {
    headline: 'Type `{0}` can never be encoded to JSON: the generated function will always fail.',
    severity: 'error',
    detail:
      "Arrays of un-serialisable elements (`symbol[]`, `(() => void)[]`,\n`Map<K, V>[]`, etc.) can't be encoded: every element would need to be\nrepresentable, and these aren't. Dropping individual elements would\nchange the array length, so the encoder refuses rather than silently\nshipping a different shape.\n\nFix: change the element type to something serialisable:\n  -  type Items = (() => void)[];\n+  type Items = string[];",
  },
  PJ005: {
    headline: 'Type `{0}` can never be encoded to JSON: the generated function will always fail.',
    severity: 'error',
    detail:
      "Every `symbol` value carries a unique runtime identity (`Symbol() !==\nSymbol()` even with the same description). That identity disappears the\nmoment it's serialised, and two symbols can't be compared across realms,\nworkers, or process boundaries. A validator that asserts \"this is a\nsymbol\" gives a false sense of safety: the value can't actually\nround-trip.\n\nFix: use a stable string key (often a literal union):\n  -  type Status = symbol;\n+  type Status = 'pending' | 'active' | 'done';",
  },
  PJ010: {
    headline:
      'Property `{0}` is a function: `prepareForJson` does not handle function values, so this property is silently not encoded.',
    severity: 'warning',
    detail:
      '`prepareForJson` works on JSON-shaped data; functions don\'t survive JSON, so\nthe emitter drops them. The rest of the object\'s behaviour is unaffected.\n\nThis is by design, see the "one contract: serializable data only"\nsection in CLAUDE.md. If you need a stricter checker that fails on\nmissing/extra function-typed members, watch the project roadmap.',
  },
  PJ011: {
    headline: "Method `{0}` is silently not encoded by `prepareForJson`: methods aren't data.",
    severity: 'warning',
    detail:
      "Class and object methods aren't part of the serialisable shape, so\n`prepareForJson` excludes them. The rest of the type still works.\n\nIf you wanted the method's return value validated/serialised, expose it\nas a data property instead.",
  },
  PJ012: {
    headline: "Static member `{0}` is silently not encoded by `prepareForJson`: statics aren't part of instance data.",
    severity: 'warning',
    detail:
      'Class static members live on the class, not on individual instances.\n`prepareForJson` operates on instance shape, so statics are excluded.',
  },
  PJ013: {
    headline: "Symbol-keyed property `{0}` is silently not encoded by `prepareForJson`: symbol keys aren't JSON-representable.",
    severity: 'warning',
    detail:
      "JSON only supports string keys; symbol-keyed properties are dropped\nfrom the serialised form. `prepareForJson` follows the same rule.\n\nFix: use a string key:\n  -  [Symbol.for('id')]: string;\n+  id: string;",
  },
  PJ014: {
    headline:
      "Union member(s) of type `{0}` can't be represented as data: `prepareForJson` drops them, so the union is encoded as its remaining members.",
    severity: 'warning',
    detail:
      'A union projects to its serialisable members only: `DataOnly<Date | symbol>`\nis `Date`. The dropped member(s) ({0}) carry no JSON-shaped value (symbol,\nfunction, Promise, or a non-serialisable built-in like `Map` / `Set` /\ntyped arrays), so `prepareForJson` encoded only the members that remain.\n\nThis is by design, see the "one contract: serializable data only"\nsection in CLAUDE.md. If EVERY member of the union is non-serialisable the\nprojection is `never`, and `prepareForJson` throws at build time instead.',
  },
  PJ015: {
    headline:
      'Property `{0}` has a non-serialisable value type (symbol, Promise, or a non-serialisable built-in): `prepareForJson` drops it, so this property is silently not encoded.',
    severity: 'warning',
    detail:
      '`prepareForJson` works on JSON-shaped data. A property whose value is a symbol,\na Promise, or a non-serialisable built-in (a typed array, `ArrayBuffer`, or any other\nstandard-library class such as `URL` or `Intl.DateTimeFormat`) carries\nno JSON-shaped value, so it is dropped: `DataOnly<{ {0}: symbol }>` is `{}`.\nThe rest of the object\'s behaviour is unaffected.\n\nNote the difference from a property that is only STRUCTURALLY unserialisable\n(`{0}: symbol[]` or `{0}: Map<string, symbol>`), which CANNOT be safely\ndropped (DataOnly keeps it as `never[]`): there `prepareForJson` throws at build\ntime instead.\n\nThis is by design, see the "one contract: serializable data only"\nsection in CLAUDE.md.',
  },
  PJS001: {
    headline: 'Type `{0}` can never be encoded to JSON: the generated function will always fail.',
    severity: 'error',
    detail:
      "`never` is the empty type: no value can ever inhabit it. A field\ntyped `never` cannot carry a runtime value, so there is nothing to\nencode/decode/validate.\n\nFix: use `unknown` if you really want to accept any value:\n  interface User {\n-   tag: never;\n+   tag: unknown;  // narrow before use\n  }\n\nFix: pick a concrete type matching your real data:\n  interface User {\n-   tag: never;\n+   tag: 'pending' | 'active' | 'done';\n  }",
  },
  PJS002: {
    headline: 'Type `{0}` can never be encoded to JSON: the generated function will always fail.',
    severity: 'error',
    detail:
      'A standard-library class carries runtime state that does not survive a JSON\nor binary round-trip: its instance identity is lost the moment it is\nserialised, so at a root position there is nothing left to work with.\n\nA few have an agreed data form and ARE supported: `Date`, `Map`,\n`Set` and the Temporal types. Everything else the standard library declares\n(`URL`, `Intl.DateTimeFormat`, `WeakMap`, `Promise`, the typed arrays and\n`Buffer`) has none, and is refused here rather than guessed at.\n\nFix: describe the data form yourself and convert at the boundary:\n  // for URL:\n  const data = yourUrl.href;             // string\n  // for typed arrays:\n  const data = Array.from(yourBuffer);   // number[]\n\nFix: change the field type to a shape made of data:\n  interface User {\n-   home: URL;\n+   home: string;\n  }',
  },
  PJS003: {
    headline: 'Type `{0}` can never be encoded to JSON: the generated function will always fail.',
    severity: 'error',
    detail:
      "Functions have no value form to serialise: their closure, prototype,\nand bound state aren't representable in JSON or binary.\n\nFix: drop the function from your type, or replace it with the data the\nfunction would produce:\n  interface User {\n-   getName: () => string;\n+   name: string;\n  }",
  },
  PJS004: {
    headline: 'Type `{0}` can never be encoded to JSON: the generated function will always fail.',
    severity: 'error',
    detail:
      "Arrays of un-serialisable elements (`symbol[]`, `(() => void)[]`,\n`Map<K, V>[]`, etc.) can't be encoded: every element would need to be\nrepresentable, and these aren't. Dropping individual elements would\nchange the array length, so the encoder refuses rather than silently\nshipping a different shape.\n\nFix: change the element type to something serialisable:\n  -  type Items = (() => void)[];\n+  type Items = string[];",
  },
  PJS005: {
    headline: 'Type `{0}` can never be encoded to JSON: the generated function will always fail.',
    severity: 'error',
    detail:
      "Every `symbol` value carries a unique runtime identity (`Symbol() !==\nSymbol()` even with the same description). That identity disappears the\nmoment it's serialised, and two symbols can't be compared across realms,\nworkers, or process boundaries. A validator that asserts \"this is a\nsymbol\" gives a false sense of safety: the value can't actually\nround-trip.\n\nFix: use a stable string key (often a literal union):\n  -  type Status = symbol;\n+  type Status = 'pending' | 'active' | 'done';",
  },
  PJS010: {
    headline:
      'Property `{0}` is a function: `prepareForJsonSafe` does not handle function values, so this property is silently not encoded.',
    severity: 'warning',
    detail:
      '`prepareForJsonSafe` works on JSON-shaped data; functions don\'t survive JSON, so\nthe emitter drops them. The rest of the object\'s behaviour is unaffected.\n\nThis is by design, see the "one contract: serializable data only"\nsection in CLAUDE.md. If you need a stricter checker that fails on\nmissing/extra function-typed members, watch the project roadmap.',
  },
  PJS011: {
    headline: "Method `{0}` is silently not encoded by `prepareForJsonSafe`: methods aren't data.",
    severity: 'warning',
    detail:
      "Class and object methods aren't part of the serialisable shape, so\n`prepareForJsonSafe` excludes them. The rest of the type still works.\n\nIf you wanted the method's return value validated/serialised, expose it\nas a data property instead.",
  },
  PJS012: {
    headline: "Static member `{0}` is silently not encoded by `prepareForJsonSafe`: statics aren't part of instance data.",
    severity: 'warning',
    detail:
      'Class static members live on the class, not on individual instances.\n`prepareForJsonSafe` operates on instance shape, so statics are excluded.',
  },
  PJS013: {
    headline:
      "Symbol-keyed property `{0}` is silently not encoded by `prepareForJsonSafe`: symbol keys aren't JSON-representable.",
    severity: 'warning',
    detail:
      "JSON only supports string keys; symbol-keyed properties are dropped\nfrom the serialised form. `prepareForJsonSafe` follows the same rule.\n\nFix: use a string key:\n  -  [Symbol.for('id')]: string;\n+  id: string;",
  },
  PJS014: {
    headline:
      "Union member(s) of type `{0}` can't be represented as data: `prepareForJsonSafe` drops them, so the union is encoded as its remaining members.",
    severity: 'warning',
    detail:
      'A union projects to its serialisable members only: `DataOnly<Date | symbol>`\nis `Date`. The dropped member(s) ({0}) carry no JSON-shaped value (symbol,\nfunction, Promise, or a non-serialisable built-in like `Map` / `Set` /\ntyped arrays), so `prepareForJsonSafe` encoded only the members that remain.\n\nThis is by design, see the "one contract: serializable data only"\nsection in CLAUDE.md. If EVERY member of the union is non-serialisable the\nprojection is `never`, and `prepareForJsonSafe` throws at build time instead.',
  },
  PJS015: {
    headline:
      'Property `{0}` has a non-serialisable value type (symbol, Promise, or a non-serialisable built-in): `prepareForJsonSafe` drops it, so this property is silently not encoded.',
    severity: 'warning',
    detail:
      '`prepareForJsonSafe` works on JSON-shaped data. A property whose value is a symbol,\na Promise, or a non-serialisable built-in (a typed array, `ArrayBuffer`, or any other\nstandard-library class such as `URL` or `Intl.DateTimeFormat`) carries\nno JSON-shaped value, so it is dropped: `DataOnly<{ {0}: symbol }>` is `{}`.\nThe rest of the object\'s behaviour is unaffected.\n\nNote the difference from a property that is only STRUCTURALLY unserialisable\n(`{0}: symbol[]` or `{0}: Map<string, symbol>`), which CANNOT be safely\ndropped (DataOnly keeps it as `never[]`): there `prepareForJsonSafe` throws at build\ntime instead.\n\nThis is by design, see the "one contract: serializable data only"\nsection in CLAUDE.md.',
  },
  RJ001: {
    headline: 'Type `{0}` can never be decoded from JSON: the generated function will always fail.',
    severity: 'error',
    detail:
      "`never` is the empty type: no value can ever inhabit it. A field\ntyped `never` cannot carry a runtime value, so there is nothing to\nencode/decode/validate.\n\nFix: use `unknown` if you really want to accept any value:\n  interface User {\n-   tag: never;\n+   tag: unknown;  // narrow before use\n  }\n\nFix: pick a concrete type matching your real data:\n  interface User {\n-   tag: never;\n+   tag: 'pending' | 'active' | 'done';\n  }",
  },
  RJ002: {
    headline: 'Type `{0}` can never be decoded from JSON: the generated function will always fail.',
    severity: 'error',
    detail:
      'A standard-library class carries runtime state that does not survive a JSON\nor binary round-trip: its instance identity is lost the moment it is\nserialised, so at a root position there is nothing left to work with.\n\nA few have an agreed data form and ARE supported: `Date`, `Map`,\n`Set` and the Temporal types. Everything else the standard library declares\n(`URL`, `Intl.DateTimeFormat`, `WeakMap`, `Promise`, the typed arrays and\n`Buffer`) has none, and is refused here rather than guessed at.\n\nFix: describe the data form yourself and convert at the boundary:\n  // for URL:\n  const data = yourUrl.href;             // string\n  // for typed arrays:\n  const data = Array.from(yourBuffer);   // number[]\n\nFix: change the field type to a shape made of data:\n  interface User {\n-   home: URL;\n+   home: string;\n  }',
  },
  RJ003: {
    headline: 'Type `{0}` can never be decoded from JSON: the generated function will always fail.',
    severity: 'error',
    detail:
      "Functions have no value form to serialise: their closure, prototype,\nand bound state aren't representable in JSON or binary.\n\nFix: drop the function from your type, or replace it with the data the\nfunction would produce:\n  interface User {\n-   getName: () => string;\n+   name: string;\n  }",
  },
  RJ004: {
    headline: 'Type `{0}` can never be decoded from JSON: the generated function will always fail.',
    severity: 'error',
    detail:
      "Arrays of un-serialisable elements (`symbol[]`, `(() => void)[]`,\n`Map<K, V>[]`, etc.) can't be encoded: every element would need to be\nrepresentable, and these aren't. Dropping individual elements would\nchange the array length, so the encoder refuses rather than silently\nshipping a different shape.\n\nFix: change the element type to something serialisable:\n  -  type Items = (() => void)[];\n+  type Items = string[];",
  },
  RJ005: {
    headline: 'Type `{0}` can never be decoded from JSON: the generated function will always fail.',
    severity: 'error',
    detail:
      "Every `symbol` value carries a unique runtime identity (`Symbol() !==\nSymbol()` even with the same description). That identity disappears the\nmoment it's serialised, and two symbols can't be compared across realms,\nworkers, or process boundaries. A validator that asserts \"this is a\nsymbol\" gives a false sense of safety: the value can't actually\nround-trip.\n\nFix: use a stable string key (often a literal union):\n  -  type Status = symbol;\n+  type Status = 'pending' | 'active' | 'done';",
  },
  RJ010: {
    headline:
      'Property `{0}` is a function: `restoreFromJson` does not handle function values, so this property is silently not decoded.',
    severity: 'warning',
    detail:
      '`restoreFromJson` works on JSON-shaped data; functions don\'t survive JSON, so\nthe emitter drops them. The rest of the object\'s behaviour is unaffected.\n\nThis is by design, see the "one contract: serializable data only"\nsection in CLAUDE.md. If you need a stricter checker that fails on\nmissing/extra function-typed members, watch the project roadmap.',
  },
  RJ011: {
    headline: "Method `{0}` is silently not decoded by `restoreFromJson`: methods aren't data.",
    severity: 'warning',
    detail:
      "Class and object methods aren't part of the serialisable shape, so\n`restoreFromJson` excludes them. The rest of the type still works.\n\nIf you wanted the method's return value validated/serialised, expose it\nas a data property instead.",
  },
  RJ012: {
    headline: "Static member `{0}` is silently not decoded by `restoreFromJson`: statics aren't part of instance data.",
    severity: 'warning',
    detail:
      'Class static members live on the class, not on individual instances.\n`restoreFromJson` operates on instance shape, so statics are excluded.',
  },
  RJ013: {
    headline: "Symbol-keyed property `{0}` is silently not decoded by `restoreFromJson`: symbol keys aren't JSON-representable.",
    severity: 'warning',
    detail:
      "JSON only supports string keys; symbol-keyed properties are dropped\nfrom the serialised form. `restoreFromJson` follows the same rule.\n\nFix: use a string key:\n  -  [Symbol.for('id')]: string;\n+  id: string;",
  },
  RJ014: {
    headline:
      "Union member(s) of type `{0}` can't be represented as data: `restoreFromJson` drops them, so the union is decoded as its remaining members.",
    severity: 'warning',
    detail:
      'A union projects to its serialisable members only: `DataOnly<Date | symbol>`\nis `Date`. The dropped member(s) ({0}) carry no JSON-shaped value (symbol,\nfunction, Promise, or a non-serialisable built-in like `Map` / `Set` /\ntyped arrays), so `restoreFromJson` decoded only the members that remain.\n\nThis is by design, see the "one contract: serializable data only"\nsection in CLAUDE.md. If EVERY member of the union is non-serialisable the\nprojection is `never`, and `restoreFromJson` throws at build time instead.',
  },
  RJ015: {
    headline:
      'Property `{0}` has a non-serialisable value type (symbol, Promise, or a non-serialisable built-in): `restoreFromJson` drops it, so this property is silently not decoded.',
    severity: 'warning',
    detail:
      '`restoreFromJson` works on JSON-shaped data. A property whose value is a symbol,\na Promise, or a non-serialisable built-in (a typed array, `ArrayBuffer`, or any other\nstandard-library class such as `URL` or `Intl.DateTimeFormat`) carries\nno JSON-shaped value, so it is dropped: `DataOnly<{ {0}: symbol }>` is `{}`.\nThe rest of the object\'s behaviour is unaffected.\n\nNote the difference from a property that is only STRUCTURALLY unserialisable\n(`{0}: symbol[]` or `{0}: Map<string, symbol>`), which CANNOT be safely\ndropped (DataOnly keeps it as `never[]`): there `restoreFromJson` throws at build\ntime instead.\n\nThis is by design, see the "one contract: serializable data only"\nsection in CLAUDE.md.',
  },
  SJ001: {
    headline: 'Type `{0}` can never be stringified to JSON: the generated function will always fail.',
    severity: 'error',
    detail:
      "`never` is the empty type: no value can ever inhabit it. A field\ntyped `never` cannot carry a runtime value, so there is nothing to\nencode/decode/validate.\n\nFix: use `unknown` if you really want to accept any value:\n  interface User {\n-   tag: never;\n+   tag: unknown;  // narrow before use\n  }\n\nFix: pick a concrete type matching your real data:\n  interface User {\n-   tag: never;\n+   tag: 'pending' | 'active' | 'done';\n  }",
  },
  SJ002: {
    headline: 'Type `{0}` can never be stringified to JSON: the generated function will always fail.',
    severity: 'error',
    detail:
      'A standard-library class carries runtime state that does not survive a JSON\nor binary round-trip: its instance identity is lost the moment it is\nserialised, so at a root position there is nothing left to work with.\n\nA few have an agreed data form and ARE supported: `Date`, `Map`,\n`Set` and the Temporal types. Everything else the standard library declares\n(`URL`, `Intl.DateTimeFormat`, `WeakMap`, `Promise`, the typed arrays and\n`Buffer`) has none, and is refused here rather than guessed at.\n\nFix: describe the data form yourself and convert at the boundary:\n  // for URL:\n  const data = yourUrl.href;             // string\n  // for typed arrays:\n  const data = Array.from(yourBuffer);   // number[]\n\nFix: change the field type to a shape made of data:\n  interface User {\n-   home: URL;\n+   home: string;\n  }',
  },
  SJ003: {
    headline: 'Type `{0}` can never be stringified to JSON: the generated function will always fail.',
    severity: 'error',
    detail:
      "Functions have no value form to serialise: their closure, prototype,\nand bound state aren't representable in JSON or binary.\n\nFix: drop the function from your type, or replace it with the data the\nfunction would produce:\n  interface User {\n-   getName: () => string;\n+   name: string;\n  }",
  },
  SJ004: {
    headline: 'Type `{0}` can never be stringified to JSON: the generated function will always fail.',
    severity: 'error',
    detail:
      "Arrays of un-serialisable elements (`symbol[]`, `(() => void)[]`,\n`Map<K, V>[]`, etc.) can't be encoded: every element would need to be\nrepresentable, and these aren't. Dropping individual elements would\nchange the array length, so the encoder refuses rather than silently\nshipping a different shape.\n\nFix: change the element type to something serialisable:\n  -  type Items = (() => void)[];\n+  type Items = string[];",
  },
  SJ005: {
    headline: 'Type `{0}` can never be stringified to JSON: the generated function will always fail.',
    severity: 'error',
    detail:
      "Every `symbol` value carries a unique runtime identity (`Symbol() !==\nSymbol()` even with the same description). That identity disappears the\nmoment it's serialised, and two symbols can't be compared across realms,\nworkers, or process boundaries. A validator that asserts \"this is a\nsymbol\" gives a false sense of safety: the value can't actually\nround-trip.\n\nFix: use a stable string key (often a literal union):\n  -  type Status = symbol;\n+  type Status = 'pending' | 'active' | 'done';",
  },
  SJ010: {
    headline:
      'Property `{0}` is a function: `stringifyJson` does not handle function values, so this property is silently not stringified.',
    severity: 'warning',
    detail:
      '`stringifyJson` works on JSON-shaped data; functions don\'t survive JSON, so\nthe emitter drops them. The rest of the object\'s behaviour is unaffected.\n\nThis is by design, see the "one contract: serializable data only"\nsection in CLAUDE.md. If you need a stricter checker that fails on\nmissing/extra function-typed members, watch the project roadmap.',
  },
  SJ011: {
    headline: "Method `{0}` is silently not stringified by `stringifyJson`: methods aren't data.",
    severity: 'warning',
    detail:
      "Class and object methods aren't part of the serialisable shape, so\n`stringifyJson` excludes them. The rest of the type still works.\n\nIf you wanted the method's return value validated/serialised, expose it\nas a data property instead.",
  },
  SJ012: {
    headline: "Static member `{0}` is silently not stringified by `stringifyJson`: statics aren't part of instance data.",
    severity: 'warning',
    detail:
      'Class static members live on the class, not on individual instances.\n`stringifyJson` operates on instance shape, so statics are excluded.',
  },
  SJ013: {
    headline:
      "Symbol-keyed property `{0}` is silently not stringified by `stringifyJson`: symbol keys aren't JSON-representable.",
    severity: 'warning',
    detail:
      "JSON only supports string keys; symbol-keyed properties are dropped\nfrom the serialised form. `stringifyJson` follows the same rule.\n\nFix: use a string key:\n  -  [Symbol.for('id')]: string;\n+  id: string;",
  },
  SJ014: {
    headline:
      "Union member(s) of type `{0}` can't be represented as data: `stringifyJson` drops them, so the union is stringified as its remaining members.",
    severity: 'warning',
    detail:
      'A union projects to its serialisable members only: `DataOnly<Date | symbol>`\nis `Date`. The dropped member(s) ({0}) carry no JSON-shaped value (symbol,\nfunction, Promise, or a non-serialisable built-in like `Map` / `Set` /\ntyped arrays), so `stringifyJson` stringified only the members that remain.\n\nThis is by design, see the "one contract: serializable data only"\nsection in CLAUDE.md. If EVERY member of the union is non-serialisable the\nprojection is `never`, and `stringifyJson` throws at build time instead.',
  },
  SJ015: {
    headline:
      'Property `{0}` has a non-serialisable value type (symbol, Promise, or a non-serialisable built-in): `stringifyJson` drops it, so this property is silently not stringified.',
    severity: 'warning',
    detail:
      '`stringifyJson` works on JSON-shaped data. A property whose value is a symbol,\na Promise, or a non-serialisable built-in (a typed array, `ArrayBuffer`, or any other\nstandard-library class such as `URL` or `Intl.DateTimeFormat`) carries\nno JSON-shaped value, so it is dropped: `DataOnly<{ {0}: symbol }>` is `{}`.\nThe rest of the object\'s behaviour is unaffected.\n\nNote the difference from a property that is only STRUCTURALLY unserialisable\n(`{0}: symbol[]` or `{0}: Map<string, symbol>`), which CANNOT be safely\ndropped (DataOnly keeps it as `never[]`): there `stringifyJson` throws at build\ntime instead.\n\nThis is by design, see the "one contract: serializable data only"\nsection in CLAUDE.md.',
  },
  TB001: {
    headline: 'Type `{0}` can never be serialised to binary: the generated function will always fail.',
    severity: 'error',
    detail:
      "`never` is the empty type: no value can ever inhabit it. A field\ntyped `never` cannot carry a runtime value, so there is nothing to\nencode/decode/validate.\n\nFix: use `unknown` if you really want to accept any value:\n  interface User {\n-   tag: never;\n+   tag: unknown;  // narrow before use\n  }\n\nFix: pick a concrete type matching your real data:\n  interface User {\n-   tag: never;\n+   tag: 'pending' | 'active' | 'done';\n  }",
  },
  TB002: {
    headline: 'Type `{0}` can never be serialised to binary: the generated function will always fail.',
    severity: 'error',
    detail:
      'A standard-library class carries runtime state that does not survive a JSON\nor binary round-trip: its instance identity is lost the moment it is\nserialised, so at a root position there is nothing left to work with.\n\nA few have an agreed data form and ARE supported: `Date`, `Map`,\n`Set` and the Temporal types. Everything else the standard library declares\n(`URL`, `Intl.DateTimeFormat`, `WeakMap`, `Promise`, the typed arrays and\n`Buffer`) has none, and is refused here rather than guessed at.\n\nFix: describe the data form yourself and convert at the boundary:\n  // for URL:\n  const data = yourUrl.href;             // string\n  // for typed arrays:\n  const data = Array.from(yourBuffer);   // number[]\n\nFix: change the field type to a shape made of data:\n  interface User {\n-   home: URL;\n+   home: string;\n  }',
  },
  TB003: {
    headline: 'Type `{0}` can never be serialised to binary: the generated function will always fail.',
    severity: 'error',
    detail:
      "Functions have no value form to serialise: their closure, prototype,\nand bound state aren't representable in JSON or binary.\n\nFix: drop the function from your type, or replace it with the data the\nfunction would produce:\n  interface User {\n-   getName: () => string;\n+   name: string;\n  }",
  },
  TB004: {
    headline: 'Type `{0}` can never be serialised to binary: the generated function will always fail.',
    severity: 'error',
    detail:
      "Arrays of un-serialisable elements (`symbol[]`, `(() => void)[]`,\n`Map<K, V>[]`, etc.) can't be encoded: every element would need to be\nrepresentable, and these aren't. Dropping individual elements would\nchange the array length, so the encoder refuses rather than silently\nshipping a different shape.\n\nFix: change the element type to something serialisable:\n  -  type Items = (() => void)[];\n+  type Items = string[];",
  },
  TB005: {
    headline: 'Type `{0}` can never be serialised to binary: the generated function will always fail.',
    severity: 'error',
    detail:
      'A standard-library class carries runtime state that does not survive a JSON\nor binary round-trip: its instance identity is lost the moment it is\nserialised, so at a root position there is nothing left to work with.\n\nA few have an agreed data form and ARE supported: `Date`, `Map`,\n`Set` and the Temporal types. Everything else the standard library declares\n(`URL`, `Intl.DateTimeFormat`, `WeakMap`, `Promise`, the typed arrays and\n`Buffer`) has none, and is refused here rather than guessed at.\n\nFix: describe the data form yourself and convert at the boundary:\n  // for URL:\n  const data = yourUrl.href;             // string\n  // for typed arrays:\n  const data = Array.from(yourBuffer);   // number[]\n\nFix: change the field type to a shape made of data:\n  interface User {\n-   home: URL;\n+   home: string;\n  }',
  },
  TB006: {
    headline: 'Type `{0}` can never be serialised to binary: the generated function will always fail.',
    severity: 'error',
    detail:
      "Every `symbol` value carries a unique runtime identity (`Symbol() !==\nSymbol()` even with the same description). That identity disappears the\nmoment it's serialised, and two symbols can't be compared across realms,\nworkers, or process boundaries. A validator that asserts \"this is a\nsymbol\" gives a false sense of safety: the value can't actually\nround-trip.\n\nFix: use a stable string key (often a literal union):\n  -  type Status = symbol;\n+  type Status = 'pending' | 'active' | 'done';",
  },
  TB010: {
    headline:
      'Property `{0}` is a function: `toBinary` does not handle function values, so this property is silently not serialised.',
    severity: 'warning',
    detail:
      '`toBinary` works on JSON-shaped data; functions don\'t survive JSON, so\nthe emitter drops them. The rest of the object\'s behaviour is unaffected.\n\nThis is by design, see the "one contract: serializable data only"\nsection in CLAUDE.md. If you need a stricter checker that fails on\nmissing/extra function-typed members, watch the project roadmap.',
  },
  TB011: {
    headline: "Method `{0}` is silently not serialised by `toBinary`: methods aren't data.",
    severity: 'warning',
    detail:
      "Class and object methods aren't part of the serialisable shape, so\n`toBinary` excludes them. The rest of the type still works.\n\nIf you wanted the method's return value validated/serialised, expose it\nas a data property instead.",
  },
  TB012: {
    headline: "Static member `{0}` is silently not serialised by `toBinary`: statics aren't part of instance data.",
    severity: 'warning',
    detail:
      'Class static members live on the class, not on individual instances.\n`toBinary` operates on instance shape, so statics are excluded.',
  },
  TB013: {
    headline: "Symbol-keyed property `{0}` is silently not serialised by `toBinary`: symbol keys aren't JSON-representable.",
    severity: 'warning',
    detail:
      "JSON only supports string keys; symbol-keyed properties are dropped\nfrom the serialised form. `toBinary` follows the same rule.\n\nFix: use a string key:\n  -  [Symbol.for('id')]: string;\n+  id: string;",
  },
  TB014: {
    headline:
      "Union member(s) of type `{0}` can't be represented as data: `toBinary` drops them, so the union is serialised as its remaining members.",
    severity: 'warning',
    detail:
      'A union projects to its serialisable members only: `DataOnly<Date | symbol>`\nis `Date`. The dropped member(s) ({0}) carry no JSON-shaped value (symbol,\nfunction, Promise, or a non-serialisable built-in like `Map` / `Set` /\ntyped arrays), so `toBinary` serialised only the members that remain.\n\nThis is by design, see the "one contract: serializable data only"\nsection in CLAUDE.md. If EVERY member of the union is non-serialisable the\nprojection is `never`, and `toBinary` throws at build time instead.',
  },
  TB015: {
    headline:
      'Property `{0}` has a non-serialisable value type (symbol, Promise, or a non-serialisable built-in): `toBinary` drops it, so this property is silently not serialised.',
    severity: 'warning',
    detail:
      '`toBinary` works on JSON-shaped data. A property whose value is a symbol,\na Promise, or a non-serialisable built-in (a typed array, `ArrayBuffer`, or any other\nstandard-library class such as `URL` or `Intl.DateTimeFormat`) carries\nno JSON-shaped value, so it is dropped: `DataOnly<{ {0}: symbol }>` is `{}`.\nThe rest of the object\'s behaviour is unaffected.\n\nNote the difference from a property that is only STRUCTURALLY unserialisable\n(`{0}: symbol[]` or `{0}: Map<string, symbol>`), which CANNOT be safely\ndropped (DataOnly keeps it as `never[]`): there `toBinary` throws at build\ntime instead.\n\nThis is by design, see the "one contract: serializable data only"\nsection in CLAUDE.md.',
  },
  TMP001: {
    headline:
      "Temporal type `{0}` resolved to `any`: the Temporal lib isn't in your tsconfig `lib`, so the generated validator would accept any value.",
    severity: 'error',
    detail:
      'mion reads types through TypeScript\'s lib definitions, so it\ncan only validate `Temporal.*` types when the Temporal namespace is loaded.\nWith the lib missing, `{0}` silently degrades to `any` and the validator\nbecomes a no-op that accepts everything, almost never what you intended.\n\nFix: add "ESNext.Temporal" to your tsconfig:\n  {\n    "compilerOptions": {\n      "lib": ["ES2023", "ESNext.Temporal"]\n    }\n  }',
  },
  UKE010: {
    headline:
      'Property `{0}` is a function: `unknownKeyErrors` does not handle function values, so this property is silently not checked.',
    severity: 'warning',
    detail:
      '`unknownKeyErrors` works on JSON-shaped data; functions don\'t survive JSON, so\nthe emitter drops them. The rest of the object\'s behaviour is unaffected.\n\nThis is by design, see the "one contract: serializable data only"\nsection in CLAUDE.md. If you need a stricter checker that fails on\nmissing/extra function-typed members, watch the project roadmap.',
  },
  UKU010: {
    headline:
      'Property `{0}` is a function: `unknownKeysToUndefined` does not handle function values, so this property is silently not cleared.',
    severity: 'warning',
    detail:
      '`unknownKeysToUndefined` works on JSON-shaped data; functions don\'t survive JSON, so\nthe emitter drops them. The rest of the object\'s behaviour is unaffected.\n\nThis is by design, see the "one contract: serializable data only"\nsection in CLAUDE.md. If you need a stricter checker that fails on\nmissing/extra function-typed members, watch the project roadmap.',
  },
  UKW010: {
    headline:
      'Property `{0}` is a function: `unknownKeysToUndefinedWire` does not handle function values, so this property is silently not cleared.',
    severity: 'warning',
    detail:
      '`unknownKeysToUndefinedWire` works on JSON-shaped data; functions don\'t survive JSON, so\nthe emitter drops them. The rest of the object\'s behaviour is unaffected.\n\nThis is by design, see the "one contract: serializable data only"\nsection in CLAUDE.md. If you need a stricter checker that fails on\nmissing/extra function-typed members, watch the project roadmap.',
  },
  UPN001: {
    headline: 'Property `{0}` is named after a prototype slot and can never be data: the generated function will always fail.',
    severity: 'error',
    detail:
      '`__proto__`, `prototype` and `constructor` are never data. Writing `__proto__`\non a plain object swaps its prototype instead of adding a key, and a lookup of\na missing `constructor` or `prototype` walks the prototype chain, so every\ndecoder refuses those keys on the wire and validate refuses them under an index\nsignature. A property declared with one of those names could never round-trip,\nso the build fails here instead of generating a function that always throws.\n\nFix: rename the property:\n  interface Settings {\n-   constructor: string;\n+   builder: string;\n  }',
  },
  VE001: {
    headline: 'Type `{0}` can never be validated: the generated function will always fail.',
    severity: 'error',
    detail:
      'A standard-library class carries runtime state that does not survive a JSON\nor binary round-trip: its instance identity is lost the moment it is\nserialised, so at a root position there is nothing left to work with.\n\nA few have an agreed data form and ARE supported: `Date`, `Map`,\n`Set` and the Temporal types. Everything else the standard library declares\n(`URL`, `Intl.DateTimeFormat`, `WeakMap`, `Promise`, the typed arrays and\n`Buffer`) has none, and is refused here rather than guessed at.\n\nFix: describe the data form yourself and convert at the boundary:\n  // for URL:\n  const data = yourUrl.href;             // string\n  // for typed arrays:\n  const data = Array.from(yourBuffer);   // number[]\n\nFix: change the field type to a shape made of data:\n  interface User {\n-   home: URL;\n+   home: string;\n  }',
  },
  VE002: {
    headline: 'Type `{0}` can never be validated: the generated function will always fail.',
    severity: 'error',
    detail:
      "Every `symbol` value carries a unique runtime identity (`Symbol() !==\nSymbol()` even with the same description). That identity disappears the\nmoment it's serialised, and two symbols can't be compared across realms,\nworkers, or process boundaries. A validator that asserts \"this is a\nsymbol\" gives a false sense of safety: the value can't actually\nround-trip.\n\nFix: use a stable string key (often a literal union):\n  -  type Status = symbol;\n+  type Status = 'pending' | 'active' | 'done';",
  },
  VE010: {
    headline:
      'Property `{0}` is a function: `validationErrors` does not handle function values, so this property is silently not checked.',
    severity: 'warning',
    detail:
      '`validationErrors` works on JSON-shaped data; functions don\'t survive JSON, so\nthe emitter drops them. The rest of the object\'s behaviour is unaffected.\n\nThis is by design, see the "one contract: serializable data only"\nsection in CLAUDE.md. If you need a stricter checker that fails on\nmissing/extra function-typed members, watch the project roadmap.',
  },
  VE011: {
    headline: "Method `{0}` is silently not checked by `validationErrors`: methods aren't data.",
    severity: 'warning',
    detail:
      "Class and object methods aren't part of the serialisable shape, so\n`validationErrors` excludes them. The rest of the type still works.\n\nIf you wanted the method's return value validated/serialised, expose it\nas a data property instead.",
  },
  VE012: {
    headline: "Static member `{0}` is silently not checked by `validationErrors`: statics aren't part of instance data.",
    severity: 'warning',
    detail:
      'Class static members live on the class, not on individual instances.\n`validationErrors` operates on instance shape, so statics are excluded.',
  },
  VE013: {
    headline: "Symbol-keyed property `{0}` is silently not checked by `validationErrors`: symbol keys aren't JSON-representable.",
    severity: 'warning',
    detail:
      "JSON only supports string keys; symbol-keyed properties are dropped\nfrom the serialised form. `validationErrors` follows the same rule.\n\nFix: use a string key:\n  -  [Symbol.for('id')]: string;\n+  id: string;",
  },
  VE015: {
    headline:
      'Property `{0}` has a non-serialisable value type (symbol, Promise, or a non-serialisable built-in): `validationErrors` drops it, so this property is silently not checked.',
    severity: 'warning',
    detail:
      '`validationErrors` works on JSON-shaped data. A property whose value is a symbol,\na Promise, or a non-serialisable built-in (a typed array, `ArrayBuffer`, or any other\nstandard-library class such as `URL` or `Intl.DateTimeFormat`) carries\nno JSON-shaped value, so it is dropped: `DataOnly<{ {0}: symbol }>` is `{}`.\nThe rest of the object\'s behaviour is unaffected.\n\nNote the difference from a property that is only STRUCTURALLY unserialisable\n(`{0}: symbol[]` or `{0}: Map<string, symbol>`), which CANNOT be safely\ndropped (DataOnly keeps it as `never[]`): there `validationErrors` throws at build\ntime instead.\n\nThis is by design, see the "one contract: serializable data only"\nsection in CLAUDE.md.',
  },
  VE020: {
    headline: '`validationErrors` on `any` / `unknown` always returns an empty error array: nothing is checked.',
    severity: 'warning',
    detail:
      'Same reason as VL021: `any` and `unknown` describe "anything", so the\nchecker has no structure to compare against. The returned error array\nwill always be empty.\n\nFix: narrow the type to the actual shape you expect:\n  -  const errors = createGetValidationErrorsFn<unknown>()(value);\n+  const errors = createGetValidationErrorsFn<User>()(value);',
  },
  VL001: {
    headline: 'Type `{0}` can never be validated: the generated function will always fail.',
    severity: 'error',
    detail:
      'A standard-library class carries runtime state that does not survive a JSON\nor binary round-trip: its instance identity is lost the moment it is\nserialised, so at a root position there is nothing left to work with.\n\nA few have an agreed data form and ARE supported: `Date`, `Map`,\n`Set` and the Temporal types. Everything else the standard library declares\n(`URL`, `Intl.DateTimeFormat`, `WeakMap`, `Promise`, the typed arrays and\n`Buffer`) has none, and is refused here rather than guessed at.\n\nFix: describe the data form yourself and convert at the boundary:\n  // for URL:\n  const data = yourUrl.href;             // string\n  // for typed arrays:\n  const data = Array.from(yourBuffer);   // number[]\n\nFix: change the field type to a shape made of data:\n  interface User {\n-   home: URL;\n+   home: string;\n  }',
  },
  VL002: {
    headline: 'Type `{0}` can never be validated: the generated function will always fail.',
    severity: 'error',
    detail:
      "Every `symbol` value carries a unique runtime identity (`Symbol() !==\nSymbol()` even with the same description). That identity disappears the\nmoment it's serialised, and two symbols can't be compared across realms,\nworkers, or process boundaries. A validator that asserts \"this is a\nsymbol\" gives a false sense of safety: the value can't actually\nround-trip.\n\nFix: use a stable string key (often a literal union):\n  -  type Status = symbol;\n+  type Status = 'pending' | 'active' | 'done';",
  },
  VL010: {
    headline:
      'Property `{0}` is a function: `validate` does not handle function values, so this property is silently not validated.',
    severity: 'warning',
    detail:
      '`validate` works on JSON-shaped data; functions don\'t survive JSON, so\nthe emitter drops them. The rest of the object\'s behaviour is unaffected.\n\nThis is by design, see the "one contract: serializable data only"\nsection in CLAUDE.md. If you need a stricter checker that fails on\nmissing/extra function-typed members, watch the project roadmap.',
  },
  VL011: {
    headline: "Method `{0}` is silently not validated by `validate`: methods aren't data.",
    severity: 'warning',
    detail:
      "Class and object methods aren't part of the serialisable shape, so\n`validate` excludes them. The rest of the type still works.\n\nIf you wanted the method's return value validated/serialised, expose it\nas a data property instead.",
  },
  VL012: {
    headline: "Static member `{0}` is silently not validated by `validate`: statics aren't part of instance data.",
    severity: 'warning',
    detail:
      'Class static members live on the class, not on individual instances.\n`validate` operates on instance shape, so statics are excluded.',
  },
  VL013: {
    headline: "Symbol-keyed property `{0}` is silently not validated by `validate`: symbol keys aren't JSON-representable.",
    severity: 'warning',
    detail:
      "JSON only supports string keys; symbol-keyed properties are dropped\nfrom the serialised form. `validate` follows the same rule.\n\nFix: use a string key:\n  -  [Symbol.for('id')]: string;\n+  id: string;",
  },
  VL014: {
    headline:
      "Union member(s) of type `{0}` can't be represented as data: `validate` drops them, so the union is validated as its remaining members.",
    severity: 'warning',
    detail:
      'A union projects to its serialisable members only: `DataOnly<Date | symbol>`\nis `Date`. The dropped member(s) ({0}) carry no JSON-shaped value (symbol,\nfunction, Promise, or a non-serialisable built-in like `Map` / `Set` /\ntyped arrays), so `validate` validated only the members that remain.\n\nThis is by design, see the "one contract: serializable data only"\nsection in CLAUDE.md. If EVERY member of the union is non-serialisable the\nprojection is `never`, and `validate` throws at build time instead.',
  },
  VL015: {
    headline:
      'Property `{0}` has a non-serialisable value type (symbol, Promise, or a non-serialisable built-in): `validate` drops it, so this property is silently not validated.',
    severity: 'warning',
    detail:
      '`validate` works on JSON-shaped data. A property whose value is a symbol,\na Promise, or a non-serialisable built-in (a typed array, `ArrayBuffer`, or any other\nstandard-library class such as `URL` or `Intl.DateTimeFormat`) carries\nno JSON-shaped value, so it is dropped: `DataOnly<{ {0}: symbol }>` is `{}`.\nThe rest of the object\'s behaviour is unaffected.\n\nNote the difference from a property that is only STRUCTURALLY unserialisable\n(`{0}: symbol[]` or `{0}: Map<string, symbol>`), which CANNOT be safely\ndropped (DataOnly keeps it as `never[]`): there `validate` throws at build\ntime instead.\n\nThis is by design, see the "one contract: serializable data only"\nsection in CLAUDE.md.',
  },
  VL021: {
    headline: '`validate` on `any` / `unknown` always returns true: the validator accepts every value.',
    severity: 'warning',
    detail:
      '`any` and `unknown` describe "anything", so a structural validator has\nnothing to check. The resulting function passes for every input,\nincluding the ones you probably wanted to reject.\n\nFix: narrow the type to the actual shape you expect:\n  -  const isUser = createValidateFn<unknown>();\n+  const isUser = createValidateFn<User>();',
  },
};
