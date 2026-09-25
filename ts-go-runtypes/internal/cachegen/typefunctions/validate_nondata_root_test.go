package typefunctions

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// validate checks DataOnly<T>, and DataOnly turns every non-data kind into `never`, so each one at a root (or a propagating
// slot under it) renders an alwaysThrow factory with a RuntimeError, like the bare symbol kind.

type nonDataRoot struct {
	name      string
	rootID    string
	typeName  string
	label     string
	vlCode    string
	veCode    string
	runTypes  []*reflection.RunType
	forbidden string
}

func nonDataRoots() []nonDataRoot {
	return []nonDataRoot{
		{"symbol literal", "lsym", "literal", "Symbol", diagnostics.CodeVLSymbolRoot, diagnostics.CodeVESymbolRoot, []*reflection.RunType{mkSymLit()}, ".description"},
		{"function", "fn", "function", "Function", diagnostics.CodeVLFunctionRoot, diagnostics.CodeVEFunctionRoot, []*reflection.RunType{mkFn()}, "=== 'function'"},
		{"callable interface", "cal", "objectLiteral", "Function", diagnostics.CodeVLFunctionRoot, diagnostics.CodeVEFunctionRoot, append([]*reflection.RunType{mkStr()}, callableInterface("cal", true)...), "=== 'function'"},
		{"promise", "prm", "promise", "Promise", diagnostics.CodeVLNonSerializableRoot, diagnostics.CodeVENonSerializableRoot, []*reflection.RunType{mkPromise()}, ".then"},
		{"regexp", "re", "regexp", "RegExp", diagnostics.CodeVLNonSerializableRoot, diagnostics.CodeVENonSerializableRoot, []*reflection.RunType{mkRegexp()}, "instanceof RegExp"},
	}
}

func assertRootRefused(t *testing.T, fam, rootID, typeName, code, label, forbidden string, out string, sink []diagnostics.Diagnostic) {
	t.Helper()
	if !strings.Contains(out, "_"+rootID+"','"+typeName+"',,,,,,'") {
		t.Errorf("[%s] root must render an alwaysThrow factory; got:\n%s", fam, out)
	}
	if forbidden != "" && strings.Contains(out, forbidden) {
		t.Errorf("[%s] %q must not be emitted for a refused root; got:\n%s", fam, forbidden, out)
	}
	got, ok := findCode(sink, code)
	if !ok {
		t.Fatalf("[%s] expected %s; sink=%+v", fam, code, sink)
	}
	if got.Severity != diagnostics.SeverityError {
		t.Errorf("[%s] %s severity = %v, want Error", fam, code, got.Severity)
	}
	if label != "" && (len(got.Args) == 0 || got.Args[0] != label) {
		t.Errorf("[%s] %s must name %s; args=%v", fam, code, label, got.Args)
	}
}

func TestValidateNonDataRoot_Refused(t *testing.T) {
	for _, root := range nonDataRoots() {
		t.Run(root.name, func(t *testing.T) {
			for fam, code := range map[string]string{"validate": root.vlCode, "validationErrors": root.veCode} {
				out, sink := renderWithDiag(t, protocol.Dump{RunTypes: root.runTypes}, fam, root.rootID)
				assertRootRefused(t, fam, root.rootID, root.typeName, code, root.label, root.forbidden, out, sink)
			}
		})
	}
}

// DataOnly<F[]> is never[]: an array element propagates the refusal to the root, like symbol[].
func TestValidateNonDataRoot_ArrayElementRefused(t *testing.T) {
	for _, root := range nonDataRoots() {
		t.Run(root.name, func(t *testing.T) {
			arr := &reflection.RunType{ID: "arr", Kind: reflection.KindArray, Child: makeRef(root.rootID)}
			dump := protocol.Dump{RunTypes: append(append([]*reflection.RunType{}, root.runTypes...), arr)}
			for fam, code := range map[string]string{"validate": root.vlCode, "validationErrors": root.veCode} {
				out, sink := renderWithDiag(t, dump, fam, "arr")
				assertRootRefused(t, fam, "arr", "array", code, "", root.forbidden, out, sink)
			}
		})
	}
}

// A union made only of non-data members projects to never and throws; a mixed union keeps its data members.
func TestValidateNonDataRoot_AllNonDataUnionRefused(t *testing.T) {
	union := &reflection.RunType{ID: "uni", Kind: reflection.KindUnion, Children: []*reflection.RunType{makeRef("fn"), makeRef("re")}}
	dump := protocol.Dump{RunTypes: []*reflection.RunType{mkFn(), mkRegexp(), union}}
	for fam, code := range map[string]string{"validate": diagnostics.CodeVLFunctionRoot, "validationErrors": diagnostics.CodeVEFunctionRoot} {
		out, sink := renderWithDiag(t, dump, fam, "uni")
		assertRootRefused(t, fam, "uni", "union", code, "Function", "", out, sink)
	}
	mixed := &reflection.RunType{ID: "mix", Kind: reflection.KindUnion, Children: []*reflection.RunType{makeRef("str"), makeRef("fn")}}
	out, sink := renderWithDiag(t, protocol.Dump{RunTypes: []*reflection.RunType{mkStr(), mkFn(), mixed}}, "validate", "mix")
	if strings.Contains(out, "_mix','union',,,,,,'") || !strings.Contains(out, "typeof v === 'string'") {
		t.Errorf("`string | fn` must validate as string; got:\n%s", out)
	}
	if _, ok := findCode(sink, diagnostics.CodeVLUnionMemberDropped); !ok {
		t.Errorf("expected %s for the dropped function member; sink=%+v", diagnostics.CodeVLUnionMemberDropped, sink)
	}
}

// DataOnly<[string, F]> is never: a non-data tuple slot refuses the whole tuple instead of expecting `undefined` there.
func TestValidateNonDataRoot_TupleSlotRefused(t *testing.T) {
	for _, root := range nonDataRoots() {
		t.Run(root.name, func(t *testing.T) {
			pos0, pos1 := 0, 1
			first := &reflection.RunType{ID: "tm0", Kind: reflection.KindTupleMember, Position: &pos0, Child: makeRef("str")}
			slot := &reflection.RunType{ID: "tm1", Kind: reflection.KindTupleMember, Position: &pos1, Child: makeRef(root.rootID)}
			tuple := &reflection.RunType{ID: "tup", Kind: reflection.KindTuple, Children: []*reflection.RunType{makeRef("tm0"), makeRef("tm1")}}
			runTypes := append([]*reflection.RunType{mkStr(), first, slot, tuple}, root.runTypes...)
			if root.rootID == "cal" {
				runTypes = append([]*reflection.RunType{first, slot, tuple}, root.runTypes...)
			}
			for fam, code := range map[string]string{"validate": root.vlCode, "validationErrors": root.veCode} {
				out, sink := renderWithDiag(t, protocol.Dump{RunTypes: runTypes}, fam, "tup")
				assertRootRefused(t, fam, "tup", "tuple", code, "", root.forbidden, out, sink)
				if strings.Contains(out, "=== undefined") || strings.Contains(out, "!== undefined") {
					t.Errorf("[%s] the slot must not fall back to an undefined check; got:\n%s", fam, out)
				}
			}
		})
	}
}
