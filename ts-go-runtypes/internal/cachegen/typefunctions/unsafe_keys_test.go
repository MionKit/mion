package typefunctions

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// The one rule for prototype-named keys, pinned in the emitted text: every
// decoder refuses such a wire key at decode time, validate refuses it under an
// index signature, and every encoder or clone that rebuilds an object from its
// keys leaves it out. The in-place encoders carry NO guard: they never write a
// key onto another object, the receiving decoder refuses the key, and a compare
// per key there would be pure cost. A type that declares one of the names fails
// the build in every family.

// recordDump — `Record<string, bigint>`: a bare string index signature whose
// value needs a transform on every road, so each family renders a live loop.
// (A Record of plain numbers renders the same key loop on the decode roads,
// guard included: see TestUnsafeKeys_DecoderGuardShipsForANoopValueType.)
func recordDump() protocol.Dump {
	num := &reflection.RunType{ID: "num", Kind: reflection.KindBigInt}
	key := &reflection.RunType{ID: "key", Kind: reflection.KindString}
	idx := &reflection.RunType{ID: "idx", Kind: reflection.KindIndexSignature, Index: makeRef("key"), Child: makeRef("num")}
	rec := &reflection.RunType{ID: "rec", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("idx")}}
	return protocol.Dump{RunTypes: []*reflection.RunType{num, key, idx, rec}}
}

func TestUnsafeKeys_GuardTextIsOneSourceOfTruth(t *testing.T) {
	check := unsafeKeyCheck("k")
	for _, name := range reflection.UnsafePropertyNames {
		if !strings.Contains(check, "k === '"+name+"'") {
			t.Errorf("guard must compare against %q, got %s", name, check)
		}
	}
	if !strings.Contains(unsafeKeyThrow("k"), quoteJS(UnsafeKeyMessage)) {
		t.Errorf("the decoder throw must carry the shared message, got %s", unsafeKeyThrow("k"))
	}
}

func TestUnsafeKeys_EveryIndexSignatureLoopIsGuarded(t *testing.T) {
	cases := map[string]string{
		"restoreFromJson":    unsafeKeyThrow("k0"),
		"prepareForJsonSafe": unsafeKeySkip("k0"),
		"validate":           "if (" + unsafeKeyCheck("k0") + ") return false;",
		"validationErrors":   "if (" + unsafeKeyCheck("k0") + ") {",
	}
	for fam, want := range cases {
		out := renderModule(t, recordDump(), fam)
		if !strings.Contains(out, want) {
			t.Errorf("[%s] index-signature loop lacks the prototype-name guard %q; got:\n%s", fam, want, out)
		}
	}
	// The in-place encoders stay guard-free on purpose (see the file comment).
	for _, fam := range []string{"prepareForJson", "stringifyJson", "toBinary"} {
		out := renderModule(t, recordDump(), fam)
		if strings.Contains(out, "k0.length === 9") {
			t.Errorf("[%s] an in-place encoder must not pay the prototype-name compare per key; got:\n%s", fam, out)
		}
	}
	// The binary decoder reads dynamic keys through desSafePropName, which
	// carries the same guard in the runtime.
	if out := renderModule(t, recordDump(), "fromBinary"); !strings.Contains(out, ".desSafePropName()") {
		t.Errorf("[fromBinary] dynamic keys must be read through desSafePropName; got:\n%s", out)
	}
}

func TestUnsafeKeys_DeclaredNameFailsEveryFamily(t *testing.T) {
	for _, name := range reflection.UnsafePropertyNames {
		str := &reflection.RunType{ID: "str", Kind: reflection.KindString}
		prop := &reflection.RunType{ID: "pp", Kind: reflection.KindPropertySignature, Name: name, IsSafeName: true, Child: makeRef("str")}
		obj := &reflection.RunType{ID: "obj", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("pp")}}
		dump := protocol.Dump{RunTypes: []*reflection.RunType{str, prop, obj}}
		for _, fam := range allSerdeFamilies {
			out, sink := renderWithDiag(t, dump, fam, "obj")
			if !objFactoryIsAlwaysThrow(out) {
				t.Errorf("[%s/%s] a declared prototype-named property must render an alwaysThrow factory; got:\n%s", fam, name, out)
			}
			got, ok := findCode(sink, diagnostics.CodeUnsafePropertyName)
			if !ok {
				t.Errorf("[%s/%s] expected %s; sink=%+v", fam, name, diagnostics.CodeUnsafePropertyName, sink)
				continue
			}
			if got.Severity != diagnostics.SeverityError || len(got.Args) != 1 || got.Args[0] != name {
				t.Errorf("[%s/%s] %s must be an Error naming the property, got %+v", fam, name, diagnostics.CodeUnsafePropertyName, got)
			}
			if !strings.Contains(out, "[UPN001] Property `"+name+"`") {
				t.Errorf("[%s/%s] the runtime throw must name the property; got:\n%s", fam, name, out)
			}
		}
	}
}

// The declared-name rule reaches every child slot, not only Children: a Map
// or Set stores its element types in Arguments behind KindParameter wrappers,
// and a JSON Schema patternProperties value lives in a SchemaChecks slot. Each
// case is the root test one container deeper, which is the cheapest detector
// a root-only rule has.
func TestUnsafeKeys_DeclaredNameOneContainerDeeperFailsTheBuild(t *testing.T) {
	str := &reflection.RunType{ID: "str", Kind: reflection.KindString}
	bad := &reflection.RunType{ID: "bad", Kind: reflection.KindPropertySignature, Name: "constructor", IsSafeName: true, Child: makeRef("str")}
	inner := &reflection.RunType{ID: "inner", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("bad")}}
	position0, position1 := 0, 1
	mapKey := &reflection.RunType{ID: "mk", Kind: reflection.KindParameter, SubKind: reflection.SubKindMapKey, Name: "key", Position: &position0, Child: makeRef("str")}
	mapValue := &reflection.RunType{ID: "mv", Kind: reflection.KindParameter, SubKind: reflection.SubKindMapValue, Name: "value", Position: &position1, Child: makeRef("inner")}
	mapNode := &reflection.RunType{ID: "map", Kind: reflection.KindClass, SubKind: reflection.SubKindMap, TypeName: "Map", Arguments: []*reflection.RunType{makeRef("mk"), makeRef("mv")}}
	setItem := &reflection.RunType{ID: "si", Kind: reflection.KindParameter, SubKind: reflection.SubKindSetItem, Name: "item", Position: &position0, Child: makeRef("inner")}
	setNode := &reflection.RunType{ID: "set", Kind: reflection.KindClass, SubKind: reflection.SubKindSet, TypeName: "Set", Arguments: []*reflection.RunType{makeRef("si")}}
	patterned := &reflection.RunType{ID: "pat", Kind: reflection.KindObjectLiteral}
	patterned.PatternProps = []*reflection.PatternPropCheck{{Source: "^d_", Key: makeRef("str"), Value: makeRef("inner")}}
	shared := []*reflection.RunType{str, bad, inner, mapKey, mapValue, setItem}

	cases := map[string]*reflection.RunType{"Map value": mapNode, "Set item": setNode, "patternProperties value": patterned}
	for label, root := range cases {
		wrapperProp := &reflection.RunType{ID: "pw", Kind: reflection.KindPropertySignature, Name: "inner", IsSafeName: true, Child: makeRef(root.ID)}
		outer := &reflection.RunType{ID: "outer", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("pw")}}
		dump := protocol.Dump{RunTypes: append(append([]*reflection.RunType{}, shared...), root, wrapperProp, outer)}
		for _, fam := range []string{"validate", "restoreFromJson", "fromBinary"} {
			out, sink := renderWithDiag(t, dump, fam, "outer")
			if !strings.Contains(out, "_outer','objectLiteral',,,,,,'[UPN001]") {
				t.Errorf("[%s/%s] a prototype-named member one %s deeper must render an alwaysThrow factory for the root; got:\n%s", fam, label, label, out)
			}
			if _, ok := findCode(sink, diagnostics.CodeUnsafePropertyName); !ok {
				t.Errorf("[%s/%s] expected %s for the nested member; sink=%+v", fam, label, diagnostics.CodeUnsafePropertyName, sink)
			}
		}
	}
}

// A decoder over a Record whose values need no rebuild still ships the key
// loop with the prototype-name refusal, on both decode roads, and its entry
// is NOT the noop short form: an entry claiming noop while carrying that
// guard would be elided by the composite and the guard lost. The encode
// roads over the same type stay noop (nothing to rebuild, no key written).
func TestUnsafeKeys_DecoderGuardShipsForANoopValueType(t *testing.T) {
	num := &reflection.RunType{ID: "num", Kind: reflection.KindNumber}
	key := &reflection.RunType{ID: "key", Kind: reflection.KindString}
	idx := &reflection.RunType{ID: "idx", Kind: reflection.KindIndexSignature, Index: makeRef("key"), Child: makeRef("num")}
	rec := &reflection.RunType{ID: "rec", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("idx")}}
	prop := &reflection.RunType{ID: "pb", Kind: reflection.KindPropertySignature, Name: "bag", IsSafeName: true, Child: makeRef("rec")}
	outer := &reflection.RunType{ID: "outer", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("pb")}}
	dump := protocol.Dump{RunTypes: []*reflection.RunType{num, key, idx, rec, prop, outer}}
	for _, fam := range []string{"restoreFromJson", "compactFromJson"} {
		out := renderModule(t, dump, fam)
		if !strings.Contains(out, unsafeKeyThrow("k0")) {
			t.Errorf("[%s] the key loop must ship its prototype-name refusal for a noop value type; got:\n%s", fam, out)
		}
		for _, id := range []string{"_rec'", "_outer'"} {
			if strings.Contains(out, id+",'objectLiteral',,true") {
				t.Errorf("[%s] an entry carrying the key guard must not be the noop short form (%s); got:\n%s", fam, id, out)
			}
		}
	}
	if out := renderModule(t, dump, "prepareForJson"); !strings.Contains(out, "_rec','objectLiteral',,true") {
		t.Errorf("[prepareForJson] a Record of numbers rebuilds nothing on encode and stays noop; got:\n%s", out)
	}
}
