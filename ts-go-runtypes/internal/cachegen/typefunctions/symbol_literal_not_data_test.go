package typefunctions

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// A symbol literal is no more data than the bare kind: the value a decoder
// could build is a fresh Symbol(), never the symbol the literal type names, so
// the round trip returns something else while the description check still
// passes it. Every serialization family refuses it exactly as it refuses
// `symbol` — dropped at a property with the …015 Warning, alwaysThrow at a
// root — while validate keeps the description check it had.

// mkSymLit is the shape the resolver emits for `typeof sym` where
// `const sym = Symbol('hello')` (serialize.go's UniqueESSymbol arm).
func mkSymLit() *reflection.RunType {
	return &reflection.RunType{
		ID:      "lsym",
		Kind:    reflection.KindLiteral,
		Literal: map[string]any{"symbol": "hello"},
		Flags:   []string{"symbol"},
	}
}

var symLitSerdeFamilies = []string{
	"prepareForJsonMutate", "prepareForJsonClone", "stringifyJson",
	"restoreFromJsonMutate", "restoreFromJsonClone", "toBinary", "fromBinary",
}

func TestSymbolLiteral_RootFailsEverySerializationFamily(t *testing.T) {
	for _, fam := range symLitSerdeFamilies {
		dump := protocol.Dump{RunTypes: []*reflection.RunType{mkSymLit()}}
		out, sink := renderWithDiag(t, dump, fam, "lsym")
		if !strings.Contains(out, "_lsym','literal',,,,,,'") {
			t.Errorf("[%s] a root symbol literal must render an alwaysThrow factory; got:\n%s", fam, out)
		}
		got, ok := findCode(sink, symbolRootCodes[fam])
		if !ok {
			t.Errorf("[%s] expected root error %s; sink=%+v", fam, symbolRootCodes[fam], sink)
			continue
		}
		if got.Severity != diagnostics.SeverityError {
			t.Errorf("[%s] %s severity = %v, want Error", fam, symbolRootCodes[fam], got.Severity)
		}
		// leafKindLabel must name Symbol, not the generic Unsupported.
		if len(got.Args) == 0 || got.Args[0] != "Symbol" {
			t.Errorf("[%s] the diagnostic must name the kind `Symbol`; args=%v", fam, got.Args)
		}
	}
}

// Nothing is written and nothing is parsed: the old `'Symbol:' + description`
// encoding and its `Symbol(v.substring(7))` rebuild are both gone.
func TestSymbolLiteral_NoWireFormIsEmitted(t *testing.T) {
	for _, fam := range symLitSerdeFamilies {
		dump := objWithProp(mkSymLit(), false)
		out, _ := renderWithDiag(t, dump, fam, "obj")
		for _, banned := range []string{"Symbol:", "Symbol(", ".description"} {
			if strings.Contains(out, banned) {
				t.Errorf("[%s] %q must not appear in a factory that carries a symbol literal; got:\n%s", fam, banned, out)
			}
		}
	}
}

func TestSymbolLiteral_PropertyDropsWithTheWarning(t *testing.T) {
	for _, fam := range allSerdeFamilies {
		dump := objWithProp(mkSymLit(), false)
		out, sink := renderWithDiag(t, dump, fam, "obj")
		if objFactoryIsAlwaysThrow(out) {
			t.Errorf("[%s] a symbol-literal property must drop (object serializes), not alwaysThrow; got:\n%s", fam, out)
		}
		got, ok := findCode(sink, nonSerPropDropCodes[fam])
		if !ok {
			t.Errorf("[%s] expected drop warning %s; sink=%+v", fam, nonSerPropDropCodes[fam], sink)
			continue
		}
		if got.Severity != diagnostics.SeverityWarning {
			t.Errorf("[%s] %s severity = %v, want Warning", fam, nonSerPropDropCodes[fam], got.Severity)
		}
	}
}

// `Date | typeof sym` projects to `Date`, the same as `Date | symbol`.
func TestSymbolLiteral_UnionMemberDrops(t *testing.T) {
	union := &reflection.RunType{ID: "uni", Kind: reflection.KindUnion, Children: []*reflection.RunType{makeRef("dat"), makeRef("lsym")}}
	dump := protocol.Dump{RunTypes: []*reflection.RunType{mkDate(), mkSymLit(), union}}
	for fam, code := range map[string]string{
		"prepareForJsonMutate": diagnostics.CodePJUnionMemberDropped,
		"toBinary":             diagnostics.CodeTBUnionMemberDropped,
	} {
		out, sink := renderWithDiag(t, dump, fam, "uni")
		if strings.Contains(out, "_uni','union',,,,,,'") {
			t.Errorf("[%s] `Date | typeof sym` must serialize as Date, not alwaysThrow; got:\n%s", fam, out)
		}
		if _, ok := findCode(sink, code); !ok {
			t.Errorf("[%s] expected union-member drop warning %s; sink=%+v", fam, code, sink)
		}
	}
}

// The wire refusal does not reach the validators: an in-memory value is still
// checkable by description, and the build stays clean for them.
func TestSymbolLiteral_ValidateKeepsTheDescriptionCheck(t *testing.T) {
	for _, fam := range []string{"validate", "validationErrors"} {
		dump := protocol.Dump{RunTypes: []*reflection.RunType{mkSymLit()}}
		out, sink := renderWithDiag(t, dump, fam, "lsym")
		if !strings.Contains(out, "typeof v === 'symbol' && v.description === 'hello'") {
			t.Errorf("[%s] a root symbol literal must still validate by description; got:\n%s", fam, out)
		}
		for _, d := range sink {
			if d.Severity == diagnostics.SeverityError {
				t.Errorf("[%s] a root symbol literal must not fail the build for the validators, got %s", fam, d.Code)
			}
		}
	}
}
