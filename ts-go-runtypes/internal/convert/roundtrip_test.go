package convert_test

import (
	"strings"
	"testing"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-runtypes/internal/convert"
)

// declIDs resolves every recognized declaration of main.ts and returns
// name → structural id. The name key is the TYPE name when present, else the
// const name — stable across forms because conversion preserves both.
func declIDs(t testing.TB, source string) map[string]string {
	return declIDsIn(t, map[string]string{"main.ts": source})
}

// declIDsIn is declIDs over a full sources map (extra files carry ambients
// like the Temporal fixture); ids are read from main.ts.
func declIDsIn(t testing.TB, sources map[string]string) map[string]string {
	t.Helper()
	prog, session, cwd := setupConvert(t, sources)
	defer session.Close()
	absPath := tspath.ResolvePath(cwd, "main.ts")
	ids, idsErr := convert.DeclarationIDs(prog, session.Checker(), session.Cache(), prog.FS, absPath)
	if idsErr != nil {
		t.Fatalf("DeclarationIDs: %v", idsErr)
	}
	return ids
}

// declGraphs is declIDs for the C6 oracle: name → canonical reflection graph.
func declGraphs(t testing.TB, source string) map[string]string {
	return declGraphsIn(t, map[string]string{"main.ts": source})
}

func declGraphsIn(t testing.TB, sources map[string]string) map[string]string {
	t.Helper()
	prog, session, cwd := setupConvert(t, sources)
	defer session.Close()
	absPath := tspath.ResolvePath(cwd, "main.ts")
	graphs, graphsErr := convert.DeclarationGraphs(prog, session.Checker(), session.Cache(), prog.FS, absPath)
	if graphsErr != nil {
		t.Fatalf("DeclarationGraphs: %v", graphsErr)
	}
	return graphs
}

// convertAndCheckIDs converts source to target and asserts every declaration
// resolves to the SAME structural id (C2) AND the same canonical reflection
// graph (C6 — information the id ignores must survive too) afterwards.
func convertAndCheckIDs(t *testing.T, source string, target convert.Target) string {
	t.Helper()
	return convertAndCheckIDsIn(t, map[string]string{"main.ts": source}, target)
}

// convertAndCheckIDsIn is the same oracle over a full sources map: main.ts is
// the converted file, everything else rides along unchanged (ambients).
func convertAndCheckIDsIn(t *testing.T, sources map[string]string, target convert.Target) string {
	t.Helper()
	output, diags := convertOneIn(t, sources, convert.Options{Target: target})
	expectNoDiags(t, diags)
	withOutput := map[string]string{}
	for rel, content := range sources {
		withOutput[rel] = content
	}
	withOutput["main.ts"] = output
	before := declIDsIn(t, sources)
	after := declIDsIn(t, withOutput)
	for name, beforeID := range before {
		afterID, ok := after[name]
		if !ok {
			t.Errorf("declaration %q disappeared after --to %s:\n%s", name, target, output)
			continue
		}
		if afterID != beforeID {
			t.Errorf("declaration %q changed id after --to %s: %s → %s\n%s", name, target, beforeID, afterID, output)
		}
	}
	if len(after) != len(before) {
		t.Errorf("declaration count changed after --to %s: %d → %d\n%s", target, len(before), len(after), output)
	}
	if !t.Failed() {
		beforeGraphs := declGraphsIn(t, sources)
		afterGraphs := declGraphsIn(t, withOutput)
		for name, beforeGraph := range beforeGraphs {
			afterGraph, ok := afterGraphs[name]
			if !ok {
				continue
			}
			if afterGraph != beforeGraph {
				t.Errorf("declaration %q lost reflection information after --to %s:\n--- before ---\n%s\n--- after ---\n%s\n--- output ---\n%s",
					name, target, beforeGraph, afterGraph, output)
			}
		}
	}
	return output
}

const atomTypeSource = "export type UserId = string;\n" +
	"type Count = number;\n" +
	"export type Flag = boolean;\n" +
	"type Name = 'ana';\n" +
	"type Answer = 42;\n" +
	"type Yes = true;\n" +
	"type Nope = null;\n" +
	"type Missing = undefined;\n" +
	"type Anything = unknown;\n" +
	"type Nothing = never;\n" +
	"type Big = bigint;\n" +
	"type BigLit = 123n;\n" +
	"type Sym = symbol;\n" +
	"type Loose = any;\n"

func TestChain_TypeToBuildersToJSONSchemaToType(t *testing.T) {
	// The full user-facing chain: type → builders → json-schema → type, id-exact
	// at every leg (the fuzz lane widens this over the generated space).
	builderForm := convertAndCheckIDs(t, atomTypeSource, convert.TargetBuilders)
	schemaForm := convertAndCheckIDs(t, builderForm, convert.TargetJSONSchema)
	if !strings.Contains(schemaForm, "runTypeFromJsonSchema({type: 'string', pattern: '^-?[0-9]+$', jsType: 'bigint'} as const)") {
		t.Errorf("bigint atom should ride the jsType dialect:\n%s", schemaForm)
	}
	// A bigint literal rides its DIGITS. JSON has no bigint and a digit string
	// under `const` would read back as a string literal, so the value gets its
	// own keyword and the door lifts `123` to `123n`.
	if !strings.Contains(schemaForm, "runTypeFromJsonSchema({type: 'string', const: '123', jsType: 'bigint'} as const)") {
		t.Errorf("bigint literal should ride the jsBigint dialect keyword:\n%s", schemaForm)
	}
	if strings.Contains(schemaForm, "embedType") {
		t.Errorf("no atom in this chain should reach the embed escape:\n%s", schemaForm)
	}
	typeForm := convertAndCheckIDs(t, schemaForm, convert.TargetType)
	for _, expected := range []string{"type BigLit = 123n;", "type Answer = 42;", "type Missing = undefined;", "export type UserId = string;"} {
		if !strings.Contains(typeForm, expected) {
			t.Errorf("chain output missing %q:\n%s", expected, typeForm)
		}
	}
}

func TestChain_StructuralParamsAtTheirDefault(t *testing.T) {
	// `minItems: 0` / `uniqueItems: false` / `minProperties: 0` say exactly
	// what OMITTING the keyword says, so the door reads the standard spelling
	// as absent — right for 2020-12, but it would drop the brand on the way
	// back. Those params ride jsParams instead, which leaves the standard
	// keywords' meaning untouched.
	source := "import * as TF from '@ts-runtypes/core/formats';\n" +
		"export type ZeroMin = TF.FormattedArray<string[], {minItems: 0}>;\n" +
		"export type NotUnique = TF.FormattedArray<string[], {uniqueItems: false}>;\n" +
		"export type ZeroProps = TF.FormattedObject<Record<string, string>, {minProperties: 0}>;\n"
	schemaForm := convertAndCheckIDs(t, source, convert.TargetJSONSchema)
	for _, expected := range []string{
		"jsParams: {minItems: 0}",
		"jsParams: {uniqueItems: false}",
		"jsParams: {minProperties: 0}",
	} {
		if !strings.Contains(schemaForm, expected) {
			t.Errorf("schema form missing %q:\n%s", expected, schemaForm)
		}
	}
	if strings.Contains(schemaForm, "embedType") {
		t.Errorf("a defaulted structural param should not reach the embed escape:\n%s", schemaForm)
	}
	typeForm := convertAndCheckIDs(t, schemaForm, convert.TargetType)
	for _, expected := range []string{"{minItems: 0}", "{uniqueItems: false}", "{minProperties: 0}"} {
		if !strings.Contains(typeForm, expected) {
			t.Errorf("type form missing %q:\n%s", expected, typeForm)
		}
	}

	_, diags := convertOne(t, source, convert.Options{Target: convert.TargetJSONSchema, Portable: true})
	if len(diags) != 3 || diags[0].Code != convert.CodePortableDialect {
		t.Fatalf("expected a portable refusal per defaulted-param declaration, got %+v", diags)
	}
}

func TestChain_BigintFormatParams(t *testing.T) {
	// The bigint family's bounds ARE bigints, which JSON cannot hold. They ride
	// as digit strings and the door lifts the literal types back, so the whole
	// brand stays data instead of riding the escape. Negative bounds included:
	// the sign is part of the digits the lift reads.
	source := "import * as TF from '@ts-runtypes/core/formats';\n" +
		"export type Small = TF.BigInt<{min: 0n, max: 255n}>;\n" +
		"export type Signed = TF.BigInt<{min: -9223372036854775808n, max: 9223372036854775807n}>;\n" +
		"export type Stepped = TF.BigInt<{multipleOf: 5n}>;\n"
	schemaForm := convertAndCheckIDs(t, source, convert.TargetJSONSchema)
	for _, expected := range []string{
		"rtFormat: 'bigintFormat', rtFormatParams: {max: '255', min: '0'}",
		"rtFormat: 'bigintFormat', rtFormatParams: {max: '9223372036854775807', min: '-9223372036854775808'}",
		"rtFormat: 'bigintFormat', rtFormatParams: {multipleOf: '5'}",
	} {
		if !strings.Contains(schemaForm, expected) {
			t.Errorf("schema form missing %q:\n%s", expected, schemaForm)
		}
	}
	if strings.Contains(schemaForm, "embedType") {
		t.Errorf("a bigint format should not reach the embed escape:\n%s", schemaForm)
	}
	typeForm := convertAndCheckIDs(t, schemaForm, convert.TargetType)
	for _, expected := range []string{
		"export type Small = TF.BigInt<{max: 255n, min: 0n}>;",
		"export type Signed = TF.BigInt<{max: 9223372036854775807n, min: -9223372036854775808n}>;",
		"export type Stepped = TF.BigInt<{multipleOf: 5n}>;",
	} {
		if !strings.Contains(typeForm, expected) {
			t.Errorf("type form missing %q:\n%s", expected, typeForm)
		}
	}
	convertAndCheckIDs(t, source, convert.TargetBuilders)

	_, diags := convertOne(t, source, convert.Options{Target: convert.TargetJSONSchema, Portable: true})
	if len(diags) != 3 || diags[0].Code != convert.CodePortableDialect {
		t.Fatalf("expected a portable refusal per bigint declaration, got %+v", diags)
	}
}

func TestChain_GenericFormatFamilies(t *testing.T) {
	source := "import * as TF from '@ts-runtypes/core/formats';\n" +
		"export type Short = TF.String<{minLength: 2; maxLength: 5}>;\n" +
		"type Port = TF.Number<{min: 1; max: 65535}>;\n" +
		"type Whole = TF.Number<{integer: true}>;\n"
	builderForm := convertAndCheckIDs(t, source, convert.TargetBuilders)
	if !strings.Contains(builderForm, "TF.string({maxLength: 5, minLength: 2})") {
		t.Errorf("string format should print the value-first family builder:\n%s", builderForm)
	}
	schemaForm := convertAndCheckIDs(t, builderForm, convert.TargetJSONSchema)
	if !strings.Contains(schemaForm, "{type: 'string', rtFormat: 'stringFormat', rtFormatParams: {maxLength: 5, minLength: 2}}") {
		t.Errorf("format brands should ride rtFormat with their params:\n%s", schemaForm)
	}
	typeForm := convertAndCheckIDs(t, schemaForm, convert.TargetType)
	if !strings.Contains(typeForm, "export type Short = TF.String<{maxLength: 5, minLength: 2}>;") {
		t.Errorf("type target should print the brand alias:\n%s", typeForm)
	}
}

func TestChain_NamedFormatPresets(t *testing.T) {
	source := "import * as TF from '@ts-runtypes/core/formats';\n" +
		"export type Contact = TF.Email;\n" +
		"type Uid = TF.UUIDv4;\n" +
		"type AnyUid = TF.UUID;\n" +
		"type Site = TF.Url;\n" +
		"type Host = TF.Hostname;\n" +
		"type Day = TF.StringDate;\n" +
		"type When = TF.Date<{min: 'now'}>;\n"
	builderForm := convertAndCheckIDs(t, source, convert.TargetBuilders)
	for _, expected := range []string{"TF.uuidv4()", "TF.uuid()", "TF.date({min: 'now'})", "getRunType<TypeFormat<string, 'domain', {"} {
		if !strings.Contains(builderForm, expected) {
			t.Errorf("builder form missing %q:\n%s", expected, builderForm)
		}
	}
	schemaForm := convertAndCheckIDs(t, builderForm, convert.TargetJSONSchema)
	if !strings.Contains(schemaForm, "{type: 'string', format: 'uuid', rtFormat: 'uuid', rtFormatParams: {version: '4'}}") {
		t.Errorf("schema form missing the uuid rtFormat row:\n%s", schemaForm)
	}
	convertAndCheckIDs(t, schemaForm, convert.TargetType)
}

func TestChain_RegexPresetEscapesGenericSpelling(t *testing.T) {
	// The regex family's params carry the preset-internal `isRegex` engine
	// flag, which the PUBLIC string builder/alias reject (ExactParams) — the
	// generic `TF.string({isRegex: …})` spelling resolved a DIFFERENT brand
	// and moved the id (found by the FE roundtrip fuzz lane). Any generic
	// family carrying a key outside its public surface must ride the exact
	// TypeFormat constructor instead.
	source := "import * as TF from '@ts-runtypes/core/formats';\n" +
		"export type Pattern = TF.RegexString;\n" +
		"type NotPattern = TF.Not<TF.RegexString>;\n"
	builderForm := convertAndCheckIDs(t, source, convert.TargetBuilders)
	if !strings.Contains(builderForm, "getRunType<TypeFormat<string, 'stringFormat', {isRegex: true") {
		t.Errorf("preset-internal params should escape through the exact constructor:\n%s", builderForm)
	}
	if strings.Contains(builderForm, "TF.string({isRegex") {
		t.Errorf("the generic spelling must never carry a non-public param key:\n%s", builderForm)
	}
	schemaForm := convertAndCheckIDs(t, builderForm, convert.TargetJSONSchema)
	convertAndCheckIDs(t, schemaForm, convert.TargetType)
}

func TestChain_OneOfAndNot(t *testing.T) {
	source := "import * as RT from '@ts-runtypes/core/builders';\n" +
		"import * as TF from '@ts-runtypes/core/formats';\n" +
		"export const choiceRT = RT.oneOf([TF.string(), TF.number()]);\n" +
		"export type Choice = InferType<typeof choiceRT>;\n" +
		"const noMailRT = RT.not(TF.email());\n" +
		"type NoMail = InferType<typeof noMailRT>;\n" +
		"import {type InferType} from '@ts-runtypes/core';\n"
	schemaForm := convertAndCheckIDs(t, source, convert.TargetJSONSchema)
	if !strings.Contains(schemaForm, "{oneOf: [{type: 'number'}, {type: 'string'}]}") {
		t.Errorf("oneOf should print branch-wise:\n%s", schemaForm)
	}
	// Still jsNot: the spec wants the standard `not` (CORE-NOT), but the door
	// does not yet rebuild `Not<F>` from it, so that slice is unlanded.
	if !strings.Contains(schemaForm, "{jsNot: {type: 'string', format: 'email', rtFormat: 'email'") {
		t.Errorf("a negated format should ride the jsNot keyword until CORE-NOT lands:\n%s", schemaForm)
	}
	if strings.Contains(schemaForm, "embedType") {
		t.Errorf("a negated format should not reach the embed escape:\n%s", schemaForm)
	}
	builderForm := convertAndCheckIDs(t, schemaForm, convert.TargetBuilders)
	if !strings.Contains(builderForm, "RT.oneOf([TF.number(), TF.string()])") {
		t.Errorf("oneOf should print RT.oneOf:\n%s", builderForm)
	}
	if !strings.Contains(builderForm, "RT.not(getRunType<TypeFormat<string, 'email', {") {
		t.Errorf("not should wrap the negated brand:\n%s", builderForm)
	}
	typeForm := convertAndCheckIDs(t, builderForm, convert.TargetType)
	if !strings.Contains(typeForm, "RT.OneOf<[number, string]>") {
		t.Errorf("oneOf type spelling missing:\n%s", typeForm)
	}
	if !strings.Contains(typeForm, "TF.Not<TypeFormat<string, 'email', {") {
		t.Errorf("not type spelling missing:\n%s", typeForm)
	}
}

func TestChain_ArraysAndTuples(t *testing.T) {
	source := "export type Tags = string[];\n" +
		"type Grid = number[][];\n" +
		"type Pair = [string, number];\n" +
		"type WithOpt = [string, number?];\n" +
		"type WithRest = [boolean, ...string[]];\n" +
		"type Lits = ['a', 2, true][];\n"
	builderForm := convertAndCheckIDs(t, source, convert.TargetBuilders)
	for _, expected := range []string{
		"RT.array(TF.string())",
		"RT.array(RT.array(TF.number()))",
		"RT.tuple([TF.string(), TF.number()])",
		"RT.tuple([TF.string()], [TF.number()])",
		"RT.tuple([RT.boolean()], [], TF.string())",
	} {
		if !strings.Contains(builderForm, expected) {
			t.Errorf("builder form missing %q:\n%s", expected, builderForm)
		}
	}
	schemaForm := convertAndCheckIDs(t, builderForm, convert.TargetJSONSchema)
	for _, expected := range []string{
		"{type: 'array', items: {type: 'string'}}",
		"{type: 'array', prefixItems: [{type: 'string'}, {type: 'number'}], minItems: 2, items: false}",
		"{type: 'array', prefixItems: [{type: 'string'}, {type: 'number'}], minItems: 1, items: false}",
		"{type: 'array', prefixItems: [{type: 'boolean'}], minItems: 1, items: {type: 'string'}}",
	} {
		if !strings.Contains(schemaForm, expected) {
			t.Errorf("schema form missing %q:\n%s", expected, schemaForm)
		}
	}
	typeForm := convertAndCheckIDs(t, schemaForm, convert.TargetType)
	for _, expected := range []string{"type Grid = number[][];", "type WithOpt = [string, number?];", "type WithRest = [boolean, ...string[]];"} {
		if !strings.Contains(typeForm, expected) {
			t.Errorf("type form missing %q:\n%s", expected, typeForm)
		}
	}
}

func TestChain_StructuralParams(t *testing.T) {
	source := "import * as RT from '@ts-runtypes/core/builders';\n" +
		"import * as TF from '@ts-runtypes/core/formats';\n" +
		"import {type InferType} from '@ts-runtypes/core';\n" +
		"export const uniqRT = RT.array(TF.string(), {uniqueItems: true, maxItems: 4});\n" +
		"export type Uniq = InferType<typeof uniqRT>;\n" +
		"const cntRT = RT.array(TF.number(), {contains: TF.number({min: 5}), minContains: 2});\n" +
		"type Cnt = InferType<typeof cntRT>;\n" +
		"const keysRT = RT.record(TF.string(), {minProperties: 1, propertyNames: TF.string({maxLength: 3})});\n" +
		"type Keys = InferType<typeof keysRT>;\n" +
		"const patRT = RT.record(RT.unknown(), {patternProperties: {'^a': TF.number()}});\n" +
		"type Pat = InferType<typeof patRT>;\n"
	schemaForm := convertAndCheckIDs(t, source, convert.TargetJSONSchema)
	for _, expected := range []string{
		"{type: 'array', items: {type: 'string'}, maxItems: 4, uniqueItems: true}",
		"contains: {type: 'number', rtFormat: 'numberFormat', rtFormatParams: {min: 5}}, minContains: 2",
		"minProperties: 1, propertyNames: {type: 'string', rtFormat: 'stringFormat', rtFormatParams: {maxLength: 3}}",
		"patternProperties: {'^a': {type: 'number'}}",
	} {
		if !strings.Contains(schemaForm, expected) {
			t.Errorf("schema form missing %q:\n%s", expected, schemaForm)
		}
	}
	builderForm := convertAndCheckIDs(t, schemaForm, convert.TargetBuilders)
	typeForm := convertAndCheckIDs(t, builderForm, convert.TargetType)
	if !strings.Contains(typeForm, "TF.FormattedArray<TF.String<{}>[], {maxItems: 4, uniqueItems: true}>") &&
		!strings.Contains(typeForm, "TF.FormattedArray<string[], {maxItems: 4, uniqueItems: true}>") {
		t.Errorf("type form missing the FormattedArray spelling:\n%s", typeForm)
	}
}

func TestChain_Objects(t *testing.T) {
	// The spec's own motivating example: docs/done/format-conversion-layer.md.
	source := "export type MyType = {\n" +
		"  id: number;\n" +
		"  name: string;\n" +
		"  tags: string[];\n" +
		"  active?: boolean;\n" +
		"};\n" +
		"type Nested = {meta: {'a b': string; flags: boolean[]}};\n"
	builderForm := convertAndCheckIDs(t, source, convert.TargetBuilders)
	for _, expected := range []string{
		"RT.object({id: TF.number(), name: TF.string(), tags: RT.array(TF.string()), active: RT.optional(RT.boolean())})",
		"RT.object({meta: RT.object({'a b': TF.string(), flags: RT.array(RT.boolean())})})",
	} {
		if !strings.Contains(builderForm, expected) {
			t.Errorf("builder form missing %q:\n%s", expected, builderForm)
		}
	}
	schemaForm := convertAndCheckIDs(t, builderForm, convert.TargetJSONSchema)
	expectedSchema := "{type: 'object', properties: {id: {type: 'number'}, name: {type: 'string'}, " +
		"tags: {type: 'array', items: {type: 'string'}}, active: {type: 'boolean'}}, required: ['id', 'name', 'tags']}"
	if !strings.Contains(schemaForm, expectedSchema) {
		t.Errorf("schema form missing %q:\n%s", expectedSchema, schemaForm)
	}
	typeForm := convertAndCheckIDs(t, schemaForm, convert.TargetType)
	if !strings.Contains(typeForm, "export type MyType = {id: number; name: string; tags: string[]; active?: boolean};") {
		t.Errorf("type form missing the object shape:\n%s", typeForm)
	}
}

func TestChain_IndexShapesPrintRecord(t *testing.T) {
	// `record(key, value)` takes ANY key type, and several index signatures
	// sharing one value type ARE `Record<K1 | K2, V>` — so these print the
	// real builder rather than an escape. On the schema target a key
	// `additionalProperties` cannot speak about (numeric, symbol, a pattern)
	// rides the jsIndexes keyword, one pair per signature.
	for _, testCase := range []struct{ source, builder, schema string }{
		{"export type Numeric = {[key: number]: string};\n", "RT.record(TF.number(), TF.string())",
			"{type: 'object', jsIndexes: [{key: {type: 'number'}, value: {type: 'string'}}]}"},
		{"export type Both = {[k: string]: number; [n: number]: number};\n", "RT.record(RT.union([TF.number(), TF.string()]), TF.number())",
			"jsIndexes: [{key: {type: 'string'}, value: {type: 'number'}}, {key: {type: 'number'}, value: {type: 'number'}}]"},
	} {
		builderForm := convertAndCheckIDs(t, testCase.source, convert.TargetBuilders)
		if !strings.Contains(builderForm, testCase.builder) {
			t.Errorf("expected %q for %q:\n%s", testCase.builder, testCase.source, builderForm)
		}
		convertAndCheckIDs(t, builderForm, convert.TargetType)
		schemaForm := convertAndCheckIDs(t, testCase.source, convert.TargetJSONSchema)
		if !strings.Contains(schemaForm, testCase.schema) {
			t.Errorf("expected %q for %q:\n%s", testCase.schema, testCase.source, schemaForm)
		}
		if strings.Contains(schemaForm, "embedType") {
			t.Errorf("a non-string index key should ride jsIndexes, not the escape:\n%s", schemaForm)
		}
		convertAndCheckIDs(t, schemaForm, convert.TargetType)
	}

	// A pattern key composes the two new keywords: jsIndexes carries the
	// signature, and its key is itself a jsTemplate.
	patternForm := convertAndCheckIDs(t, "export type Routes = {[key: `api/${string}`]: number};\n", convert.TargetJSONSchema)
	if !strings.Contains(patternForm, "jsIndexes: [{key: {jsTemplate: {texts: ['api/', ''], placeholders: [{type: 'string'}]}}, value: {type: 'number'}}]") {
		t.Errorf("a pattern index key should nest jsTemplate inside jsIndexes:\n%s", patternForm)
	}
	convertAndCheckIDs(t, patternForm, convert.TargetType)

	_, diags := convertOne(t, "export type Numeric = {[key: number]: string};\n",
		convert.Options{Target: convert.TargetJSONSchema, Portable: true})
	if len(diags) != 1 || diags[0].Code != convert.CodePortableDialect {
		t.Fatalf("expected the portable refusal for jsIndexes, got %+v", diags)
	}

	// Named members BESIDE an index print the INTERSECTION: `object(...)`
	// cannot carry an index and `record(...)` cannot carry named members, but
	// `Record<K, V> & {…}` is exactly what TypeScript resolves the mixed
	// literal to, so the id is identical. Optional, readonly and narrower
	// members all ride it, on every target.
	for _, testCase := range []struct {
		source, wants string
		// The readonly MODIFIER rides the jsReadonly dialect keyword, so even
		// a mixed record keeps its standard `properties` spelling.
		schemaReadonly string
	}{
		{source: "export type Mixed = {name: string; [key: string]: unknown};\n", wants: "RT.intersection(RT.record(RT.unknown()), RT.object({name: TF.string()}))"},
		{source: "export type Loose = {name?: string; [key: string]: unknown};\n", wants: "RT.optional(TF.string())"},
		{source: "export type Frozen = {readonly name: string; [key: string]: unknown};\n", wants: "RT.propMod({readonly: true}, TF.string())", schemaReadonly: "jsReadonly: ['name']"},
		{source: "export type Typed = {id: 'a' | 'b'; [key: string]: string};\n", wants: "RT.intersection(RT.record(TF.string()), RT.object({id:"},
	} {
		builderForm := convertAndCheckIDs(t, testCase.source, convert.TargetBuilders)
		if !strings.Contains(builderForm, testCase.wants) {
			t.Errorf("expected %q for %q:\n%s", testCase.wants, testCase.source, builderForm)
		}
		convertAndCheckIDs(t, builderForm, convert.TargetType)
		// The schema form is standard 2020-12: `properties` beside
		// `additionalProperties`, which the door lowers back to the same
		// intersection.
		schemaForm := convertAndCheckIDs(t, testCase.source, convert.TargetJSONSchema)
		if strings.Contains(schemaForm, "embedType<") || !strings.Contains(schemaForm, "additionalProperties:") {
			t.Errorf("a mixed record should print properties + additionalProperties:\n%s", schemaForm)
		}
		if testCase.schemaReadonly != "" && !strings.Contains(schemaForm, testCase.schemaReadonly) {
			t.Errorf("expected %q for %q:\n%s", testCase.schemaReadonly, testCase.source, schemaForm)
		}
		convertAndCheckIDs(t, schemaForm, convert.TargetType)
	}
}

func TestChain_UnknownAbsorbedUnion(t *testing.T) {
	// `string | unknown` IS `unknown` to the checker — the union collapses
	// BEFORE reflection, so there is only one type and one id. The generated
	// functions are unknown's, and the converter prints the collapsed spelling
	// from the first leg on; the discarded members can never resurface, and no
	// id can move because no second type ever existed.
	source := "export type Loose = string | unknown;\n" +
		"type Both = {a: number} | unknown;\n" +
		"type Gone = string | never;\n"
	builderForm := convertAndCheckIDs(t, source, convert.TargetBuilders)
	if !strings.Contains(builderForm, "RT.unknown()") || strings.Contains(builderForm, "RT.union(") {
		t.Errorf("an unknown-absorbed union should print the collapsed spelling, not a union:\n%s", builderForm)
	}
	if !strings.Contains(builderForm, "TF.string()") {
		t.Errorf("never should vanish, leaving the plain member:\n%s", builderForm)
	}
	schemaForm := convertAndCheckIDs(t, builderForm, convert.TargetJSONSchema)
	typeForm := convertAndCheckIDs(t, schemaForm, convert.TargetType)
	if !strings.Contains(typeForm, "export type Loose = unknown;") {
		t.Errorf("the type target restores the collapsed union as plain unknown:\n%s", typeForm)
	}
}

func TestChain_Unions(t *testing.T) {
	source := "export type Status = 'draft' | 'live';\n" +
		"type MaybeName = string | null;\n" +
		"type Mixed = number | boolean[] | {kind: 'a'; size: number};\n" +
		"type OptionalIsh = string | undefined;\n" +
		"type Items = ('a' | 'b')[];\n"
	builderForm := convertAndCheckIDs(t, source, convert.TargetBuilders)
	for _, expected := range []string{
		"RT.union([RT.literal('draft'), RT.literal('live')])",
		"RT.union([RT.literal(null), TF.string()])",
	} {
		if !strings.Contains(builderForm, expected) {
			t.Errorf("builder form missing %q:\n%s", expected, builderForm)
		}
	}
	schemaForm := convertAndCheckIDs(t, builderForm, convert.TargetJSONSchema)
	for _, expected := range []string{
		"{enum: ['draft', 'live']}",
		"{enum: ['a', 'b']}",
	} {
		if !strings.Contains(schemaForm, expected) {
			t.Errorf("schema form missing %q:\n%s", expected, schemaForm)
		}
	}
	typeForm := convertAndCheckIDs(t, schemaForm, convert.TargetType)
	for _, expected := range []string{"type Items = ('a' | 'b')[];", "export type Status = 'draft' | 'live';"} {
		if !strings.Contains(typeForm, expected) {
			t.Errorf("type form missing %q:\n%s", expected, typeForm)
		}
	}
}

func TestChain_Natives(t *testing.T) {
	source := "export type Stamp = Date;\n" +
		"type Lookup = Map<string, number[]>;\n" +
		"type Bag = Set<'a' | 'b'>;\n" +
		"type Later = Promise<{ok: boolean}>;\n"
	builderForm := convertAndCheckIDs(t, source, convert.TargetBuilders)
	for _, expected := range []string{
		"TF.date()",
		"RT.map(TF.string(), RT.array(TF.number()))",
		"RT.set(RT.union([RT.literal('a'), RT.literal('b')]))",
		"RT.promise(RT.object({ok: RT.boolean()}))",
	} {
		if !strings.Contains(builderForm, expected) {
			t.Errorf("builder form missing %q:\n%s", expected, builderForm)
		}
	}
	schemaForm := convertAndCheckIDs(t, builderForm, convert.TargetJSONSchema)
	for _, expected := range []string{
		// The wire half sits beside the annotation: a Date encodes as its ISO
		// string, so a standard validator enforces {type, format} and only a
		// dialect-aware reader takes the jsType.
		"runTypeFromJsonSchema({type: 'string', format: 'date-time', jsType: 'Date'} as const)",
		"{type: 'array', items: {type: 'array', prefixItems: [{type: 'string'}, {type: 'array', items: {type: 'number'}}], minItems: 2, items: false}, jsType: 'Map'}",
		"{type: 'array', items: {enum: ['a', 'b']}, uniqueItems: true, jsType: 'Set'}",
		"{jsType: 'Promise', jsResolved: {type: 'object', properties: {ok: {type: 'boolean'}}, required: ['ok']}}",
	} {
		if !strings.Contains(schemaForm, expected) {
			t.Errorf("schema form missing %q:\n%s", expected, schemaForm)
		}
	}
	typeForm := convertAndCheckIDs(t, schemaForm, convert.TargetType)
	for _, expected := range []string{"export type Stamp = Date;", "type Lookup = Map<string, number[]>;", "type Bag = Set<'a' | 'b'>;", "type Later = Promise<{ok: boolean}>;"} {
		if !strings.Contains(typeForm, expected) {
			t.Errorf("type form missing %q:\n%s", expected, typeForm)
		}
	}
}

func TestChain_Records(t *testing.T) {
	source := "export type Env = Record<string, string>;\n" +
		"type Counts = {[key: string]: number};\n" +
		"type Deep = Record<string, {ok: boolean} | null>;\n"
	builderForm := convertAndCheckIDs(t, source, convert.TargetBuilders)
	if !strings.Contains(builderForm, "RT.record(TF.string())") || !strings.Contains(builderForm, "RT.record(TF.number())") {
		t.Errorf("records should print RT.record:\n%s", builderForm)
	}
	schemaForm := convertAndCheckIDs(t, builderForm, convert.TargetJSONSchema)
	if !strings.Contains(schemaForm, "{type: 'object', additionalProperties: {type: 'string'}}") {
		t.Errorf("records should print additionalProperties:\n%s", schemaForm)
	}
	typeForm := convertAndCheckIDs(t, schemaForm, convert.TargetType)
	for _, expected := range []string{"export type Env = Record<string, string>;", "type Counts = Record<string, number>;"} {
		if !strings.Contains(typeForm, expected) {
			t.Errorf("type form missing %q:\n%s", expected, typeForm)
		}
	}
}

func TestReadonlyMember_FullChain(t *testing.T) {
	source := "type WithRO = {readonly id: string; count: number};\n"
	builderForm := convertAndCheckIDs(t, source, convert.TargetBuilders)
	if !strings.Contains(builderForm, "RT.object({id: RT.propMod({readonly: true}, TF.string()), count: TF.number()})") {
		t.Errorf("readonly member should ride propMod:\n%s", builderForm)
	}
	// The modifier rides the jsReadonly dialect keyword, so the object keeps
	// its standard spelling — `count` is still an ordinary `{type: 'number'}`
	// property rather than being dragged into an escape by its sibling.
	schemaForm := convertAndCheckIDs(t, builderForm, convert.TargetJSONSchema)
	if !strings.Contains(schemaForm, "required: ['id', 'count'], jsReadonly: ['id']") {
		t.Errorf("readonly member should ride the jsReadonly keyword:\n%s", schemaForm)
	}
	if strings.Contains(schemaForm, "embedType") {
		t.Errorf("a readonly member must not escape its whole object:\n%s", schemaForm)
	}
	if !strings.Contains(schemaForm, "count: {type: 'number'}") {
		t.Errorf("the mutable sibling should keep its standard spelling:\n%s", schemaForm)
	}
	typeForm := convertAndCheckIDs(t, schemaForm, convert.TargetType)
	if !strings.Contains(typeForm, "type WithRO = {readonly id: string; count: number};") {
		t.Errorf("readonly modifier must survive the full chain:\n%s", typeForm)
	}
	_, diags := convertOne(t, source, convert.Options{Target: convert.TargetJSONSchema, Portable: true})
	if len(diags) != 1 || diags[0].Code != convert.CodePortableDialect {
		t.Fatalf("expected the portable refusal for the readonly embed, got %+v", diags)
	}
}

func TestChain_LabeledTuple(t *testing.T) {
	source := "type Point = [x: number, y: number];\n" +
		"export type Span = [start: number, len?: number, ...rest: string[]];\n"
	builderForm := convertAndCheckIDs(t, source, convert.TargetBuilders)
	if !strings.Contains(builderForm, "RT.tuple([RT.slot('x', TF.number()), RT.slot('y', TF.number())])") {
		t.Errorf("labeled tuples should print the slot form:\n%s", builderForm)
	}
	if !strings.Contains(builderForm, "RT.tuple([RT.slot('start', TF.number())], [RT.slot('len', TF.number())], RT.slot('rest', TF.string()))") {
		t.Errorf("optional and rest slots should carry their labels:\n%s", builderForm)
	}
	schemaForm := convertAndCheckIDs(t, builderForm, convert.TargetJSONSchema)
	if !strings.Contains(schemaForm, "jsLabels: ['x', 'y']") {
		t.Errorf("labeled tuples should print the jsLabels dialect keyword on the schema target:\n%s", schemaForm)
	}
	if !strings.Contains(schemaForm, "jsLabels: ['start', 'len', 'rest']") {
		t.Errorf("optional and rest slots should ride jsLabels in order:\n%s", schemaForm)
	}
	typeForm := convertAndCheckIDs(t, schemaForm, convert.TargetType)
	if !strings.Contains(typeForm, "type Point = [x: number, y: number];") ||
		!strings.Contains(typeForm, "export type Span = [start: number, len?: number, ...rest: string[]];") {
		t.Errorf("type target should restore the labeled spellings:\n%s", typeForm)
	}
}

func TestChain_NamedFunctionParams(t *testing.T) {
	// All-required named params ride the slot form; optional/rest params keep
	// the getRunType escape (their value-first spellings have no id-exact
	// twin) — TestChain_Functions pins that side.
	source := "export type Send = (event: string, retries: number) => boolean;\n"
	builderForm := convertAndCheckIDs(t, source, convert.TargetBuilders)
	if !strings.Contains(builderForm, "RT.func([RT.slot('event', TF.string()), RT.slot('retries', TF.number())], RT.boolean())") {
		t.Errorf("named function params should print the slot form:\n%s", builderForm)
	}
	// On the schema target the signature rides jsFunction: the params are an
	// ordinary tuple schema, so their names come along on jsLabels.
	schemaForm := convertAndCheckIDs(t, builderForm, convert.TargetJSONSchema)
	if !strings.Contains(schemaForm, "{jsFunction: {params: {type: 'array', prefixItems: [{type: 'string'}, {type: 'number'}], minItems: 2, items: false, jsLabels: ['event', 'retries']}, return: {type: 'boolean'}}}") {
		t.Errorf("functions should ride the jsFunction dialect keyword:\n%s", schemaForm)
	}
	if strings.Contains(schemaForm, "embedType") {
		t.Errorf("a named all-required signature should not reach the embed escape:\n%s", schemaForm)
	}
	typeForm := convertAndCheckIDs(t, schemaForm, convert.TargetType)
	if !strings.Contains(typeForm, "export type Send = (event: string, retries: number) => boolean;") {
		t.Errorf("type target should restore the named signature:\n%s", typeForm)
	}

	_, diags := convertOne(t, source, convert.Options{Target: convert.TargetJSONSchema, Portable: true})
	if len(diags) != 1 || diags[0].Code != convert.CodePortableDialect {
		t.Fatalf("expected the portable refusal for jsFunction, got %+v", diags)
	}
}

func TestChain_OptionalAndRestParamsKeepTheEscape(t *testing.T) {
	// The two signature shapes jsFunction cannot carry, both for the same
	// reason: the door spreads the params tuple into a rest parameter and the
	// parameter names ride an intersection on that tuple, so materialising the
	// signature rewrites `extra?: string` into a required `extra: string |
	// undefined`, and a rest slot comes back as ONE spread parameter carrying
	// a labeled tuple. Dropping the names would keep both, but names fold into
	// the id just as hard — so the escape carries these exactly, which is the
	// same line the value-first slot form draws.
	for _, testCase := range []struct{ source, embed string }{
		{"export type Send = (event: string, extra?: string) => boolean;\n",
			"embedType<(event: string, extra?: string) => boolean>()"},
		{"export type Emit = (topic: string, ...values: number[]) => void;\n",
			"embedType<(topic: string, ...values: number[]) => void>()"},
	} {
		schemaForm := convertAndCheckIDs(t, testCase.source, convert.TargetJSONSchema)
		if !strings.Contains(schemaForm, testCase.embed) {
			t.Errorf("expected %q for %q:\n%s", testCase.embed, testCase.source, schemaForm)
		}
		convertAndCheckIDs(t, schemaForm, convert.TargetType)
	}
}

func TestChain_ImportLayoutPathIndependent(t *testing.T) {
	// The FE roundtrip fuzz lane's find (seed 0x5150): a kept user binding on
	// a managed module rides its own statement once the builders form renders
	// namespace + named as two statements — the NEXT leg's scan must fold that
	// extra statement back into the canonical block, or its position depends
	// on which legs the file has been through and two chains landing on the
	// same form disagree on import order.
	source := "import type * as TF from '@ts-runtypes/core/formats';\n" +
		"import type {OneOf as TFOneOf} from '@ts-runtypes/core/builders';\n" +
		"export type Boxed = TF.FormattedObject<Record<string, string>, {minProperties: 2}>;\n"
	buildersForm := convertAndCheckIDs(t, source, convert.TargetBuilders)
	passA := convertAndCheckIDs(t, buildersForm, convert.TargetType)
	schemaForm := convertAndCheckIDs(t, buildersForm, convert.TargetJSONSchema)
	passB := convertAndCheckIDs(t, schemaForm, convert.TargetType)
	if passA != passB {
		t.Fatalf("type-form fixpoint diverged:\n--- builders → type ---\n%s\n--- builders → json-schema → type ---\n%s", passA, passB)
	}
	wantBlock := "import {type OneOf as TFOneOf} from '@ts-runtypes/core/builders';\n" +
		"import * as TF from '@ts-runtypes/core/formats';\n"
	if !strings.Contains(passA, wantBlock) {
		t.Errorf("managed imports must land as one canonical block (kept user binding folded):\n%s", passA)
	}
}

func TestPortable_LabeledTupleRefused(t *testing.T) {
	source := "type Point = [x: number, y: number];\n"
	_, diags := convertOne(t, source, convert.Options{Target: convert.TargetJSONSchema, Portable: true})
	if len(diags) != 1 || diags[0].Code != convert.CodePortableDialect {
		t.Fatalf("expected one CNV006 for the labeled-tuple embed under --portable, got %+v", diags)
	}
}

func TestPortable_DialectRefused(t *testing.T) {
	source := "type Big = bigint;\ntype BigLit = 123n;\ntype Plain = string;\n"
	output, diags := convertOne(t, source, convert.Options{Target: convert.TargetJSONSchema, Portable: true})
	errorCount := 0
	for _, diagnostic := range diags {
		if diagnostic.Code != convert.CodePortableDialect {
			t.Errorf("expected only CNV006, got %s [%s]: %s", diagnostic.Code, diagnostic.Decl, diagnostic.Message)
		}
		errorCount++
	}
	if errorCount != 2 {
		t.Errorf("expected 2 portable refusals (Big, BigLit), got %d", errorCount)
	}
	if !strings.Contains(output, "type Big = bigint;") || !strings.Contains(output, "runTypeFromJsonSchema({type: 'string'} as const)") {
		t.Errorf("portable run must skip dialect declarations and convert the rest:\n%s", output)
	}
}

func TestAnonymousCycle_Refused(t *testing.T) {
	// A cycle that never passes through a NAMED declaration root has no
	// spelling (`self()` / `$ref: '#'` bind the root only): the indexed
	// access below makes the INNER object cycle on itself while only the
	// outer object is named. The declaration errors and stays untouched.
	source := "type Outer = {inner: {back?: Outer['inner']}};\ntype Plain = string;\n"
	output, diags := convertOne(t, source, convert.Options{Target: convert.TargetBuilders})
	foundCycleDiag := false
	for _, diagnostic := range diags {
		if diagnostic.Code == convert.CodeUnsupportedKind && strings.Contains(diagnostic.Message, "cycle") {
			foundCycleDiag = true
		}
	}
	if !foundCycleDiag {
		t.Fatalf("expected a CNV001 unnamed-cycle diagnostic, got %+v", diags)
	}
	if !strings.Contains(output, "const plainRT = TF.string();") {
		t.Errorf("the rest of the file still converts:\n%s", output)
	}
}

func TestAnonymousCycle_RescuedByNamingIt(t *testing.T) {
	// Naming the cycling inner type turns the unnamed cycle into an ordinary
	// declaration reference, so the same shape converts.
	source := "type Outer = {inner: {back?: Outer['inner']}};\ntype Cut = Outer['inner'];\n"
	output, diags := convertOne(t, source, convert.Options{Target: convert.TargetBuilders})
	expectNoDiags(t, diags)
	if !strings.Contains(output, "getRunType<Cut>()") || !strings.Contains(output, "RT.circular(") {
		t.Errorf("naming the inner cycle should convert via a reference + its own circular:\n%s", output)
	}
}

func TestGenericDecl_Refused(t *testing.T) {
	source := "type Box<T> = T;\ntype Plain = string;\n"
	output, diags := convertOne(t, source, convert.Options{Target: convert.TargetBuilders})
	if len(diags) != 1 || diags[0].Code != convert.CodeGenericDecl {
		t.Fatalf("expected one CNV002, got %+v", diags)
	}
	if !strings.Contains(output, "type Box<T> = T;") || !strings.Contains(output, "const plainRT = TF.string();") {
		t.Errorf("generic declarations stay untouched while the rest converts:\n%s", output)
	}
}
