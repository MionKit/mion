package typefunctions

import (
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

// jsonFamilies are the flat-union families that share buildFlatLayout; binary
// (toBinary/fromBinary) shares it too and is covered by the same change.
var jsonFamilies = []string{"validate", "prepareForJson", "prepareForJsonSafe", "stringifyJson", "restoreFromJson"}

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
	out := renderModule(t, unionDump(mkDate(), mkStr(), mkSym()), "stringifyJson")
	for _, want := range []string{"'[0,'", "'[1,'"} {
		if !strings.Contains(out, want) {
			t.Errorf("expected wire index fragment %s in reindexed union; got:\n%s", want, out)
		}
	}
	if strings.Contains(out, "'[2,'") {
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
	opts := RenderOpts{
		EmitMode:        "both",
		DiagSink:        &sink,
		ProvenanceSites: map[string][]diagnostics.Site{rootID: {{FilePath: "/x.ts", StartLine: 1, StartCol: 1}}},
	}
	return joinEntries(t, FamilyByKey(familyKey).Collect(dump, opts, nil)), sink
}

// dropWarnFamilies maps each family that walks union members itself to its
// DataOnly union-member-drop code. validationErrors is absent: its union arm
// delegates to validate, so the user sees VL014 from the validate render.
var dropWarnFamilies = map[string]string{
	"validate":           diagnostics.CodeVLUnionMemberDropped,
	"prepareForJson":     diagnostics.CodePJUnionMemberDropped,
	"prepareForJsonSafe": diagnostics.CodePJSUnionMemberDropped,
	"stringifyJson":      diagnostics.CodeSJUnionMemberDropped,
	"restoreFromJson":    diagnostics.CodeRJUnionMemberDropped,
	"toBinary":           diagnostics.CodeTBUnionMemberDropped,
	"fromBinary":         diagnostics.CodeFBUnionMemberDropped,
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
// warnings (VL010 etc.).
func TestDataOnlyUnion_DropEmitsWarning(t *testing.T) {
	dump := unionDump(mkDate(), mkSym())
	for fam, wantCode := range dropWarnFamilies {
		_, sink := renderWithDiag(t, dump, fam, "uni")
		got, ok := findCode(sink, wantCode)
		if !ok {
			t.Errorf("[%s] expected union-member-drop warning %s; sink=%+v", fam, wantCode, sink)
			continue
		}
		if got.Severity != diagnostics.SeverityWarning {
			t.Errorf("[%s] %s severity = %v, want Warning", fam, wantCode, got.Severity)
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

	out := renderModule(t, dump, "stringifyJson")
	// The array entry must be a real factory (arr inner fn), not alwaysThrow.
	if !strings.Contains(out, "_arr(v){") {
		t.Errorf("(Date|symbol)[] should encode (element union drops symbol); got:\n%s", out)
	}
}

// K2 regression: a union whose object member carries a DataOnly-stripped
// property (`Date | {b: symbol}`) must DROP that property and serialize the
// member as `{}`, NOT alwaysThrow the whole union. A standalone `{b: symbol}`
// already drops to `{}`; the union merged-prop builder used to filter only
// function-like props, so the symbol survived, emitted CodeNS, and failed the
// union. Covers every flat-union family (the merged-prop list is shared).
func TestDataOnlyUnion_ObjectMemberStrippedProp(t *testing.T) {
	date := mkDate()
	sym := mkSym()
	propB := &reflection.RunType{ID: "pb", Kind: reflection.KindPropertySignature, Name: "b", Child: makeRef("sym")}
	obj := &reflection.RunType{ID: "obj", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("pb")}}
	union := &reflection.RunType{
		ID: "uni", Kind: reflection.KindUnion,
		Children:          []*reflection.RunType{makeRef("dat"), makeRef("obj")},
		SafeUnionChildren: []*reflection.RunType{makeRef("dat"), makeRef("obj")},
	}
	dump := protocol.Dump{RunTypes: []*reflection.RunType{date, sym, propB, obj, union}}

	for _, fam := range []string{"validate", "prepareForJson", "prepareForJsonSafe", "stringifyJson", "restoreFromJson", "toBinary", "fromBinary"} {
		out := renderModule(t, dump, fam)
		// A real union factory (`<hash>_uni(…){`) — family-agnostic, since binary
		// encode/decode bodies take `(v,Ser)` / `(ret,Des)` not just `(v)`. An
		// alwaysThrow union has no `_uni(` function definition at all.
		if !strings.Contains(out, "_uni(") {
			t.Errorf("[%s] `Date | {b: symbol}` should drop the symbol prop and serialize, not alwaysThrow; got:\n%s", fam, out)
		}
	}
}
