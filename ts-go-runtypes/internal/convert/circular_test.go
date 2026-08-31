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
	set, setErr := convert.BuildSet(prog, session.Checker(), session.Cache(), session.MarkerOptions(), absFiles)
	if setErr != nil {
		t.Fatalf("BuildSet: %v", setErr)
	}
	outputs := map[string]string{}
	var diags []convert.Diagnostic
	for _, absPath := range absFiles {
		result, convertErr := convert.ConvertFile(prog, session.Checker(), session.Cache(), session.MarkerOptions(), absPath, opts, set)
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
		fileIDs, idsErr := convert.DeclarationIDs(prog, session.Checker(), session.Cache(), session.MarkerOptions(), absPath)
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
		fileGraphs, graphsErr := convert.DeclarationGraphs(prog, session.Checker(), session.Cache(), session.MarkerOptions(), absPath)
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
	typeForm := convertAndCheckIDs(t, builderForm, convert.TargetType)
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
	source := "import * as TF from '@mionjs/run-types/formats';\n" +
		"export type Registry = {entries: TF.FormattedObject<Record<string, Registry>, {minProperties: 1}>};\n"
	builderForm := convertAndCheckIDs(t, source, convert.TargetBuilders)
	if !strings.Contains(builderForm, "RT.circular(") || !strings.Contains(builderForm, "minProperties: 1") {
		t.Errorf("a branded record inside a cycle should print with its params:\n%s", builderForm)
	}
	convertAndCheckIDs(t, builderForm, convert.TargetType)

	// Primitive brands inside cycles were always fine — they pass the
	// substitution untouched.
	safeSource := "import * as TF from '@mionjs/run-types/formats';\n" +
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
	typeForm := convertAndCheckIDs(t, builderForm, convert.TargetType)
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
	typeForm := convertAndCheckIDs(t, builderForm, convert.TargetType)
	if !strings.Contains(typeForm, "[head: number, tail?: Loose]") {
		t.Errorf("the type target should restore the optional labeled slot:\n%s", typeForm)
	}
}

func TestCircular_BrandedTemporalConverts(t *testing.T) {
	// A branded Temporal value inside a recursive declaration used to resolve a
	// different id value-first: the substitution walked the class, whose
	// methods return the class, and rebuilt it into a plain object. Temporal
	// joined Date and RegExp as a leaf, so it now converts.
	source := "import * as TFT from '@mionjs/run-types/formats/temporal';\n" +
		"export type Slot = {value: TFT.PlainDateTime<{max: '2030-01-01T00:00:00'}>; next?: Slot};\n"
	builderForm := convertAndCheckIDsIn(t, fuzzSources(source), convert.TargetBuilders)
	if !strings.Contains(builderForm, "RT.circular(") || !strings.Contains(builderForm, "TFT.plainDateTime(") {
		t.Errorf("a branded Temporal inside a cycle should print its builder:\n%s", builderForm)
	}
}

// TestCircular_BinaryNativesConvert — the same failure mode as the Temporal
// case above, for the binary builtins: a typed array's `subarray()` returns its
// own type, so the substitution's member walk circularly referenced itself and
// rebuilt the node into a plain object, moving the declaration's id. They
// joined Date / RegExp / Temporal as leaves, so a recursive declaration
// carrying one now survives the round trip.
func TestCircular_BinaryNativesConvert(t *testing.T) {
	for _, member := range []string{"DataView", "Uint8Array", "Int32Array", "BigInt64Array", "ArrayBuffer", "SharedArrayBuffer"} {
		t.Run(member, func(t *testing.T) {
			source := "export interface Node {payload: " + member + "; kids: Node[]}\n"
			buildersForm := convertAndCheckIDs(t, source, convert.TargetBuilders)
			if !strings.Contains(buildersForm, "RT.circular(") {
				t.Errorf("expected a circular builder:\n%s", buildersForm)
			}
		})
	}
}

// TestCircular_SelfStillSubstitutesThroughContainers — the negative control for
// the leaf list above. A leaf arm is tested BEFORE the Map / Set / array arms,
// so an arm that matched a real container would stop `self()` substituting and
// silently leak the `Self` brand into the recovered type — which is the bound
// on what may ever join that list.
func TestCircular_SelfStillSubstitutesThroughContainers(t *testing.T) {
	for _, kids := range []string{"Node[]", "Map<string, Node>", "Set<Node>", "Record<string, Node>"} {
		t.Run(kids, func(t *testing.T) {
			source := "export interface Node {payload: DataView; kids: " + kids + "}\n"
			builderForm := convertAndCheckIDs(t, source, convert.TargetBuilders)
			if !t.Failed() {
				convertAndCheckIDs(t, builderForm, convert.TargetType)
			}
		})
	}
}

func TestCircular_TupleSlotCycleConvertsLazyPair(t *testing.T) {
	// A tuple is the one container `RT.circular` cannot tie a knot through:
	// TypeScript instantiates a mapped tuple's slots up front, so
	// `Recursive<Body>` unrolls itself until the checker gives up rather than
	// substituting. The LAZY PAIR sidesteps the substitution entirely — the
	// declaration stays a REAL deferred alias (an ordinary recursive tuple
	// type) and gains a `getRunType<Name>()` handle — so these convert now,
	// with every leg keeping the declaration's id.
	for _, testCase := range []struct {
		source string
		pair   string
	}{
		{"export type Pair = [number, Pair];\n", "export const pairRT = getRunType<Pair>();"},
		{"export type Tail = [number, Tail?];\n", "export const tailRT = getRunType<Tail>();"},
		{"export type Rest = [number, ...Rest[]];\n", "export const restRT = getRunType<Rest>();"},
		{"export type Labeled = [head: number, tail: Labeled];\n", "export const labeledRT = getRunType<Labeled>();"},
		// A union arm inherits the eagerness (the substitution distributes).
		{"export type Maybe = [number, Maybe | null];\n", "export const maybeRT = getRunType<Maybe>();"},
		// Nested tuples chain it.
		{"export type Nest = [number, [string, Nest]];\n", "export const nestRT = getRunType<Nest>();"},
	} {
		builderForm := convertAndCheckIDs(t, testCase.source, convert.TargetBuilders)
		if !strings.Contains(builderForm, testCase.pair) {
			t.Errorf("expected the lazy pair %q in:\n%s", testCase.pair, builderForm)
		}
		if again := convertAndCheckIDs(t, builderForm, convert.TargetBuilders); again != builderForm {
			t.Errorf("builders target is not a fixpoint over the pair:\n%s\n---\n%s", builderForm, again)
		}
		typeForm := convertAndCheckIDs(t, builderForm, convert.TargetType)
		if strings.Contains(typeForm, "getRunType<") {
			t.Errorf("type target should drop the handle const:\n%s", typeForm)
		}
	}
}

func TestCircular_TupleSlotBehindDeferredContainerConverts(t *testing.T) {
	// Every OTHER slot defers, so the knot closes and the cycle converts —
	// only the direct tuple slot refuses above.
	for _, source := range []string{
		"export type Boxed = [number, {value: Boxed}];\n",
		"export type Many = [number, Many[]];\n",
		"export type Keyed = [number, Map<string, Keyed>];\n",
		"export type Unique = [number, Set<Unique>];\n",
		"export type Later = [number, Promise<Later>];\n",
		"export type Callable = [number, (node: Callable) => void];\n",
		// The cycle runs THROUGH a tuple but closes on an object member.
		"export type Outer = {link: [number, Outer]};\n",
	} {
		builderForm := convertAndCheckIDs(t, source, convert.TargetBuilders)
		if !strings.Contains(builderForm, "RT.circular(") {
			t.Errorf("a deferred cycle should convert:\n%s", builderForm)
		}
		convertAndCheckIDs(t, builderForm, convert.TargetType)
	}
}

func TestChain_RecursiveIndexPrintsTheLiteralSpelling(t *testing.T) {
	// `Record<K, V>` is a mapped ALIAS, so TypeScript resolves its argument
	// while resolving the declaration: a value that reaches back here is
	// TS2456. Printing it anyway produced source that does not compile, and
	// re-converting it baked in `any`. The index-signature literal defers.
	for _, testCase := range []struct{ source, wants string }{
		{"export type Idx = {[key: string]: Idx};\n", "export type Idx = {[key: string]: Idx};"},
		{"export type Mixed = {[key: string]: Mixed | number};\n", "export type Mixed = {[key: string]: Mixed | number};"},
		// Deferred through an array, so the alias spelling stays legal.
		{"export type Board = Record<string, Board[]>;\n", "export type Board = Record<string, Board[]>;"},
	} {
		builderForm := convertAndCheckIDs(t, testCase.source, convert.TargetBuilders)
		typeForm := convertAndCheckIDs(t, builderForm, convert.TargetType)
		if !strings.Contains(typeForm, testCase.wants) {
			t.Errorf("expected %q in:\n%s", testCase.wants, typeForm)
		}
		// The type form is the fixpoint — converting it again is a no-op.
		if again := convertAndCheckIDs(t, typeForm, convert.TargetType); again != typeForm {
			t.Errorf("type target is not a fixpoint:\n%s\n---\n%s", typeForm, again)
		}
	}
}

func TestChain_EscapeOnCycleConvertsLazyPair(t *testing.T) {
	// A cycle whose builders spelling needs a getRunType ESCAPE (a method
	// forces one) has no value print: the escape's type text can only reach
	// its cycle partner by NAME, and a converted name resolves through
	// `InferType<typeof partnerRT>` — an EAGER alias whose const sits on the
	// same cycle, so TypeScript silently collapses the whole knot to `any`
	// (found by the elision fuzz lane, seed 886383364). The conversion now
	// prints the LAZY PAIR instead: the declaration stays a REAL type (real
	// names resolve lazily, so the knot is legal TS) plus a
	// `getRunType<Name>()` handle const — and the chain oracle proves every
	// leg keeps the declaration's id.
	for _, testCase := range []struct {
		source string
		pair   string
	}{
		// The wild shape: recursion through the partner that names the array.
		{"export interface TreeNode {label(): string; kids: Forest;}\nexport type Forest = TreeNode[];\n",
			"export const treeNodeRT = getRunType<TreeNode>();"},
		// A mutual object cycle with the escape on one side.
		{"export interface Alpha {tag(): string; beta?: Beta;}\nexport type Beta = {alpha?: Alpha};\n",
			"export const alphaRT = getRunType<Alpha>();"},
		// The direct self back-edge, no partner involved.
		{"export interface Node {label(): string; next?: Node;}\n",
			"export const nodeRT = getRunType<Node>();"},
	} {
		builderForm := convertAndCheckIDs(t, testCase.source, convert.TargetBuilders)
		if !strings.Contains(builderForm, testCase.pair) {
			t.Errorf("expected the lazy pair %q in:\n%s", testCase.pair, builderForm)
		}
		// The pair IS the builders form — converting again is a byte no-op.
		if again := convertAndCheckIDs(t, builderForm, convert.TargetBuilders); again != builderForm {
			t.Errorf("builders target is not a fixpoint over the pair:\n%s\n---\n%s", builderForm, again)
		}
		// The type target collapses the pair back to real declarations only.
		typeForm := convertAndCheckIDs(t, builderForm, convert.TargetType)
		if strings.Contains(typeForm, "getRunType<") {
			t.Errorf("type target should drop the handle const:\n%s", typeForm)
		}
	}
}

func TestPair_HandConstIsTheBuildersForm(t *testing.T) {
	// A hand-written pair over a NON-recursive type is the same spelling: the
	// builders target leaves it alone, the type target collapses it.
	source := "import {getRunType} from '@mionjs/run-types';\n" +
		"export type Leaf = {value: string};\n" +
		"export const leafRT = getRunType<Leaf>();\n"
	builderForm := convertAndCheckIDs(t, source, convert.TargetBuilders)
	if builderForm != source {
		t.Errorf("builders target should be a no-op over a hand-written pair:\n%s", builderForm)
	}
	typeForm := convertAndCheckIDs(t, source, convert.TargetType)
	if strings.Contains(typeForm, "getRunType<") || strings.Contains(typeForm, "leafRT") {
		t.Errorf("type target should collapse the pair:\n%s", typeForm)
	}
	if !strings.Contains(typeForm, "export type Leaf = {value: string};") {
		t.Errorf("type declaration should survive the collapse:\n%s", typeForm)
	}
}

func TestPair_ConstStillUsedRefusesToCollapse(t *testing.T) {
	// The pair's const referenced OUTSIDE the conversion keeps the pair: the
	// type target must refuse with the const-still-used diagnostic instead of
	// breaking the use.
	source := "import {getRunType} from '@mionjs/run-types';\n" +
		"export type Leaf = {value: string};\n" +
		"export const leafRT = getRunType<Leaf>();\n" +
		"export const keep = [leafRT];\n"
	_, diags := convertOne(t, source, convert.Options{Target: convert.TargetType})
	if len(diags) != 1 || diags[0].Code != convert.CodeConstStillUsed {
		t.Fatalf("expected the const-still-used refusal, got %+v", diags)
	}
}

func TestChain_MutualCycle(t *testing.T) {
	// Builders inline the partner (a name reference would make the const's
	// type self-referential); the type target restores both names.
	source := "export type Alpha = {beta?: Beta};\nexport type Beta = {alpha?: Alpha};\n"
	builderForm := convertAndCheckIDs(t, source, convert.TargetBuilders)
	if !strings.Contains(builderForm, "RT.circular(") {
		t.Errorf("mutual cycle should wrap in RT.circular:\n%s", builderForm)
	}
	typeForm := convertAndCheckIDs(t, builderForm, convert.TargetType)
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
	typeForm := convertAndCheckIDs(t, builderForm, convert.TargetType)
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
		"leaf.ts": "import {type InferType} from '@mionjs/run-types';\nimport * as RT from '@mionjs/run-types/builders';\nimport * as TF from '@mionjs/run-types/formats';\n" +
			"export const leafRT = RT.object({value: TF.string()});\nexport type Leaf = InferType<typeof leafRT>;\n",
		"branch.ts": "import * as RT from '@mionjs/run-types/builders';\nimport {leafRT} from './leaf.ts';\n" +
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
	set, setErr := convert.BuildSet(prog, session.Checker(), session.Cache(), session.MarkerOptions(), []string{branchAbs})
	if setErr != nil {
		t.Fatalf("BuildSet: %v", setErr)
	}
	result, convertErr := convert.ConvertFile(prog, session.Checker(), session.Cache(), session.MarkerOptions(), branchAbs, convert.Options{Target: convert.TargetBuilders}, set)
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
