package convert_test

import (
	"strings"
	"testing"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-runtypes/internal/convert"
)

// convertSet converts every file of sources with one run-wide Set and returns
// path → output, asserting no diagnostics.
func convertSet(t *testing.T, sources map[string]string, opts convert.Options) map[string]string {
	t.Helper()
	outputs, diags := convertSetWithDiags(t, sources, opts)
	for _, diagnostic := range diags {
		t.Errorf("unexpected diagnostic %s [%s]: %s", diagnostic.Code, diagnostic.Decl, diagnostic.Message)
	}
	return outputs
}

func convertSetWithDiags(t *testing.T, sources map[string]string, opts convert.Options) (map[string]string, []convert.Diagnostic) {
	t.Helper()
	prog, session, cwd := setupConvert(t, sources)
	defer session.Close()
	absFiles := make([]string, 0, len(sources))
	relByAbs := map[string]string{}
	for rel := range sources {
		absPath := tspath.ResolvePath(cwd, rel)
		absFiles = append(absFiles, absPath)
		relByAbs[absPath] = rel
	}
	set, setErr := convert.BuildSet(prog, session.Checker(), session.Cache(), prog.FS, absFiles)
	if setErr != nil {
		t.Fatalf("BuildSet: %v", setErr)
	}
	outputs := map[string]string{}
	var diags []convert.Diagnostic
	for _, absPath := range absFiles {
		result, convertErr := convert.ConvertFile(prog, session.Checker(), session.Cache(), prog.FS, absPath, opts, set)
		if convertErr != nil {
			t.Fatalf("ConvertFile %s: %v", relByAbs[absPath], convertErr)
		}
		outputs[relByAbs[absPath]] = result.Output
		diags = append(diags, result.Diags...)
	}
	return outputs, diags
}

// setDeclIDs resolves every declaration id across a multi-file set.
func setDeclIDs(t testing.TB, sources map[string]string) map[string]string {
	t.Helper()
	prog, session, cwd := setupConvert(t, sources)
	defer session.Close()
	ids := map[string]string{}
	for rel := range sources {
		absPath := tspath.ResolvePath(cwd, rel)
		fileIDs, idsErr := convert.DeclarationIDs(prog, session.Checker(), session.Cache(), prog.FS, absPath)
		if idsErr != nil {
			t.Fatalf("DeclarationIDs %s: %v", rel, idsErr)
		}
		for name, id := range fileIDs {
			ids[rel+"#"+name] = id
		}
	}
	return ids
}

// setDeclGraphs is setDeclIDs for the C6 oracle.
func setDeclGraphs(t testing.TB, sources map[string]string) map[string]string {
	t.Helper()
	prog, session, cwd := setupConvert(t, sources)
	defer session.Close()
	graphs := map[string]string{}
	for rel := range sources {
		absPath := tspath.ResolvePath(cwd, rel)
		fileGraphs, graphsErr := convert.DeclarationGraphs(prog, session.Checker(), session.Cache(), prog.FS, absPath)
		if graphsErr != nil {
			t.Fatalf("DeclarationGraphs %s: %v", rel, graphsErr)
		}
		for name, graph := range fileGraphs {
			graphs[rel+"#"+name] = graph
		}
	}
	return graphs
}

// convertSetAndCheckIDs is convertSet plus the C2 oracle across the set. A
// declaration converting away from an alias-less const gains a DERIVED type
// name, so names absent after conversion fall back to id-multiset matching.
func convertSetAndCheckIDs(t *testing.T, sources map[string]string, target convert.Target) map[string]string {
	t.Helper()
	outputs := convertSet(t, sources, convert.Options{Target: target})
	before := setDeclIDs(t, sources)
	after := setDeclIDs(t, outputs)
	afterCounts := map[string]int{}
	for _, id := range after {
		afterCounts[id]++
	}
	for name, beforeID := range before {
		if afterID, ok := after[name]; ok {
			if afterID != beforeID {
				t.Errorf("declaration %q changed id after --to %s: %s → %s\n%v", name, target, beforeID, afterID, outputs)
			}
			continue
		}
		if afterCounts[beforeID] == 0 {
			t.Errorf("declaration %q (id %s) disappeared after --to %s:\n%v", name, beforeID, target, outputs)
			continue
		}
		afterCounts[beforeID]--
	}
	if len(after) != len(before) {
		t.Errorf("declaration count changed after --to %s: %d → %d\n%v", target, len(before), len(after), outputs)
	}
	if !t.Failed() {
		beforeGraphs := setDeclGraphs(t, sources)
		afterGraphs := setDeclGraphs(t, outputs)
		for name, beforeGraph := range beforeGraphs {
			if afterGraph, ok := afterGraphs[name]; ok && afterGraph != beforeGraph {
				t.Errorf("declaration %q lost reflection information after --to %s:\n--- before ---\n%s\n--- after ---\n%s",
					name, target, beforeGraph, afterGraph)
			}
		}
	}
	return outputs
}

func TestChain_SelfCycle(t *testing.T) {
	source := "export type TreeNode = {value: number; next?: TreeNode; children: TreeNode[]};\n"
	builderForm := convertAndCheckIDs(t, source, convert.TargetBuilders)
	if !strings.Contains(builderForm, "RT.circular(") || !strings.Contains(builderForm, "RT.self()") {
		t.Errorf("self-cycle should print RT.circular + RT.self():\n%s", builderForm)
	}
	schemaForm := convertAndCheckIDs(t, builderForm, convert.TargetJSONSchema)
	if !strings.Contains(schemaForm, "{$ref: '#'}") {
		t.Errorf("self-cycle should print {$ref: '#'} on the schema target:\n%s", schemaForm)
	}
	typeForm := convertAndCheckIDs(t, schemaForm, convert.TargetType)
	if !strings.Contains(typeForm, "next?: TreeNode") || !strings.Contains(typeForm, "children: TreeNode[]") {
		t.Errorf("type target should close the cycle on the type's own name:\n%s", typeForm)
	}
}

func TestCircular_StructuralPayloadConverts(t *testing.T) {
	// Container-level sentinel payloads inside a cycle used to move the id
	// value-first (RT.circular's Self substitution folded the intersection
	// away), so the builders target refused them. The substitution now returns
	// a non-recursing node verbatim and rebuilds a recursing one piece by
	// piece, so these print — and the chain oracle proves every leg keeps the
	// declaration's id.
	source := "import * as TF from '@ts-runtypes/core/formats';\n" +
		"export type Registry = {entries: TF.FormattedObject<Record<string, Registry>, {minProperties: 1}>};\n"
	builderForm := convertAndCheckIDs(t, source, convert.TargetBuilders)
	if !strings.Contains(builderForm, "RT.circular(") || !strings.Contains(builderForm, "minProperties: 1") {
		t.Errorf("a branded record inside a cycle should print with its params:\n%s", builderForm)
	}
	schemaForm := convertAndCheckIDs(t, builderForm, convert.TargetJSONSchema)
	convertAndCheckIDs(t, schemaForm, convert.TargetType)

	// Primitive brands inside cycles were always fine — they pass the
	// substitution untouched.
	safeSource := "import * as TF from '@ts-runtypes/core/formats';\n" +
		"export type Chain = {tag: TF.Email; next?: Chain};\n"
	safeForm := convertAndCheckIDs(t, safeSource, convert.TargetBuilders)
	if !strings.Contains(safeForm, "RT.circular(") {
		t.Errorf("primitive-branded cycles should still convert:\n%s", safeForm)
	}
}

func TestCircular_LabeledTupleConverts(t *testing.T) {
	// A FIXED-arity labeled tuple the cycle runs through is rebuilt slot by
	// slot, so its label carrier survives and the slot form prints.
	source := "export type Pair = {link: [head: number, tail: Pair]};\n"
	builderForm := convertAndCheckIDs(t, source, convert.TargetBuilders)
	if !strings.Contains(builderForm, "RT.slot('head'") || !strings.Contains(builderForm, "RT.slot('tail'") {
		t.Errorf("a labeled tuple inside a cycle should print the slot form:\n%s", builderForm)
	}
	schemaForm := convertAndCheckIDs(t, builderForm, convert.TargetJSONSchema)
	typeForm := convertAndCheckIDs(t, schemaForm, convert.TargetType)
	if !strings.Contains(typeForm, "[head: number, tail: Pair]") {
		t.Errorf("the type target should restore the labels:\n%s", typeForm)
	}
}

func TestCircular_OptionalSlotLabeledTupleConverts(t *testing.T) {
	// An OPTIONAL slot leaves the tuple without a single literal arity, so the
	// rebuild splits it: the required slots are rebuilt by index, the rest ride
	// `Partial`, and the label carrier is re-attached. Both halves of the chain
	// keep the declaration's id.
	source := "export type Loose = {link: [head: number, tail?: Loose]};\n"
	builderForm := convertAndCheckIDs(t, source, convert.TargetBuilders)
	if !strings.Contains(builderForm, "RT.slot('head'") || !strings.Contains(builderForm, "RT.slot('tail'") {
		t.Errorf("an optional-slot labeled tuple should print the slot form:\n%s", builderForm)
	}
	schemaForm := convertAndCheckIDs(t, builderForm, convert.TargetJSONSchema)
	typeForm := convertAndCheckIDs(t, schemaForm, convert.TargetType)
	if !strings.Contains(typeForm, "[head: number, tail?: Loose]") {
		t.Errorf("the type target should restore the optional labeled slot:\n%s", typeForm)
	}
}

func TestCircular_BrandedTemporalConverts(t *testing.T) {
	// A branded Temporal value inside a recursive declaration used to resolve a
	// different id value-first: the substitution walked the class, whose
	// methods return the class, and rebuilt it into a plain object. Temporal
	// joined Date and RegExp as a leaf, so it now converts.
	source := "import * as TFT from '@ts-runtypes/core/formats/temporal';\n" +
		"export type Slot = {value: TFT.PlainDateTime<{max: '2030-01-01T00:00:00'}>; next?: Slot};\n"
	builderForm := convertAndCheckIDsIn(t, fuzzSources(source), convert.TargetBuilders)
	if !strings.Contains(builderForm, "RT.circular(") || !strings.Contains(builderForm, "TFT.plainDateTime(") {
		t.Errorf("a branded Temporal inside a cycle should print its builder:\n%s", builderForm)
	}
}

func TestCircular_OneOfPrimitiveBranchRefusedOnBuilders(t *testing.T) {
	// The second residual: the oneOf branch tuple rides EVERY arm, and a
	// primitive arm passes through the substitution untouched, so its copy of
	// the tuple keeps an unsubstituted Self.
	source := "import {type OneOf} from '@ts-runtypes/core/builders';\n" +
		"export type Mixed = OneOf<[{next: Mixed}, number]>;\n"
	_, diags := convertOne(t, source, convert.Options{Target: convert.TargetBuilders})
	if len(diags) != 1 || diags[0].Code != convert.CodeUnsupportedKind ||
		!strings.Contains(diags[0].Message, "primitive branch") {
		t.Fatalf("expected the oneOf primitive-branch refusal, got %+v", diags)
	}
	// All-object branches carry no primitive arm, so they convert.
	objectSource := "import {type OneOf} from '@ts-runtypes/core/builders';\n" +
		"export type Nodes = OneOf<[{next: Nodes}, {leaf: number}]>;\n"
	builderForm := convertAndCheckIDs(t, objectSource, convert.TargetBuilders)
	if !strings.Contains(builderForm, "RT.oneOf(") {
		t.Errorf("an all-object oneOf inside a cycle should convert:\n%s", builderForm)
	}
}

func TestChain_MutualCycle(t *testing.T) {
	// Builders/schema inline the partner (a name reference would make the
	// const's type self-referential); the type target restores both names.
	source := "export type Alpha = {beta?: Beta};\nexport type Beta = {alpha?: Alpha};\n"
	builderForm := convertAndCheckIDs(t, source, convert.TargetBuilders)
	if !strings.Contains(builderForm, "RT.circular(") {
		t.Errorf("mutual cycle should wrap in RT.circular:\n%s", builderForm)
	}
	schemaForm := convertAndCheckIDs(t, builderForm, convert.TargetJSONSchema)
	typeForm := convertAndCheckIDs(t, schemaForm, convert.TargetType)
	if !strings.Contains(typeForm, "export type Alpha = {beta?: Beta};") {
		t.Errorf("type target should reference the partner by name:\n%s", typeForm)
	}
}

func TestChain_CrossReference(t *testing.T) {
	source := "export type Leaf = {value: string};\nexport type Branch = {leaf: Leaf; twigs: Leaf[]};\n"
	builderForm := convertAndCheckIDs(t, source, convert.TargetBuilders)
	if !strings.Contains(builderForm, "getRunType<Leaf>()") {
		t.Errorf("acyclic reference should print getRunType<Leaf>():\n%s", builderForm)
	}
	schemaForm := convertAndCheckIDs(t, builderForm, convert.TargetJSONSchema)
	if !strings.Contains(schemaForm, "embedType<Leaf>()") {
		t.Errorf("acyclic reference should print embedType<Leaf>() on the schema target:\n%s", schemaForm)
	}
	typeForm := convertAndCheckIDs(t, schemaForm, convert.TargetType)
	if !strings.Contains(typeForm, "export type Branch = {leaf: Leaf; twigs: Leaf[]};") {
		t.Errorf("type target should keep the reference by name:\n%s", typeForm)
	}
}

func TestBuildersCircularInput_ToType(t *testing.T) {
	source := buildersHeader +
		"export const nodeRT = RT.circular(RT.object({value: TF.number(), next: RT.optional(RT.self())}));\n" +
		"export type Node = InferType<typeof nodeRT>;\n"
	typeForm := convertAndCheckIDs(t, source, convert.TargetType)
	if !strings.Contains(typeForm, "export type Node = {value: number; next?: Node};") {
		t.Errorf("authored circular builder should convert to the named self-reference:\n%s", typeForm)
	}
}

func TestSchemaRefInput_ToType(t *testing.T) {
	source := "import {type InferType} from '@ts-runtypes/core';\n" +
		"import {runTypeFromJsonSchema} from '@ts-runtypes/core/json-schema';\n" +
		"export const nodeRT = runTypeFromJsonSchema({type: 'object', properties: {value: {type: 'number'}, next: {$ref: '#'}}, required: ['value'], additionalProperties: false} as const);\n" +
		"export type Node = InferType<typeof nodeRT>;\n"
	typeForm := convertAndCheckIDs(t, source, convert.TargetType)
	if !strings.Contains(typeForm, "next?: Node") {
		t.Errorf("authored $ref: '#' schema should convert to the named self-reference:\n%s", typeForm)
	}
}

func TestMultiFile_CrossImport(t *testing.T) {
	sources := map[string]string{
		"leaf.ts":   "export type Leaf = {value: string};\n",
		"branch.ts": "import {type Leaf} from './leaf.ts';\nexport type Branch = {leaf: Leaf};\n",
	}
	builderOutputs := convertSetAndCheckIDs(t, sources, convert.TargetBuilders)
	if !strings.Contains(builderOutputs["branch.ts"], "getRunType<Leaf>()") {
		t.Errorf("cross-file reference should print getRunType<Leaf>():\n%s", builderOutputs["branch.ts"])
	}
	if !strings.Contains(builderOutputs["branch.ts"], "import {type Leaf} from './leaf.ts';") {
		t.Errorf("existing type import should survive:\n%s", builderOutputs["branch.ts"])
	}
	typeOutputs := convertSetAndCheckIDs(t, builderOutputs, convert.TargetType)
	if !strings.Contains(typeOutputs["branch.ts"], "export type Branch = {leaf: Leaf};") {
		t.Errorf("type target should restore the named cross-file reference:\n%s", typeOutputs["branch.ts"])
	}
}

func TestMultiFile_ConstImportRetargets(t *testing.T) {
	// branch.ts composes leaf.ts's BUILDER CONST; converting both to type form
	// drops the const import and references the type name instead.
	sources := map[string]string{
		"leaf.ts": "import {type InferType} from '@ts-runtypes/core';\nimport * as RT from '@ts-runtypes/core/builders';\nimport * as TF from '@ts-runtypes/core/formats';\n" +
			"export const leafRT = RT.object({value: TF.string()});\nexport type Leaf = InferType<typeof leafRT>;\n",
		"branch.ts": "import * as RT from '@ts-runtypes/core/builders';\nimport {leafRT} from './leaf.ts';\n" +
			"export const branchRT = RT.object({leaf: leafRT});\n",
	}
	typeOutputs := convertSetAndCheckIDs(t, sources, convert.TargetType)
	branch := typeOutputs["branch.ts"]
	if !strings.Contains(branch, "{leaf: Leaf}") {
		t.Errorf("const composition should convert to the type name:\n%s", branch)
	}
	if !strings.Contains(branch, "import {type Leaf} from './leaf.ts';") {
		t.Errorf("the type-name import should be added:\n%s", branch)
	}
	if strings.Contains(branch, "leafRT") {
		t.Errorf("the now-unused const import should be removed:\n%s", branch)
	}
}

func TestOutsideSet_Errors(t *testing.T) {
	// branch.ts references leaf.ts, but only branch.ts is in the run — the
	// user decided this errors instead of silently inlining the reference.
	sources := map[string]string{
		"leaf.ts":   "export type Leaf = {value: string};\n",
		"branch.ts": "import {type Leaf} from './leaf.ts';\nexport type Branch = {leaf: Leaf};\n",
	}
	prog, session, cwd := setupConvert(t, sources)
	defer session.Close()
	branchAbs := tspath.ResolvePath(cwd, "branch.ts")
	set, setErr := convert.BuildSet(prog, session.Checker(), session.Cache(), prog.FS, []string{branchAbs})
	if setErr != nil {
		t.Fatalf("BuildSet: %v", setErr)
	}
	result, convertErr := convert.ConvertFile(prog, session.Checker(), session.Cache(), prog.FS, branchAbs, convert.Options{Target: convert.TargetBuilders}, set)
	if convertErr != nil {
		t.Fatalf("ConvertFile: %v", convertErr)
	}
	if len(result.Diags) != 1 || result.Diags[0].Code != convert.CodeOutsideSet {
		t.Fatalf("expected one CNV004, got %+v", result.Diags)
	}
	if result.Changed {
		t.Errorf("declaration with an outside-set reference must stay untouched")
	}
}

func TestAliasOfAlias_ReferencesTarget(t *testing.T) {
	source := "export type Original = {value: string};\nexport type Mirror = Original;\n"
	builderForm := convertAndCheckIDs(t, source, convert.TargetBuilders)
	if !strings.Contains(builderForm, "const mirrorRT = getRunType<Original>();") {
		t.Errorf("an alias of an alias should reference the original:\n%s", builderForm)
	}
}

func TestPortable_CrossReferenceInlines(t *testing.T) {
	// embedType is dialect, so --portable inlines references instead
	// (structurally identical, the id cannot move).
	source := "export type Leaf = {value: string};\nexport type Branch = {leaf: Leaf};\n"
	output, diags := convertOne(t, source, convert.Options{Target: convert.TargetJSONSchema, Portable: true})
	expectNoDiags(t, diags)
	if strings.Contains(output, "embedType") {
		t.Errorf("--portable must not print embedType:\n%s", output)
	}
	if !strings.Contains(output, "leaf: {type: 'object', properties: {value: {type: 'string'}}") {
		t.Errorf("--portable should inline the reference:\n%s", output)
	}
}
