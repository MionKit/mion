package resolver_test

import (
	"testing"

	"github.com/mionkit/ts-runtypes/internal/reflection"
)

// The slot-form builders (`RT.tuple({required: [RT.slot('x', …)]})`,
// `RT.func({params: [RT.slot('event', …)], ret})`) carry slot labels / parameter names
// through the `__rtLabels` sentinel and must converge with their type-first
// labeled twins on ONE structural id — with byte-identical projections
// (member/parameter names), whichever form is scanned first. Fixtures pair
// BOTH getRunTypeId call shapes per the marker coverage rule: the value-first
// builder is the natural reflect form (`getRunTypeId(RT.tuple({required: […]}))`), the
// written labeled type the static form (`getRunTypeId<[x: number]>()`).

const labeledImports = `import {getRunTypeId} from '@mionjs/run-types';
import * as RT from '@mionjs/run-types/builders';
import * as TF from '@mionjs/run-types/formats';
`

// memberNames dereferences a tuple root's children (or a function root's
// parameters) and returns their projected labels.
func memberNames(t *testing.T, rootID string, nodes []*reflection.RunType) []string {
	t.Helper()
	byID := map[string]*reflection.RunType{}
	for _, node := range nodes {
		byID[node.ID] = node
	}
	root := byID[rootID]
	if root == nil {
		t.Fatalf("root %q missing from dump", rootID)
	}
	refs := root.Children
	if root.Kind == reflection.KindFunction {
		refs = root.Parameters
	}
	names := make([]string, 0, len(refs))
	for _, ref := range refs {
		member := byID[ref.ID]
		if member == nil {
			t.Fatalf("member %q missing from dump", ref.ID)
		}
		names = append(names, member.Name)
	}
	return names
}

func assertNames(t *testing.T, got, want []string) {
	t.Helper()
	if len(got) != len(want) {
		t.Fatalf("member names: want %v, got %v", want, got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("member names: want %v, got %v", want, got)
		}
	}
}

func TestLabeledTuple_SlotFormConvergesWithTypeFirst(t *testing.T) {
	// Reflect shape: the builder value. Static shape: the written labeled tuple.
	builderForm := labeledImports + `getRunTypeId(RT.tuple({required: [RT.slot('x', TF.number()), RT.slot('y', TF.number())]}));
`
	writtenForm := labeledImports + `getRunTypeId<[x: number, y: number]>();
`
	r := setupInline(t, map[string]string{"builder.ts": builderForm, "written.ts": writtenForm})
	builder := resolveFile(t, r, "builder.ts")
	written := resolveFile(t, r, "written.ts")
	if builder.ID != written.ID {
		t.Fatalf("slot-form tuple and [x: number, y: number] diverge: %q vs %q", builder.ID, written.ID)
	}
	assertNames(t, memberNames(t, builder.ID, dump(r)), []string{"x", "y"})
}

func TestLabeledTuple_OptionalMembers(t *testing.T) {
	builderForm := labeledImports + `getRunTypeId(RT.tuple({required: [RT.slot('x', TF.number())], optional: [RT.slot('y', TF.string())]}));
`
	writtenForm := labeledImports + `getRunTypeId<[x: number, y?: string]>();
`
	r := setupInline(t, map[string]string{"builder.ts": builderForm, "written.ts": writtenForm})
	builder := resolveFile(t, r, "builder.ts")
	written := resolveFile(t, r, "written.ts")
	if builder.ID != written.ID {
		t.Fatalf("slot-form optionals and [x: number, y?: string] diverge: %q vs %q", builder.ID, written.ID)
	}
	assertNames(t, memberNames(t, builder.ID, dump(r)), []string{"x", "y"})
}

func TestLabeledTuple_RestSlotCarriesItsLabel(t *testing.T) {
	// The rest element is a slot too, so any rest label is expressible — and
	// rest labels are id data like every other label.
	builderForm := labeledImports + `getRunTypeId(RT.tuple({required: [RT.slot('x', TF.number())], rest: RT.slot('rest', TF.string())}));
`
	writtenForm := labeledImports + `getRunTypeId<[x: number, ...rest: string[]]>();
`
	otherLabel := labeledImports + `getRunTypeId<[x: number, ...items: string[]]>();
`
	r := setupInline(t, map[string]string{"builder.ts": builderForm, "written.ts": writtenForm, "items.ts": otherLabel})
	builder := resolveFile(t, r, "builder.ts")
	written := resolveFile(t, r, "written.ts")
	items := resolveFile(t, r, "items.ts")
	if builder.ID != written.ID {
		t.Fatalf("slot-form rest and [x: number, ...rest: string[]] diverge: %q vs %q", builder.ID, written.ID)
	}
	if builder.ID == items.ID {
		t.Fatalf("...rest and ...items must not share an id (labels are id data): %q", builder.ID)
	}
	assertNames(t, memberNames(t, builder.ID, dump(r)), []string{"x", "rest"})
}

func TestTupleGroups_OmittedGroupsMatchTheirEmptySpelling(t *testing.T) {
	// Every group is optional, and an omitted one must brand exactly what the
	// explicitly-empty one brands — otherwise the two spellings of one shape
	// would land on different cache entries.
	omitted := labeledImports + `getRunTypeId(RT.tuple({required: [RT.slot('x', TF.number())], rest: RT.slot('rest', TF.string())}));
`
	explicit := labeledImports + `getRunTypeId(RT.tuple({required: [RT.slot('x', TF.number())], optional: [], rest: RT.slot('rest', TF.string())}));
`
	r := setupInline(t, map[string]string{"omitted.ts": omitted, "explicit.ts": explicit})
	if a, b := resolveFile(t, r, "omitted.ts"), resolveFile(t, r, "explicit.ts"); a.ID != b.ID {
		t.Fatalf("omitted and empty optional group diverge: %q vs %q", a.ID, b.ID)
	}
}

func TestTupleGroups_EmptyBagConvergesWithTheEmptyTuple(t *testing.T) {
	// An all-empty bag must resolve the UNLABELED empty tuple: a labeled empty
	// tuple would carry an empty labels sentinel and split the entry in two.
	builderForm := labeledImports + `getRunTypeId(RT.tuple({}));
`
	writtenForm := labeledImports + `getRunTypeId<[]>();
`
	r := setupInline(t, map[string]string{"builder.ts": builderForm, "written.ts": writtenForm})
	if builder, written := resolveFile(t, r, "builder.ts"), resolveFile(t, r, "written.ts"); builder.ID != written.ID {
		t.Fatalf("tuple({}) and [] diverge: %q vs %q", builder.ID, written.ID)
	}
}

func TestLabeledFunc_OmittedParamsGroupConvergesWithNoParams(t *testing.T) {
	// `{ret}` alone, an empty params list, and a bare `func()` all brand the
	// same no-params signature — NOT a spurious rest parameter.
	retOnly := labeledImports + `getRunTypeId(RT.func({ret: TF.number()}));
`
	emptyParams := labeledImports + `getRunTypeId(RT.func({params: [], ret: TF.number()}));
`
	writtenForm := labeledImports + `getRunTypeId<() => number>();
`
	r := setupInline(t, map[string]string{"ret.ts": retOnly, "empty.ts": emptyParams, "written.ts": writtenForm})
	ret := resolveFile(t, r, "ret.ts")
	empty := resolveFile(t, r, "empty.ts")
	written := resolveFile(t, r, "written.ts")
	if ret.ID != written.ID {
		t.Fatalf("func({ret}) and () => number diverge: %q vs %q", ret.ID, written.ID)
	}
	if empty.ID != written.ID {
		t.Fatalf("func({params: [], ret}) and () => number diverge: %q vs %q", empty.ID, written.ID)
	}
}

func TestLabeledTuple_OrderAdversarial(t *testing.T) {
	// Five slots ordered against the alphabet — written slot order defines slot
	// order verbatim. (The record-shaped API this slot form replaced failed
	// exactly here: the checker keeps keyof unions sorted by internal type id,
	// not declaration order, so {w, h} projected [h, w].)
	builderForm := labeledImports + `getRunTypeId(RT.tuple({required: [RT.slot('z', TF.number()), RT.slot('y', TF.string()), RT.slot('m', RT.boolean()), RT.slot('b', TF.number()), RT.slot('a', TF.string())]}));
`
	writtenForm := labeledImports + `getRunTypeId<[z: number, y: string, m: boolean, b: number, a: string]>();
`
	r := setupInline(t, map[string]string{"builder.ts": builderForm, "written.ts": writtenForm})
	builder := resolveFile(t, r, "builder.ts")
	written := resolveFile(t, r, "written.ts")
	if builder.ID != written.ID {
		t.Fatalf("anti-alphabetical slot form diverges from its written twin: %q vs %q", builder.ID, written.ID)
	}
	assertNames(t, memberNames(t, builder.ID, dump(r)), []string{"z", "y", "m", "b", "a"})
}

func TestLabeledTuple_SameShapeDifferentLabelsStayDistinct(t *testing.T) {
	pointForm := labeledImports + `getRunTypeId(RT.tuple({required: [RT.slot('x', TF.number()), RT.slot('y', TF.number())]}));
`
	sizeForm := labeledImports + `getRunTypeId(RT.tuple({required: [RT.slot('w', TF.number()), RT.slot('h', TF.number())]}));
`
	r := setupInline(t, map[string]string{"point.ts": pointForm, "size.ts": sizeForm})
	point := resolveFile(t, r, "point.ts")
	size := resolveFile(t, r, "size.ts")
	if point.ID == size.ID {
		t.Fatalf("(x, y) and (w, h) slot tuples must not share an id (got %q)", point.ID)
	}
	assertNames(t, memberNames(t, point.ID, dump(r)), []string{"x", "y"})
	assertNames(t, memberNames(t, size.ID, dump(r)), []string{"w", "h"})
}

func TestLabeledTuple_SlotFormDivergesFromPlainArrayForm(t *testing.T) {
	// The plain-RunType array form stays UNLABELED by design — the pinned
	// divergence.
	slotForm := labeledImports + `getRunTypeId(RT.tuple({required: [RT.slot('x', TF.number()), RT.slot('y', TF.number())]}));
`
	arrayForm := labeledImports + `getRunTypeId(RT.tuple({required: [TF.number(), TF.number()]}));
`
	r := setupInline(t, map[string]string{"slot.ts": slotForm, "array.ts": arrayForm})
	slotTuple := resolveFile(t, r, "slot.ts")
	array := resolveFile(t, r, "array.ts")
	if slotTuple.ID == array.ID {
		t.Fatalf("labeled slot form must not share the unlabeled array form's id (got %q)", slotTuple.ID)
	}
}

func TestLabeledFunc_SlotFormConvergesWithWrittenSignature(t *testing.T) {
	builderForm := labeledImports + `getRunTypeId(RT.func({params: [RT.slot('event', TF.string()), RT.slot('retries', TF.number())], ret: TF.number()}));
`
	writtenForm := labeledImports + `getRunTypeId<(event: string, retries: number) => number>();
`
	r := setupInline(t, map[string]string{"builder.ts": builderForm, "written.ts": writtenForm})
	builder := resolveFile(t, r, "builder.ts")
	written := resolveFile(t, r, "written.ts")
	if builder.ID != written.ID {
		t.Fatalf("func slot form and (event: string, retries: number) => number diverge: %q vs %q", builder.ID, written.ID)
	}
	assertNames(t, memberNames(t, builder.ID, dump(r)), []string{"event", "retries"})
}

func TestLabeledFunc_ParamNamedType(t *testing.T) {
	// A parameter literally named "type" — the slot label channel must not
	// collide with the runtime carrier's own `type` tag.
	builderForm := labeledImports + `getRunTypeId(RT.func({params: [RT.slot('type', TF.string())], ret: TF.number()}));
`
	writtenForm := labeledImports + `getRunTypeId<(type: string) => number>();
`
	r := setupInline(t, map[string]string{"builder.ts": builderForm, "written.ts": writtenForm})
	builder := resolveFile(t, r, "builder.ts")
	written := resolveFile(t, r, "written.ts")
	if builder.ID != written.ID {
		t.Fatalf("func({params: [slot('type', …)]}) and (type: string) => number diverge: %q vs %q", builder.ID, written.ID)
	}
	assertNames(t, memberNames(t, builder.ID, dump(r)), []string{"type"})
}

func TestLabeledFunc_EmptyParamsArrayConvergesWithNoParams(t *testing.T) {
	// An empty `params` group matches the no-params overload and brands a bare
	// `() => number`, converging with the written form.
	builderForm := labeledImports + `getRunTypeId(RT.func({ret: TF.number()}));
`
	writtenForm := labeledImports + `getRunTypeId<() => number>();
`
	r := setupInline(t, map[string]string{"builder.ts": builderForm, "written.ts": writtenForm})
	builder := resolveFile(t, r, "builder.ts")
	written := resolveFile(t, r, "written.ts")
	if builder.ID != written.ID {
		t.Fatalf("func({ret}) and () => number diverge: %q vs %q", builder.ID, written.ID)
	}
}

func TestLabeledFunc_RestSpreadProjectionParity(t *testing.T) {
	// The written labeled rest-tuple spelling shares the plain signature's id
	// (typeid expands it), so its PROJECTION must expand identically too — the
	// serialize-side parity fix. Both must project one named positional
	// parameter, never a single rest param (first-interned would win at random).
	spreadForm := labeledImports + `getRunTypeId<(...args: [a: string]) => number>();
`
	plainForm := labeledImports + `getRunTypeId<(a: string) => number>();
`
	r := setupInline(t, map[string]string{"spread.ts": spreadForm, "plain.ts": plainForm})
	spread := resolveFile(t, r, "spread.ts")
	plain := resolveFile(t, r, "plain.ts")
	if spread.ID != plain.ID {
		t.Fatalf("(...args: [a: string]) and (a: string) diverge: %q vs %q", spread.ID, plain.ID)
	}
	names := memberNames(t, spread.ID, dump(r))
	assertNames(t, names, []string{"a"})
}

func TestLabeledTuple_ParamsTupleThroughFunc(t *testing.T) {
	// The params-TUPLE form carries the labels through the tuple's own slot
	// form: func({params: tuple({required: [slot('a', …)]}), ret}) ≡ (a: string) => number.
	builderForm := labeledImports + `getRunTypeId(RT.func({params: RT.tuple({required: [RT.slot('a', TF.string())]}), ret: TF.number()}));
`
	writtenForm := labeledImports + `getRunTypeId<(a: string) => number>();
`
	r := setupInline(t, map[string]string{"builder.ts": builderForm, "written.ts": writtenForm})
	builder := resolveFile(t, r, "builder.ts")
	written := resolveFile(t, r, "written.ts")
	if builder.ID != written.ID {
		t.Fatalf("func({params: tuple({required: [slot('a', …)]})}) and (a: string) => number diverge: %q vs %q", builder.ID, written.ID)
	}
}
