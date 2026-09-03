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
// keys leaves it out. A type that declares one of the names fails the build in
// every family.

// recordDump — `Record<string, bigint>`: a bare string index signature whose
// value needs a transform on every road, so each family renders a live loop.
// (A Record of plain numbers is a noop identity for the JSON codecs: no loop
// runs, the key reaches validate untouched, and validate refuses it there.)
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
		"stringifyJson":      unsafeKeySkip("k0"),
		"toBinary":           unsafeKeySkip("k0"),
		"prepareForJson":     "delete v[k0]; continue;",
		"validate":           "if (" + unsafeKeyCheck("k0") + ") return false;",
		"validationErrors":   "if (" + unsafeKeyCheck("k0") + ") {",
	}
	for fam, want := range cases {
		out := renderModule(t, recordDump(), fam)
		if !strings.Contains(out, want) {
			t.Errorf("[%s] index-signature loop lacks the prototype-name guard %q; got:\n%s", fam, want, out)
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
