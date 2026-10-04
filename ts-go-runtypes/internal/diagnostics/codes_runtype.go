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

	// CodeFMTSampleConflict: two sites resolve to ONE cache entry (sample pools are not id-relevant)
	// but declare different mockSamples pools. The entry carries whichever interned first, so
	// reordering unrelated code can silently change the winner, and the build reports it rather than
	// pick. Declared-vs-absent is NOT a conflict (the declared pool is adopted) and generated pools
	// are deterministic per pattern. Args: [format name, the pool in use, the conflicting pool, the
	// site that interned first].
	CodeFMTSampleConflict = "format-sample-conflict"

	// CodeFMTPatternTimeout: the JS engine could not evaluate a pattern against one sample inside the
	// sidecar's budget, even on the quiet retry. Same doctrine as format-no-js-runtime: the validator would run
	// that same regex. TRANSIENT, because a saturated host blows the budget on a fine pattern, so it
	// is never persisted or memoized and the next build re-evaluates. Args: [pattern source, reason].
	CodeFMTPatternTimeout = "format-pattern-timeout"

	// CodeFMTPatternUnsafe: a `pattern` can be made to backtrack exponentially, so the emitted
	// validator is a denial-of-service hole. Found by a STATIC check (internal/regexsafety), so
	// unlike format-pattern-timeout it needs no JS engine and its verdict is deterministic and safe to cache. Escape
	// hatch when the check reads a pattern wrongly: `unsafePattern: true` on the pattern params.
	// Args: [pattern source, reason, offending sub-expression].
	CodeFMTPatternUnsafe = "format-pattern-unsafe"

	// CodeFMTPatternUnreadable: the validator would skip an unreadable `pattern`, e.g. a RegExp or a .d.ts `FormatPattern` const.
	// Args: [the pattern's type as written].
	CodeFMTPatternUnreadable = "format-pattern-unreadable"
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
	for _, code := range []string{
		CodeVLNonSerializableRoot, CodeVLSymbolRoot, CodeVLFunctionRoot,
		CodeVENonSerializableRoot, CodeVESymbolRoot, CodeVEFunctionRoot,
		CodePJNeverRoot, CodePJNonSerializableRoot, CodePJFunctionRoot, CodePJSymbolRoot,
		CodePJSNeverRoot, CodePJSNonSerializableRoot, CodePJSFunctionRoot, CodePJSSymbolRoot,
		CodeRJNeverRoot, CodeRJNonSerializableRoot, CodeRJFunctionRoot, CodeRJSymbolRoot,
		CodeRUKUnionRoot,
	} {
		register(Definition{Code: code, Family: FamilyRunType, Level: LevelRuntimeError, Scope: ScopeRoot, Title: "RunType root-position error"})
	}

	// An internal bug: fail the build, or the `utl.getRT(key).fn` prologue of the unrendered primitive crashes at runtime.
	register(Definition{Code: CodeCompositeMissingPrimitive, Family: FamilyRunType, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "JSON composite references an unrendered primitive entry"})
	// An internal bug too: without it the entry was skipped and the site ran the family identity (validate accepted everything).
	register(Definition{Code: CodeUnsupportedLeafNoCode, Family: FamilyRunType, Level: LevelRuntimeError, Scope: ScopeGraph, Title: "A type function cannot compile a kind that has no diagnostic code"})

	// Child-position drops are LevelInfo: leaving out what is not data is the documented contract.
	// unknown-keys-function-shared / unknown-keys-non-data-shared stay LevelWarning: a clone that SHARES a value with the original is a surprise, not a drop.
	// The `-union-member-dropped` codes are the DataOnly union-member drop (`Date | symbol` acts as `Date`);
	// validationErrors has none, its union arm delegates to validate so the user sees validate-union-member-dropped.
	// The `-non-data-property-dropped` codes are the DataOnly PROPERTY drop: a property whose VALUE is directly non-data
	// (function-valued props keep using `-function-property-dropped`) is dropped, so `{a: symbol}` acts as `{}`. A value that
	// is only STRUCTURALLY unserializable (symbol[], Map<string, symbol>) is NOT dropped, since
	// DataOnly keeps it as `never[]`, and the family throws at root instead.
	for _, code := range []string{
		CodeVLFunctionPropDropped, CodeVLMethodDropped, CodeVLStaticDropped, CodeVLSymbolKeyedDropped, CodeVLUnionMemberDropped, CodeVLNonSerializablePropDrop,
		CodeVEFunctionPropDropped, CodeVEMethodDropped, CodeVEStaticDropped, CodeVESymbolKeyedDropped, CodeVENonSerializablePropDrop,
		CodePJFunctionPropDropped, CodePJMethodDropped, CodePJStaticDropped, CodePJSymbolKeyedDropped, CodePJUnionMemberDropped, CodePJNonSerializablePropDrop,
		CodePJSFunctionPropDropped, CodePJSMethodDropped, CodePJSStaticDropped, CodePJSSymbolKeyedDropped, CodePJSUnionMemberDropped, CodePJSNonSerializablePropDrop,
		CodeRJFunctionPropDropped, CodeRJMethodDropped, CodeRJStaticDropped, CodeRJSymbolKeyedDropped, CodeRJUnionMemberDropped, CodeRJNonSerializablePropDrop,
		CodeRUKMethodDropped, CodeRUKStaticDropped, CodeRUKSharedAsAsked,
	} {
		register(Definition{Code: code, Family: FamilyRunType, Level: LevelInfo, Scope: ScopeGraph, Title: "RunType child-position member dropped"})
	}
	for _, code := range []string{CodeRUKFunctionPropDropped, CodeRUKNonSerializablePropDrop} {
		register(Definition{Code: code, Family: FamilyRunType, Level: LevelWarning, Scope: ScopeGraph, Title: "RunType child-position member dropped"})
	}

	// The removeUnknownKeys refusals keep one code at any depth: a nested trigger makes the whole function throw too.
	for _, code := range []string{CodeRUKSymbolKeyedMember, CodeRUKPrivateFields, CodeRUKSharedRefused} {
		register(Definition{Code: code, Family: FamilyRunType, Level: LevelRuntimeError, Scope: ScopeGraph, Title: "removeUnknownKeys refuses a member it cannot copy"})
	}

	// data-proto-property-dropped is the same child-position drop keyed on the NAME, and one code serves every family
	// because a member named `__proto__` cannot carry data on any road.
	register(Definition{Code: CodeUnsafePropertyName, Family: FamilyRunType, Level: LevelWarning, Scope: ScopeGraph, Title: "RunType member named `__proto__` dropped"})

	// Root any/unknown noop validators are LevelInfo: the author wrote `any`, so accepting everything was asked for.
	// A type that BECAME any through a failed name, import or lib is the RuntimeError (marker-any-from-unresolved-*, marker-temporal-lib-missing, config-lib-missing-base).
	// The user is told because no schema is enforced, not because it is wrong.
	register(Definition{Code: CodeVERootAnyUnknown, Family: FamilyRunType, Level: LevelInfo, Scope: ScopeRoot, Title: "validationErrors root any/unknown: identity fallback"})
	register(Definition{Code: CodeVLRootAnyUnknown, Family: FamilyRunType, Level: LevelInfo, Scope: ScopeRoot, Title: "validate root any/unknown: identity fallback"})

	// A format annotation is checked wherever it sits (ScopeGraph); the missing-runtime code is about
	// the host, not the type, hence ScopeNotSource.
	register(Definition{Code: CodeFMTSampleMismatch, Family: FamilyRunType, Level: LevelRuntimeError, Scope: ScopeGraph, Title: "format mockSample does not match pattern"})
	register(Definition{Code: CodeFMTInvalidParams, Family: FamilyRunType, Level: LevelRuntimeError, Scope: ScopeGraph, Title: "invalid type-format params"})
	register(Definition{Code: CodeFMTSampleBounds, Family: FamilyRunType, Level: LevelRuntimeError, Scope: ScopeGraph, Title: "format mockSample violates a sibling constraint"})
	register(Definition{Code: CodeFMTMissingJsRuntime, Family: FamilyRunType, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "format pattern checks need a JS runtime and none was found"})
	register(Definition{Code: CodeFMTSampleGenFailed, Family: FamilyRunType, Level: LevelRuntimeError, Scope: ScopeGraph, Title: "format pattern mockSamples could not be auto-generated"})
	register(Definition{Code: CodeFMTSampleConflict, Family: FamilyRunType, Level: LevelRuntimeError, Scope: ScopeGraph, Title: "two sites declare different mockSamples for one shared format entry"})
	register(Definition{Code: CodeFMTPatternTimeout, Family: FamilyRunType, Level: LevelRuntimeError, Scope: ScopeGraph, Transient: true, Title: "format pattern evaluation timed out"})
	register(Definition{Code: CodeFMTPatternUnsafe, Family: FamilyRunType, Level: LevelRuntimeError, Scope: ScopeGraph, Title: "format pattern can be made to backtrack exponentially"})
	register(Definition{Code: CodeFMTPatternUnreadable, Family: FamilyRunType, Level: LevelRuntimeError, Scope: ScopeGraph, Title: "format pattern is a value the build cannot read"})
}
