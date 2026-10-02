package typeid_test

import "testing"

// Readonly is part of the id for every position that can carry it, so reflection never reports a twin's flag.
func TestStructural_ReadonlyCollectionsSplitFromMutableTwin(t *testing.T) {
	for _, testCase := range []struct{ readonlyType, mutableType string }{
		{"readonly [number, string]", "[number, string]"},
		{"readonly string[]", "string[]"},
		{"ReadonlyArray<string>", "string[]"},
		{"{readonly [k: string]: number}", "{[k: string]: number}"},
		{"readonly [x: number, y?: string]", "[x: number, y?: string]"},
	} {
		_, readonlyNode := rootFor(t, "import {getRunTypeId} from '@mionjs/run-types';\ngetRunTypeId<"+testCase.readonlyType+">();\n")
		_, mutableNode := rootFor(t, "import {getRunTypeId} from '@mionjs/run-types';\ngetRunTypeId<"+testCase.mutableType+">();\n")
		if readonlyNode.ID == mutableNode.ID {
			t.Errorf("%s must not share an id with %s, both got %q", testCase.readonlyType, testCase.mutableType, readonlyNode.ID)
		}
	}
}

func TestStructural_ReadonlyArraySpellingsShareID(t *testing.T) {
	_, shorthand := rootFor(t, "import {getRunTypeId} from '@mionjs/run-types';\ngetRunTypeId<readonly string[]>();\n")
	_, generic := rootFor(t, "import {getRunTypeId} from '@mionjs/run-types';\ngetRunTypeId<ReadonlyArray<string>>();\n")
	if shorthand.ID != generic.ID {
		t.Fatalf("readonly string[] and ReadonlyArray<string> are one type: %q vs %q", shorthand.ID, generic.ID)
	}
}

func TestStructural_ReadonlyTupleProjected(t *testing.T) {
	_, readonlyNode := rootFor(t, "import {getRunTypeId} from '@mionjs/run-types';\ngetRunTypeId<readonly [number, string]>();\n")
	if !readonlyNode.Readonly {
		t.Errorf("a readonly tuple must project readonly")
	}
	_, mutableNode := rootFor(t, "import {getRunTypeId} from '@mionjs/run-types';\ngetRunTypeId<[number, string]>();\n")
	if mutableNode.Readonly {
		t.Errorf("a mutable tuple must not project readonly")
	}
}

func TestStructural_ReadonlyArrayProjected(t *testing.T) {
	_, readonlyNode := rootFor(t, "import {getRunTypeId} from '@mionjs/run-types';\ngetRunTypeId<readonly string[]>();\n")
	if !readonlyNode.Readonly {
		t.Errorf("a readonly array must project readonly")
	}
}

func TestStructural_ReadonlyTupleFormEquivalence(t *testing.T) {
	_, static := rootFor(t, "import {getRunTypeId} from '@mionjs/run-types';\ngetRunTypeId<readonly [number, string]>();\n")
	_, reflected := rootFor(t, `import {getRunTypeId} from '@mionjs/run-types';
const pair: readonly [number, string] = [1, 'a'];
getRunTypeId(pair);
`)
	if static.ID != reflected.ID || !reflected.Readonly {
		t.Fatalf("getRunTypeId<readonly [number, string]>() and getRunTypeId(value) must share a readonly entry: %q vs %q", static.ID, reflected.ID)
	}
}

func TestStructural_ReadonlyArrayFormEquivalence(t *testing.T) {
	_, static := rootFor(t, "import {getRunTypeId} from '@mionjs/run-types';\ngetRunTypeId<readonly string[]>();\n")
	_, reflected := rootFor(t, `import {getRunTypeId} from '@mionjs/run-types';
const names: readonly string[] = ['a'];
getRunTypeId(names);
`)
	if static.ID != reflected.ID || !reflected.Readonly {
		t.Fatalf("getRunTypeId<readonly string[]>() and getRunTypeId(value) must share a readonly entry: %q vs %q", static.ID, reflected.ID)
	}
}

// A tuple intersection merges to readonly only when every member is readonly, as in TypeScript.
func TestStructural_ReadonlyTupleIntersection(t *testing.T) {
	idFor := func(typeText string) (string, bool) {
		_, node := rootFor(t, "import {getRunTypeId} from '@mionjs/run-types';\ngetRunTypeId<"+typeText+">();\n")
		return node.ID, node.Readonly
	}
	allReadonly, allReadonlyFlag := idFor("readonly [string, ...unknown[]] & readonly [unknown?, number?, ...unknown[]]")
	written, _ := idFor("readonly [string, number?, ...unknown[]]")
	if allReadonly != written || !allReadonlyFlag {
		t.Errorf("an all-readonly merge must match the written readonly tuple: %q vs %q", allReadonly, written)
	}
	mixed, mixedFlag := idFor("readonly [string, ...unknown[]] & [unknown?, number?, ...unknown[]]")
	mutable, _ := idFor("[string, number?, ...unknown[]]")
	if mixed != mutable || mixedFlag {
		t.Errorf("a merge with one mutable member must match the mutable tuple: %q vs %q", mixed, mutable)
	}
}
