package typeid_test

import (
	"testing"

	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// TestTupleMerge_IntersectionConvergesWithHandWrittenTuple — the collapse-level
// pin for docs/done/allof-tuple-intersection-collapse-gap.md: a tuple ∩ tuple
// intersection merges slot-wise (unknown sides defer, equal sides collapse,
// the length window intersects) and the resulting node is INDISTINGUISHABLE —
// same id, same kind — from the equivalent hand-written tuple. Historically
// this shape degraded into a junk objectLiteral whose validator was a noop.
func TestTupleMerge_IntersectionConvergesWithHandWrittenTuple(t *testing.T) {
	_, twin := rootFor(t, `import {getRunTypeId} from '@ts-runtypes/core';
getRunTypeId<[string, ...unknown[]] & [unknown?, number?, ...unknown[]]>();
`)
	_, plainRequired := rootFor(t, `import {getRunTypeId} from '@ts-runtypes/core';
getRunTypeId<[string, number?, ...unknown[]]>();
`)
	if twin.Kind != protocol.KindTuple {
		t.Fatalf("twin: expected KindTuple, got %d", twin.Kind)
	}
	if twin.ID != plainRequired.ID {
		t.Errorf("required-slot merge: twin %s != hand-written %s", twin.ID, plainRequired.ID)
	}

	// All-optional variant (the JSON Schema door's shape: prefixItems slots
	// are optional below minItems) — merged optionality follows the widest
	// required prefix, here zero.
	_, optionalTwin := rootFor(t, `import {getRunTypeId} from '@ts-runtypes/core';
getRunTypeId<[string?, ...unknown[]] & [unknown?, number?, ...unknown[]]>();
`)
	_, plainOptional := rootFor(t, `import {getRunTypeId} from '@ts-runtypes/core';
getRunTypeId<[string?, number?, ...unknown[]]>();
`)
	if optionalTwin.ID != plainOptional.ID {
		t.Errorf("optional-slot merge: twin %s != hand-written %s", optionalTwin.ID, plainOptional.ID)
	}
}

// TestTupleMerge_FormEquivalence — marker rule: the static and reflection
// call shapes resolve the merged intersection to ONE cache entry.
func TestTupleMerge_FormEquivalence(t *testing.T) {
	_, staticNode := rootFor(t, `import {getRunTypeId} from '@ts-runtypes/core';
getRunTypeId<[string, ...unknown[]] & [unknown?, number?, ...unknown[]]>();
`)
	_, reflectNode := rootFor(t, `import {getRunTypeId} from '@ts-runtypes/core';
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
	_, conflict := rootFor(t, `import {getRunTypeId} from '@ts-runtypes/core';
getRunTypeId<[string] & [number]>();
`)
	if conflict.Kind != protocol.KindNever {
		t.Errorf("conflict: expected KindNever, got kind %d (id %s)", conflict.Kind, conflict.ID)
	}

	// Impossible length window: left requires ≥2, right closes at 1.
	_, window := rootFor(t, `import {getRunTypeId} from '@ts-runtypes/core';
getRunTypeId<[unknown, unknown, ...unknown[]] & [string?]>();
`)
	if window.Kind != protocol.KindNever {
		t.Errorf("length window: expected KindNever, got kind %d (id %s)", window.Kind, window.ID)
	}
}

// TestTupleMerge_ClosedSideCapsTheMerge — a single closed tuple closes the
// merge at its fixed length; the open side's tail is dropped.
func TestTupleMerge_ClosedSideCapsTheMerge(t *testing.T) {
	_, capped := rootFor(t, `import {getRunTypeId} from '@ts-runtypes/core';
getRunTypeId<[string, ...unknown[]] & [unknown?, number?]>();
`)
	_, plain := rootFor(t, `import {getRunTypeId} from '@ts-runtypes/core';
getRunTypeId<[string, number?]>();
`)
	if capped.ID != plain.ID {
		t.Errorf("closed cap: merged %s != hand-written %s", capped.ID, plain.ID)
	}
}
