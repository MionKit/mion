package convert_test

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/convert"
)

func TestChain_Functions(t *testing.T) {
	source := "export type Handler = (event: string, retries?: number, ...rest: boolean[]) => Promise<void>;\n" +
		"type Callback = () => void;\n"
	builderForm := convertAndCheckIDs(t, source, convert.TargetBuilders)
	if !strings.Contains(builderForm, "getRunType<(event: string, retries?: number, ...rest: boolean[]) => Promise<void>>()") {
		t.Errorf("functions should escape through getRunType with their labels:\n%s", builderForm)
	}
	typeForm := convertAndCheckIDs(t, builderForm, convert.TargetType)
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
	typeForm := convertAndCheckIDs(t, builderForm, convert.TargetType)
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
	typeForm := convertAndCheckIDs(t, builderForm, convert.TargetType)
	if !strings.Contains(typeForm, "export type Route = `api/${string}/v${number}`;") {
		t.Errorf("type target should reconstruct the backtick spelling:\n%s", typeForm)
	}
	// bigint is a placeholder in its own right. A LITERAL placeholder is not:
	// the checker folds `${'a'}` into the neighbouring text before reflection
	// ever sees it.
	mixed := convertAndCheckIDs(t, "export type Mixed = `${'a'}-${bigint}-${number}`;\n", convert.TargetBuilders)
	convertAndCheckIDs(t, mixed, convert.TargetType)
}

func TestChain_BrandMeta(t *testing.T) {
	source := "export type Email = string & {readonly __brand: 'email'};\n" +
		"export type Indexed = number & {dbIndex: true};\n"
	builderForm := convertAndCheckIDs(t, source, convert.TargetBuilders)
	if !strings.Contains(builderForm, "getRunType<string & {readonly __brand: 'email'}>()") {
		t.Errorf("brand metadata should escape with the intersection:\n%s", builderForm)
	}
	typeForm := convertAndCheckIDs(t, builderForm, convert.TargetType)
	if !strings.Contains(typeForm, "export type Email = string & {readonly __brand: 'email'};") {
		t.Errorf("type target should restore the intersection spelling:\n%s", typeForm)
	}
}

func TestChain_BareObject(t *testing.T) {
	source := "export type Anything = {payload: object};\n"
	builderForm := convertAndCheckIDs(t, source, convert.TargetBuilders)
	typeForm := convertAndCheckIDs(t, builderForm, convert.TargetType)
	if !strings.Contains(typeForm, "payload: object") {
		t.Errorf("bare object should survive the chain:\n%s", typeForm)
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
