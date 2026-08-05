package diagnostics

// RunType RT-compiler codes. Per-family prefixes so users reading their
// build log can tell which RT family produced a diagnostic without
// reading the message: SJ010 is unambiguously "stringifyJson dropped a
// member"; VL010 is "validate dropped a member"; even if both messages are
// otherwise identical.
//
// Numeric suffix convention within each family:
//   001-009 — root-position errors (the rendered factory throws on call)
//   010+    — child-position warnings (silent skips made visible)

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

// CodeCompositeMissingPrimitive — a JSON composite (jeCL/jeMU/jeDI/jdST/jdPR)
// entry's soft-dep primitive has no rendered entry in the graph. Always an
// internal invariant breach, never a user error.
const CodeCompositeMissingPrimitive = "JCP001"

// prepareForJson family.
const (
	CodePJNeverRoot               = "PJ001"
	CodePJNonSerializableRoot     = "PJ002"
	CodePJFunctionRoot            = "PJ003"
	CodePJArrayElement            = "PJ004"
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
	CodePJSArrayElement            = "PJS004"
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
	CodeRJArrayElement            = "RJ004"
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
	CodeSJArrayElement            = "SJ004"
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
	CodeTBNonSerializableElem     = "TB005"
	CodeTBArrayElement            = "TB004"
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
	CodeFBNonSerializableElem     = "FB005"
	CodeFBArrayElement            = "FB004"
	CodeFBSymbolRoot              = "FB006"
	CodeFBFunctionPropDropped     = "FB010"
	CodeFBMethodDropped           = "FB011"
	CodeFBStaticDropped           = "FB012"
	CodeFBSymbolKeyedDropped      = "FB013"
	CodeFBUnionMemberDropped      = "FB014"
	CodeFBNonSerializablePropDrop = "FB015"
)

// Format family — TypeFormat (pattern / mockSample) build-time checks.
const (
	// CodeFMTSampleMismatch — a declared mockSample does not match the
	// format's own pattern. Error severity: the sample is supposed to be
	// a canonical valid value, so a mismatch is always a type-definition
	// bug. Args: [sample, pattern-source].
	CodeFMTSampleMismatch = "FMT001"

	// CodeFMTInvalidParams — a format's params violate an invariant
	// (mutually-exclusive options, out-of-range bound, missing required
	// mockSamples, unknown enum value, …). Error severity: the type
	// definition is malformed and the emitted validator would be
	// unreachable or wrong. Args: [violation message]. Replaces the
	// build-time `validateParams` throw (run JS-side at JIT compile; we
	// run it AOT in Go and surface it as a diagnostic).
	CodeFMTInvalidParams = "FMT002"

	// CodeFMTSampleBounds — a declared mockSample violates a statically
	// checkable sibling constraint (length / minLength / maxLength, or one
	// of the plain-string char/value ops allowedChars / disallowedChars /
	// disallowedValues). Error severity, same doctrine as FMT001: a sample
	// is a canonical valid value, so one that its own siblings reject is a
	// type-definition bug (it would feed createMockDataFn an invalid value,
	// or be filtered out at mock time). Args: [comma-joined offending
	// samples, constraint name, bound/description]. One diagnostic per
	// violated constraint — the pipeline dedups per code per walk, so every
	// offender for a constraint rides one message.
	CodeFMTSampleBounds = "FMT003"

	// CodeFMTMissingJsRuntime — a pattern needs the JS engine (compile
	// check + sample-vs-pattern check run on the real `new RegExp`) but no
	// engine could run: no node/bun found, or the sidecar died. Error
	// severity, fail-closed: the build refuses what it can't verify.
	// Emitted once per pattern-bearing site; projects with zero patterns
	// never need a JS runtime. Args: [pattern source, reason].
	CodeFMTMissingJsRuntime = "FMT004"

	// CodeFMTSampleGenFailed — a pattern declares no mockSamples and the
	// build could not auto-generate any: generation is disabled
	// (patternSampleCount 0), randexp cannot handle the construct, or the
	// whole retry budget yielded nothing that survives the pattern and its
	// length bounds. Error severity: a pattern without samples cannot mock,
	// so the type definition must declare them. Args: [pattern source,
	// reason].
	CodeFMTSampleGenFailed = "FMT005"

	// CodeFMTSampleConflict — two sites resolve to ONE cache entry (their
	// formats are identical apart from the sample pools, which are not
	// id-relevant) but each DECLARES a different mockSamples pool. The shared
	// entry can only carry one, so it mocks from whichever interned first —
	// deterministic for a fixed input, but adding or reordering unrelated code
	// can silently change which pool wins. Error severity: the build fails
	// rather than pick for you. Declared-vs-absent is NOT a conflict (absence is
	// not an opinion — the declared pool is adopted), and auto-generated pools
	// are deterministic per pattern so they cannot disagree. Args: [format name,
	// the pool in use, the conflicting pool, the site that interned first].
	CodeFMTSampleConflict = "FMT006"
)

// Unknown-keys family — no root throws today; only child drops.
const (
	CodeHUKFunctionPropDropped = "HUK010"
	CodeUKEFunctionPropDropped = "UKE010"
	CodeUKUFunctionPropDropped = "UKU010"
	CodeUKWFunctionPropDropped = "UKW010"
)

// cloneExactShape family — the clone-based strip. Object-bearing unions and
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

// Class-serializer family (CLS) — advisory, Warning severity. Emitted once
// per named plain user class (KindClass + SubKindNone) reached by a
// serialization family (pj / pjs / rj / sj / tb / fb) when NO custom
// serializer is registered for the class name: the class is serialized
// structurally (declared props in, prototype-less plain object out). The
// user can register a custom (de)serializer via registerClassSerializer to
// opt into round-tripping a real instance. NOT emitted for validate /
// getValidationErrors, builtins (Date/Map/Set/RegExp/nonSerializable), or
// anonymous classes. Args: [className].
const (
	CodeCLSStructuralFallback = "CLS001"
)

func init() {
	// Root-position errors — render a throwing factory.
	for _, code := range []string{
		CodeVLNonSerializableRoot, CodeVLSymbolRoot,
		CodeVENonSerializableRoot, CodeVESymbolRoot,
		CodePJNeverRoot, CodePJNonSerializableRoot, CodePJFunctionRoot, CodePJArrayElement, CodePJSymbolRoot,
		CodePJSNeverRoot, CodePJSNonSerializableRoot, CodePJSFunctionRoot, CodePJSArrayElement, CodePJSSymbolRoot,
		CodeRJNeverRoot, CodeRJNonSerializableRoot, CodeRJFunctionRoot, CodeRJArrayElement, CodeRJSymbolRoot,
		CodeSJNeverRoot, CodeSJNonSerializableRoot, CodeSJFunctionRoot, CodeSJArrayElement, CodeSJSymbolRoot,
		CodeTBNeverRoot, CodeTBNonSerializableRoot, CodeTBFunctionRoot, CodeTBArrayElement, CodeTBNonSerializableElem, CodeTBSymbolRoot,
		CodeFBNeverRoot, CodeFBNonSerializableRoot, CodeFBFunctionRoot, CodeFBArrayElement, CodeFBNonSerializableElem, CodeFBSymbolRoot,
		CodeCESUnionRoot, CodeCESFunctionRoot,
	} {
		register(Definition{Code: code, Family: FamilyRunType, Severity: SeverityError, Title: "RunType root-position error"})
	}

	// Composite invariant breach — a JSON composite entry references a
	// primitive that never rendered. Internal bug: the site demand should
	// have rendered it (real, noop short-form, or alwaysThrow); the emitted
	// `utl.getRT(key).fn` prologue would crash at runtime, so the build
	// fails loudly here instead.
	register(Definition{Code: CodeCompositeMissingPrimitive, Family: FamilyRunType, Severity: SeverityError, Title: "JSON composite references an unrendered primitive entry"})

	// Child-position warnings — the factory still emits, just drops the member.
	// The *UnionMemberDropped codes (…014) are the DataOnly union-member drop:
	// `Date | symbol` serializes/validates as `Date`. validationErrors (VE) has
	// none — its union arm delegates to validate, so the user sees VL014.
	// The *NonSerializablePropDrop codes (…015) are the DataOnly PROPERTY drop:
	// a property whose VALUE is directly non-data (symbol / Promise / never /
	// non-serializable built-in — function-valued props keep using …010) is
	// dropped so `{a: symbol}` serializes/validates as `{}`, matching
	// `DataOnly<{a: symbol}>` = `{}`. A property whose value is only
	// STRUCTURALLY unserializable (symbol[], Map<string, symbol>) is NOT dropped
	// — DataOnly keeps it (`never[]`), so the family throws at root instead.
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
		register(Definition{Code: code, Family: FamilyRunType, Severity: SeverityWarning, Title: "RunType child-position member dropped"})
	}

	// Root any/unknown — noop validators that accept every value. Warning
	// severity (not Info): the user opted into a permissive type, often
	// without realising the runtime is no longer enforcing the schema.
	register(Definition{Code: CodeVERootAnyUnknown, Family: FamilyRunType, Severity: SeverityWarning, Title: "validationErrors root any/unknown — identity fallback"})
	register(Definition{Code: CodeVLRootAnyUnknown, Family: FamilyRunType, Severity: SeverityWarning, Title: "validate root any/unknown — identity fallback"})

	// Format-family — a mockSample that contradicts its own pattern is a
	// type-definition bug; surface it as an error.
	register(Definition{Code: CodeFMTSampleMismatch, Family: FamilyRunType, Severity: SeverityError, Title: "format mockSample does not match pattern"})
	register(Definition{Code: CodeFMTInvalidParams, Family: FamilyRunType, Severity: SeverityError, Title: "invalid type-format params"})
	register(Definition{Code: CodeFMTSampleBounds, Family: FamilyRunType, Severity: SeverityError, Title: "format mockSample violates a sibling constraint"})
	register(Definition{Code: CodeFMTMissingJsRuntime, Family: FamilyRunType, Severity: SeverityError, Title: "format pattern checks need a JS runtime and none was found"})
	register(Definition{Code: CodeFMTSampleGenFailed, Family: FamilyRunType, Severity: SeverityError, Title: "format pattern mockSamples could not be auto-generated"})
	register(Definition{Code: CodeFMTSampleConflict, Family: FamilyRunType, Severity: SeverityError, Title: "two sites declare different mockSamples for one shared format entry"})

	// Class-serializer family — a named plain user class is serialized
	// structurally because no custom serializer is registered. Advisory,
	// not a failure: the structural fallback round-trips data fine; the
	// warning just tells the user they CAN register a serializer for full
	// instance reconstruction.
	register(Definition{Code: CodeCLSStructuralFallback, Family: FamilyRunType, Severity: SeverityWarning, Title: "user class serialized structurally — register a serializer for custom (de)serialization"})
}
