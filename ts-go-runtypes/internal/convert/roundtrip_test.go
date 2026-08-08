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
