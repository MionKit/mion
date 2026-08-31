package convert_test

import (
	"sort"
	"strings"
	"testing"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-runtypes/internal/compiler/program"
	"github.com/mionkit/ts-runtypes/internal/compiler/resolver"
	"github.com/mionkit/ts-runtypes/internal/convert"
	"github.com/mionkit/ts-runtypes/internal/jsengine"
	"github.com/mionkit/ts-runtypes/internal/testfixtures"
)

// setupConvert builds a single-checker Program + Session over an in-memory
// overlay that includes the REAL @mionjs/run-types package (built dist), the
// same shape the resolver's own inline tests use.
func setupConvert(t testing.TB, sources map[string]string) (*program.Program, *resolver.Session, string) {
	t.Helper()
	cwd := tspath.NormalizePath(t.TempDir())
	overlay := map[string]string{}
	markerFiles, markerErr := testfixtures.RealMarkerPackage()
	if markerErr != nil {
		t.Fatalf("real marker package unavailable (build packages/ts-runtypes dist first): %v", markerErr)
	}
	for rel, content := range markerFiles {
		overlay[tspath.ResolvePath(cwd, rel)] = content
	}
	relNames := make([]string, 0, len(sources))
	for rel, content := range sources {
		overlay[tspath.ResolvePath(cwd, rel)] = content
		relNames = append(relNames, rel)
	}
	sort.Strings(relNames)
	fileNames := make([]string, 0, len(relNames))
	for _, rel := range relNames {
		fileNames = append(fileNames, tspath.ResolvePath(cwd, rel))
	}
	prog, progErr := program.NewInferred(program.Options{Cwd: cwd, Overlay: overlay, SingleThreaded: true}, fileNames)
	if progErr != nil {
		t.Fatalf("build program: %v", progErr)
	}
	session, resolverErr := resolver.New(prog, resolver.Options{Cwd: cwd, SingleThreaded: true, JSEngine: jsengine.NewSidecar("")})
	if resolverErr != nil {
		t.Fatalf("build resolver: %v", resolverErr)
	}
	return prog, session, cwd
}

// convertOne converts a single main.ts source and returns the output + diags.
func convertOne(t testing.TB, source string, opts convert.Options) (string, []convert.Diagnostic) {
	t.Helper()
	return convertOneIn(t, map[string]string{"main.ts": source}, opts)
}

// convertOneIn converts main.ts out of a full sources map — extra entries
// carry ambients (the Temporal fixture) or sibling modules.
func convertOneIn(t testing.TB, sources map[string]string, opts convert.Options) (string, []convert.Diagnostic) {
	t.Helper()
	prog, session, cwd := setupConvert(t, sources)
	defer session.Close()
	absPath := tspath.ResolvePath(cwd, "main.ts")
	result, convertErr := convert.ConvertFile(prog, session.Checker(), session.Cache(), session.MarkerOptions(), absPath, opts, nil)
	if convertErr != nil {
		t.Fatalf("ConvertFile: %v", convertErr)
	}
	return result.Output, result.Diags
}

// expectNoDiags fails on any diagnostic, printing them all.
func expectNoDiags(t *testing.T, diags []convert.Diagnostic) {
	t.Helper()
	for _, diagnostic := range diags {
		t.Errorf("unexpected diagnostic %s [%s]: %s", diagnostic.Code, diagnostic.Decl, diagnostic.Message)
	}
}

const buildersHeader = "import {type InferType} from '@mionjs/run-types';\n" +
	"import * as RT from '@mionjs/run-types/builders';\n" +
	"import * as TF from '@mionjs/run-types/formats';\n"

func TestTypeToBuilders_Atoms(t *testing.T) {
	source := "" +
		"/** The user id. */\n" +
		"export type UserId = string;\n" +
		"type Count = number;\n" +
		"type Name = 'ana';\n"
	output, diags := convertOne(t, source, convert.Options{Target: convert.TargetBuilders})
	expectNoDiags(t, diags)
	expected := buildersHeader +
		"/** The user id. */\n" +
		"export const userIdRT = TF.string();\n" +
		"export type UserId = InferType<typeof userIdRT>;\n" +
		"const countRT = TF.number();\n" +
		"type Count = InferType<typeof countRT>;\n" +
		"const nameRT = RT.literal('ana');\n" +
		"type Name = InferType<typeof nameRT>;\n"
	if output != expected {
		t.Errorf("output mismatch:\n--- got ---\n%s\n--- want ---\n%s", output, expected)
	}
}

func TestBuildersToType_Atoms(t *testing.T) {
	source := buildersHeader +
		"export const userIdRT = TF.string();\n" +
		"export type UserId = InferType<typeof userIdRT>;\n" +
		"const nameRT = RT.literal('ana');\n" +
		"type Name = InferType<typeof nameRT>;\n"
	output, diags := convertOne(t, source, convert.Options{Target: convert.TargetType})
	expectNoDiags(t, diags)
	expected := "export type UserId = string;\n" +
		"type Name = 'ana';\n"
	if output != expected {
		t.Errorf("output mismatch:\n--- got ---\n%s\n--- want ---\n%s", output, expected)
	}
}

func TestBuildersToType_MarkerUseConvertsAwayWithTheConst(t *testing.T) {
	// A MARKER use of the const is itself a conversion site (callsites.go), so
	// rewriting it removes the last reference and the const converts away with
	// it — where this used to refuse with CNV003, the file now converts whole.
	source := buildersHeader +
		"import {getRunTypeId} from '@mionjs/run-types';\n" +
		"export const userIdRT = TF.string();\n" +
		"export type UserId = InferType<typeof userIdRT>;\n" +
		"export const id = getRunTypeId(userIdRT);\n"
	output, diags := convertOne(t, source, convert.Options{Target: convert.TargetType})
	expectNoDiags(t, diags)
	expected := "import {getRunTypeId} from '@mionjs/run-types';\n" +
		"export type UserId = string;\n" +
		"export const id = getRunTypeId<UserId>();\n"
	if output != expected {
		t.Errorf("output mismatch:\n--- got ---\n%s\n--- want ---\n%s", output, expected)
	}
}

func TestBuildersToType_KeepsUsedConst(t *testing.T) {
	// A use the converter cannot rewrite — a plain function taking the RunType —
	// still pins the const, and CNV003 still says so.
	source := buildersHeader +
		"declare function describe(runType: unknown): string;\n" +
		"export const userIdRT = TF.string();\n" +
		"export type UserId = InferType<typeof userIdRT>;\n" +
		"export const described = describe(userIdRT);\n"
	output, diags := convertOne(t, source, convert.Options{Target: convert.TargetType})
	if len(diags) != 1 || diags[0].Code != convert.CodeConstStillUsed {
		t.Fatalf("expected one CNV003, got %+v", diags)
	}
	if !strings.Contains(output, "export const userIdRT = TF.string();") {
		t.Errorf("used const must stay untouched:\n%s", output)
	}
}

func TestIdempotence_BuildersTarget(t *testing.T) {
	source := buildersHeader +
		"export const userIdRT = TF.string();\n" +
		"export type UserId = InferType<typeof userIdRT>;\n"
	output, diags := convertOne(t, source, convert.Options{Target: convert.TargetBuilders})
	expectNoDiags(t, diags)
	if output != source {
		t.Errorf("converting a builders-form file to builders must be a byte no-op:\n--- got ---\n%s", output)
	}
}
