package typefunctions

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// The one rule for `__proto__`, pinned in the emitted text. As a WIRE KEY under
// an index signature every decoder refuses it at decode time, validate refuses
// it, and every encoder or clone that rebuilds an object from its keys leaves it
// out. The in-place encoders carry NO guard: they never write a key onto another
// object, the receiving decoder refuses the key, and a compare per key there
// would be pure cost. As a DECLARED member it is dropped like any other member
// that cannot cross the wire, and the surrounding type still works.
//
// `prototype` and `constructor` are ordinary names in both positions. A declared
// `constructor` reads through the prototype chain when its own key is absent
// (`({}).constructor` is the Object function), so its presence test is the
// own-enumerability check rather than `!== undefined`.

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
	// The two names the guard must NOT cost a compare for: both land as plain
	// own keys, so a record carries them like any other key.
	for _, ordinary := range []string{"prototype", "constructor"} {
		if strings.Contains(check, "'"+ordinary+"'") {
			t.Errorf("%q is an ordinary data key and must not be in the guard, got %s", ordinary, check)
		}
	}
	if !strings.Contains(unsafeKeyThrow("k"), quoteJS(UnsafeKeyMessage)) {
		t.Errorf("the decoder throw must carry the shared message, got %s", unsafeKeyThrow("k"))
	}
}

func TestUnsafeKeys_EveryIndexSignatureLoopIsGuarded(t *testing.T) {
	cases := map[string]string{
		"restoreFromJsonMutate":     unsafeKeyThrow("k0"),
		"prepareForJsonClone": unsafeKeySkip("k0"),
		"validate":            "if (" + unsafeKeyCheck("k0") + ") return false;",
		"validationErrors":    "if (" + unsafeKeyCheck("k0") + ") {",
	}
	for fam, want := range cases {
		out := renderModule(t, recordDump(), fam)
		if !strings.Contains(out, want) {
			t.Errorf("[%s] index-signature loop lacks the prototype-name guard %q; got:\n%s", fam, want, out)
		}
	}
	// The in-place encoders stay guard-free on purpose (see the file comment).
	for _, fam := range []string{"prepareForJsonMutate", "stringifyJson", "toBinary"} {
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

// memberIsTouched reports whether the emitted text reads or writes a member by
// name. The index-signature key guard also SPELLS a name (`k0 === '__proto__'`),
// so a dropped-member check has to look for an access, not for the bare text.
func memberIsTouched(rendered, name string) bool {
	return strings.Contains(rendered, "."+name) || strings.Contains(rendered, "['"+name+"']") ||
		strings.Contains(rendered, `\'`+name+`\'`+":")
}

// bigintProp builds `{ok: number, <name><?>: bigint}` (id "obj"). A bigint value
// needs work on every road, so every family renders a live body instead of the
// noop short form and the member is visible in the emitted text.
func bigintProp(name string, optional bool) protocol.Dump {
	big := &reflection.RunType{ID: "big", Kind: reflection.KindBigInt}
	num := &reflection.RunType{ID: "num", Kind: reflection.KindNumber}
	prop := &reflection.RunType{ID: "pp", Kind: reflection.KindPropertySignature, Name: name, IsSafeName: true, Optional: optional, Child: makeRef("big")}
	keep := &reflection.RunType{ID: "pk", Kind: reflection.KindPropertySignature, Name: "ok", IsSafeName: true, Child: makeRef("num")}
	obj := &reflection.RunType{ID: "obj", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("pk"), makeRef("pp")}}
	return protocol.Dump{RunTypes: []*reflection.RunType{big, num, prop, keep, obj}}
}

// A DECLARED `__proto__` drops the member and leaves the type working: no
// alwaysThrow factory, a UPN001 Warning naming the property, and the sibling
// property still emitted. That is the same lane a member whose VALUE cannot
// cross the wire rides (strippedPropertyDrop), keyed on the name instead.
func TestUnsafeKeys_DeclaredUnsafeNameDropsTheMemberEveryFamily(t *testing.T) {
	dump := bigintProp("__proto__", false)
	for _, fam := range allSerdeFamilies {
		out, sink := renderWithDiag(t, dump, fam, "obj")
		if objFactoryIsAlwaysThrow(out) {
			t.Errorf("[%s] a declared `__proto__` drops the member, it never fails the type; got:\n%s", fam, out)
		}
		if memberIsTouched(out, "__proto__") {
			t.Errorf("[%s] the dropped member must not be read or written; got:\n%s", fam, out)
		}
		got, found := findCode(sink, diagnostics.CodeUnsafePropertyName)
		if !found {
			t.Errorf("[%s] expected %s; sink=%+v", fam, diagnostics.CodeUnsafePropertyName, sink)
			continue
		}
		if got.Severity != diagnostics.SeverityWarning || len(got.Args) != 1 || got.Args[0] != "__proto__" {
			t.Errorf("[%s] %s must be a Warning naming the property, got %+v", fam, diagnostics.CodeUnsafePropertyName, got)
		}
	}
}

// `prototype` and `constructor` are ordinary property names: a real factory, no
// UPN001, and the member carried in the emitted body. `({}).prototype` is
// undefined and `({}).constructor` only needs the own-enumerability presence
// test, so neither costs the type anything.
func TestUnsafeKeys_PrototypeAndConstructorAreOrdinaryDeclaredNames(t *testing.T) {
	for _, name := range []string{"prototype", "constructor"} {
		dump := bigintProp(name, false)
		for _, fam := range allSerdeFamilies {
			out, sink := renderWithDiag(t, dump, fam, "obj")
			if objFactoryIsAlwaysThrow(out) {
				t.Errorf("[%s/%s] an ordinary property name must render a real factory; got:\n%s", fam, name, out)
			}
			if _, found := findCode(sink, diagnostics.CodeUnsafePropertyName); found {
				t.Errorf("[%s/%s] %s must not fire for an ordinary property name; sink=%+v", fam, name, diagnostics.CodeUnsafePropertyName, sink)
			}
			if !memberIsTouched(out, name) {
				t.Errorf("[%s/%s] the member must be carried in the emitted body; got:\n%s", fam, name, out)
			}
		}
	}
}

// Every object inherits `constructor` from Object.prototype, so an absent own
// key answers that function and a plain `!== undefined` test would call the
// member present. Each family that tests presence uses the own-enumerability
// check, alone or ANDed onto the cheap test. `prototype` is NOT inherited
// (`({}).prototype` is undefined), so it keeps the cheap test.
func TestUnsafeKeys_DeclaredConstructorUsesTheOwnEnumerabilityTest(t *testing.T) {
	guard := propertyIsEnumerableGuard("v", "constructor")
	for _, fam := range allSerdeFamilies {
		out := renderModule(t, bigintProp("constructor", true), fam)
		// fromBinary is the one family with nothing to guard: presence rides the
		// wire bitmap rather than a read off the object, and the write it makes
		// (`ret.constructor = …`) is an own key on a fresh object.
		if fam == "fromBinary" {
			if strings.Contains(out, guard) {
				t.Errorf("[%s] presence rides the wire bitmap, so the own-key test is pure cost; got:\n%s", fam, out)
			}
			continue
		}
		if !strings.Contains(out, guard) {
			t.Errorf("[%s] an optional `constructor` must test presence with %s; got:\n%s", fam, guard, out)
		}
		if plain := renderModule(t, bigintProp("prototype", true), fam); strings.Contains(plain, propertyIsEnumerableGuard("v", "prototype")) {
			t.Errorf("[%s] `prototype` is not inherited and must keep the cheap presence test; got:\n%s", fam, plain)
		}
	}
	// Presence without a value check: `in` walks the prototype chain too, so a
	// REQUIRED `constructor: unknown` needs the same own-key test.
	unknown := &reflection.RunType{ID: "unk", Kind: reflection.KindUnknown}
	prop := &reflection.RunType{ID: "pp", Kind: reflection.KindPropertySignature, Name: "constructor", IsSafeName: true, Child: makeRef("unk")}
	obj := &reflection.RunType{ID: "obj", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("pp")}}
	dump := protocol.Dump{RunTypes: []*reflection.RunType{unknown, prop, obj}}
	for _, fam := range []string{"validate", "validationErrors"} {
		out := renderModule(t, dump, fam)
		if strings.Contains(out, "'constructor' in v") {
			t.Errorf("[%s] `'constructor' in {}` is true through the prototype chain; got:\n%s", fam, out)
		}
		if !strings.Contains(out, guard) {
			t.Errorf("[%s] a required `constructor` with no value check must test own-enumerability; got:\n%s", fam, out)
		}
	}
}

// The declared-name rule reaches every child slot, not only Children: a Map
// or Set stores its element types in Arguments behind KindParameter wrappers,
// and a JSON Schema patternProperties value lives in a SchemaChecks slot. Each
// case is the root test one container deeper, which is the cheapest detector
// a rule that only looked at the root would fail. The Warning rides the entry
// the member sits on, which is not the root's, so this pins the DROP.
func TestUnsafeKeys_DeclaredUnsafeNameOneContainerDeeperStillDrops(t *testing.T) {
	str := &reflection.RunType{ID: "str", Kind: reflection.KindString}
	big := &reflection.RunType{ID: "big", Kind: reflection.KindBigInt}
	bad := &reflection.RunType{ID: "bad", Kind: reflection.KindPropertySignature, Name: "__proto__", IsSafeName: true, Child: makeRef("big")}
	keep := &reflection.RunType{ID: "keep", Kind: reflection.KindPropertySignature, Name: "ok", IsSafeName: true, Child: makeRef("big")}
	inner := &reflection.RunType{ID: "inner", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("keep"), makeRef("bad")}}
	position0, position1 := 0, 1
	mapKey := &reflection.RunType{ID: "mk", Kind: reflection.KindParameter, SubKind: reflection.SubKindMapKey, Name: "key", Position: &position0, Child: makeRef("str")}
	mapValue := &reflection.RunType{ID: "mv", Kind: reflection.KindParameter, SubKind: reflection.SubKindMapValue, Name: "value", Position: &position1, Child: makeRef("inner")}
	mapNode := &reflection.RunType{ID: "map", Kind: reflection.KindClass, SubKind: reflection.SubKindMap, TypeName: "Map", Arguments: []*reflection.RunType{makeRef("mk"), makeRef("mv")}}
	setItem := &reflection.RunType{ID: "si", Kind: reflection.KindParameter, SubKind: reflection.SubKindSetItem, Name: "item", Position: &position0, Child: makeRef("inner")}
	setNode := &reflection.RunType{ID: "set", Kind: reflection.KindClass, SubKind: reflection.SubKindSet, TypeName: "Set", Arguments: []*reflection.RunType{makeRef("si")}}
	patterned := &reflection.RunType{ID: "pat", Kind: reflection.KindObjectLiteral}
	patterned.PatternProps = []*reflection.PatternPropCheck{{Source: "^d_", Key: makeRef("str"), Value: makeRef("inner")}}
	shared := []*reflection.RunType{str, big, bad, keep, inner, mapKey, mapValue, setItem}

	cases := map[string]*reflection.RunType{"Map value": mapNode, "Set item": setNode, "patternProperties value": patterned}
	for label, root := range cases {
		wrapperProp := &reflection.RunType{ID: "pw", Kind: reflection.KindPropertySignature, Name: "inner", IsSafeName: true, Child: makeRef(root.ID)}
		outer := &reflection.RunType{ID: "outer", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("pw")}}
		dump := protocol.Dump{RunTypes: append(append([]*reflection.RunType{}, shared...), root, wrapperProp, outer)}
		for _, fam := range []string{"validate", "restoreFromJsonMutate", "fromBinary"} {
			out := renderModule(t, dump, fam)
			if strings.Contains(out, "[UPN001]") {
				t.Errorf("[%s/%s] a member one %s deeper drops, it never throws the root; got:\n%s", fam, label, label, out)
			}
			if memberIsTouched(out, "__proto__") {
				t.Errorf("[%s/%s] the dropped member must not be read or written; got:\n%s", fam, label, out)
			}
			if !memberIsTouched(out, "ok") {
				t.Errorf("[%s/%s] the sibling member must still be emitted; got:\n%s", fam, label, out)
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
	for _, fam := range []string{"restoreFromJsonMutate", "compactFromJson", "restoreFromJsonClone"} {
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
	if out := renderModule(t, dump, "prepareForJsonMutate"); !strings.Contains(out, "_rec','objectLiteral',,true") {
		t.Errorf("[prepareForJson] a Record of numbers rebuilds nothing on encode and stays noop; got:\n%s", out)
	}
}
