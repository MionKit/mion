package typefunctions

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// F3: align property-position DataOnly handling to the oracle (and DataOnly<T>),
// uniformly across validate, validationErrors, and the six serialization families.
//
//   - A property whose VALUE is DIRECTLY DataOnly-stripped (symbol / function /
//     Promise / never / non-serializable native) is DROPPED so the surrounding
//     object still serializes — `DataOnly<{a: symbol}>` = `{}`. The drop is a
//     child-position WARNING (…015, or …010 for function-valued props), never an
//     Error: "Error" means "throws at runtime", and the object serializes fine.
//   - A property whose value is only STRUCTURALLY unserializable (symbol[],
//     Map<string,symbol>, a tuple with a stripped slot) is KEPT by DataOnly
//     (`{a: never[]}`), so it can't be represented: the family alwaysThrows with a
//     root-position ERROR. It is NOT silently dropped.
//
// Before the fix the absorb path emitted the ROOT error code (via DiagCodeForLeaf)
// for a dropped property — severity wrong — AND absorbed the structural case —
// behavior wrong — while prepareForJsonSafe instead FAILED the directly-stripped
// case. Three disagreements the non-data fuzz lane surfaced.

func mkPromise() *reflection.RunType {
	return &reflection.RunType{ID: "prm", Kind: reflection.KindPromise}
}
func mkNonSerNative() *reflection.RunType {
	return &reflection.RunType{ID: "nsv", Kind: reflection.KindClass, SubKind: reflection.SubKindNonSerializable}
}

// objWithProp builds `{a: <value>}` (id "obj") plus any extra decls the value
// references. `optional` toggles the property's `?`.
func objWithProp(value *reflection.RunType, optional bool, extra ...*reflection.RunType) protocol.Dump {
	propA := &reflection.RunType{ID: "pa", Kind: reflection.KindPropertySignature, Name: "a", Optional: optional, Child: makeRef(value.ID)}
	obj := &reflection.RunType{ID: "obj", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("pa")}}
	return protocol.Dump{RunTypes: append([]*reflection.RunType{value, propA, obj}, extra...)}
}

// objFactoryIsAlwaysThrow reports whether the object entry rendered as an
// alwaysThrow tuple (`_obj','objectLiteral',,,,,,'<message>'` — typeName then
// five holes for code/isNoop/rtDeps/pureFnDeps/createRTFn, then the quoted
// message) rather than a real factory body (whose code slot holds a body
// string) or a noop (`,,true`). Mirrors the detector in
// callable_interface_dataonly_test.go.
func objFactoryIsAlwaysThrow(rendered string) bool {
	return strings.Contains(rendered, "_obj','objectLiteral',,,,,,'")
}

// allSerdeFamilies — validate + validationErrors + the six serialization families.
var allSerdeFamilies = []string{
	"validate", "validationErrors", "prepareForJson", "prepareForJsonSafe",
	"stringifyJson", "restoreFromJson", "toBinary", "fromBinary",
}

// nonSerPropDropCodes maps each family to its …015 directly-stripped-property
// drop Warning (function-valued props use …010 instead — see the function test).
var nonSerPropDropCodes = map[string]string{
	"validate":           diagnostics.CodeVLNonSerializablePropDrop,
	"validationErrors":   diagnostics.CodeVENonSerializablePropDrop,
	"prepareForJson":     diagnostics.CodePJNonSerializablePropDrop,
	"prepareForJsonSafe": diagnostics.CodePJSNonSerializablePropDrop,
	"stringifyJson":      diagnostics.CodeSJNonSerializablePropDrop,
	"restoreFromJson":    diagnostics.CodeRJNonSerializablePropDrop,
	"toBinary":           diagnostics.CodeTBNonSerializablePropDrop,
	"fromBinary":         diagnostics.CodeFBNonSerializablePropDrop,
}

// symbolRootCodes maps each family to the symbol root-position Error its
// alwaysThrow factory carries (symbol[] reaches a symbol leaf in a propagating
// array-element slot).
var symbolRootCodes = map[string]string{
	"validate":           diagnostics.CodeVLSymbolRoot,
	"validationErrors":   diagnostics.CodeVESymbolRoot,
	"prepareForJson":     diagnostics.CodePJSymbolRoot,
	"prepareForJsonSafe": diagnostics.CodePJSSymbolRoot,
	"stringifyJson":      diagnostics.CodeSJSymbolRoot,
	"restoreFromJson":    diagnostics.CodeRJSymbolRoot,
	"toBinary":           diagnostics.CodeTBSymbolRoot,
	"fromBinary":         diagnostics.CodeFBSymbolRoot,
}

// functionPropDropCodes maps each family to its …010 function-valued-property
// drop Warning — the code a function-valued property keeps (NOT …015).
var functionPropDropCodes = map[string]string{
	"validate":           diagnostics.CodeVLFunctionPropDropped,
	"validationErrors":   diagnostics.CodeVEFunctionPropDropped,
	"prepareForJson":     diagnostics.CodePJFunctionPropDropped,
	"prepareForJsonSafe": diagnostics.CodePJSFunctionPropDropped,
	"stringifyJson":      diagnostics.CodeSJFunctionPropDropped,
	"restoreFromJson":    diagnostics.CodeRJFunctionPropDropped,
	"toBinary":           diagnostics.CodeTBFunctionPropDropped,
	"fromBinary":         diagnostics.CodeFBFunctionPropDropped,
}

// A directly-stripped property value (symbol / Promise / non-serializable native)
// is DROPPED across every family: the object renders a real factory (never
// alwaysThrow), the drop is a child-position Warning (…015), and NO Error fires.
func TestF3_DirectlyStrippedPropertyDrops(t *testing.T) {
	cases := map[string]func() *reflection.RunType{
		"symbol":           mkSym,
		"Promise":          mkPromise,
		"non-serializable": mkNonSerNative,
	}
	for _, optional := range []bool{false, true} {
		for name, mk := range cases {
			for _, fam := range allSerdeFamilies {
				dump := objWithProp(mk(), optional)
				out, sink := renderWithDiag(t, dump, fam, "obj")
				if objFactoryIsAlwaysThrow(out) {
					t.Errorf("[%s/%s optional=%v] a %s-valued property must drop (object serializes), not alwaysThrow; got:\n%s", fam, name, optional, name, out)
				}
				got, ok := findCode(sink, nonSerPropDropCodes[fam])
				if !ok {
					t.Errorf("[%s/%s optional=%v] expected drop warning %s; sink=%+v", fam, name, optional, nonSerPropDropCodes[fam], sink)
					continue
				}
				if got.Severity != diagnostics.SeverityWarning {
					t.Errorf("[%s/%s optional=%v] %s severity = %v, want Warning", fam, name, optional, nonSerPropDropCodes[fam], got.Severity)
				}
				// A clean drop never carries an Error-severity diagnostic.
				for _, d := range sink {
					if d.Severity == diagnostics.SeverityError {
						t.Errorf("[%s/%s optional=%v] a dropped property must not emit an Error diagnostic, got %s", fam, name, optional, d.Code)
					}
				}
			}
		}
	}
}

// The surrounding object still serializes its data props: `{good: bigint; bad:
// symbol}` drops `bad` and keeps `good`. The rendered factory must reference
// `good` and must not alwaysThrow. `good` is a bigint (not a string) so every
// family — including prepareForJson / restoreFromJson, which no-op a string —
// emits a real `good` transform.
func TestF3_DroppedPropertyKeepsSiblings(t *testing.T) {
	bigint := &reflection.RunType{ID: "big", Kind: reflection.KindBigInt}
	sym := mkSym()
	good := &reflection.RunType{ID: "pg", Kind: reflection.KindPropertySignature, Name: "good", Child: makeRef("big")}
	bad := &reflection.RunType{ID: "pb", Kind: reflection.KindPropertySignature, Name: "bad", Child: makeRef("sym")}
	obj := &reflection.RunType{ID: "obj", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("pg"), makeRef("pb")}}
	dump := protocol.Dump{RunTypes: []*reflection.RunType{bigint, sym, good, bad, obj}}

	for _, fam := range allSerdeFamilies {
		out := renderModule(t, dump, fam)
		if objFactoryIsAlwaysThrow(out) {
			t.Errorf("[%s] `{good: string; bad: symbol}` must drop bad and serialize good, not alwaysThrow; got:\n%s", fam, out)
		}
		if !strings.Contains(out, "good") {
			t.Errorf("[%s] the surviving `good` property must be referenced in the factory; got:\n%s", fam, out)
		}
	}
}

// A STRUCTURALLY-unserializable property value (symbol[] — a symbol in a
// propagating array-element slot) is NOT dropped: DataOnly keeps `{a: never[]}`,
// so every family alwaysThrows with a root-position Error, and the …015 drop
// warning must NOT fire. (Map<string,symbol> / Set<symbol> / `[number, symbol]`
// behave identically — every propagating slot collapses the same way.)
func TestF3_StructurallyUnserializablePropertyFails(t *testing.T) {
	for _, fam := range allSerdeFamilies {
		symArr := &reflection.RunType{ID: "sarr", Kind: reflection.KindArray, Child: makeRef("sym")}
		dump := objWithProp(symArr, false, mkSym())
		out, sink := renderWithDiag(t, dump, fam, "obj")
		if !objFactoryIsAlwaysThrow(out) {
			t.Errorf("[%s] `{a: symbol[]}` must alwaysThrow (symbol[] can't be safely dropped), not serialize; got:\n%s", fam, out)
		}
		if _, ok := findCode(sink, nonSerPropDropCodes[fam]); ok {
			t.Errorf("[%s] a structurally-unserializable property must NOT emit the …015 drop warning; sink=%+v", fam, sink)
		}
		got, ok := findCode(sink, symbolRootCodes[fam])
		if !ok {
			t.Errorf("[%s] expected root symbol error %s; sink=%+v", fam, symbolRootCodes[fam], sink)
			continue
		}
		if got.Severity != diagnostics.SeverityError {
			t.Errorf("[%s] %s severity = %v, want Error", fam, symbolRootCodes[fam], got.Severity)
		}
	}
}

// A function-VALUED property keeps the existing …010 FunctionPropDropped code,
// NOT the new …015 — the fix must not reclassify function-typed properties (the
// VL010/PJ010/… contract pinned by diagnostics_test.go + runtype-diagnostics).
func TestF3_FunctionValuedPropertyUsesFunctionCode(t *testing.T) {
	for _, fam := range allSerdeFamilies {
		dump := objWithProp(mkFn(), false)
		_, sink := renderWithDiag(t, dump, fam, "obj")
		if _, ok := findCode(sink, functionPropDropCodes[fam]); !ok {
			t.Errorf("[%s] function-valued property must emit %s (function-drop), got sink=%+v", fam, functionPropDropCodes[fam], sink)
		}
		if _, ok := findCode(sink, nonSerPropDropCodes[fam]); ok {
			t.Errorf("[%s] function-valued property must NOT emit the …015 code (it uses …010)", fam)
		}
	}
}
