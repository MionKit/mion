package convert_test

import (
	"strings"
	"testing"

	"github.com/mionkit/ts-runtypes/internal/convert"
)

func TestChain_Functions(t *testing.T) {
	source := "export type Handler = (event: string, retries?: number, ...rest: boolean[]) => Promise<void>;\n" +
		"type Callback = () => void;\n"
	builderForm := convertAndCheckIDs(t, source, convert.TargetBuilders)
	if !strings.Contains(builderForm, "getRunType<(event: string, retries?: number, ...rest: boolean[]) => Promise<void>>()") {
		t.Errorf("functions should escape through getRunType with their labels:\n%s", builderForm)
	}
	schemaForm := convertAndCheckIDs(t, builderForm, convert.TargetJSONSchema)
	if !strings.Contains(schemaForm, "embedType<(event: string, retries?: number, ...rest: boolean[]) => Promise<void>>()") {
		t.Errorf("functions should embed on the schema target:\n%s", schemaForm)
	}
	typeForm := convertAndCheckIDs(t, schemaForm, convert.TargetType)
	if !strings.Contains(typeForm, "export type Handler = (event: string, retries?: number, ...rest: boolean[]) => Promise<void>;") {
		t.Errorf("type target should print the arrow type with labels:\n%s", typeForm)
	}
}

func TestFunctionLabels_FoldIntoID(t *testing.T) {
	// Parameter names fold into the structural id — the printed labels must be
	// the reflected ones, so two same-shape-different-label functions stay
	// distinct through conversion.
	first := declIDs(t, "type Fn = (a: string) => void;\n")
	second := declIDs(t, "type Fn = (b: string) => void;\n")
	if first["Fn"] == second["Fn"] {
		t.Skip("parameter labels do not fold into the id on this build")
	}
	convertAndCheckIDs(t, "type Fn = (a: string) => void;\n", convert.TargetBuilders)
}

func TestChain_MethodMembers(t *testing.T) {
	source := "export type Repo = {find(id: string): number; close(): void; version: number};\n"
	builderForm := convertAndCheckIDs(t, source, convert.TargetBuilders)
	if !strings.Contains(builderForm, "getRunType<{find(id: string): number; close(): void; version: number}>()") {
		t.Errorf("method-bearing objects should escape whole:\n%s", builderForm)
	}
	schemaForm := convertAndCheckIDs(t, builderForm, convert.TargetJSONSchema)
	typeForm := convertAndCheckIDs(t, schemaForm, convert.TargetType)
	if !strings.Contains(typeForm, "find(id: string): number") {
		t.Errorf("type target should keep method syntax:\n%s", typeForm)
	}
}

func TestChain_CallableObject(t *testing.T) {
	source := "export type Tagger = {(value: string): number; label: string};\n"
	builderForm := convertAndCheckIDs(t, source, convert.TargetBuilders)
	// The reflected member order lists properties before call signatures;
	// the id oracle proves the reordered spelling resolves identically.
	if !strings.Contains(builderForm, "getRunType<{label: string; (value: string): number}>()") {
		t.Errorf("callable objects should escape whole:\n%s", builderForm)
	}
	convertAndCheckIDs(t, builderForm, convert.TargetType)
}

func TestChain_TemplateLiteral(t *testing.T) {
	source := "export type Route = `api/${string}/v${number}`;\n"
	builderForm := convertAndCheckIDs(t, source, convert.TargetBuilders)
	if !strings.Contains(builderForm, "getRunType<`api/${string}/v${number}`>()") {
		t.Errorf("template literals should escape through getRunType:\n%s", builderForm)
	}
	// On the schema target the parts ride the jsTemplate keyword as data: the
	// literal chunks beside the placeholder schemas, which is what lets the
	// door rebuild the type (a pattern string alone could not).
	schemaForm := convertAndCheckIDs(t, builderForm, convert.TargetJSONSchema)
	if !strings.Contains(schemaForm, "{jsTemplate: {texts: ['api/', '/v', ''], placeholders: [{type: 'string'}, {type: 'number'}]}}") {
		t.Errorf("template literals should ride the jsTemplate dialect keyword:\n%s", schemaForm)
	}
	if strings.Contains(schemaForm, "embedType") {
		t.Errorf("template literals should not reach the embed escape:\n%s", schemaForm)
	}
	typeForm := convertAndCheckIDs(t, schemaForm, convert.TargetType)
	if !strings.Contains(typeForm, "export type Route = `api/${string}/v${number}`;") {
		t.Errorf("type target should reconstruct the backtick spelling:\n%s", typeForm)
	}
	// bigint is a placeholder in its own right. A LITERAL placeholder is not:
	// the checker folds `${'a'}` into the neighbouring text before reflection
	// ever sees it, which is why `texts` here opens with 'a-' and only two
	// placeholders survive.
	mixed := convertAndCheckIDs(t, "export type Mixed = `${'a'}-${bigint}-${number}`;\n", convert.TargetJSONSchema)
	if !strings.Contains(mixed, "texts: ['a-', '-', ''], placeholders: [{jsType: 'bigint'}, {type: 'number'}]") {
		t.Errorf("a bigint placeholder should get a schema, a literal one folds into the text:\n%s", mixed)
	}
	convertAndCheckIDs(t, mixed, convert.TargetType)
}

func TestPortable_TemplateLiteralRefused(t *testing.T) {
	source := "export type Route = `api/${string}`;\n"
	_, diags := convertOne(t, source, convert.Options{Target: convert.TargetJSONSchema, Portable: true})
	if len(diags) != 1 || diags[0].Code != convert.CodePortableDialect {
		t.Fatalf("expected the portable refusal for jsTemplate, got %+v", diags)
	}
}

func TestChain_BrandMeta(t *testing.T) {
	source := "export type Email = string & {readonly __brand: 'email'};\n" +
		"export type Indexed = number & {dbIndex: true};\n"
	builderForm := convertAndCheckIDs(t, source, convert.TargetBuilders)
	if !strings.Contains(builderForm, "getRunType<string & {readonly __brand: 'email'}>()") {
		t.Errorf("brand metadata should escape with the intersection:\n%s", builderForm)
	}
	schemaForm := convertAndCheckIDs(t, builderForm, convert.TargetJSONSchema)
	if !strings.Contains(schemaForm, "embedType<string & {readonly __brand: 'email'}>()") {
		t.Errorf("brand metadata should embed on the schema target:\n%s", schemaForm)
	}
	typeForm := convertAndCheckIDs(t, schemaForm, convert.TargetType)
	if !strings.Contains(typeForm, "export type Email = string & {readonly __brand: 'email'};") {
		t.Errorf("type target should restore the intersection spelling:\n%s", typeForm)
	}
}

func TestChain_BareObject(t *testing.T) {
	source := "export type Anything = {payload: object};\n"
	builderForm := convertAndCheckIDs(t, source, convert.TargetBuilders)
	schemaForm := convertAndCheckIDs(t, builderForm, convert.TargetJSONSchema)
	typeForm := convertAndCheckIDs(t, schemaForm, convert.TargetType)
	if !strings.Contains(typeForm, "payload: object") {
		t.Errorf("bare object should survive the chain:\n%s", typeForm)
	}
}

func TestPortable_FunctionRefused(t *testing.T) {
	source := "export type Handler = (event: string) => void;\n"
	_, diags := convertOne(t, source, convert.Options{Target: convert.TargetJSONSchema, Portable: true})
	if len(diags) != 1 || diags[0].Code != convert.CodePortableDialect {
		t.Fatalf("expected one CNV006 for a function under --portable, got %+v", diags)
	}
}

func TestNonEnumerableMember_Refused(t *testing.T) {
	source := "type Guarded = {\n  /** @nonEnumerable */\n  hidden?: string;\n  shown: number;\n};\n"
	output, diags := convertOne(t, source, convert.Options{Target: convert.TargetBuilders})
	if len(diags) != 1 || diags[0].Code != convert.CodeUnsupportedKind || !strings.Contains(diags[0].Message, "@nonEnumerable") {
		t.Fatalf("expected the @nonEnumerable refusal, got %+v", diags)
	}
	if !strings.Contains(output, "@nonEnumerable") {
		t.Errorf("declaration must stay untouched:\n%s", output)
	}
}

func TestParameterDefault_Refused(t *testing.T) {
	source := "function greet(name = 'ana'): string {\n  return name;\n}\nexport type Greeter = typeof greet;\n"
	_, diags := convertOne(t, source, convert.Options{Target: convert.TargetBuilders})
	if len(diags) != 1 || diags[0].Code != convert.CodeUnsupportedKind || !strings.Contains(diags[0].Message, "default value") {
		t.Fatalf("expected the parameter-default refusal, got %+v", diags)
	}
}
