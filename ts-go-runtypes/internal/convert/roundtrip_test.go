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
	t.Helper()
	prog, session, cwd := setupConvert(t, map[string]string{"main.ts": source})
	defer session.Close()
	absPath := tspath.ResolvePath(cwd, "main.ts")
	ids, idsErr := convert.DeclarationIDs(prog, session.Checker(), session.Cache(), prog.FS, absPath)
	if idsErr != nil {
		t.Fatalf("DeclarationIDs: %v", idsErr)
	}
	return ids
}

// convertAndCheckIDs converts source to target and asserts every declaration
// resolves to the SAME structural id afterwards — the C2 oracle, Go-side.
func convertAndCheckIDs(t *testing.T, source string, target convert.Target) string {
	t.Helper()
	output, diags := convertOne(t, source, convert.Options{Target: target})
	expectNoDiags(t, diags)
	before := declIDs(t, source)
	after := declIDs(t, output)
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
	if !strings.Contains(schemaForm, "runTypeFromJsonSchema({jsType: 'bigint'} as const)") {
		t.Errorf("bigint atom should ride the jsType dialect:\n%s", schemaForm)
	}
	if !strings.Contains(schemaForm, "runTypeFromJsonSchema(embedType(123n))") {
		t.Errorf("bigint literal should ride embedType:\n%s", schemaForm)
	}
	typeForm := convertAndCheckIDs(t, schemaForm, convert.TargetType)
	for _, expected := range []string{"type BigLit = 123n;", "type Answer = 42;", "type Missing = undefined;", "export type UserId = string;"} {
		if !strings.Contains(typeForm, expected) {
			t.Errorf("chain output missing %q:\n%s", expected, typeForm)
		}
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
	if !strings.Contains(schemaForm, "{jsFormat: {name: 'stringFormat', params: {maxLength: 5, minLength: 2}}} as const") {
		t.Errorf("format brands should ride jsFormat verbatim:\n%s", schemaForm)
	}
	typeForm := convertAndCheckIDs(t, schemaForm, convert.TargetType)
	if !strings.Contains(typeForm, "export type Short = TF.String<{maxLength: 5, minLength: 2}>;") {
		t.Errorf("type target should print the brand alias:\n%s", typeForm)
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
		"runTypeFromJsonSchema({jsType: 'Date'} as const)",
		"{jsType: 'Map', typeArguments: [{type: 'string'}, {type: 'array', items: {type: 'number'}}]}",
		"{jsType: 'Set', typeArguments: [{enum: ['a', 'b']}]}",
		"{jsType: 'Promise', typeArguments: [{type: 'object', properties: {ok: {type: 'boolean'}}, required: ['ok']}]}",
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

func TestReadonlyMember_TypeBuilderOnly(t *testing.T) {
	source := "type WithRO = {readonly id: string; count: number};\n"
	builderForm := convertAndCheckIDs(t, source, convert.TargetBuilders)
	if !strings.Contains(builderForm, "RT.object({id: RT.propMod({readonly: true}, TF.string()), count: TF.number()})") {
		t.Errorf("readonly member should ride propMod:\n%s", builderForm)
	}
	typeForm := convertAndCheckIDs(t, builderForm, convert.TargetType)
	if !strings.Contains(typeForm, "type WithRO = {readonly id: string; count: number};") {
		t.Errorf("readonly modifier must survive the builder leg:\n%s", typeForm)
	}
	_, diags := convertOne(t, source, convert.Options{Target: convert.TargetJSONSchema})
	if len(diags) != 1 || diags[0].Code != convert.CodeUnsupportedKind {
		t.Fatalf("expected the jsReadonly-pending refusal, got %+v", diags)
	}
}

func TestLabeledTuple_RefusedForNow(t *testing.T) {
	source := "type Point = [x: number, y: number];\n"
	output, diags := convertOne(t, source, convert.Options{Target: convert.TargetBuilders})
	if len(diags) != 1 || diags[0].Code != convert.CodeUnsupportedKind {
		t.Fatalf("expected one CNV001 for the labeled tuple, got %+v", diags)
	}
	if !strings.Contains(output, "type Point = [x: number, y: number];") {
		t.Errorf("labeled tuple must stay untouched:\n%s", output)
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

func TestCircular_RefusedForNow(t *testing.T) {
	source := "type Tree = {value: number; kids: Tree[]};\ntype Plain = string;\n"
	output, diags := convertOne(t, source, convert.Options{Target: convert.TargetBuilders})
	if len(diags) != 1 || diags[0].Code != convert.CodeUnsupportedKind {
		t.Fatalf("expected one CNV001 for the circular type, got %+v", diags)
	}
	if !strings.Contains(output, "type Tree = {value: number; kids: Tree[]};") || !strings.Contains(output, "const plainRT = TF.string();") {
		t.Errorf("circular declaration stays untouched while the rest converts:\n%s", output)
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
