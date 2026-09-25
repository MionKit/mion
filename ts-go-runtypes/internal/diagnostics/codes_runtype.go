package diagnostics

// RunType compiler codes, one prefix per family so a build log names the family (PJ010: prepareForJson dropped a
// member). Suffix 001-009: root errors, the factory throws on call; 010+: child-position warnings for silent skips.

// validate family.
const (
	CodeVLNonSerializableRoot     = "VL001"
	CodeVLSymbolRoot              = "VL002"
	CodeVLFunctionRoot            = "VL003"
	CodeVLFunctionPropDropped     = "VL010"
	CodeVLMethodDropped           = "VL011"
	CodeVLStaticDropped           = "VL012"
	CodeVLSymbolKeyedDropped      = "VL013"
	CodeVLUnionMemberDropped      = "VL014"
	CodeVLNonSerializablePropDrop = "VL015"
	CodeVLRootAnyUnknown          = "VL021"
)

// validationErrors family.
const (
	CodeVENonSerializableRoot     = "VE001"
	CodeVESymbolRoot              = "VE002"
	CodeVEFunctionRoot            = "VE003"
	CodeVEFunctionPropDropped     = "VE010"
	CodeVEMethodDropped           = "VE011"
	CodeVEStaticDropped           = "VE012"
	CodeVESymbolKeyedDropped      = "VE013"
	CodeVENonSerializablePropDrop = "VE015"
	CodeVERootAnyUnknown          = "VE020"
)

// CodeCompositeMissingPrimitive: a JSON composite entry's soft-dep primitive has no rendered entry
// in the graph. Always an internal invariant breach, never a user error.
const CodeCompositeMissingPrimitive = "JCP001"

// prepareForJson family.
const (
	CodePJNeverRoot               = "PJ001"
	CodePJNonSerializableRoot     = "PJ002"
	CodePJFunctionRoot            = "PJ003"
	CodePJSymbolRoot              = "PJ005"
	CodePJFunctionPropDropped     = "PJ010"
	CodePJMethodDropped           = "PJ011"
	CodePJStaticDropped           = "PJ012"
	CodePJSymbolKeyedDropped      = "PJ013"
	CodePJUnionMemberDropped      = "PJ014"
	CodePJNonSerializablePropDrop = "PJ015"
)

// prepareForJsonClone family.
const (
	CodePJSNeverRoot               = "PJS001"
	CodePJSNonSerializableRoot     = "PJS002"
	CodePJSFunctionRoot            = "PJS003"
	CodePJSSymbolRoot              = "PJS005"
	CodePJSFunctionPropDropped     = "PJS010"
	CodePJSMethodDropped           = "PJS011"
	CodePJSStaticDropped           = "PJS012"
	CodePJSSymbolKeyedDropped      = "PJS013"
	CodePJSUnionMemberDropped      = "PJS014"
	CodePJSNonSerializablePropDrop = "PJS015"
)

// restoreFromJsonMutate family.
const (
	CodeRJNeverRoot               = "RJ001"
	CodeRJNonSerializableRoot     = "RJ002"
	CodeRJFunctionRoot            = "RJ003"
	CodeRJSymbolRoot              = "RJ005"
	CodeRJFunctionPropDropped     = "RJ010"
	CodeRJMethodDropped           = "RJ011"
	CodeRJStaticDropped           = "RJ012"
	CodeRJSymbolKeyedDropped      = "RJ013"
	CodeRJUnionMemberDropped      = "RJ014"
	CodeRJNonSerializablePropDrop = "RJ015"
)

// Format family: TypeFormat (pattern / mockSample) build-time checks. Every one is
// LevelRuntimeError, because EmitDiagnostic does not change what the emitter writes and the entry
// always renders: what ships is a validator that was never verified (FMT004, FMT007), built from
// contradictory params (FMT002) or hangable by a crafted input (FMT008), or a mock function that
// cannot produce a valid value (FMT001, FMT003, FMT005, FMT006).
const (
	// CodeFMTSampleMismatch: a declared mockSample does not match the format's own pattern. A sample
	// is a canonical valid value, so a mismatch is always a type-definition bug. Args: [sample,
	// pattern-source].
	CodeFMTSampleMismatch = "FMT001"

	// CodeFMTInvalidParams: a format's params violate an invariant, so the emitted validator would be
	// unreachable or wrong. Args: [violation message]. Replaces the JS-side `validateParams` throw,
	// run AOT in Go.
	CodeFMTInvalidParams = "FMT002"

	// CodeFMTSampleBounds: a declared mockSample violates a statically checkable sibling constraint
	// (length bounds, allowedChars / disallowedChars / disallowedValues). Same doctrine as FMT001: a
	// sample its own siblings reject is a type-definition bug. One diagnostic per violated
	// constraint, since the pipeline dedups per code per walk. Args: [comma-joined offending samples,
	// constraint name, bound/description].
	CodeFMTSampleBounds = "FMT003"

	// CodeFMTMissingJsRuntime: a pattern needs the JS engine (the checks run on the real `new
	// RegExp`) and none could run. Fail-closed, and the entry still renders, so what ships is a
	// validator nothing checked. Emitted once per pattern-bearing site, so a project with no patterns
	// never needs a JS runtime. Args: [pattern source, reason].
	CodeFMTMissingJsRuntime = "FMT004"

	// CodeFMTSampleGenFailed: a pattern declares no mockSamples and none could be generated
	// (generation off, a construct randexp cannot handle, or a retry budget that yielded nothing
	// surviving the pattern and its length bounds). A pattern without samples cannot mock, so the
	// type must declare them. Args: [pattern source, reason].
	CodeFMTSampleGenFailed = "FMT005"

	// CodeFMTSampleConflict: two sites resolve to ONE cache entry (sample pools are not id-relevant)
	// but declare different mockSamples pools. The entry carries whichever interned first, so
	// reordering unrelated code can silently change the winner, and the build reports it rather than
	// pick. Declared-vs-absent is NOT a conflict (the declared pool is adopted) and generated pools
	// are deterministic per pattern. Args: [format name, the pool in use, the conflicting pool, the
	// site that interned first].
	CodeFMTSampleConflict = "FMT006"

	// CodeFMTPatternTimeout: the JS engine could not evaluate a pattern against one sample inside the
	// sidecar's budget, even on the quiet retry. Same doctrine as FMT004: the validator would run
	// that same regex. TRANSIENT, because a saturated host blows the budget on a fine pattern, so it
	// is never persisted or memoized and the next build re-evaluates. Args: [pattern source, reason].
	CodeFMTPatternTimeout = "FMT007"

	// CodeFMTPatternUnsafe: a `pattern` can be made to backtrack exponentially, so the emitted
	// validator is a denial-of-service hole. Found by a STATIC check (internal/regexsafety), so
	// unlike FMT007 it needs no JS engine and its verdict is deterministic and safe to cache. Escape
	// hatch when the check reads a pattern wrongly: `unsafePattern: true` on the pattern params.
	// Args: [pattern source, reason, offending sub-expression].
	CodeFMTPatternUnsafe = "FMT008"
)

// removeUnknownKeys: object unions and callable roots fail, since a strip that silently keeps keys is a security bug.
// Declared members are never dropped: a value it cannot rebuild is shared by reference, and these warnings name it.
const (
	CodeRUKUnionRoot               = "RUK001"
	CodeRUKFunctionRoot            = "RUK003"
	CodeRUKFunctionPropDropped     = "RUK010"
	CodeRUKMethodDropped           = "RUK011"
	CodeRUKStaticDropped           = "RUK012"
	CodeRUKNonSerializablePropDrop = "RUK015"
)

// Unsafe property name (UPN), one warning for every family: a declared `__proto__` member is
// dropped, because writing that key on a plain object swaps its prototype instead of storing a
// value. TypeScript ACCEPTS the declaration, so the type promises a value the runtime never carries,
// which is what makes the warning worth emitting; the rest of the type is unaffected. Args:
// [propertyName].
const (
	CodeUnsafePropertyName = "UPN001"
)

func init() {
	// Root-position errors are LevelRuntimeError, not LevelError: the entry RENDERS as an alwaysThrow
	// factory, so the module is written and the function throws the moment it is called.
	// ScopeRoot: the same trigger inside a property is a child-position drop (the …01x warnings).
	for _, code := range []string{
		CodeVLNonSerializableRoot, CodeVLSymbolRoot, CodeVLFunctionRoot,
		CodeVENonSerializableRoot, CodeVESymbolRoot, CodeVEFunctionRoot,
		CodePJNeverRoot, CodePJNonSerializableRoot, CodePJFunctionRoot, CodePJSymbolRoot,
		CodePJSNeverRoot, CodePJSNonSerializableRoot, CodePJSFunctionRoot, CodePJSSymbolRoot,
		CodeRJNeverRoot, CodeRJNonSerializableRoot, CodeRJFunctionRoot, CodeRJSymbolRoot,
		CodeRUKUnionRoot, CodeRUKFunctionRoot,
	} {
		register(Definition{Code: code, Family: FamilyRunType, Level: LevelRuntimeError, Scope: ScopeRoot, Title: "RunType root-position error"})
	}

	// An internal bug: the site demand should have rendered the primitive, and the emitted
	// `utl.getRT(key).fn` prologue would crash at runtime, so the build fails loudly here instead.
	register(Definition{Code: CodeCompositeMissingPrimitive, Family: FamilyRunType, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "JSON composite references an unrendered primitive entry"})

	// Child-position warnings: the factory still emits, just drops the member.
	// The …014 codes are the DataOnly union-member drop (`Date | symbol` acts as `Date`);
	// validationErrors has none, its union arm delegates to validate so the user sees VL014.
	// The …015 codes are the DataOnly PROPERTY drop: a property whose VALUE is directly non-data
	// (function-valued props keep using …010) is dropped, so `{a: symbol}` acts as `{}`. A value that
	// is only STRUCTURALLY unserializable (symbol[], Map<string, symbol>) is NOT dropped, since
	// DataOnly keeps it as `never[]`, and the family throws at root instead.
	for _, code := range []string{
		CodeVLFunctionPropDropped, CodeVLMethodDropped, CodeVLStaticDropped, CodeVLSymbolKeyedDropped, CodeVLUnionMemberDropped, CodeVLNonSerializablePropDrop,
		CodeVEFunctionPropDropped, CodeVEMethodDropped, CodeVEStaticDropped, CodeVESymbolKeyedDropped, CodeVENonSerializablePropDrop,
		CodePJFunctionPropDropped, CodePJMethodDropped, CodePJStaticDropped, CodePJSymbolKeyedDropped, CodePJUnionMemberDropped, CodePJNonSerializablePropDrop,
		CodePJSFunctionPropDropped, CodePJSMethodDropped, CodePJSStaticDropped, CodePJSSymbolKeyedDropped, CodePJSUnionMemberDropped, CodePJSNonSerializablePropDrop,
		CodeRJFunctionPropDropped, CodeRJMethodDropped, CodeRJStaticDropped, CodeRJSymbolKeyedDropped, CodeRJUnionMemberDropped, CodeRJNonSerializablePropDrop,
		CodeRUKFunctionPropDropped, CodeRUKMethodDropped, CodeRUKStaticDropped, CodeRUKNonSerializablePropDrop,
	} {
		register(Definition{Code: code, Family: FamilyRunType, Level: LevelWarning, Scope: ScopeGraph, Title: "RunType child-position member dropped"})
	}

	// UPN001 is the same child-position drop keyed on the NAME, and one code serves every family
	// because a member named `__proto__` cannot carry data on any road.
	register(Definition{Code: CodeUnsafePropertyName, Family: FamilyRunType, Level: LevelWarning, Scope: ScopeGraph, Title: "RunType member named `__proto__` dropped"})

	// Root any/unknown noop validators are LevelWarning, not LevelRuntimeError: the type really IS
	// `any` or `unknown` as written, so accepting everything is what was asked for. The RuntimeError
	// case is a type that BECAME any because a name, an import or a lib failed to resolve (MKR007 /
	// MKR013 / TMP001 / CFG002). The user is told because no schema is enforced, not because it is
	// wrong.
	register(Definition{Code: CodeVERootAnyUnknown, Family: FamilyRunType, Level: LevelWarning, Scope: ScopeRoot, Title: "validationErrors root any/unknown: identity fallback"})
	register(Definition{Code: CodeVLRootAnyUnknown, Family: FamilyRunType, Level: LevelWarning, Scope: ScopeRoot, Title: "validate root any/unknown: identity fallback"})

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
}
