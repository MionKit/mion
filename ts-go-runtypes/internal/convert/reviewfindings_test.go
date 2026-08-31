package convert_test

// Regression pins for the adversarial-review findings: each test is the
// reviewer's confirmed trigger, now expected to convert exactly or refuse
// loudly (never silently emit broken output or move an id).

import (
	"strings"
	"testing"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-runtypes/internal/convert"
)

// expectSingleRefusal asserts the conversion produced exactly one Error diag
// with the given code and message fragment, and left the source byte-identical.
func expectSingleRefusal(t *testing.T, source string, target convert.Target, code, says string) {
	t.Helper()
	output, diags := convertOne(t, source, convert.Options{Target: target})
	errors := 0
	for _, diagnostic := range diags {
		if diagnostic.Severity != convert.SeverityError {
			continue
		}
		errors++
		if diagnostic.Code != code {
			t.Errorf("--to %s: expected %s, got %s: %s", target, code, diagnostic.Code, diagnostic.Message)
		}
		if !strings.Contains(diagnostic.Message, says) {
			t.Errorf("--to %s: message %q does not mention %q", target, diagnostic.Message, says)
		}
	}
	if errors != 1 {
		t.Errorf("--to %s: expected exactly one refusal, got %d: %+v", target, errors, diags)
	}
	if output != source {
		t.Errorf("--to %s: a refused declaration must stay byte-identical:\n%s", target, output)
	}
}

func TestTemplateLiteral_CarriageReturnEscapes(t *testing.T) {
	source := "export type Weird = `a\\r${string}b`;\n"
	builderForm := convertAndCheckIDs(t, source, convert.TargetBuilders)
	if !strings.Contains(builderForm, "`a\\r${string}b`") {
		t.Errorf("the CR must print as an escape, not raw:\n%s", builderForm)
	}
	convertAndCheckIDs(t, builderForm, convert.TargetType)
}

func TestInfinityLiteral_PrintsOverflowSpelling(t *testing.T) {
	source := "export type Big = 1e999;\ntype Small = -1e999;\n"
	builderForm := convertAndCheckIDs(t, source, convert.TargetBuilders)
	if !strings.Contains(builderForm, "RT.literal(1e999)") || !strings.Contains(builderForm, "RT.literal(-1e999)") {
		t.Errorf("Infinity literals should print the overflow spelling:\n%s", builderForm)
	}
	convertAndCheckIDs(t, builderForm, convert.TargetType)
}

func TestConstAway_KeepsConstUsedBySkippedDecl(t *testing.T) {
	// Wrapper is ALREADY type-form, so its span is never rewritten and its
	// `typeof userRT` keeps the const alive (CNV003), fixpoint included.
	source := buildersHeader +
		"export const userRT = TF.string();\n" +
		"export type User = InferType<typeof userRT>;\n" +
		"export type Wrapper = {u: InferType<typeof userRT>};\n"
	output, diags := convertOne(t, source, convert.Options{Target: convert.TargetType})
	foundStillUsed := false
	for _, diagnostic := range diags {
		if diagnostic.Code == convert.CodeConstStillUsed {
			foundStillUsed = true
		}
	}
	if !foundStillUsed {
		t.Fatalf("expected CNV003 for the const referenced by the skipped declaration, got %+v", diags)
	}
	if !strings.Contains(output, "export const userRT = TF.string();") {
		t.Errorf("the const must stay while a kept span references it:\n%s", output)
	}
}

func TestManagedNamespaceImport_SpellsMembersQualified(t *testing.T) {
	source := "import * as core from '@mionjs/run-types';\n" +
		"export type Person = {name: string};\n" +
		"export const check: core.RunType<Person> | null = null;\n"
	output, diags := convertOne(t, source, convert.Options{Target: convert.TargetBuilders})
	expectNoDiags(t, diags)
	if !strings.Contains(output, "core.InferType<typeof personRT>") {
		t.Errorf("with a core namespace import, InferType must spell through it:\n%s", output)
	}
	if strings.Contains(output, "import {type InferType}") {
		t.Errorf("no named core import may be added beside the namespace:\n%s", output)
	}
}

func TestDuplicateManagedImports_NoDuplicateBinding(t *testing.T) {
	source := "import {getRunTypeId} from '@mionjs/run-types';\n" +
		"import {type InferType} from '@mionjs/run-types';\n" +
		"export type Person = {name: string};\n" +
		"export declare const sample: Person;\n" +
		"export const personId = getRunTypeId(sample);\n" +
		"export type Twin = InferType<import('@mionjs/run-types').RunType<Person>> | null;\n"
	output, diags := convertOne(t, source, convert.Options{Target: convert.TargetBuilders})
	expectNoDiags(t, diags)
	if strings.Count(output, "InferType}") > 1 || strings.Count(output, "type InferType") > 1 {
		t.Errorf("InferType must not be imported twice:\n%s", output)
	}
}

func TestSymbolKeyedMember_RefusesInsteadOfManglingTheKey(t *testing.T) {
	// tsgo spells a symbol-keyed property `\xFE@<name>@<id>`; the guard only
	// recognised the `@@name` form, so this printed as a STRING property whose
	// key was the mangled internal spelling — a different type, silently, with
	// exit code 0. Found while writing the unsupported-conversion list.
	source := "declare const tag: unique symbol;\nexport type Tagged = {[tag]: number};\n"
	output, diags := convertOne(t, source, convert.Options{Target: convert.TargetBuilders})
	if len(diags) != 1 || diags[0].Code != convert.CodeUnsupportedKind ||
		!strings.Contains(diags[0].Message, "symbol-keyed member") {
		t.Fatalf("expected the symbol-keyed refusal, got %+v", diags)
	}
	if !strings.Contains(output, "export type Tagged = {[tag]: number};") {
		t.Errorf("the refused declaration must stay untouched:\n%s", output)
	}
}

func TestHelperLocalCollision_SuffixesAlias(t *testing.T) {
	source := "export const RT = 5;\n" +
		"export type Person = {name: string};\n"
	output, diags := convertOne(t, source, convert.Options{Target: convert.TargetBuilders})
	expectNoDiags(t, diags)
	if !strings.Contains(output, "import * as RT2 from '@mionjs/run-types/builders';") {
		t.Errorf("the builders namespace must claim a non-colliding alias:\n%s", output)
	}
	if !strings.Contains(output, "RT2.object(") {
		t.Errorf("printed builders must use the claimed alias:\n%s", output)
	}
}

func TestCrossFile_UnexportedAliasInlines(t *testing.T) {
	// `Leaf` is not exported, so `branch.ts` cannot import the NAME — but a name
	// it cannot spell is not a conversion failure. The structure inlines
	// instead, which says the same thing and keeps the same id. (This used to
	// refuse with CNV004, which stopped whole files converting over a lost
	// name.)
	sources := map[string]string{
		"leaf.ts": "import {type InferType} from '@mionjs/run-types';\nimport * as RT from '@mionjs/run-types/builders';\nimport * as TF from '@mionjs/run-types/formats';\n" +
			"export const leafRT = RT.object({value: TF.string()});\ntype Leaf = InferType<typeof leafRT>;\n",
		"branch.ts": "import * as RT from '@mionjs/run-types/builders';\nimport {leafRT} from './leaf.ts';\n" +
			"export const branchRT = RT.object({leaf: leafRT});\n",
	}
	before := setDeclIDs(t, sources)
	outputs, diags := convertSetWithDiags(t, sources, convert.Options{Target: convert.TargetType})
	for _, diagnostic := range diags {
		t.Errorf("unexpected diagnostic %s [%s]: %s", diagnostic.Code, diagnostic.Decl, diagnostic.Message)
	}
	if !strings.Contains(outputs["branch.ts"], "{leaf: {value: string}}") {
		t.Errorf("the unspellable name should inline its structure:\n%s", outputs["branch.ts"])
	}
	// A const converting to a type gains a DERIVED type name, so names absent
	// after conversion fall back to id-multiset matching (as in
	// convertSetAndCheckIDs).
	after := setDeclIDs(t, outputs)
	afterCounts := map[string]int{}
	for _, id := range after {
		afterCounts[id]++
	}
	for key, id := range before {
		if afterID, ok := after[key]; ok {
			if afterID != id {
				t.Errorf("declaration %s changed id: %s → %s", key, id, afterID)
			}
			continue
		}
		if afterCounts[id] == 0 {
			t.Errorf("declaration %s (id %s) disappeared:\n%v", key, id, outputs)
			continue
		}
		afterCounts[id]--
	}
}

func TestTypeTarget_AliasExportWins(t *testing.T) {
	source := buildersHeader +
		"const leafRT = RT.object({value: TF.string()});\n" +
		"export type Leaf = InferType<typeof leafRT>;\n"
	output, diags := convertOne(t, source, convert.Options{Target: convert.TargetType})
	expectNoDiags(t, diags)
	if !strings.Contains(output, "export type Leaf = {value: string};") {
		t.Errorf("the printed type must keep the ALIAS's export modifier:\n%s", output)
	}
}

func TestForeignDefaultImport_StillAddsTypeImport(t *testing.T) {
	sources := map[string]string{
		"leaf.ts": "import {type InferType} from '@mionjs/run-types';\nimport * as RT from '@mionjs/run-types/builders';\nimport * as TF from '@mionjs/run-types/formats';\n" +
			"const defaultThing = 1;\nexport default defaultThing;\n" +
			"export const leafRT = RT.object({value: TF.string()});\nexport type Leaf = InferType<typeof leafRT>;\n",
		"branch.ts": "import * as RT from '@mionjs/run-types/builders';\nimport dflt, {leafRT} from './leaf.ts';\n" +
			"export const branchRT = RT.object({leaf: leafRT});\nexport const keep = dflt;\n",
	}
	outputs := convertSetAndCheckIDs(t, sources, convert.TargetType)
	branch := outputs["branch.ts"]
	if !strings.Contains(branch, "{leaf: Leaf}") {
		t.Fatalf("cross-file reference should spell the name:\n%s", branch)
	}
	if !strings.Contains(branch, "import {type Leaf} from './leaf.ts';") {
		t.Errorf("the type import must be added even though the existing statement has a default import:\n%s", branch)
	}
}

func TestOutsideSet_NamespaceMemberReferenceErrors(t *testing.T) {
	sources := map[string]string{
		"leaf.ts":   "export type Leaf = {value: string};\n",
		"branch.ts": "import * as L from './leaf.ts';\nexport type Branch = {leaf: L.Leaf};\n",
	}
	prog, session, cwd := setupConvert(t, sources)
	defer session.Close()
	branchAbs := tspath.ResolvePath(cwd, "branch.ts")
	set, setErr := convert.BuildSet(prog, session.Checker(), session.Cache(), session.MarkerOptions(), []string{branchAbs})
	if setErr != nil {
		t.Fatalf("BuildSet: %v", setErr)
	}
	result, convertErr := convert.ConvertFile(prog, session.Checker(), session.Cache(), session.MarkerOptions(), branchAbs, convert.Options{Target: convert.TargetBuilders}, set)
	if convertErr != nil {
		t.Fatalf("ConvertFile: %v", convertErr)
	}
	if len(result.Diags) == 0 || result.Diags[0].Code != convert.CodeOutsideSet {
		t.Fatalf("expected CNV004 for the namespace member reference, got %+v", result.Diags)
	}
}

func TestOutsideSet_BuilderPropertyReferenceErrors(t *testing.T) {
	sources := map[string]string{
		"leaf.ts": "import {type InferType} from '@mionjs/run-types';\nimport * as RT from '@mionjs/run-types/builders';\nimport * as TF from '@mionjs/run-types/formats';\n" +
			"export const leafRT = RT.object({value: TF.string()});\nexport type Leaf = InferType<typeof leafRT>;\n",
		"branch.ts": "import * as RT from '@mionjs/run-types/builders';\nimport {leafRT} from './leaf.ts';\n" +
			"export const branchRT = RT.object({leaf: leafRT});\n",
	}
	prog, session, cwd := setupConvert(t, sources)
	defer session.Close()
	branchAbs := tspath.ResolvePath(cwd, "branch.ts")
	set, setErr := convert.BuildSet(prog, session.Checker(), session.Cache(), session.MarkerOptions(), []string{branchAbs})
	if setErr != nil {
		t.Fatalf("BuildSet: %v", setErr)
	}
	result, convertErr := convert.ConvertFile(prog, session.Checker(), session.Cache(), session.MarkerOptions(), branchAbs, convert.Options{Target: convert.TargetType}, set)
	if convertErr != nil {
		t.Fatalf("ConvertFile: %v", convertErr)
	}
	foundOutside := false
	for _, diagnostic := range result.Diags {
		if diagnostic.Code == convert.CodeOutsideSet {
			foundOutside = true
		}
	}
	if !foundOutside {
		t.Fatalf("expected CNV004 for the builder property-position reference, got %+v", result.Diags)
	}
}
