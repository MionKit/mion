package resolver_test

import (
	"testing"

	"github.com/mionkit/ts-runtypes/internal/reflection"
)

// The slot-form builders (`RT.tuple([RT.slot('x', …)])`,
// `RT.func([RT.slot('event', …)], ret)`) carry slot labels / parameter names
// through the `__rtLabels` sentinel and must converge with their type-first
// labeled twins on ONE structural id — with byte-identical projections
// (member/parameter names), whichever form is scanned first. Fixtures pair
// BOTH getRunTypeId call shapes per the marker coverage rule: the value-first
// builder is the natural reflect form (`getRunTypeId(RT.tuple([…]))`), the
// written labeled type the static form (`getRunTypeId<[x: number]>()`).

const labeledImports = `import {getRunTypeId} from '@ts-runtypes/core';
import * as RT from '@ts-runtypes/core/builders';
import * as TF from '@ts-runtypes/core/formats';
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
	builderForm := labeledImports + `getRunTypeId(RT.tuple([RT.slot('x', TF.number()), RT.slot('y', TF.number())]));
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
	builderForm := labeledImports + `getRunTypeId(RT.tuple([RT.slot('x', TF.number())], [RT.slot('y', TF.string())]));
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
	builderForm := labeledImports + `getRunTypeId(RT.tuple([RT.slot('x', TF.number())], [], RT.slot('rest', TF.string())));
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

func TestLabeledTuple_OrderAdversarial(t *testing.T) {
	// Five slots ordered against the alphabet — written slot order defines slot
	// order verbatim. (The record-shaped API this slot form replaced failed
	// exactly here: the checker keeps keyof unions sorted by internal type id,
	// not declaration order, so {w, h} projected [h, w].)
	builderForm := labeledImports + `getRunTypeId(RT.tuple([RT.slot('z', TF.number()), RT.slot('y', TF.string()), RT.slot('m', RT.boolean()), RT.slot('b', TF.number()), RT.slot('a', TF.string())]));
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
	pointForm := labeledImports + `getRunTypeId(RT.tuple([RT.slot('x', TF.number()), RT.slot('y', TF.number())]));
`
	sizeForm := labeledImports + `getRunTypeId(RT.tuple([RT.slot('w', TF.number()), RT.slot('h', TF.number())]));
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
	slotForm := labeledImports + `getRunTypeId(RT.tuple([RT.slot('x', TF.number()), RT.slot('y', TF.number())]));
`
	arrayForm := labeledImports + `getRunTypeId(RT.tuple([TF.number(), TF.number()]));
`
	r := setupInline(t, map[string]string{"slot.ts": slotForm, "array.ts": arrayForm})
	slotTuple := resolveFile(t, r, "slot.ts")
	array := resolveFile(t, r, "array.ts")
	if slotTuple.ID == array.ID {
		t.Fatalf("labeled slot form must not share the unlabeled array form's id (got %q)", slotTuple.ID)
	}
}

func TestLabeledFunc_SlotFormConvergesWithWrittenSignature(t *testing.T) {
	builderForm := labeledImports + `getRunTypeId(RT.func([RT.slot('event', TF.string()), RT.slot('retries', TF.number())], TF.number()));
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
	builderForm := labeledImports + `getRunTypeId(RT.func([RT.slot('type', TF.string())], TF.number()));
`
	writtenForm := labeledImports + `getRunTypeId<(type: string) => number>();
`
	r := setupInline(t, map[string]string{"builder.ts": builderForm, "written.ts": writtenForm})
	builder := resolveFile(t, r, "builder.ts")
	written := resolveFile(t, r, "written.ts")
	if builder.ID != written.ID {
		t.Fatalf("func([slot('type', …)]) and (type: string) => number diverge: %q vs %q", builder.ID, written.ID)
	}
	assertNames(t, memberNames(t, builder.ID, dump(r)), []string{"type"})
}

func TestLabeledFunc_EmptyParamsArrayConvergesWithNoParams(t *testing.T) {
	// `func([], ret)` matches the no-params overload and brands a bare
	// `() => number`, converging with the written form.
	builderForm := labeledImports + `getRunTypeId(RT.func([], TF.number()));
`
	writtenForm := labeledImports + `getRunTypeId<() => number>();
`
	r := setupInline(t, map[string]string{"builder.ts": builderForm, "written.ts": writtenForm})
	builder := resolveFile(t, r, "builder.ts")
	written := resolveFile(t, r, "written.ts")
	if builder.ID != written.ID {
		t.Fatalf("func([]) and () => number diverge: %q vs %q", builder.ID, written.ID)
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
	// form: func(tuple([slot('a', …)]), ret) ≡ (a: string) => number.
	builderForm := labeledImports + `getRunTypeId(RT.func(RT.tuple([RT.slot('a', TF.string())]), TF.number()));
`
	writtenForm := labeledImports + `getRunTypeId<(a: string) => number>();
`
	r := setupInline(t, map[string]string{"builder.ts": builderForm, "written.ts": writtenForm})
	builder := resolveFile(t, r, "builder.ts")
	written := resolveFile(t, r, "written.ts")
	if builder.ID != written.ID {
		t.Fatalf("func(tuple([slot('a', …)])) and (a: string) => number diverge: %q vs %q", builder.ID, written.ID)
	}
}
