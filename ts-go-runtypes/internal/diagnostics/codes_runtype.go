package diagnostics

// RunType RT-compiler codes. Per-family prefixes so users reading their
// build log can tell which RT family produced a diagnostic without
// reading the message: SJ010 is unambiguously "stringifyJson dropped a
// member"; VL010 is "validate dropped a member"; even if both messages are
// otherwise identical.
//
// Numeric suffix convention within each family:
//   001-009: root-position errors (the rendered factory throws on call)
//   010+: child-position warnings (silent skips made visible)

// validate family.
const (
	CodeVLNonSerializableRoot     = "VL001"
	CodeVLSymbolRoot              = "VL002"
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
	CodeVEFunctionPropDropped     = "VE010"
	CodeVEMethodDropped           = "VE011"
	CodeVEStaticDropped           = "VE012"
	CodeVESymbolKeyedDropped      = "VE013"
	CodeVENonSerializablePropDrop = "VE015"
	CodeVERootAnyUnknown          = "VE020"
)

// CodeCompositeMissingPrimitive: a JSON composite (jeCL/jeMU/jeDI/jdST/jdPR)
// entry's soft-dep primitive has no rendered entry in the graph. Always an
// internal invariant breach, never a user error.
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

// prepareForJsonSafe family.
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

// restoreFromJson family.
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

// stringifyJson family.
const (
	CodeSJNeverRoot               = "SJ001"
	CodeSJNonSerializableRoot     = "SJ002"
	CodeSJFunctionRoot            = "SJ003"
	CodeSJSymbolRoot              = "SJ005"
	CodeSJFunctionPropDropped     = "SJ010"
	CodeSJMethodDropped           = "SJ011"
	CodeSJStaticDropped           = "SJ012"
	CodeSJSymbolKeyedDropped      = "SJ013"
	CodeSJUnionMemberDropped      = "SJ014"
	CodeSJNonSerializablePropDrop = "SJ015"
)

// toBinary family.
const (
	CodeTBNeverRoot               = "TB001"
	CodeTBNonSerializableRoot     = "TB002"
	CodeTBFunctionRoot            = "TB003"
	CodeTBSymbolRoot              = "TB006"
	CodeTBFunctionPropDropped     = "TB010"
	CodeTBMethodDropped           = "TB011"
	CodeTBStaticDropped           = "TB012"
	CodeTBSymbolKeyedDropped      = "TB013"
	CodeTBUnionMemberDropped      = "TB014"
	CodeTBNonSerializablePropDrop = "TB015"
)

// fromBinary family.
const (
	CodeFBNeverRoot               = "FB001"
	CodeFBNonSerializableRoot     = "FB002"
	CodeFBFunctionRoot            = "FB003"
	CodeFBSymbolRoot              = "FB006"
	CodeFBFunctionPropDropped     = "FB010"
	CodeFBMethodDropped           = "FB011"
	CodeFBStaticDropped           = "FB012"
	CodeFBSymbolKeyedDropped      = "FB013"
	CodeFBUnionMemberDropped      = "FB014"
	CodeFBNonSerializablePropDrop = "FB015"
)

// Format family: TypeFormat (pattern / mockSample) build-time checks. Every one
// is LevelRuntimeError: a format finding is raised through EmitDiagnostic, which
// surfaces the problem WITHOUT changing what the emitter writes, so the entry
// always renders. What ships is a validator that was never verified (FMT004,
// FMT007), one built from contradictory params (FMT002), one that can be hung by
// a crafted input (FMT008), or a mock function that cannot produce a valid value
// (FMT001, FMT003, FMT005, FMT006).
const (
	// CodeFMTSampleMismatch: a declared mockSample does not match the
	// format's own pattern. The sample is supposed to be
	// a canonical valid value, so a mismatch is always a type-definition
	// bug. Args: [sample, pattern-source].
	CodeFMTSampleMismatch = "FMT001"

	// CodeFMTInvalidParams: a format's params violate an invariant
	// (mutually-exclusive options, out-of-range bound, missing required
	// mockSamples, unknown enum value, …). The type
	// definition is malformed and the emitted validator would be
	// unreachable or wrong. Args: [violation message]. Replaces the
	// build-time `validateParams` throw (run JS-side at JIT compile; we
	// run it AOT in Go and surface it as a diagnostic).
	CodeFMTInvalidParams = "FMT002"

	// CodeFMTSampleBounds: a declared mockSample violates a statically
	// checkable sibling constraint (length / minLength / maxLength, or one
	// of the plain-string char/value ops allowedChars / disallowedChars /
	// disallowedValues). Same doctrine as FMT001: a sample
	// is a canonical valid value, so one that its own siblings reject is a
	// type-definition bug (it would feed createMockDataFn an invalid value,
	// or be filtered out at mock time). Args: [comma-joined offending
	// samples, constraint name, bound/description]. One diagnostic per
	// violated constraint: the pipeline dedups per code per walk, so every
	// offender for a constraint rides one message.
	CodeFMTSampleBounds = "FMT003"

	// CodeFMTMissingJsRuntime: a pattern needs the JS engine (compile
	// check + sample-vs-pattern check run on the real `new RegExp`) but no
	// engine could run: no node/bun found, or the sidecar died. Fail-closed, and the
	// entry still renders, so what ships is a validator nothing checked.
	// Emitted once per pattern-bearing site; projects with zero patterns
	// never need a JS runtime. Args: [pattern source, reason].
	CodeFMTMissingJsRuntime = "FMT004"

	// CodeFMTSampleGenFailed: a pattern declares no mockSamples and the
	// build could not auto-generate any: generation is disabled
	// (patternSampleCount 0), randexp cannot handle the construct, or the
	// whole retry budget yielded nothing that survives the pattern and its
	// length bounds. A pattern without samples cannot mock,
	// so the type definition must declare them. Args: [pattern source,
	// reason].
	CodeFMTSampleGenFailed = "FMT005"

	// CodeFMTSampleConflict: two sites resolve to ONE cache entry (their
	// formats are identical apart from the sample pools, which are not
	// id-relevant) but each DECLARES a different mockSamples pool. The shared
	// entry can only carry one, so it mocks from whichever interned first,
	// deterministic for a fixed input, but adding or reordering unrelated code
	// can silently change which pool wins. The build reports it rather than pick
	// for you. Declared-vs-absent is NOT a conflict (absence is
	// not an opinion, the declared pool is adopted), and auto-generated pools
	// are deterministic per pattern so they cannot disagree. Args: [format name,
	// the pool in use, the conflicting pool, the site that interned first].
	CodeFMTSampleConflict = "FMT006"

	// CodeFMTPatternTimeout: the JS engine could not finish evaluating a
	// pattern against one sample inside the sidecar's match budget, even on
	// the quiet retry. Same doctrine as FMT004: the emitted
	// validator would run that same regex, so a pattern that really does
	// backtrack catastrophically must not ship. The verdict is TRANSIENT,
	// though: a saturated host blows the budget on a perfectly fine pattern,
	// so it is never persisted in the disk cache (nor memoized for the
	// session), and the next build re-evaluates the pattern from scratch.
	// Args: [pattern source, reason].
	CodeFMTPatternTimeout = "FMT007"

	// CodeFMTPatternUnsafe: a format's `pattern` can be made to backtrack
	// exponentially, so the emitted validator can be hung by a short
	// crafted input. Found by a STATIC check on the pattern source
	// (internal/regexsafety), so unlike FMT007 it runs on every host,
	// needs no JS engine, and its verdict is a property of the pattern
	// itself — deterministic, and safe to cache. What ships is a
	// validator that is a denial-of-service hole. Escape hatch for a
	// pattern the check reads wrongly: `unsafePattern: true` on the
	// pattern params.
	// Args: [pattern source, reason, offending sub-expression].
	CodeFMTPatternUnsafe = "FMT008"
)

// Unknown-keys family: no root throws today; only child drops.
const (
	CodeHUKFunctionPropDropped = "HUK010"
	CodeUKEFunctionPropDropped = "UKE010"
	CodeUKUFunctionPropDropped = "UKU010"
	CodeUKWFunctionPropDropped = "UKW010"
)

// cloneExactShape family: the clone-based strip. Object-bearing unions and
// callable roots FAIL the build (a strip that silently doesn't strip is a
// security bug, not a fallback). Declared members are never dropped: values
// the emitter cannot rebuild (functions, symbols, promises, non-serialisable
// natives) are kept and SHARED BY REFERENCE, with these advisories naming
// them; class methods ride the prototype (CES011); statics are class-level
// (CES012).
const (
	CodeCESUnionRoot               = "CES001"
	CodeCESFunctionRoot            = "CES003"
	CodeCESFunctionPropDropped     = "CES010"
	CodeCESMethodDropped           = "CES011"
	CodeCESStaticDropped           = "CES012"
	CodeCESNonSerializablePropDrop = "CES015"
)

// Unsafe property name (UPN): Error severity, every family. A type that
// declares a property named `__proto__`, `prototype` or `constructor` can never
// round-trip: those keys are refused on the wire (writing `__proto__` on a plain
// object swaps its prototype, a missing `constructor` reads through the
// prototype chain), so the entry renders as an alwaysThrow factory. Args:
// [propertyName].
const (
	CodeUnsafePropertyName = "UPN001"
)

func init() {
	// Root-position errors: LevelRuntimeError. The entry RENDERS, as an alwaysThrow
	// factory, so the cache module is written and the generated function throws the
	// moment it is called. That is the textbook RuntimeError, and the reason the
	// level is not LevelError: there is real output, and a consumer that reports it
	// and exits non-zero has done the right thing.
	// ScopeRoot: the same trigger inside a property is a child-position drop (the
	// …01x warnings).
	for _, code := range []string{
		CodeVLNonSerializableRoot, CodeVLSymbolRoot,
		CodeVENonSerializableRoot, CodeVESymbolRoot,
		CodePJNeverRoot, CodePJNonSerializableRoot, CodePJFunctionRoot, CodePJSymbolRoot,
		CodePJSNeverRoot, CodePJSNonSerializableRoot, CodePJSFunctionRoot, CodePJSSymbolRoot,
		CodeRJNeverRoot, CodeRJNonSerializableRoot, CodeRJFunctionRoot, CodeRJSymbolRoot,
		CodeSJNeverRoot, CodeSJNonSerializableRoot, CodeSJFunctionRoot, CodeSJSymbolRoot,
		CodeTBNeverRoot, CodeTBNonSerializableRoot, CodeTBFunctionRoot, CodeTBSymbolRoot,
		CodeFBNeverRoot, CodeFBNonSerializableRoot, CodeFBFunctionRoot, CodeFBSymbolRoot,
		CodeCESUnionRoot, CodeCESFunctionRoot,
	} {
		register(Definition{Code: code, Family: FamilyRunType, Level: LevelRuntimeError, Scope: ScopeRoot, Title: "RunType root-position error"})
	}

	// Composite invariant breach: a JSON composite entry references a
	// primitive that never rendered. Internal bug: the site demand should
	// have rendered it (real, noop short-form, or alwaysThrow); the emitted
	// `utl.getRT(key).fn` prologue would crash at runtime, so the build
	// fails loudly here instead.
	register(Definition{Code: CodeCompositeMissingPrimitive, Family: FamilyRunType, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "JSON composite references an unrendered primitive entry"})
	register(Definition{Code: CodeUnsafePropertyName, Family: FamilyRunType, Level: LevelRuntimeError, Scope: ScopeGraph, Title: "property named after a prototype slot"})

	// Child-position warnings: the factory still emits, just drops the member.
	// The *UnionMemberDropped codes (…014) are the DataOnly union-member drop:
	// `Date | symbol` serializes/validates as `Date`. validationErrors (VE) has
	// none: its union arm delegates to validate, so the user sees VL014.
	// The *NonSerializablePropDrop codes (…015) are the DataOnly PROPERTY drop:
	// a property whose VALUE is directly non-data (symbol / Promise / never /
	// non-serializable built-in; function-valued props keep using …010) is
	// dropped so `{a: symbol}` serializes/validates as `{}`, matching
	// `DataOnly<{a: symbol}>` = `{}`. A property whose value is only
	// STRUCTURALLY unserializable (symbol[], Map<string, symbol>) is NOT dropped:
	// DataOnly keeps it (`never[]`), so the family throws at root instead.
	for _, code := range []string{
		CodeVLFunctionPropDropped, CodeVLMethodDropped, CodeVLStaticDropped, CodeVLSymbolKeyedDropped, CodeVLUnionMemberDropped, CodeVLNonSerializablePropDrop,
		CodeVEFunctionPropDropped, CodeVEMethodDropped, CodeVEStaticDropped, CodeVESymbolKeyedDropped, CodeVENonSerializablePropDrop,
		CodePJFunctionPropDropped, CodePJMethodDropped, CodePJStaticDropped, CodePJSymbolKeyedDropped, CodePJUnionMemberDropped, CodePJNonSerializablePropDrop,
		CodePJSFunctionPropDropped, CodePJSMethodDropped, CodePJSStaticDropped, CodePJSSymbolKeyedDropped, CodePJSUnionMemberDropped, CodePJSNonSerializablePropDrop,
		CodeRJFunctionPropDropped, CodeRJMethodDropped, CodeRJStaticDropped, CodeRJSymbolKeyedDropped, CodeRJUnionMemberDropped, CodeRJNonSerializablePropDrop,
		CodeSJFunctionPropDropped, CodeSJMethodDropped, CodeSJStaticDropped, CodeSJSymbolKeyedDropped, CodeSJUnionMemberDropped, CodeSJNonSerializablePropDrop,
		CodeTBFunctionPropDropped, CodeTBMethodDropped, CodeTBStaticDropped, CodeTBSymbolKeyedDropped, CodeTBUnionMemberDropped, CodeTBNonSerializablePropDrop,
		CodeFBFunctionPropDropped, CodeFBMethodDropped, CodeFBStaticDropped, CodeFBSymbolKeyedDropped, CodeFBUnionMemberDropped, CodeFBNonSerializablePropDrop,
		CodeHUKFunctionPropDropped, CodeUKEFunctionPropDropped, CodeUKUFunctionPropDropped, CodeUKWFunctionPropDropped,
		CodeCESFunctionPropDropped, CodeCESMethodDropped, CodeCESStaticDropped, CodeCESNonSerializablePropDrop,
	} {
		register(Definition{Code: code, Family: FamilyRunType, Level: LevelWarning, Scope: ScopeGraph, Title: "RunType child-position member dropped"})
	}

	// Root any/unknown: noop validators that accept every value. LevelWarning, not
	// LevelRuntimeError, and the line between the two matters: here the type really
	// IS `any` or `unknown`, written by the author, so a validator that accepts
	// everything is exactly what was asked for. The RuntimeError case is the type
	// that was NOT any and became it anyway, because a name, an import or a lib
	// failed to resolve (MKR007 / MKR013 / TMP001 / CFG002). The user is told
	// because the runtime is no longer enforcing a schema, not because it is wrong.
	register(Definition{Code: CodeVERootAnyUnknown, Family: FamilyRunType, Level: LevelWarning, Scope: ScopeRoot, Title: "validationErrors root any/unknown: identity fallback"})
	register(Definition{Code: CodeVLRootAnyUnknown, Family: FamilyRunType, Level: LevelWarning, Scope: ScopeRoot, Title: "validate root any/unknown: identity fallback"})

	// Format-family: a mockSample that contradicts its own pattern is a
	// type-definition bug; surface it as an error.
	// A format annotation is checked wherever it sits (ScopeGraph); the
	// missing-runtime code is about the host, not the type.
	register(Definition{Code: CodeFMTSampleMismatch, Family: FamilyRunType, Level: LevelRuntimeError, Scope: ScopeGraph, Title: "format mockSample does not match pattern"})
	register(Definition{Code: CodeFMTInvalidParams, Family: FamilyRunType, Level: LevelRuntimeError, Scope: ScopeGraph, Title: "invalid type-format params"})
	register(Definition{Code: CodeFMTSampleBounds, Family: FamilyRunType, Level: LevelRuntimeError, Scope: ScopeGraph, Title: "format mockSample violates a sibling constraint"})
	register(Definition{Code: CodeFMTMissingJsRuntime, Family: FamilyRunType, Level: LevelRuntimeError, Scope: ScopeNotSource, Title: "format pattern checks need a JS runtime and none was found"})
	register(Definition{Code: CodeFMTSampleGenFailed, Family: FamilyRunType, Level: LevelRuntimeError, Scope: ScopeGraph, Title: "format pattern mockSamples could not be auto-generated"})
	register(Definition{Code: CodeFMTSampleConflict, Family: FamilyRunType, Level: LevelRuntimeError, Scope: ScopeGraph, Title: "two sites declare different mockSamples for one shared format entry"})
	register(Definition{Code: CodeFMTPatternTimeout, Family: FamilyRunType, Level: LevelRuntimeError, Scope: ScopeGraph, Transient: true, Title: "format pattern evaluation timed out"})
	register(Definition{Code: CodeFMTPatternUnsafe, Family: FamilyRunType, Level: LevelRuntimeError, Scope: ScopeGraph, Title: "format pattern can be made to backtrack exponentially"})
}
