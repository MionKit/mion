package diagnostics

// RunType compiler codes, one prefix per family so a build log names the family. A `-root` code is a root
// error, the factory throws on call; a `-dropped` code is a child-position drop.

// validate family.
const (
	CodeVLNonSerializableRoot     = "validate-non-data-root"
	CodeVLSymbolRoot              = "validate-symbol-root"
	CodeVLFunctionRoot            = "validate-function-root"
	CodeVLFunctionPropDropped     = "validate-function-property-dropped"
	CodeVLMethodDropped           = "validate-method-dropped"
	CodeVLStaticDropped           = "validate-static-dropped"
	CodeVLSymbolKeyedDropped      = "validate-symbol-key-dropped"
	CodeVLUnionMemberDropped      = "validate-union-member-dropped"
	CodeVLNonSerializablePropDrop = "validate-non-data-property-dropped"
	CodeVLRootAnyUnknown          = "validate-any-accepts-all"
)

// validationErrors family.
const (
	CodeVENonSerializableRoot     = "validation-errors-non-data-root"
	CodeVESymbolRoot              = "validation-errors-symbol-root"
	CodeVEFunctionRoot            = "validation-errors-function-root"
	CodeVEFunctionPropDropped     = "validation-errors-function-property-dropped"
	CodeVEMethodDropped           = "validation-errors-method-dropped"
	CodeVEStaticDropped           = "validation-errors-static-dropped"
	CodeVESymbolKeyedDropped      = "validation-errors-symbol-key-dropped"
	CodeVENonSerializablePropDrop = "validation-errors-non-data-property-dropped"
	CodeVERootAnyUnknown          = "validation-errors-any-accepts-all"
)

// CodeCompositeMissingPrimitive: a JSON composite entry's soft-dep primitive has no rendered entry
// in the graph. Always an internal invariant breach, never a user error.
const CodeCompositeMissingPrimitive = "internal-json-primitive-missing"

// CodeUnsupportedLeafNoCode: alwaysThrow code for an uncompilable kind with no root code; an internal bug. Args: [kindLabel].
const CodeUnsupportedLeafNoCode = "internal-kind-not-compilable"

// prepareForJson family.
const (
	CodePJNeverRoot               = "json-prepare-never-root"
	CodePJNonSerializableRoot     = "json-prepare-non-data-root"
	CodePJFunctionRoot            = "json-prepare-function-root"
	CodePJSymbolRoot              = "json-prepare-symbol-root"
	CodePJFunctionPropDropped     = "json-prepare-function-property-dropped"
	CodePJMethodDropped           = "json-prepare-method-dropped"
	CodePJStaticDropped           = "json-prepare-static-dropped"
	CodePJSymbolKeyedDropped      = "json-prepare-symbol-key-dropped"
	CodePJUnionMemberDropped      = "json-prepare-union-member-dropped"
	CodePJNonSerializablePropDrop = "json-prepare-non-data-property-dropped"
)

// prepareForJsonClone family.
const (
	CodePJSNeverRoot               = "json-prepare-clone-never-root"
	CodePJSNonSerializableRoot     = "json-prepare-clone-non-data-root"
	CodePJSFunctionRoot            = "json-prepare-clone-function-root"
	CodePJSSymbolRoot              = "json-prepare-clone-symbol-root"
	CodePJSFunctionPropDropped     = "json-prepare-clone-function-property-dropped"
	CodePJSMethodDropped           = "json-prepare-clone-method-dropped"
	CodePJSStaticDropped           = "json-prepare-clone-static-dropped"
	CodePJSSymbolKeyedDropped      = "json-prepare-clone-symbol-key-dropped"
	CodePJSUnionMemberDropped      = "json-prepare-clone-union-member-dropped"
	CodePJSNonSerializablePropDrop = "json-prepare-clone-non-data-property-dropped"
)

// restoreFromJsonMutate family.
const (
	CodeRJNeverRoot               = "json-restore-never-root"
	CodeRJNonSerializableRoot     = "json-restore-non-data-root"
	CodeRJFunctionRoot            = "json-restore-function-root"
	CodeRJSymbolRoot              = "json-restore-symbol-root"
	CodeRJFunctionPropDropped     = "json-restore-function-property-dropped"
	CodeRJMethodDropped           = "json-restore-method-dropped"
	CodeRJStaticDropped           = "json-restore-static-dropped"
	CodeRJSymbolKeyedDropped      = "json-restore-symbol-key-dropped"
	CodeRJUnionMemberDropped      = "json-restore-union-member-dropped"
	CodeRJNonSerializablePropDrop = "json-restore-non-data-property-dropped"
)

// Format family: TypeFormat (pattern / mockSample) build-time checks. Every one is
// LevelRuntimeError, because EmitDiagnostic does not change what the emitter writes and the entry
// always renders: what ships is a validator that was never verified (format-no-js-runtime, format-pattern-timeout), built from
// contradictory params (format-invalid-params) or hangable by a crafted input (format-pattern-unsafe), or a mock function that
// cannot produce a valid value (format-sample-mismatch, format-sample-out-of-bounds, format-sample-generation-failed, format-sample-conflict).
const (
	// CodeFMTSampleMismatch: a declared mockSample does not match the format's own pattern. A sample
	// is a canonical valid value, so a mismatch is always a type-definition bug. Args: [sample,
	// pattern-source].
	CodeFMTSampleMismatch = "format-sample-mismatch"

	// CodeFMTInvalidParams: a format's params violate an invariant, so the emitted validator would be
	// unreachable or wrong. Args: [violation message]. Replaces the JS-side `validateParams` throw,
	// run AOT in Go.
	CodeFMTInvalidParams = "format-invalid-params"

	// CodeFMTSampleBounds: a declared mockSample violates a statically checkable sibling constraint
	// (length bounds, allowedChars / disallowedChars / disallowedValues). Same doctrine as format-sample-mismatch: a
	// sample its own siblings reject is a type-definition bug. One diagnostic per violated
	// constraint, since the pipeline dedups per code per walk. Args: [comma-joined offending samples,
	// constraint name, bound/description].
	CodeFMTSampleBounds = "format-sample-out-of-bounds"

	// CodeFMTMissingJsRuntime: a pattern needs the JS engine (the checks run on the real `new
	// RegExp`) and none could run. Fail-closed, and the entry still renders, so what ships is a
	// validator nothing checked. Emitted once per pattern-bearing site, so a project with no patterns
	// never needs a JS runtime. Args: [pattern source, reason].
	CodeFMTMissingJsRuntime = "format-no-js-runtime"

	// CodeFMTSampleGenFailed: a pattern declares no mockSamples and none could be generated
	// (generation off, a construct randexp cannot handle, or a retry budget that yielded nothing
	// surviving the pattern and its length bounds). A pattern without samples cannot mock, so the
	// type must declare them. Args: [pattern source, reason].
	CodeFMTSampleGenFailed = "format-sample-generation-failed"

	// CodeFMTSampleConflict: two sites share ONE cache entry (pools are not id-relevant) but declare different mockSamples.
	// The first interned wins, so reordering unrelated code could silently flip it: the build reports instead of picking.
	// Declared-vs-absent is NOT a conflict (the declared pool is adopted); a generated pool is drawn once per entry.
	// Args: [format name, the pool in use, the conflicting pool, the site that interned first].
	CodeFMTSampleConflict = "format-sample-conflict"

	// CodeFMTPatternTimeout: the JS engine could not evaluate a pattern against one sample inside the
	// sidecar's budget, even on the quiet retry. Same doctrine as format-no-js-runtime: the validator would run
	// that same regex. TRANSIENT, because a saturated host blows the budget on a fine pattern, so it
	// is never persisted or memoized and the next build re-evaluates. Args: [pattern source, reason].
	CodeFMTPatternTimeout = "format-pattern-timeout"

	// CodeFMTPatternUnsafe: a `pattern` can be made to backtrack exponentially, so the emitted
	// validator is a denial-of-service hole. Found by a STATIC check (pkg/regexsafety), so
	// unlike format-pattern-timeout it needs no JS engine and its verdict is deterministic and safe to cache. Escape
	// hatch when the check reads a pattern wrongly: `unsafePattern: true` on the pattern params.
	// Args: [pattern source, reason, offending sub-expression].
	CodeFMTPatternUnsafe = "format-pattern-unsafe"

	// CodeFMTPatternUnreadable: the validator would skip an unreadable `pattern`, e.g. a RegExp or a .d.ts `FormatPattern` const.
	// Args: [the pattern's type as written].
	CodeFMTPatternUnreadable = "format-pattern-unreadable"

	// CodeFMTGeneratorInvalid: a string format's mock `generator` cannot produce a value the format accepts, so every
	// mock call would throw. Args: [generator, the reasons joined].
	CodeFMTGeneratorInvalid = "format-generator-invalid"
)

// removeUnknownKeys never drops a declared member: copied, shared (the -shared codes) or it throws (the rest).
const (
	CodeRUKUnionRoot               = "unknown-keys-object-union"
	CodeRUKSymbolKeyedMember       = "unknown-keys-symbol-key"
	CodeRUKPrivateFields           = "unknown-keys-private-fields"
	CodeRUKSharedRefused           = "unknown-keys-shared-value-refused"
	CodeRUKFunctionPropDropped     = "unknown-keys-function-shared"
	CodeRUKMethodDropped           = "unknown-keys-method-not-copied"
	CodeRUKStaticDropped           = "unknown-keys-static-dropped"
	CodeRUKNonSerializablePropDrop = "unknown-keys-non-data-shared"
	CodeRUKSharedAsAsked           = "unknown-keys-value-shared"
)

// Unsafe property name, one warning for every family: a declared `__proto__` member is
// dropped, because writing that key on a plain object swaps its prototype instead of storing a
// value. TypeScript ACCEPTS the declaration, so the type promises a value the runtime never carries,
// which is what makes the warning worth emitting; the rest of the type is unaffected. Args:
// [propertyName].
const (
	CodeUnsafePropertyName = "data-proto-property-dropped"
)

func init() {
	// LevelRuntimeError, not LevelError: the entry renders as an alwaysThrow factory that throws when called.
	// ScopeRoot: the same trigger inside a property is a child-position drop (the `-dropped` codes).
	for _, definition := range []Definition{
		{Code: CodeVLNonSerializableRoot, Family: FamilyRunType, Level: LevelRuntimeError, Scope: ScopeRoot, Title: "RunType root-position error",
			Headline: "Type `{type}` can never be validated: the generated function will always fail.",
			Summary:  "Your type is a built-in class with no JSON form, such as `URLSearchParams`, `Intl.DateTimeFormat`, `WeakMap`, `Promise`, `RegExp`, `Buffer` or a typed array like `Uint8Array`. Only `Date`, `Map`, `Set`, `URL` and the Temporal types are supported. Validate plain data instead, or convert the value first (`params.toString()`, `Array.from(bytes)`).",
			Fix: `const bytes = Array.from(myUint8Array);
const isData = createValidateFn<number[]>();`,
			Example: `import {createValidateFn} from '@mionjs/run-types';
export const isData = createValidateFn<Uint8Array>();`,
		},
		{Code: CodeVLSymbolRoot, Family: FamilyRunType, Level: LevelRuntimeError, Scope: ScopeRoot, Title: "RunType root-position error",
			Headline: "Type `{type}` can never be validated: the generated function will always fail.",
			Summary:  "Your type is a `symbol`, or one named symbol such as `typeof mySymbol`. A symbol's identity is lost when it crosses a network, a worker or a process. Use a string union instead.",
			Fix:      `type Status = 'pending' | 'active' | 'done';`,
			Example: `import {createValidateFn} from '@mionjs/run-types';
export const isData = createValidateFn<symbol>();`,
		},
		{Code: CodeVLFunctionRoot, Family: FamilyRunType, Level: LevelRuntimeError, Scope: ScopeRoot, Title: "RunType root-position error",
			Headline: "Type `{type}` can never be validated: the generated function will always fail.",
			Summary:  "Your type is a function, a method, or an interface with a call signature. A function is code, not data. Validate what it takes or returns instead.",
			Fix: `const isArgs = createValidateFn<Parameters<typeof handler>>();
const isResult = createValidateFn<Awaited<ReturnType<typeof handler>>>();`,
			Example: `import {createValidateFn} from '@mionjs/run-types';
export const isData = createValidateFn<() => void>();`,
		},
		{Code: CodeVENonSerializableRoot, Family: FamilyRunType, Level: LevelRuntimeError, Scope: ScopeRoot, Title: "RunType root-position error",
			Headline: "Type `{type}` can never be validated: the generated function will always fail.",
			Summary:  "Same as `validate-non-data-root`, for `createGetValidationErrorsFn`. Your type is a built-in class with no JSON form, such as `URLSearchParams`, `Intl.DateTimeFormat`, `WeakMap`, `Promise`, `RegExp`, `Buffer` or a typed array like `Uint8Array`. Only `Date`, `Map`, `Set`, `URL` and the Temporal types are supported. Check plain data instead, or convert the value first (`params.toString()`, `Array.from(bytes)`).",
			Fix: `const bytes = Array.from(myUint8Array);
const errorsOf = createGetValidationErrorsFn<number[]>();`,
			Example: `import {createGetValidationErrorsFn} from '@mionjs/run-types';
export const errorsOf = createGetValidationErrorsFn<Uint8Array>();`,
		},
		{Code: CodeVESymbolRoot, Family: FamilyRunType, Level: LevelRuntimeError, Scope: ScopeRoot, Title: "RunType root-position error",
			Headline: "Type `{type}` can never be validated: the generated function will always fail.",
			Summary:  "Same as `validate-symbol-root`, for `createGetValidationErrorsFn`. Your type is a `symbol`, or one named symbol such as `typeof mySymbol`, and each symbol's identity is lost when it crosses a network, a worker or a process. Use a string union instead.",
			Fix:      "type Status = 'pending' | 'active' | 'done';",
			Example: `import {createGetValidationErrorsFn} from '@mionjs/run-types';
export const errorsOf = createGetValidationErrorsFn<symbol>();`,
		},
		{Code: CodeVEFunctionRoot, Family: FamilyRunType, Level: LevelRuntimeError, Scope: ScopeRoot, Title: "RunType root-position error",
			Headline: "Type `{type}` can never be validated: the generated function will always fail.",
			Summary:  "Same as `validate-function-root`, for `createGetValidationErrorsFn`. Your type is a function, a method, or an interface with a call signature, which is code, not data. Check what it takes or returns instead.",
			Fix: `const argsErrors = createGetValidationErrorsFn<Parameters<typeof handler>>();
const resultErrors = createGetValidationErrorsFn<Awaited<ReturnType<typeof handler>>>();`,
			Example: `import {createGetValidationErrorsFn} from '@mionjs/run-types';
export const errorsOf = createGetValidationErrorsFn<() => void>();`,
		},
		{Code: CodePJNeverRoot, Family: FamilyRunType, Level: LevelRuntimeError, Scope: ScopeRoot, Title: "RunType root-position error",
			Headline: "Type `{type}` can never be encoded to JSON: the generated function will always fail.",
			Summary:  "Your type resolves to `never`, so no value can ever match it and there is nothing to encode. Use a concrete type that matches your data, or `unknown` if you accept any value and check it before use. A `never` property inside an object is dropped instead (json-prepare-non-data-property-dropped).",
			Fix: `type Tag = 'pending' | 'active' | 'done';
// or, to accept any value:
type AnyTag = unknown; // check it before use`,
		},
		{Code: CodePJNonSerializableRoot, Family: FamilyRunType, Level: LevelRuntimeError, Scope: ScopeRoot, Title: "RunType root-position error",
			Headline: "Type `{type}` can never be encoded to JSON: the generated function will always fail.",
			Summary:  "Standard library classes have no JSON form, except `Date`, `Map`, `Set`, `URL` and the Temporal types. When your type is `URLSearchParams`, `Intl.DateTimeFormat`, `WeakMap`, `Promise`, `RegExp`, a typed array or `Buffer` (or an array of them), there is nothing to encode. Convert the value to plain data, like a string for a `URLSearchParams` or a number array for a typed array. Inside an object, such a property is dropped instead (json-prepare-non-data-property-dropped).",
			Fix: `const query: string = yourParams.toString(); // not a URLSearchParams
const bytes: number[] = Array.from(yourBuffer); // not a typed array`,
		},
		{Code: CodePJFunctionRoot, Family: FamilyRunType, Level: LevelRuntimeError, Scope: ScopeRoot, Title: "RunType root-position error",
			Headline: "Type `{type}` can never be encoded to JSON: the generated function will always fail.",
			Summary:  "A function has no JSON form, so there is nothing to encode. Use the data the function returns. A method or function property inside an object is dropped instead (json-prepare-method-dropped, or json-prepare-function-property-dropped when optional or in a union member).",
			Fix: `interface User {
  name: string; // not getName: () => string
}`,
		},
		{Code: CodePJSymbolRoot, Family: FamilyRunType, Level: LevelRuntimeError, Scope: ScopeRoot, Title: "RunType root-position error",
			Headline: "Type `{type}` can never be encoded to JSON: the generated function will always fail.",
			Summary:  "A `symbol`'s identity is lost in JSON, so it cannot be encoded. Use a string instead, often a union of string literals. A symbol property inside an object is dropped instead (json-prepare-non-data-property-dropped).",
			Fix:      "type Status = 'pending' | 'active' | 'done'; // not symbol",
		},
		{Code: CodePJSNeverRoot, Family: FamilyRunType, Level: LevelRuntimeError, Scope: ScopeRoot, Title: "RunType root-position error",
			Headline: "Type `{type}` can never be encoded to JSON: the generated function will always fail.",
			Summary:  "Your type resolves to `never`, so no value can ever match it and there is nothing to encode. Use a concrete type that matches your data, or `unknown` if you accept any value and check it before use. A `never` property inside an object is dropped instead (json-prepare-clone-non-data-property-dropped).",
			Fix: `type Tag = 'pending' | 'active' | 'done';
// or, to accept any value:
type AnyTag = unknown; // check it before use`,
		},
		{Code: CodePJSNonSerializableRoot, Family: FamilyRunType, Level: LevelRuntimeError, Scope: ScopeRoot, Title: "RunType root-position error",
			Headline: "Type `{type}` can never be encoded to JSON: the generated function will always fail.",
			Summary:  "Standard library classes have no JSON form, except `Date`, `Map`, `Set`, `URL` and the Temporal types. When your type is `URLSearchParams`, `Intl.DateTimeFormat`, `WeakMap`, `Promise`, `RegExp`, a typed array or `Buffer` (or an array of them), there is nothing to encode. Convert the value to plain data, like a string for a `URLSearchParams` or a number array for a typed array. Inside an object, such a property is dropped instead (json-prepare-clone-non-data-property-dropped).",
			Fix: `const query: string = yourParams.toString(); // not a URLSearchParams
const bytes: number[] = Array.from(yourBuffer); // not a typed array`,
		},
		{Code: CodePJSFunctionRoot, Family: FamilyRunType, Level: LevelRuntimeError, Scope: ScopeRoot, Title: "RunType root-position error",
			Headline: "Type `{type}` can never be encoded to JSON: the generated function will always fail.",
			Summary:  "A function has no JSON form, so there is nothing to encode. Use the data the function returns. A method or function property inside an object is dropped instead (json-prepare-clone-method-dropped, or json-prepare-clone-function-property-dropped when optional or in a union member).",
			Fix: `interface User {
  name: string; // not getName: () => string
}`,
		},
		{Code: CodePJSSymbolRoot, Family: FamilyRunType, Level: LevelRuntimeError, Scope: ScopeRoot, Title: "RunType root-position error",
			Headline: "Type `{type}` can never be encoded to JSON: the generated function will always fail.",
			Summary:  "A `symbol`'s identity is lost in JSON, so it cannot be encoded. Use a string instead, often a union of string literals. A symbol property inside an object is dropped instead (json-prepare-clone-non-data-property-dropped).",
			Fix:      "type Status = 'pending' | 'active' | 'done'; // not symbol",
		},
		{Code: CodeRJNeverRoot, Family: FamilyRunType, Level: LevelRuntimeError, Scope: ScopeRoot, Title: "RunType root-position error",
			Headline: "Type `{type}` can never be decoded from JSON: the generated function will always fail.",
			Summary:  "Your type resolves to `never`, so no value can ever match it and there is nothing to decode. Use a concrete type that matches your data, or `unknown` if you accept any value and check it before use. A `never` property inside an object is dropped instead (json-restore-non-data-property-dropped).",
			Fix: `type Tag = 'pending' | 'active' | 'done';
// or, to accept any value:
type AnyTag = unknown; // check it before use`,
		},
		{Code: CodeRJNonSerializableRoot, Family: FamilyRunType, Level: LevelRuntimeError, Scope: ScopeRoot, Title: "RunType root-position error",
			Headline: "Type `{type}` can never be decoded from JSON: the generated function will always fail.",
			Summary:  "Standard library classes have no JSON form, except `Date`, `Map`, `Set`, `URL` and the Temporal types. When your type is `URLSearchParams`, `Intl.DateTimeFormat`, `WeakMap`, `Promise`, `RegExp`, a typed array or `Buffer` (or an array of them), there is nothing to decode. Convert the value to plain data, like a string for a `URLSearchParams` or a number array for a typed array. Inside an object, such a property is dropped instead (json-restore-non-data-property-dropped).",
			Fix: `const query: string = yourParams.toString(); // not a URLSearchParams
const bytes: number[] = Array.from(yourBuffer); // not a typed array`,
		},
		{Code: CodeRJFunctionRoot, Family: FamilyRunType, Level: LevelRuntimeError, Scope: ScopeRoot, Title: "RunType root-position error",
			Headline: "Type `{type}` can never be decoded from JSON: the generated function will always fail.",
			Summary:  "A function has no JSON form, so there is nothing to decode. Use the data the function returns. A method or function property inside an object is dropped instead (json-restore-method-dropped, or json-restore-function-property-dropped when optional or in a union member).",
			Fix: `interface User {
  name: string; // not getName: () => string
}`,
		},
		{Code: CodeRJSymbolRoot, Family: FamilyRunType, Level: LevelRuntimeError, Scope: ScopeRoot, Title: "RunType root-position error",
			Headline: "Type `{type}` can never be decoded from JSON: the generated function will always fail.",
			Summary:  "A `symbol`'s identity is lost in JSON, so it cannot be decoded. Use a string instead, often a union of string literals. A symbol property inside an object is dropped instead (json-restore-non-data-property-dropped).",
			Fix:      "type Status = 'pending' | 'active' | 'done'; // not symbol",
		},
		{Code: CodeRUKUnionRoot, Family: FamilyRunType, Level: LevelRuntimeError, Scope: ScopeRoot, Title: "RunType root-position error",
			Headline: "`removeUnknownKeys` does not support unions with object members: the emitter cannot know which declared shape to rebuild at runtime.",
			Summary:  "`removeUnknownKeys` rebuilds a value from its declared shape, and for a union of objects it cannot tell which member the value matches, so the function throws rather than keep unknown keys. Narrow the value first and use one `createRemoveUnknownKeysFn<Member>()` per member, or turn the union into one object with optional properties.",
			Fix: `const removeCatKeys = createRemoveUnknownKeysFn<Cat>();
const removeDogKeys = createRemoveUnknownKeysFn<Dog>();`,
			Example: `import {createRemoveUnknownKeysFn} from '@mionjs/run-types';
type Pet = {kind: 'cat'; meows: boolean} | {kind: 'dog'; barks: boolean};
export const removePetKeys = createRemoveUnknownKeysFn<Pet>();`,
		},
	} {
		Register(definition)
	}

	// An internal bug: fail the build, or the `utl.getRT(key).fn` prologue of the unrendered primitive crashes at runtime.
	Register(Definition{Code: CodeCompositeMissingPrimitive, Family: FamilyRunType, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "JSON composite references an unrendered primitive entry",
		Headline: "Internal error: JSON composite `{composite}` references primitive entry `{primitive}` (type `{type}`) which was never rendered; please file an issue.",
		Summary:  "The JSON code mion generated for your type points to a piece that was never built, so it would crash when called and a production build stops. This is a bug in mion, not in your code: report it with the type and the call site named in the error.",
	})
	// An internal bug too: without it the entry was skipped and the site ran the family identity (validate accepted everything).
	Register(Definition{Code: CodeUnsupportedLeafNoCode, Family: FamilyRunType, Level: LevelRuntimeError, Scope: ScopeGraph, Title: "A type function cannot compile a kind that has no diagnostic code",
		Headline: "Internal error: type `{type}` cannot be compiled here and has no diagnostic, so the function always throws; please file an issue.",
		Summary:  "The code mion generated for your type meets a kind of value it cannot handle and has no message for, so the function always throws. This is a bug in mion, not in your code: report it with the type and the call site named in the error.",
	})

	// Child-position drops are LevelInfo: leaving out what is not data is the documented contract.
	// unknown-keys-function-shared / unknown-keys-non-data-shared stay LevelWarning: a clone that SHARES a value with the original is a surprise, not a drop.
	// The `-union-member-dropped` codes are the DataOnly union-member drop (`Date | symbol` acts as `Date`);
	// validationErrors has none, its union arm delegates to validate so the user sees validate-union-member-dropped.
	// The `-non-data-property-dropped` codes are the DataOnly PROPERTY drop: a property whose VALUE is directly non-data
	// (function-valued props keep using `-function-property-dropped`) is dropped, so `{a: symbol}` acts as `{}`. A value that
	// is only STRUCTURALLY unserializable (symbol[], Map<string, symbol>) is NOT dropped, since
	// DataOnly keeps it as `never[]`, and the family throws at root instead.
	for _, definition := range []Definition{
		{Code: CodeVLFunctionPropDropped, Family: FamilyRunType, Level: LevelInfo, Scope: ScopeGraph, Title: "RunType child-position member dropped",
			Headline: "Property `{property}` is a function: `validate` does not handle function values, so this property is silently not validated.",
			Summary:  "A function holds no data, so validation skips the property and still checks the others. You see this for an optional function property or one in a union member. A required one reports `validate-method-dropped`. Remove the property, or replace it with the data it would produce.",
			Example: `import {createValidateFn} from '@mionjs/run-types';
interface Button { label: string; onClick?: () => void }
export const isButton = createValidateFn<Button>();`,
			NestedExample: `import {createValidateFn} from '@mionjs/run-types';
interface Toolbar { button: { label: string; onClick?: () => void } }
export const isToolbar = createValidateFn<Toolbar>();`,
		},
		{Code: CodeVLMethodDropped, Family: FamilyRunType, Level: LevelInfo, Scope: ScopeGraph, Title: "RunType child-position member dropped",
			Headline: "Method `{method}` is silently not validated by `validate`: methods aren't data.",
			Summary:  "A method like `greet(): string`, or a function property like `onClick: () => void`, is not data. Validation skips it and still checks the rest of the type. To check its result, store that result in a data property.",
			Example: `import {createValidateFn} from '@mionjs/run-types';
interface User { name: string; greet(): string; }
export const isUser = createValidateFn<User>();`,
			NestedExample: `import {createValidateFn} from '@mionjs/run-types';
interface Account { user: { name: string; greet(): string } }
export const isAccount = createValidateFn<Account>();`,
		},
		{Code: CodeVLStaticDropped, Family: FamilyRunType, Level: LevelInfo, Scope: ScopeGraph, Title: "RunType child-position member dropped",
			Headline: "Static member `{member}` is silently not validated by `validate`: statics aren't part of instance data.",
			Summary:  "Static members belong to the class, not its instances, and validation checks instance data only. The rest of the class is still checked.",
			Example: `import {createValidateFn} from '@mionjs/run-types';
class Config { static version = 1; name = ''; }
export const isConfig = createValidateFn<Config>();`,
			NestedExample: `import {createValidateFn} from '@mionjs/run-types';
class Config { static version = 1; name = ''; }
interface App { config: Config }
export const isApp = createValidateFn<App>();`,
		},
		{Code: CodeVLSymbolKeyedDropped, Family: FamilyRunType, Level: LevelInfo, Scope: ScopeGraph, Title: "RunType child-position member dropped",
			Headline: "Symbol-keyed property `{property}` is silently not validated by `validate`: symbol keys aren't JSON-representable.",
			Example: `import {createValidateFn} from '@mionjs/run-types';
const tag = Symbol('tag');
interface Item { id: string; [tag]: string }
export const isItem = createValidateFn<Item>();`,
			NestedExample: `import {createValidateFn} from '@mionjs/run-types';
const tag = Symbol('tag');
interface Item { id: string; [tag]: string }
interface Order { item: Item }
export const isOrder = createValidateFn<Order>();`,
			Summary: "JSON has string keys only, so validation skips a symbol-keyed property. Use a string key if the property holds real data.",
			Fix: `interface Item {
  id: string; // instead of [Symbol.for('id')]: string
}`,
		},
		{Code: CodeVLUnionMemberDropped, Family: FamilyRunType, Level: LevelInfo, Scope: ScopeGraph, Title: "RunType child-position member dropped",
			Headline: "Union member(s) of type `{type}` can't be represented as data: `validate` drops them, so the union is validated as its remaining members.",
			Summary:  "Validation drops union members with no data form (a symbol, a function, a `Promise`, or a built-in class that is not data), so `Date | symbol` validates as `Date`. If no member has a data form, the whole type fails with `validate-non-data-root`, `validate-symbol-root` or `validate-function-root`.",
			Example: `import {createValidateFn} from '@mionjs/run-types';
export const isData = createValidateFn<Date | symbol>();`,
			NestedExample: `import {createValidateFn} from '@mionjs/run-types';
interface Event { at: Date | symbol }
export const isEvent = createValidateFn<Event>();`,
		},
		{Code: CodeVLNonSerializablePropDrop, Family: FamilyRunType, Level: LevelInfo, Scope: ScopeGraph, Title: "RunType child-position member dropped",
			Headline: "Property `{property}` has a non-serialisable value type (symbol, Promise, or a non-serialisable built-in): `validate` drops it, so this property is silently not validated.",
			Summary:  "A property holding a symbol, a `Promise` or a built-in class with no data form (a typed array, `ArrayBuffer`, `URLSearchParams` and similar) is skipped, so `{ id: symbol }` validates as `{}`. The other properties are still checked. A value that holds one inside, like `symbol[]` or `Map<string, symbol>`, cannot be dropped, so the whole type fails with the matching error, such as `validate-symbol-root`.",
			Example: `import {createValidateFn} from '@mionjs/run-types';
interface Box { id: symbol; name: string; }
export const isBox = createValidateFn<Box>();`,
			NestedExample: `import {createValidateFn} from '@mionjs/run-types';
interface Shelf { box: { id: symbol; name: string } }
export const isShelf = createValidateFn<Shelf>();`,
		},
		{Code: CodeVEFunctionPropDropped, Family: FamilyRunType, Level: LevelInfo, Scope: ScopeGraph, Title: "RunType child-position member dropped",
			Headline: "Property `{property}` is a function: `validationErrors` does not handle function values, so this property is silently not checked.",
			Summary:  "Same as `validate-function-property-dropped`, for `createGetValidationErrorsFn`. A function holds no data, so the property is left out of the error report and the others are still checked. You see this for an optional function property or one in a union member. A required one reports `validation-errors-method-dropped`. Remove the property, or replace it with the data it would produce.",
			Example: `import {createGetValidationErrorsFn} from '@mionjs/run-types';
interface Button { label: string; onClick?: () => void }
export const getButtonErrors = createGetValidationErrorsFn<Button>();`,
			NestedExample: `import {createGetValidationErrorsFn} from '@mionjs/run-types';
interface Toolbar { button: { label: string; onClick?: () => void } }
export const getToolbarErrors = createGetValidationErrorsFn<Toolbar>();`,
		},
		{Code: CodeVEMethodDropped, Family: FamilyRunType, Level: LevelInfo, Scope: ScopeGraph, Title: "RunType child-position member dropped",
			Headline: "Method `{method}` is silently not checked by `validationErrors`: methods aren't data.",
			Summary:  "Same as `validate-method-dropped`, for `createGetValidationErrorsFn`. A method like `greet(): string`, or a function property like `onClick: () => void`, is not data, so it is left out of the error report. To check its result, store that result in a data property.",
			Example: `import {createGetValidationErrorsFn} from '@mionjs/run-types';
interface User { name: string; greet(): string; }
export const errorsOf = createGetValidationErrorsFn<User>();`,
			NestedExample: `import {createGetValidationErrorsFn} from '@mionjs/run-types';
interface Account { user: { name: string; greet(): string } }
export const errorsOf = createGetValidationErrorsFn<Account>();`,
		},
		{Code: CodeVEStaticDropped, Family: FamilyRunType, Level: LevelInfo, Scope: ScopeGraph, Title: "RunType child-position member dropped",
			Headline: "Static member `{member}` is silently not checked by `validationErrors`: statics aren't part of instance data.",
			Summary:  "Same as `validate-static-dropped`, for `createGetValidationErrorsFn`. Static members belong to the class, not its instances, so they are left out of the error report.",
			Example: `import {createGetValidationErrorsFn} from '@mionjs/run-types';
class Config { static version = 1; name = ''; }
export const errorsOf = createGetValidationErrorsFn<Config>();`,
			NestedExample: `import {createGetValidationErrorsFn} from '@mionjs/run-types';
class Config { static version = 1; name = ''; }
interface App { config: Config }
export const errorsOf = createGetValidationErrorsFn<App>();`,
		},
		{Code: CodeVESymbolKeyedDropped, Family: FamilyRunType, Level: LevelInfo, Scope: ScopeGraph, Title: "RunType child-position member dropped",
			// No Example, same reason as validate-symbol-key-dropped: the slot is not emitted today.
			Headline: "Symbol-keyed property `{property}` is silently not checked by `validationErrors`: symbol keys aren't JSON-representable.",
			Summary:  "Same as `validate-symbol-key-dropped`, for `createGetValidationErrorsFn`. JSON has string keys only, so a symbol-keyed property is left out of the error report. Use a string key if the property holds real data.",
			Fix: `interface Item {
  id: string; // instead of [Symbol.for('id')]: string
}`,
		},
		{Code: CodeVENonSerializablePropDrop, Family: FamilyRunType, Level: LevelInfo, Scope: ScopeGraph, Title: "RunType child-position member dropped",
			Headline: "Property `{property}` has a non-serialisable value type (symbol, Promise, or a non-serialisable built-in): `validationErrors` drops it, so this property is silently not checked.",
			Summary:  "Same as `validate-non-data-property-dropped`, for `createGetValidationErrorsFn`. A property holding a symbol, a `Promise` or a built-in class with no data form (a typed array, `ArrayBuffer`, `URLSearchParams` and similar) is left out of the error report, and the other properties are still checked. A value that holds one inside, like `symbol[]` or `Map<string, symbol>`, cannot be dropped, so the whole type fails with the matching error, such as `validation-errors-symbol-root`.",
			Example: `import {createGetValidationErrorsFn} from '@mionjs/run-types';
interface Box { id: symbol; name: string; }
export const errorsOf = createGetValidationErrorsFn<Box>();`,
			NestedExample: `import {createGetValidationErrorsFn} from '@mionjs/run-types';
interface Shelf { box: { id: symbol; name: string } }
export const errorsOf = createGetValidationErrorsFn<Shelf>();`,
		},
		{Code: CodePJFunctionPropDropped, Family: FamilyRunType, Level: LevelInfo, Scope: ScopeGraph, Title: "RunType child-position member dropped",
			Headline: "Property `{property}` is a function: the JSON encoder does not handle function values, so this property is silently not encoded.",
			Summary:  "A function has no JSON form, so the encoder leaves this property out and encodes the rest as usual. This is expected: only data is encoded.",
		},
		{Code: CodePJMethodDropped, Family: FamilyRunType, Level: LevelInfo, Scope: ScopeGraph, Title: "RunType child-position member dropped",
			Headline: "Method `{method}` is silently not encoded: methods aren't data.",
			Summary:  "Methods are not data, so the encoder leaves them out and still encodes the rest of the type. To encode a method's result, store it in a data property.",
		},
		{Code: CodePJStaticDropped, Family: FamilyRunType, Level: LevelInfo, Scope: ScopeGraph, Title: "RunType child-position member dropped",
			Headline: "Static member `{member}` is silently not encoded: statics aren't part of instance data.",
			Summary:  "Static members belong to the class, not its instances, so the encoder leaves them out.",
		},
		{Code: CodePJSymbolKeyedDropped, Family: FamilyRunType, Level: LevelInfo, Scope: ScopeGraph, Title: "RunType child-position member dropped",
			Headline: "Symbol-keyed property `{property}` is silently not encoded: symbol keys aren't JSON-representable.",
			Summary:  "JSON only has string keys, so the encoder leaves out properties keyed by a symbol. Use a string key if you need the value encoded.",
			Fix: `interface Item {
  id: string; // not [Symbol.for('id')]: string
}`,
		},
		{Code: CodePJUnionMemberDropped, Family: FamilyRunType, Level: LevelInfo, Scope: ScopeGraph, Title: "RunType child-position member dropped",
			Headline: "Union member(s) of type `{type}` can't be represented as data: the JSON encoder drops them, so the union is encoded as its remaining members.",
			Summary:  "Symbols, functions, `never`, `Promise`, `RegExp` and standard library classes such as `URLSearchParams` or typed arrays have no JSON form, so the encoder drops them from the union: `Date | symbol` encodes as `Date`. If every member is dropped, you get the error for the whole type instead (such as json-prepare-symbol-root), and the encoder always fails.",
		},
		{Code: CodePJNonSerializablePropDrop, Family: FamilyRunType, Level: LevelInfo, Scope: ScopeGraph, Title: "RunType child-position member dropped",
			Headline: "Property `{property}` has a non-serialisable value type (symbol, Promise, or a non-serialisable built-in): the JSON encoder drops it, so this property is silently not encoded.",
			Summary:  "A property holding a symbol, `never`, a `Promise`, a `RegExp` or a standard library class such as a typed array, `ArrayBuffer`, `URLSearchParams` or `Intl.DateTimeFormat` has no JSON form, so the encoder drops it and leaves the rest of the object alone: `{a: symbol}` encodes as `{}`. A property holding such a value inside an array or a Map, like `symbol[]` or `Map<string, symbol>`, cannot be dropped: you get an error instead (such as json-prepare-symbol-root), and the encoder always fails.",
		},
		{Code: CodePJSFunctionPropDropped, Family: FamilyRunType, Level: LevelInfo, Scope: ScopeGraph, Title: "RunType child-position member dropped",
			Headline: "Property `{property}` is a function: the JSON encoder does not handle function values, so this property is silently not encoded.",
			Summary:  "A function has no JSON form, so the encoder leaves this property out and encodes the rest as usual. This is expected: only data is encoded.",
		},
		{Code: CodePJSMethodDropped, Family: FamilyRunType, Level: LevelInfo, Scope: ScopeGraph, Title: "RunType child-position member dropped",
			Headline: "Method `{method}` is silently not encoded: methods aren't data.",
			Summary:  "Methods are not data, so the encoder leaves them out and still encodes the rest of the type. To encode a method's result, store it in a data property.",
		},
		{Code: CodePJSStaticDropped, Family: FamilyRunType, Level: LevelInfo, Scope: ScopeGraph, Title: "RunType child-position member dropped",
			Headline: "Static member `{member}` is silently not encoded: statics aren't part of instance data.",
			Summary:  "Static members belong to the class, not its instances, so the encoder leaves them out.",
		},
		{Code: CodePJSSymbolKeyedDropped, Family: FamilyRunType, Level: LevelInfo, Scope: ScopeGraph, Title: "RunType child-position member dropped",
			Headline: "Symbol-keyed property `{property}` is silently not encoded: symbol keys aren't JSON-representable.",
			Summary:  "JSON only has string keys, so the encoder leaves out properties keyed by a symbol. Use a string key if you need the value encoded.",
			Fix: `interface Item {
  id: string; // not [Symbol.for('id')]: string
}`,
		},
		{Code: CodePJSUnionMemberDropped, Family: FamilyRunType, Level: LevelInfo, Scope: ScopeGraph, Title: "RunType child-position member dropped",
			Headline: "Union member(s) of type `{type}` can't be represented as data: the JSON encoder drops them, so the union is encoded as its remaining members.",
			Summary:  "Symbols, functions, `never`, `Promise`, `RegExp` and standard library classes such as `URLSearchParams` or typed arrays have no JSON form, so the encoder drops them from the union: `Date | symbol` encodes as `Date`. If every member is dropped, you get the error for the whole type instead (such as json-prepare-clone-symbol-root), and the encoder always fails.",
		},
		{Code: CodePJSNonSerializablePropDrop, Family: FamilyRunType, Level: LevelInfo, Scope: ScopeGraph, Title: "RunType child-position member dropped",
			Headline: "Property `{property}` has a non-serialisable value type (symbol, Promise, or a non-serialisable built-in): the JSON encoder drops it, so this property is silently not encoded.",
			Summary:  "A property holding a symbol, `never`, a `Promise`, a `RegExp` or a standard library class such as a typed array, `ArrayBuffer`, `URLSearchParams` or `Intl.DateTimeFormat` has no JSON form, so the encoder drops it and leaves the rest of the object alone: `{a: symbol}` encodes as `{}`. A property holding such a value inside an array or a Map, like `symbol[]` or `Map<string, symbol>`, cannot be dropped: you get an error instead (such as json-prepare-clone-symbol-root), and the encoder always fails.",
		},
		{Code: CodeRJFunctionPropDropped, Family: FamilyRunType, Level: LevelInfo, Scope: ScopeGraph, Title: "RunType child-position member dropped",
			Headline: "Property `{property}` is a function: the JSON decoder does not handle function values, so this property is silently not decoded.",
			Summary:  "A function has no JSON form, so the decoder leaves this property out and decodes the rest as usual. This is expected: only data is decoded.",
		},
		{Code: CodeRJMethodDropped, Family: FamilyRunType, Level: LevelInfo, Scope: ScopeGraph, Title: "RunType child-position member dropped",
			Headline: "Method `{method}` is silently not decoded: methods aren't data.",
			Summary:  "Methods are not data, so the decoder leaves them out and still decodes the rest of the type. To decode a method's result, store it in a data property.",
		},
		{Code: CodeRJStaticDropped, Family: FamilyRunType, Level: LevelInfo, Scope: ScopeGraph, Title: "RunType child-position member dropped",
			Headline: "Static member `{member}` is silently not decoded: statics aren't part of instance data.",
			Summary:  "Static members belong to the class, not its instances, so the decoder leaves them out.",
		},
		{Code: CodeRJSymbolKeyedDropped, Family: FamilyRunType, Level: LevelInfo, Scope: ScopeGraph, Title: "RunType child-position member dropped",
			Headline: "Symbol-keyed property `{property}` is silently not decoded: symbol keys aren't JSON-representable.",
			Summary:  "JSON only has string keys, so the decoder leaves out properties keyed by a symbol. Use a string key if you need the value decoded.",
			Fix: `interface Item {
  id: string; // not [Symbol.for('id')]: string
}`,
		},
		{Code: CodeRJUnionMemberDropped, Family: FamilyRunType, Level: LevelInfo, Scope: ScopeGraph, Title: "RunType child-position member dropped",
			Headline: "Union member(s) of type `{type}` can't be represented as data: the JSON decoder drops them, so the union is decoded as its remaining members.",
			Summary:  "Symbols, functions, `never`, `Promise`, `RegExp` and standard library classes such as `URLSearchParams` or typed arrays have no JSON form, so the decoder drops them from the union: `Date | symbol` decodes as `Date`. If every member is dropped, you get the error for the whole type instead (such as json-restore-symbol-root), and the decoder always fails.",
		},
		{Code: CodeRJNonSerializablePropDrop, Family: FamilyRunType, Level: LevelInfo, Scope: ScopeGraph, Title: "RunType child-position member dropped",
			Headline: "Property `{property}` has a non-serialisable value type (symbol, Promise, or a non-serialisable built-in): the JSON decoder drops it, so this property is silently not decoded.",
			Summary:  "A property holding a symbol, `never`, a `Promise`, a `RegExp` or a standard library class such as a typed array, `ArrayBuffer`, `URLSearchParams` or `Intl.DateTimeFormat` has no JSON form, so the decoder drops it and leaves the rest of the object alone: `{a: symbol}` decodes as `{}`. A property holding such a value inside an array or a Map, like `symbol[]` or `Map<string, symbol>`, cannot be dropped: you get an error instead (such as json-restore-symbol-root), and the decoder always fails.",
		},
		{Code: CodeRUKMethodDropped, Family: FamilyRunType, Level: LevelInfo, Scope: ScopeGraph, Title: "RunType child-position member dropped",
			Headline: "Method or accessor `{member}` is not copied: the copy keeps the input's prototype, so it still works.",
			Summary:  "A class copy keeps the input's prototype, so methods and get / set accessors still work without being copied. A function stored in a field (`onChange = () => ...`) is its own value and is shared instead (unknown-keys-function-shared). The constructor does not run on the copy.",
			Example: `import {createRemoveUnknownKeysFn} from '@mionjs/run-types';
export class User { name = ''; greet(): string { return this.name; } }
export const removeUserKeys = createRemoveUnknownKeysFn<User>();`,
			NestedExample: `import {createRemoveUnknownKeysFn} from '@mionjs/run-types';
export class User { name = ''; greet(): string { return this.name; } }
export const removeAccountKeys = createRemoveUnknownKeysFn<{user: User}>();`,
		},
		{Code: CodeRUKStaticDropped, Family: FamilyRunType, Level: LevelInfo, Scope: ScopeGraph, Title: "RunType child-position member dropped",
			Headline: "Static member `{member}` is not part of instance data: `removeUnknownKeys` skips it.",
			Summary:  "Static members belong to the class, not its instances, so the copy leaves them out.",
			Example: `import {createRemoveUnknownKeysFn} from '@mionjs/run-types';
export class Config { static version = 1; name = ''; }
export const removeConfigKeys = createRemoveUnknownKeysFn<Config>();`,
			NestedExample: `import {createRemoveUnknownKeysFn} from '@mionjs/run-types';
export class Config { static version = 1; name = ''; }
export const removeAppKeys = createRemoveUnknownKeysFn<{config: Config}>();`,
		},
		{Code: CodeRUKSharedAsAsked, Family: FamilyRunType, Level: LevelInfo, Scope: ScopeGraph, Title: "RunType child-position member dropped",
			Headline: "The value in {target} is shared with the input, as `sharedValues: 'share'` asks.",
			Summary:  "You passed `sharedValues: 'share'`, so a function or a value the copy cannot rebuild is shared with the input, as asked. This note is hidden unless you show all levels.",
			Example: `import {createRemoveUnknownKeysFn} from '@mionjs/run-types';
interface Button { label: string; onClick: () => void }
export const removeButtonKeys = createRemoveUnknownKeysFn<Button>(undefined, {sharedValues: 'share'});`,
			NestedExample: `import {createRemoveUnknownKeysFn} from '@mionjs/run-types';
interface Toolbar { button: { label: string; onClick: () => void } }
export const removeToolbarKeys = createRemoveUnknownKeysFn<Toolbar>(undefined, {sharedValues: 'share'});`,
		},
	} {
		Register(definition)
	}
	for _, definition := range []Definition{
		{Code: CodeRUKFunctionPropDropped, Family: FamilyRunType, Level: LevelWarning, Scope: ScopeGraph, Title: "RunType child-position member dropped",
			Headline: "The function in {target} cannot be copied: the copy shares it with the input.",
			Summary:  "`removeUnknownKeys` never removes a declared key. A function cannot be copied, so the copy points to the same function as the input. Class methods stay on the prototype instead (unknown-keys-method-not-copied). A function type itself is shared the same way. Pass `sharedValues: 'share'` to say this is fine, or `'refuse'` to make it an error.",
			Example: `import {createRemoveUnknownKeysFn} from '@mionjs/run-types';
interface Button { label: string; onClick: () => void }
export const removeButtonKeys = createRemoveUnknownKeysFn<Button>();`,
			NestedExample: `import {createRemoveUnknownKeysFn} from '@mionjs/run-types';
interface Toolbar { button: { label: string; onClick: () => void } }
export const removeToolbarKeys = createRemoveUnknownKeysFn<Toolbar>();`,
		},
		{Code: CodeRUKNonSerializablePropDrop, Family: FamilyRunType, Level: LevelWarning, Scope: ScopeGraph, Title: "RunType child-position member dropped",
			Headline: "The value in {target} cannot be copied (a Promise, a RegExp or a built-in that is not data): the copy shares it with the input.",
			Summary:  "`removeUnknownKeys` never removes a declared property. A value it cannot copy, like a `Promise`, a `RegExp` or a built-in like `URLSearchParams`, is shared with the input, so a change through it shows on both. Pass `sharedValues: 'share'` to say this is fine, `'refuse'` to make it an error, or register `overrideRemoveUnknownKeys<T>()` to copy it yourself.",
			Example: `import {createRemoveUnknownKeysFn} from '@mionjs/run-types';
interface Link { title: string; pattern: RegExp }
export const removeLinkKeys = createRemoveUnknownKeysFn<Link>();`,
			NestedExample: `import {createRemoveUnknownKeysFn} from '@mionjs/run-types';
interface Page { link: { title: string; pattern: RegExp } }
export const removePageKeys = createRemoveUnknownKeysFn<Page>();`,
		},
	} {
		Register(definition)
	}

	// The removeUnknownKeys refusals keep one code at any depth: a nested trigger makes the whole function throw too.
	for _, definition := range []Definition{
		{Code: CodeRUKSymbolKeyedMember, Family: FamilyRunType, Level: LevelRuntimeError, Scope: ScopeGraph, Title: "removeUnknownKeys refuses a member it cannot copy",
			Headline: "Symbol-keyed {target} cannot be copied: the generated code cannot name your symbol, so the function always throws.",
			Summary:  "The copy is typed as your type, so it must have the symbol-keyed property too. The generated code cannot name a symbol from your code, and copying every symbol on the input would keep undeclared ones, so the function always throws. Use a string key, or a `[key: symbol]: V` index signature, whose keys are all copied. Symbol-keyed class methods are fine: they stay on the prototype.",
			Fix:      "interface Item { id: string; tag: string }",
			Example: `import {createRemoveUnknownKeysFn} from '@mionjs/run-types';
const tag = Symbol('tag');
interface Item { id: string; [tag]: string }
export const removeItemKeys = createRemoveUnknownKeysFn<Item>();`,
			NestedExample: `import {createRemoveUnknownKeysFn} from '@mionjs/run-types';
const tag = Symbol('tag');
interface Order { item: { id: string; [tag]: string } }
export const removeOrderKeys = createRemoveUnknownKeysFn<Order>();`,
		},
		{Code: CodeRUKPrivateFields, Family: FamilyRunType, Level: LevelRuntimeError, Scope: ScopeGraph, Title: "removeUnknownKeys refuses a member it cannot copy",
			Headline: "The {target} has `#private` fields, which only its constructor can create: a copy would break its methods, so the function always throws.",
			Summary:  "A class copy keeps the input's prototype but never runs the constructor, and only the constructor can create `#private` fields. A method reading one would throw on the copy, so the function always throws instead. Use TypeScript `private` instead of `#`, or register `overrideRemoveUnknownKeys<T>()` to build the copy yourself.",
			Fix:      `class Counter { private count = 0; }`,
			Example: `import {createRemoveUnknownKeysFn} from '@mionjs/run-types';
export class Counter { #count = 0; label = ''; }
export const removeCounterKeys = createRemoveUnknownKeysFn<Counter>();`,
			NestedExample: `import {createRemoveUnknownKeysFn} from '@mionjs/run-types';
export class Counter { #count = 0; label = ''; }
export const removePageKeys = createRemoveUnknownKeysFn<{counter: Counter}>();`,
		},
		{Code: CodeRUKSharedRefused, Family: FamilyRunType, Level: LevelRuntimeError, Scope: ScopeGraph, Title: "removeUnknownKeys refuses a member it cannot copy",
			Headline: "The value in {target} can only be shared with the input and `sharedValues: 'refuse'` is set, so the function always throws.",
			Summary:  "With `sharedValues: 'refuse'`, a value the copy cannot rebuild (a function, a `Promise`, a `RegExp` or a built-in like `URLSearchParams`) makes the function always throw instead of sharing it with the input. Remove the option to share it with a warning, or change the type.",
			Example: `import {createRemoveUnknownKeysFn} from '@mionjs/run-types';
interface Button { label: string; onClick: () => void }
export const removeButtonKeys = createRemoveUnknownKeysFn<Button>(undefined, {sharedValues: 'refuse'});`,
			NestedExample: `import {createRemoveUnknownKeysFn} from '@mionjs/run-types';
interface Toolbar { button: { label: string; onClick: () => void } }
export const removeToolbarKeys = createRemoveUnknownKeysFn<Toolbar>(undefined, {sharedValues: 'refuse'});`,
		},
	} {
		Register(definition)
	}

	// data-proto-property-dropped is the same child-position drop keyed on the NAME, and one code serves every family
	// because a member named `__proto__` cannot carry data on any road.
	Register(Definition{Code: CodeUnsafePropertyName, Family: FamilyRunType, Level: LevelWarning, Scope: ScopeGraph, Title: "RunType member named `__proto__` dropped",
		Headline: "Property `{property}` can never be data and is dropped: the rest of the type still works.",
		Summary:  "A property named `__proto__` is left out of every generated function, anywhere in the type (nested objects, array items and Map values too). Setting that key changes the object's prototype instead of storing a value, so it never exists at runtime even though TypeScript accepts it. `prototype` and `constructor` are normal names and are kept. Rename the property to keep the data.",
		Fix:      `interface Settings { ok: number; parent: string }`,
		Example: `import {createValidateFn} from '@mionjs/run-types';
interface Settings { ok: number; __proto__: string }
export const isSettings = createValidateFn<Settings>();`,
		NestedExample: `import {createValidateFn} from '@mionjs/run-types';
interface Outer { inner: Map<string, { ok: number; __proto__: string }> }
export const isOuter = createValidateFn<Outer>();`,
	})

	// Root any/unknown noop validators are LevelInfo: the author wrote `any`, so accepting everything was asked for.
	// A type that BECAME any through a failed name, import or lib is the RuntimeError (marker-any-from-unresolved-*, marker-temporal-lib-missing, config-lib-missing-base).
	// The user is told because no schema is enforced, not because it is wrong.
	Register(Definition{Code: CodeVERootAnyUnknown, Family: FamilyRunType, Level: LevelInfo, Scope: ScopeRoot, Title: "validationErrors root any/unknown: identity fallback",
		Headline: "`validationErrors` on `any` / `unknown` always returns an empty error array: nothing is checked.",
		Summary:  "Same as `validate-any-accepts-all`, for `createGetValidationErrorsFn`. `any` and `unknown` have nothing to check, so the error list is always empty. Narrow the type to the shape you expect.",
		Fix:      "const errorsOf = createGetValidationErrorsFn<User>(); // instead of <unknown>",
		Example: `import {createGetValidationErrorsFn} from '@mionjs/run-types';
export const errorsOf = createGetValidationErrorsFn<unknown>();`,
	})
	Register(Definition{Code: CodeVLRootAnyUnknown, Family: FamilyRunType, Level: LevelInfo, Scope: ScopeRoot, Title: "validate root any/unknown: identity fallback",
		Headline: "`validate` on `any` / `unknown` always returns true: the validator accepts every value.",
		Summary:  "`any` and `unknown` have no shape to check, so the validator accepts every value, including ones you meant to reject. Narrow the type to the shape you expect.",
		Fix:      `const isUser = createValidateFn<User>(); // instead of <unknown>`,
		Example: `import {createValidateFn} from '@mionjs/run-types';
export const isAnything = createValidateFn<unknown>();`,
	})

	// A format annotation is checked wherever it sits (ScopeGraph); the missing-runtime code is about
	// the host, not the type, hence ScopeNotSource.
	Register(Definition{Code: CodeFMTSampleMismatch, Family: FamilyRunType, Level: LevelRuntimeError, Scope: ScopeGraph, Title: "format mockSample does not match pattern",
		Headline: "TypeFormat mockSample \"{sample}\" does not match its pattern /{pattern}/; fix the sample or the pattern.",
		Summary:  "A `mockSample` does not match its `pattern` (checked with the same regex your validator uses), so mock data built from it would fail validation. Change the sample or the pattern so they agree.",
		Fix:      "type Slug = String<{pattern: {source: '^[a-z]+$'; mockSamples: ['abc', 'xyz']}}>;",
	})
	Register(Definition{Code: CodeFMTInvalidParams, Family: FamilyRunType, Level: LevelRuntimeError, Scope: ScopeGraph, Title: "invalid type-format params",
		Headline: "Invalid type-format params: {reason}",
		Summary:  "A format's settings break one of its rules, so its validator would be wrong or would throw. The message names the rule, for example `length` used with `minLength` or `maxLength`, `maxLength` below `minLength`, more than 100 `allowedValues`, or a `pattern` that is not a valid JavaScript regex. A string format takes only one of `pattern`, `allowedChars`, `disallowedChars`, `allowedValues` or `disallowedValues`, and `disallowedChars` or `disallowedValues` need `mockSamples` or a `generator`. Change the settings the message names.",
	})
	Register(Definition{Code: CodeFMTSampleBounds, Family: FamilyRunType, Level: LevelRuntimeError, Scope: ScopeGraph, Title: "format mockSample violates a sibling constraint",
		Headline: "TypeFormat mockSample violates a sibling constraint: {reason}",
		Summary:  "A `mockSample` breaks another setting of the same format: `length`, `minLength`, `maxLength`, `allowedChars`, `disallowedChars` or `disallowedValues`. Mock data would then be invalid, or `createMockDataFn` would drop every sample and throw. Lengths count code points, the same as the validator: `💩` is one. Change the sample or relax the setting.",
		Fix:      "type B = String<{minLength: 1; pattern: {source: '^b+$'; mockSamples: ['b', 'bb']}}>;",
	})
	Register(Definition{Code: CodeFMTMissingJsRuntime, Family: FamilyRunType, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "format pattern checks need a JS runtime and none was found",
		Headline: "TypeFormat pattern /{pattern}/ cannot be checked: {reason}; pattern validation requires a JavaScript runtime; install one or pass --js-runtime.",
		Summary:  "mion checks each `pattern` on a real JavaScript engine (that it compiles and that its `mockSamples` match), and no JavaScript runtime could be started. Install node or bun (both found on your PATH), or point `--js-runtime` or `MION_JS_RUNTIME` at another runtime such as deno. Projects with no patterns never need this.",
	})
	Register(Definition{Code: CodeFMTSampleGenFailed, Family: FamilyRunType, Level: LevelRuntimeError, Scope: ScopeGraph, Title: "format pattern mockSamples could not be auto-generated",
		Headline: "Cannot auto-generate mockSamples for pattern /{pattern}/: {reason}; declare mockSamples explicitly.",
		Summary:  "A `pattern` with no `mockSamples` gets samples generated at build time, and none came out. Either generation is off (`patternSampleCount` is 0), the pattern uses something the generator cannot handle (usually a lookaround), or all `patternSampleCount` times `patternSampleRetries` tries failed the pattern or its length limits. Declare `mockSamples` yourself (they are still checked against the pattern), or set `patternSampleCount` above 0 and raise `patternSampleRetries` for a heavily constrained pattern.",
		Fix:      "type Y = String<{pattern: {source: '(?<=x)y'; mockSamples: ['xy']}}>;",
	})
	Register(Definition{Code: CodeFMTSampleConflict, Family: FamilyRunType, Level: LevelRuntimeError, Scope: ScopeGraph, Title: "two sites declare different mockSamples for one shared format entry",
		Headline: "Two sites share one cache entry for format `{format}` but declare different mockSamples: `{samples}` here vs `{otherSamples}` at {otherSite}. Make the pools identical, or declare one and leave the other out.",
		Summary:  "Two formats that differ only in their `mockSamples` share one validator entry, which keeps only one sample list. Which list wins would depend on the order your code is read, so the build stops. Use the same `mockSamples` in both, or declare them in one and leave them out of the other. If the two types really differ, give them a different pattern, bound or brand.",
		Fix: `type A = String<{maxLength: 5; mockSamples: ['aaa']}>;
type B = String<{maxLength: 5; mockSamples: ['aaa']}>; // same samples
// or leave them out: type B = String<{maxLength: 5}>;`,
	})
	Register(Definition{Code: CodeFMTPatternTimeout, Family: FamilyRunType, Level: LevelRuntimeError, Scope: ScopeGraph, Transient: true, Title: "format pattern evaluation timed out",
		Headline: "TypeFormat pattern /{pattern}/ could not be evaluated in time: {reason}; the build was not able to tell whether the pattern is safe.",
		Summary:  "Each `mockSample` runs through your pattern with a time limit, and this one ran out of time even on a longer retry. Either the pattern backtracks without end (nested repeats such as `(a+)+` on a long input are the usual cause), or the machine was too busy. The next build checks again, so a one-off slowdown clears by itself. If it keeps failing on an idle machine, rewrite the pattern without nested repeats, or shorten the sample it times out on.",
	})
	Register(Definition{Code: CodeFMTPatternUnsafe, Family: FamilyRunType, Level: LevelRuntimeError, Scope: ScopeGraph, Title: "format pattern can be made to backtrack exponentially",
		Headline: "TypeFormat pattern /{pattern}/ can be made to backtrack exponentially: {reason} (`{input}`); a crafted input would hang the validator.",
		Summary:  "The `pattern` can match the same text in more than one way, and JavaScript tries every way before it gives up, so a few dozen almost-matching characters can hang your validator. Make each repeat match one way only, usually by giving the repeated part a boundary the rest cannot match. If the pattern is safe and the check is wrong, add `unsafePattern: true` to the pattern.",
		Fix: `type Words = String<{pattern: {source: '^\\w+(?:\\s\\w+)*$'}}>;
// only if the check is wrong:
type Safe = String<{pattern: {source: '...'; unsafePattern: true}}>;`,
	})
	Register(Definition{Code: CodeFMTPatternUnreadable, Family: FamilyRunType, Level: LevelRuntimeError, Scope: ScopeGraph, Title: "format pattern is a value the build cannot read",
		Headline: "TypeFormat pattern `{pattern}` is a value the build cannot read, so the validator would not check it.",
		Summary:  "The build reads a `pattern` from its type. A RegExp value, or a const typed as plain `FormatPattern`, keeps no source in its type, and a `.d.ts` keeps only the type. The validator would then not check the pattern at all. Use a `registerFormatPattern` const without a type annotation, or write the source as a literal.",
		Fix: `const sku = registerFormatPattern({source: '^[A-Z]{3}-[0-9]{4}$'});
type Sku = String<{pattern: typeof sku}>;
// or
type Sku = String<{pattern: {source: '^[A-Z]{3}-[0-9]{4}$'}}>;`,
		Example: `import {createValidateFn} from '@mionjs/run-types';
import * as TF from '@mionjs/run-types/formats';
declare const sku: {readonly source: string};
export const isSku = createValidateFn<TF.String<{pattern: typeof sku}>>();`,
		NestedExample: `import {createValidateFn} from '@mionjs/run-types';
import * as TF from '@mionjs/run-types/formats';
declare const sku: {readonly source: string};
export const isOrder = createValidateFn<{item: {sku: TF.String<{pattern: typeof sku}>}}>();`,
	})
	Register(Definition{Code: CodeFMTGeneratorInvalid, Family: FamilyRunType, Level: LevelRuntimeError, Scope: ScopeGraph, Title: "mock generator cannot produce a value the format accepts",
		Headline: "TypeFormat mock generator `{generator}` cannot mock this format: {reason}",
		Summary:  "A `generator` picks realistic mock values, so it must be one generator name and not sit next to `allowedValues`, `contentMediaType` or `isRegex`, which already decide the value or that no generated value meets (beside `mockSamples` the types refuse it). The mock fits each value to the format: it pads or cuts it to the length limits and replaces a char `allowedChars`, `disallowedChars` or a preset like `Alpha` rejects. So the build only fails when that leaves nothing to build from, like `length: 0` with `allowedChars`. The message names the problem.",
		Fix:      "type LastName = TF.String<{maxLength: 40; generator: 'lastName'}>;",
		Example: `import {createValidateFn} from '@mionjs/run-types';
import * as TF from '@mionjs/run-types/formats';
export const isCode = createValidateFn<TF.String<{allowedValues: {val: ['Lee']}; generator: 'lastName'}>>();`,
		NestedExample: `import {createValidateFn} from '@mionjs/run-types';
import * as TF from '@mionjs/run-types/formats';
export const isUser = createValidateFn<{user: {name: TF.String<{allowedValues: {val: ['Lee']}; generator: 'lastName'}>}}>();`,
	})
}
