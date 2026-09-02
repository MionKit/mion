package typeid_test

import (
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// TestTupleMerge_IntersectionConvergesWithHandWrittenTuple — the collapse-level
// pin for the allOf tuple-intersection collapse gap: a tuple ∩ tuple
// intersection merges slot-wise (unknown sides defer, equal sides collapse,
// the length window intersects) and the resulting node is INDISTINGUISHABLE —
// same id, same kind — from the equivalent hand-written tuple. Historically
// this shape degraded into a junk objectLiteral whose validator was a noop.
func TestTupleMerge_IntersectionConvergesWithHandWrittenTuple(t *testing.T) {
	_, twin := rootFor(t, `import {getRunTypeId} from '@mionjs/run-types';
getRunTypeId<[string, ...unknown[]] & [unknown?, number?, ...unknown[]]>();
`)
	_, plainRequired := rootFor(t, `import {getRunTypeId} from '@mionjs/run-types';
getRunTypeId<[string, number?, ...unknown[]]>();
`)
	if twin.Kind != reflection.KindTuple {
		t.Fatalf("twin: expected KindTuple, got %d", twin.Kind)
	}
	if twin.ID != plainRequired.ID {
		t.Errorf("required-slot merge: twin %s != hand-written %s", twin.ID, plainRequired.ID)
	}

	// All-optional variant (the JSON Schema door's shape: prefixItems slots
	// are optional below minItems) — merged optionality follows the widest
	// required prefix, here zero.
	_, optionalTwin := rootFor(t, `import {getRunTypeId} from '@mionjs/run-types';
getRunTypeId<[string?, ...unknown[]] & [unknown?, number?, ...unknown[]]>();
`)
	_, plainOptional := rootFor(t, `import {getRunTypeId} from '@mionjs/run-types';
getRunTypeId<[string?, number?, ...unknown[]]>();
`)
	if optionalTwin.ID != plainOptional.ID {
		t.Errorf("optional-slot merge: twin %s != hand-written %s", optionalTwin.ID, plainOptional.ID)
	}
}

// TestTupleMerge_FormEquivalence — marker rule: the static and reflection
// call shapes resolve the merged intersection to ONE cache entry.
func TestTupleMerge_FormEquivalence(t *testing.T) {
	_, staticNode := rootFor(t, `import {getRunTypeId} from '@mionjs/run-types';
getRunTypeId<[string, ...unknown[]] & [unknown?, number?, ...unknown[]]>();
`)
	_, reflectNode := rootFor(t, `import {getRunTypeId} from '@mionjs/run-types';
const value: [string, ...unknown[]] & [unknown?, number?, ...unknown[]] = ['a', 1];
getRunTypeId(value);
`)
	if staticNode.ID != reflectNode.ID {
		t.Errorf("form equivalence: static %s != reflection %s", staticNode.ID, reflectNode.ID)
	}
}

// TestTupleMerge_ConflictProjectsNever — a genuine slot conflict must reject
// everything (KindNever), never silently under-validate.
func TestTupleMerge_ConflictProjectsNever(t *testing.T) {
	_, conflict := rootFor(t, `import {getRunTypeId} from '@mionjs/run-types';
getRunTypeId<[string] & [number]>();
`)
	if conflict.Kind != reflection.KindNever {
		t.Errorf("conflict: expected KindNever, got kind %d (id %s)", conflict.Kind, conflict.ID)
	}

	// Impossible length window: left requires ≥2, right closes at 1.
	_, window := rootFor(t, `import {getRunTypeId} from '@mionjs/run-types';
getRunTypeId<[unknown, unknown, ...unknown[]] & [string?]>();
`)
	if window.Kind != reflection.KindNever {
		t.Errorf("length window: expected KindNever, got kind %d (id %s)", window.Kind, window.ID)
	}
}

// TestTupleMerge_ArrayReadsAsAnOpenTuple — a plain array is a tuple with NO
// fixed slots and an open tail, so `tuple ∩ array` merges through the same
// slot-wise path. This is the shape JSON Schema produces whenever a
// `prefixItems` in one applicator meets an `items` in another; before the gate
// widened, the pair fell through to the junk-objectLiteral path and the
// validator rejected every array.
func TestTupleMerge_ArrayReadsAsAnOpenTuple(t *testing.T) {
	// The array's element type fills the slots the tuple leaves unknown.
	_, merged := rootFor(t, `import {getRunTypeId} from '@mionjs/run-types';
getRunTypeId<[unknown?, ...unknown[]] & number[]>();
`)
	_, plain := rootFor(t, `import {getRunTypeId} from '@mionjs/run-types';
getRunTypeId<[number?, ...number[]]>();
`)
	if merged.Kind != reflection.KindTuple {
		t.Fatalf("tuple ∩ array: expected KindTuple, got %d", merged.Kind)
	}
	if merged.ID != plain.ID {
		t.Errorf("tuple ∩ array: merged %s != hand-written %s", merged.ID, plain.ID)
	}

	// The tuple's own slot wins over an unknown-element array, and the tail
	// stays open — `['a', 1, true]` still validates.
	_, tupleWins := rootFor(t, `import {getRunTypeId} from '@mionjs/run-types';
getRunTypeId<[string?, ...unknown[]] & unknown[]>();
`)
	_, tupleAlone := rootFor(t, `import {getRunTypeId} from '@mionjs/run-types';
getRunTypeId<[string?, ...unknown[]]>();
`)
	if tupleWins.ID != tupleAlone.ID {
		t.Errorf("tuple ∩ unknown[]: merged %s != hand-written %s", tupleWins.ID, tupleAlone.ID)
	}

	// Reflection shape resolves the same entry (marker rule).
	_, reflectNode := rootFor(t, `import {getRunTypeId} from '@mionjs/run-types';
const value: [unknown?, ...unknown[]] & number[] = [1];
getRunTypeId(value);
`)
	if reflectNode.ID != merged.ID {
		t.Errorf("form equivalence: static %s != reflection %s", merged.ID, reflectNode.ID)
	}

	// A conflicting slot (string tuple slot vs number array element) still
	// rejects everything rather than dropping one of the two constraints.
	_, conflict := rootFor(t, `import {getRunTypeId} from '@mionjs/run-types';
getRunTypeId<[string, ...unknown[]] & number[]>();
`)
	if conflict.Kind != reflection.KindNever {
		t.Errorf("tuple ∩ array conflict: expected KindNever, got kind %d (id %s)", conflict.Kind, conflict.ID)
	}
}

// The raw sentinel encoding of a branded number, so these cases need nothing
// from the formats module graph — same trick the fuzz generator's preamble uses.
const foldBrands = `import {getRunTypeId} from '@mionjs/run-types';
type Min3 = number & {__rtFormatName?: 'number'; __rtFormatParams?: {min: 3}};
type Min5 = number & {__rtFormatName?: 'number'; __rtFormatParams?: {min: 5}};
`

// TestTupleMerge_ContendedSlotFoldsItsAnnotations — two applicators constraining
// ONE position with different bounds is a conjunction, not a conflict: the slot
// folds to the base wearing the tightened annotation. Every slot that reaches
// this path used to project `never`, so nothing that resolves today can move.
func TestTupleMerge_ContendedSlotFoldsItsAnnotations(t *testing.T) {
	_, folded := rootFor(t, foldBrands+`getRunTypeId<[Min3?, ...unknown[]] & Min5[]>();
`)
	if folded.Kind != reflection.KindTuple {
		t.Fatalf("contended slot: expected KindTuple, got %d (id %s)", folded.Kind, folded.ID)
	}
	// `min: 3 ∧ min: 5` is `min: 5`, so the merged slot IS the tighter bound.
	_, tighter := rootFor(t, foldBrands+`getRunTypeId<[Min5?, ...Min5[]]>();
`)
	if folded.ID != tighter.ID {
		t.Errorf("annotation fold: merged %s != tightened %s", folded.ID, tighter.ID)
	}
}

// TestTupleMerge_ContendedUnionSlotFoldsArmwise — the shape a TYPE-LESS JSON
// Schema keyword produces: each side is the six-kind union and only the number
// arm differs. Arms pair up, the branded pair folds, and the identical arms
// pass through. The tuple slot is also an OPAQUE optional here (its union keeps
// `null` after `undefined` is stripped), which used to fail the merge outright.
func TestTupleMerge_ContendedUnionSlotFoldsArmwise(t *testing.T) {
	unions := foldBrands + `type U3 = string | Min3 | boolean | null | unknown[] | Record<string, unknown>;
type U5 = string | Min5 | boolean | null | unknown[] | Record<string, unknown>;
`
	_, folded := rootFor(t, unions+`getRunTypeId<[U3?, ...unknown[]] & U5[]>();
`)
	if folded.Kind != reflection.KindTuple {
		t.Fatalf("union slot: expected KindTuple, got %d (id %s)", folded.Kind, folded.ID)
	}
	_, tighter := rootFor(t, unions+`getRunTypeId<[U5?, ...U5[]]>();
`)
	if folded.ID != tighter.ID {
		t.Errorf("armwise fold: merged %s != tightened %s", folded.ID, tighter.ID)
	}
}

// TestTupleMerge_UnfoldableContentionStillProjectsNever — the fold is bounded
// too. Different format FAMILIES on one slot, and a slot whose sides share no
// base at all, both stay conflicts.
func TestTupleMerge_UnfoldableContentionStillProjectsNever(t *testing.T) {
	_, families := rootFor(t, `import {getRunTypeId} from '@mionjs/run-types';
type Numeric = number & {__rtFormatName?: 'number'; __rtFormatParams?: {min: 3}};
type Texty = string & {__rtFormatName?: 'string'; __rtFormatParams?: {minLength: 3}};
getRunTypeId<[Numeric?, ...unknown[]] & Texty[]>();
`)
	if families.Kind != reflection.KindNever {
		t.Errorf("cross-family: expected KindNever, got kind %d (id %s)", families.Kind, families.ID)
	}

	// A plain disagreement with no annotation anywhere has nothing to fold.
	_, plain := rootFor(t, `import {getRunTypeId} from '@mionjs/run-types';
getRunTypeId<[string?, ...unknown[]] & number[]>();
`)
	if plain.Kind != reflection.KindNever {
		t.Errorf("plain disagreement: expected KindNever, got kind %d (id %s)", plain.Kind, plain.ID)
	}
}

// TestTupleMerge_ClosedSideCapsTheMerge — a single closed tuple closes the
// merge at its fixed length; the open side's tail is dropped.
func TestTupleMerge_ClosedSideCapsTheMerge(t *testing.T) {
	_, capped := rootFor(t, `import {getRunTypeId} from '@mionjs/run-types';
getRunTypeId<[string, ...unknown[]] & [unknown?, number?]>();
`)
	_, plain := rootFor(t, `import {getRunTypeId} from '@mionjs/run-types';
getRunTypeId<[string, number?]>();
`)
	if capped.ID != plain.ID {
		t.Errorf("closed cap: merged %s != hand-written %s", capped.ID, plain.ID)
	}
}
