package typefunctions

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/operations"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// rjsEntry renders the restoreFromJsonClone family for a dump and returns the entry for id.
func rjsEntry(t *testing.T, runTypes []*reflection.RunType, id string) string {
	t.Helper()
	return familyEntry(t, runTypes, "restoreFromJsonClone", id)
}

// templateKeyIndex is the index signature `[k: \`<prefix>${string}\`]: <valueID>`.
func templateKeyIndex(id, prefix, valueID string) []*reflection.RunType {
	key := &reflection.RunType{ID: id + "Key", Kind: reflection.KindTemplateLiteral, Literal: map[string]any{
		"templateLiteral": map[string]any{"texts": []any{prefix, ""}, "placeholders": []any{map[string]any{}}},
	}}
	sig := &reflection.RunType{ID: id, Kind: reflection.KindIndexSignature, Index: makeRef(key.ID), Child: makeRef(valueID)}
	return []*reflection.RunType{key, sig}
}

// An object is rebuilt (`const r0 = {}`) exactly when its declaration does not
// admit every key that can arrive: a symbol-keyed or function-valued signature
// admits no wire key, and a dropped declared member's wire key has to go. A
// plain `[k: string]: number` admits everything, so the in-place walk is
// delegated to and only its prototype-name refusal ships.
func TestRestoreFromJsonClone_IndexSignatureRebuildTriggers(t *testing.T) {
	str := &reflection.RunType{ID: "str", Kind: reflection.KindString}
	num := &reflection.RunType{ID: "num", Kind: reflection.KindNumber}
	sym := &reflection.RunType{ID: "sym", Kind: reflection.KindSymbol}
	fn := &reflection.RunType{ID: "fn", Kind: reflection.KindFunction}
	propA := &reflection.RunType{ID: "pa", Kind: reflection.KindProperty, Name: "a", IsSafeName: true, Child: makeRef("str")}
	method := &reflection.RunType{ID: "pm", Kind: reflection.KindMethodSignature, Name: "m"}
	symIdx := &reflection.RunType{ID: "symIdx", Kind: reflection.KindIndexSignature, Index: makeRef("sym"), Child: makeRef("num")}
	fnIdx := &reflection.RunType{ID: "fnIdx", Kind: reflection.KindIndexSignature, Index: makeRef("str"), Child: makeRef("fn")}
	numIdx := &reflection.RunType{ID: "numIdx", Kind: reflection.KindIndexSignature, Index: makeRef("str"), Child: makeRef("num")}
	shared := []*reflection.RunType{str, num, sym, fn, propA, method, symIdx, fnIdx, numIdx}

	rebuilt := map[string]*reflection.RunType{
		"symbol-keyed signature":    {ID: "obj", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("symIdx"), makeRef("pa")}},
		"function-valued signature": {ID: "obj", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("fnIdx")}},
		"dropped declared sibling":  {ID: "obj", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("numIdx"), makeRef("pm")}},
	}
	for label, obj := range rebuilt {
		entry := rjsEntry(t, append(append([]*reflection.RunType{}, shared...), obj), "obj")
		if !strings.Contains(entry, "const r0 = {}") {
			t.Errorf("[%s] must rebuild from the declared shape; got:\n%s", label, entry)
		}
	}
	// The dropped method's key is skipped by the sweep, every other key is copied.
	dropped := rjsEntry(t, append(append([]*reflection.RunType{}, shared...), rebuilt["dropped declared sibling"]), "obj")
	if !strings.Contains(dropped, "if (k0 === 'm') continue;r0[k0] = v[k0]; continue;") {
		t.Errorf("a dropped declared sibling must be skipped and every other key copied; got:\n%s", dropped)
	}

	open := &reflection.RunType{ID: "obj", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("numIdx")}}
	entry := rjsEntry(t, append(append([]*reflection.RunType{}, shared...), open), "obj")
	if strings.Contains(entry, "const r0") {
		t.Errorf("a plain string-keyed record admits every key and must delegate; got:\n%s", entry)
	}
	if !strings.Contains(entry, unsafeKeyThrow("k0")) {
		t.Errorf("the delegated walk must still refuse a prototype-named key; got:\n%s", entry)
	}
}

// An index signature is always open: a key its pattern does not match is
// validation's to refuse, so the rebuild sweep copies it and only skips the
// value transform. Two pattern signatures sharing a value type keep both arms.
func TestRestoreFromJsonClone_PatternKeysAreCopiedNotDropped(t *testing.T) {
	num := &reflection.RunType{ID: "num", Kind: reflection.KindNumber}
	method := &reflection.RunType{ID: "pm", Kind: reflection.KindMethodSignature, Name: "m"}
	obj := &reflection.RunType{ID: "obj", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("idxA"), makeRef("idxB"), makeRef("pm")}}
	runTypes := append(append([]*reflection.RunType{num, method, obj}, templateKeyIndex("idxA", "a_", "num")...), templateKeyIndex("idxB", "b_", "num")...)
	entry := rjsEntry(t, runTypes, "obj")
	for _, regex := range []string{`new RegExp("^a_`, `new RegExp("^b_`} {
		if !strings.Contains(entry, regex) {
			t.Errorf("both pattern arms must hoist their regex; got:\n%s", entry)
		}
	}
	if !strings.Contains(entry, "if (reIdx1.test(k0)) {r0[k0] = v[k0]; continue;}r0[k0] = v[k0];}") {
		t.Errorf("a key matching no pattern must still be copied after the last arm; got:\n%s", entry)
	}
	if !strings.Contains(entry, "if (k0 === 'm') continue;") {
		t.Errorf("the dropped method's key must be skipped; got:\n%s", entry)
	}
}

// The remaining rebuild positions render, each with the rebuild where the
// object sits: under a named class's serializer registry branch, inside a Map's
// value slot, and through a circular type's tuple slot.
func TestRestoreFromJsonClone_RebuildPositions(t *testing.T) {
	str := &reflection.RunType{ID: "str", Kind: reflection.KindString}
	propA := &reflection.RunType{ID: "pa", Kind: reflection.KindProperty, Name: "a", IsSafeName: true, Child: makeRef("str")}
	inner := &reflection.RunType{ID: "inner", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("pa")}}
	cls := &reflection.RunType{ID: "cls", Kind: reflection.KindClass, SubKind: reflection.SubKindNone, TypeName: "Account", Children: []*reflection.RunType{makeRef("pa")}}
	position0, position1 := 0, 1
	mapKey := &reflection.RunType{ID: "mk", Kind: reflection.KindParameter, SubKind: reflection.SubKindMapKey, Name: "key", Position: &position0, Child: makeRef("str")}
	mapValue := &reflection.RunType{ID: "mv", Kind: reflection.KindParameter, SubKind: reflection.SubKindMapValue, Name: "value", Position: &position1, Child: makeRef("inner")}
	mapNode := &reflection.RunType{ID: "map", Kind: reflection.KindClass, SubKind: reflection.SubKindMap, TypeName: "Map", Arguments: []*reflection.RunType{makeRef("mk"), makeRef("mv")}}
	slot0 := &reflection.RunType{ID: "tm0", Kind: reflection.KindTupleMember, Position: &position0, Child: makeRef("str")}
	slot1 := &reflection.RunType{ID: "tm1", Kind: reflection.KindTupleMember, Position: &position1, Optional: true, Child: makeRef("self")}
	tuple := &reflection.RunType{ID: "tup", Kind: reflection.KindTuple, Children: []*reflection.RunType{makeRef("tm0"), makeRef("tm1")}}
	propList := &reflection.RunType{ID: "plist", Kind: reflection.KindProperty, Name: "list", IsSafeName: true, Child: makeRef("tup")}
	self := &reflection.RunType{ID: "self", Kind: reflection.KindObjectLiteral, TypeName: "Self", IsCircular: true, Children: []*reflection.RunType{makeRef("plist")}}
	runTypes := []*reflection.RunType{str, propA, inner, cls, mapKey, mapValue, mapNode, slot0, slot1, tuple, propList, self}

	class := rjsEntry(t, runTypes, "cls")
	if !strings.Contains(class, "utl.deserializeClass(") || !strings.Contains(class, "const r0 = {};r0.a = v.a;") {
		t.Errorf("a named class must rebuild its declared shape under the serializer registry branch; got:\n%s", class)
	}
	mapEntry := rjsEntry(t, runTypes, "map")
	if !strings.Contains(mapEntry, "v[e0][1] = ") || !strings.Contains(mapEntry, "new Map(v)") {
		t.Errorf("a Map of objects must rebuild each value before the constructor; got:\n%s", mapEntry)
	}
	circular := rjsEntry(t, runTypes, "self")
	// The self-reference is emitted as a call to this family's own entry, so the
	// prefix comes from the registry: a hardcoded hash rots on every rename.
	selfCall := "v.list[1] = " + operations.PlainHash("restoreFromJsonClone") + "_self(v.list[1])"
	if !strings.Contains(circular, "r0.list = v.list;v = r0;") || !strings.Contains(circular, selfCall) {
		t.Errorf("a circular type must rebuild itself and recurse through its tuple slot; got:\n%s", circular)
	}
}
