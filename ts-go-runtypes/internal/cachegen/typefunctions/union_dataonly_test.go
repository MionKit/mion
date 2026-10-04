package typefunctions

import (
	"fmt"
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// DataOnly union-member drop: a union with non-serializable members must
// project to the union of its data members (symbol / function / Promise /
// non-serializable / never dropped), matching DataOnly<T>. An all-stripped
// union (DataOnly = never) still renders an alwaysThrow factory.

func unionDump(members ...*reflection.RunType) protocol.Dump {
	refs := make([]*reflection.RunType, 0, len(members))
	all := make([]*reflection.RunType, 0, len(members)+1)
	for _, member := range members {
		refs = append(refs, makeRef(member.ID))
		all = append(all, member)
	}
	union := &reflection.RunType{
		ID: "uni", Kind: reflection.KindUnion,
		Children:          refs,
		SafeUnionChildren: refs,
	}
	all = append(all, union)
	return protocol.Dump{RunTypes: all}
}

func mkDate() *reflection.RunType {
	return &reflection.RunType{ID: "dat", Kind: reflection.KindClass, SubKind: reflection.SubKindDate}
}
func mkSym() *reflection.RunType { return &reflection.RunType{ID: "sym", Kind: reflection.KindSymbol} }
func mkStr() *reflection.RunType { return &reflection.RunType{ID: "str", Kind: reflection.KindString} }
func mkFn() *reflection.RunType  { return &reflection.RunType{ID: "fn", Kind: reflection.KindFunction} }

// unionEntryWorks reports whether the rendered module contains a real union
// factory body (`<hash>_uni(v){…}`). An alwaysThrow union has no such body —
// it is a short tuple ending in a `[..] Cannot …` message instead.
func unionEntryWorks(rendered string) bool {
	return strings.Contains(rendered, "_uni(v){")
}

// jsonFamilies are the flat-union families that share buildFlatLayout.
var jsonFamilies = []string{"validate", "prepareForJsonMutate", "prepareForJsonClone", "restoreFromJsonMutate"}

func TestDataOnlyUnion_DropsStrippedMember(t *testing.T) {
	dump := unionDump(mkDate(), mkSym())
	for _, fam := range jsonFamilies {
		out := renderModule(t, dump, fam)
		if !unionEntryWorks(out) {
			t.Errorf("[%s] Date|symbol union should drop symbol and render a working factory; got:\n%s", fam, out)
		}
	}
	// The surviving member is Date — validate must check it.
	if out := renderModule(t, dump, "validate"); !strings.Contains(out, "instanceof Date") {
		t.Errorf("expected the union to validate Date; got:\n%s", out)
	}
}

func TestDataOnlyUnion_AllStrippedStillThrows(t *testing.T) {
	dump := unionDump(mkSym(), mkFn())
	for _, fam := range jsonFamilies {
		out := renderModule(t, dump, fam)
		if unionEntryWorks(out) {
			t.Errorf("[%s] all-stripped union (symbol|fn) should alwaysThrow, not render a body; got:\n%s", fam, out)
		}
	}
}

// Date | string | symbol must keep two members and reindex them gap-free
// (Date=0, string=1); the dropped symbol must NOT leave a [2,…] arm.
func TestDataOnlyUnion_ReindexesGapFree(t *testing.T) {
	out := renderModule(t, unionDump(mkDate(), mkStr(), mkSym()), "prepareForJsonMutate")
	for _, want := range []string{"[0, v]", "[1, v]"} {
		if !strings.Contains(out, want) {
			t.Errorf("expected wire index fragment %s in reindexed union; got:\n%s", want, out)
		}
	}
	if strings.Contains(out, "[2, v]") {
		t.Errorf("dropped symbol (original index 2) must not leave a [2,…] arm; got:\n%s", out)
	}
}

// renderWithDiag collects one family over `dump`, wiring a DiagSink and a
// provenance site for `rootID` so EmitDiagnostic actually fans out (it skips
// when no call site is known). Returns the rendered module + the captured
// diagnostics.
func renderWithDiag(t *testing.T, dump protocol.Dump, familyKey, rootID string) (string, []diagnostics.Diagnostic) {
	t.Helper()
	var sink []diagnostics.Diagnostic
	family := FamilyByKey(familyKey)
	// Provenance is keyed per rendered entry (type id + family tag), and a root
	// code reads the rooted map while a child-position one reads the reaching
	// map — here one call site named rootID and demanded this family, so both
	// hold it.
	site := map[string][]diagnostics.Site{
		ProvenanceKey(rootID, family.Settings.Tag): {{FilePath: "/x.ts", StartLine: 1, StartCol: 1}},
	}
	opts := RenderOpts{
		EmitMode:        "both",
		DiagSink:        &sink,
		ProvenanceSites: site,
		RootedSites:     site,
	}
	return joinEntries(t, family.Collect(dump, opts, nil)), sink
}

// dropWarnFamilies maps each family that walks union members itself to its
// DataOnly union-member-drop code. validationErrors is absent: its union arm
// delegates to validate, so the user sees validate-union-member-dropped from the validate render.
var dropWarnFamilies = map[string]string{
	"validate":              diagnostics.CodeVLUnionMemberDropped,
	"prepareForJsonMutate":  diagnostics.CodePJUnionMemberDropped,
	"prepareForJsonClone":   diagnostics.CodePJSUnionMemberDropped,
	"restoreFromJsonMutate": diagnostics.CodeRJUnionMemberDropped,
}

func findCode(sink []diagnostics.Diagnostic, code string) (diagnostics.Diagnostic, bool) {
	for _, d := range sink {
		if d.Code == code {
			return d, true
		}
	}
	return diagnostics.Diagnostic{}, false
}

// A genuine drop (Date | symbol — one member survives) raises a per-family
// build-time Warning naming the dropped member, mirroring the property-drop
// warnings (validate-function-property-dropped etc.).
func TestDataOnlyUnion_DropEmitsInfo(t *testing.T) {
	dump := unionDump(mkDate(), mkSym())
	for fam, wantCode := range dropWarnFamilies {
		_, sink := renderWithDiag(t, dump, fam, "uni")
		got, ok := findCode(sink, wantCode)
		if !ok {
			t.Errorf("[%s] expected union-member-drop warning %s; sink=%+v", fam, wantCode, sink)
			continue
		}
		if got.Severity != diagnostics.SeverityInfo {
			t.Errorf("[%s] %s severity = %v, want Info", fam, wantCode, got.Severity)
		}
		if len(got.Args) == 0 || !strings.Contains(got.Args[0], "symbol") {
			t.Errorf("[%s] %s args = %v, want a label naming the dropped \"symbol\" member", fam, wantCode, got.Args)
		}
	}
}

// An all-stripped union (symbol | function) renders alwaysThrow, NOT a drop —
// so it must NOT emit a *014 union-member-drop warning (it surfaces a
// root-position error instead).
func TestDataOnlyUnion_AllStrippedNoDropWarning(t *testing.T) {
	dump := unionDump(mkSym(), mkFn())
	for fam, code := range dropWarnFamilies {
		_, sink := renderWithDiag(t, dump, fam, "uni")
		if _, ok := findCode(sink, code); ok {
			t.Errorf("[%s] all-stripped union must not emit drop warning %s; sink=%+v", fam, code, sink)
		}
	}
}

// A union with no stripped members (Date | string) drops nothing, so no
// union-member-drop warning fires.
func TestDataOnlyUnion_NoDropNoWarning(t *testing.T) {
	dump := unionDump(mkDate(), mkStr())
	for fam, code := range dropWarnFamilies {
		_, sink := renderWithDiag(t, dump, fam, "uni")
		if _, ok := findCode(sink, code); ok {
			t.Errorf("[%s] clean union must not emit drop warning %s; sink=%+v", fam, code, sink)
		}
	}
}

// Nested fix: (Date | symbol)[] — the element union drops symbol to Date, so
// the array encodes instead of alwaysThrowing.
func TestDataOnlyUnion_NestedInArray(t *testing.T) {
	date := mkDate()
	sym := mkSym()
	union := &reflection.RunType{
		ID: "uni", Kind: reflection.KindUnion,
		Children:          []*reflection.RunType{makeRef("dat"), makeRef("sym")},
		SafeUnionChildren: []*reflection.RunType{makeRef("dat"), makeRef("sym")},
	}
	arr := &reflection.RunType{ID: "arr", Kind: reflection.KindArray, Child: makeRef("uni")}
	dump := protocol.Dump{RunTypes: []*reflection.RunType{date, sym, union, arr}}

	out := renderModule(t, dump, "prepareForJsonMutate")
	// The array entry must be a real factory (arr inner fn), not alwaysThrow.
	if !strings.Contains(out, "_arr(v){") {
		t.Errorf("(Date|symbol)[] should encode (element union drops symbol); got:\n%s", out)
	}
}

// K2: `Date | {b: symbol}` drops the prop instead of alwaysThrowing, at the root and one object deeper.
// Only the value kind's drop code is reported (`-function-property-dropped` or `-non-data-property-dropped`).
// removeUnknownKeys refuses the union itself but still reports the drop.
func TestDataOnlyUnion_ObjectMemberStrippedProp(t *testing.T) {
	type familyCodes struct{ want, notWant string }
	cases := []struct {
		name  string
		value *reflection.RunType
		codes map[string]familyCodes
	}{
		{"symbol", mkSym(), map[string]familyCodes{
			"validate":              {diagnostics.CodeVLNonSerializablePropDrop, diagnostics.CodeVLFunctionPropDropped},
			"prepareForJsonMutate":  {diagnostics.CodePJNonSerializablePropDrop, diagnostics.CodePJFunctionPropDropped},
			"prepareForJsonClone":   {diagnostics.CodePJSNonSerializablePropDrop, diagnostics.CodePJSFunctionPropDropped},
			"restoreFromJsonMutate": {diagnostics.CodeRJNonSerializablePropDrop, diagnostics.CodeRJFunctionPropDropped},
			"removeUnknownKeys":     {diagnostics.CodeRUKNonSerializablePropDrop, diagnostics.CodeRUKFunctionPropDropped},
		}},
		{"function", mkFn(), map[string]familyCodes{
			"validate":              {diagnostics.CodeVLFunctionPropDropped, diagnostics.CodeVLNonSerializablePropDrop},
			"prepareForJsonMutate":  {diagnostics.CodePJFunctionPropDropped, diagnostics.CodePJNonSerializablePropDrop},
			"prepareForJsonClone":   {diagnostics.CodePJSFunctionPropDropped, diagnostics.CodePJSNonSerializablePropDrop},
			"restoreFromJsonMutate": {diagnostics.CodeRJFunctionPropDropped, diagnostics.CodeRJNonSerializablePropDrop},
			"removeUnknownKeys":     {diagnostics.CodeRUKFunctionPropDropped, diagnostics.CodeRUKNonSerializablePropDrop},
		}},
	}
	for _, testCase := range cases {
		propB := &reflection.RunType{ID: "pb", Kind: reflection.KindPropertySignature, Name: "b", Child: makeRef(testCase.value.ID)}
		obj := &reflection.RunType{ID: "obj", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("pb")}}
		union := &reflection.RunType{
			ID: "uni", Kind: reflection.KindUnion,
			Children:          []*reflection.RunType{makeRef("dat"), makeRef("obj")},
			SafeUnionChildren: []*reflection.RunType{makeRef("dat"), makeRef("obj")},
		}
		propU := &reflection.RunType{ID: "pu", Kind: reflection.KindPropertySignature, Name: "u", Child: makeRef("uni")}
		outer := &reflection.RunType{ID: "outer", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("pu")}}
		dump := protocol.Dump{RunTypes: []*reflection.RunType{mkDate(), testCase.value, propB, obj, union, propU, outer}}
		for _, rootID := range []string{"uni", "outer"} {
			for familyKey, codes := range testCase.codes {
				out, sink := renderWithDiag(t, dump, familyKey, rootID)
				label := fmt.Sprintf("[%s %s root=%s]", familyKey, testCase.name, rootID)
				if familyKey != "removeUnknownKeys" && !strings.Contains(out, "_uni(") {
					t.Errorf("%s the union should drop the property and serialize, not alwaysThrow; got:\n%s", label, out)
				}
				if _, ok := findCode(sink, codes.want); !ok {
					t.Errorf("%s want %s; sink=%+v", label, codes.want, sink)
				}
				if _, ok := findCode(sink, codes.notWant); ok {
					t.Errorf("%s must not report %s; sink=%+v", label, codes.notWant, sink)
				}
			}
		}
	}
}

func TestDataOnlyUnion_ObjectMemberUnsafeNameDropped(t *testing.T) {
	protoProp := &reflection.RunType{ID: "pp", Kind: reflection.KindPropertySignature, Name: "__proto__", Child: makeRef("str")}
	obj := &reflection.RunType{ID: "obj", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("pp")}}
	union := &reflection.RunType{
		ID: "uni", Kind: reflection.KindUnion,
		Children:          []*reflection.RunType{makeRef("dat"), makeRef("obj")},
		SafeUnionChildren: []*reflection.RunType{makeRef("dat"), makeRef("obj")},
	}
	dump := protocol.Dump{RunTypes: []*reflection.RunType{mkDate(), mkStr(), protoProp, obj, union}}
	for _, familyKey := range []string{"validate", "prepareForJsonMutate", "prepareForJsonClone", "restoreFromJsonMutate", "removeUnknownKeys"} {
		out, sink := renderWithDiag(t, dump, familyKey, "uni")
		if _, ok := findCode(sink, diagnostics.CodeUnsafePropertyName); !ok {
			t.Errorf("[%s] want %s for `__proto__` in a union member; sink=%+v", familyKey, diagnostics.CodeUnsafePropertyName, sink)
		}
		if strings.Contains(out, "__proto__") {
			t.Errorf("[%s] generated code still reads `__proto__`:\n%s", familyKey, out)
		}
	}
}
