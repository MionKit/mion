package typefunctions

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

var symbolKeyedDropCodes = map[string]string{
	"validate":              diagnostics.CodeVLSymbolKeyedDropped,
	"validationErrors":      diagnostics.CodeVESymbolKeyedDropped,
	"prepareForJsonMutate":  diagnostics.CodePJSymbolKeyedDropped,
	"prepareForJsonClone":   diagnostics.CodePJSSymbolKeyedDropped,
	"restoreFromJsonMutate": diagnostics.CodeRJSymbolKeyedDropped,
	"restoreFromJsonClone":  diagnostics.CodeRJSymbolKeyedDropped,
	"removeUnknownKeys":     diagnostics.CodeRUKSymbolKeyedDropped,
}

// Every family drops a symbol-keyed property with its …013 Info, and nothing reads tsgo's `\xFE@tag` as a string key.
func TestSymbolKeyedProperty_DropsInEveryFamily(t *testing.T) {
	for _, fam := range append(append([]string{}, allSerdeFamilies...), "removeUnknownKeys") {
		value := &reflection.RunType{ID: "s", Kind: reflection.KindString}
		name := &reflection.RunType{ID: "pn", Kind: reflection.KindPropertySignature, Name: "name", Child: makeRef("s")}
		tag := &reflection.RunType{ID: "pt", Kind: reflection.KindPropertySignature, Name: "\xFE@tag", Child: makeRef("s")}
		obj := &reflection.RunType{ID: "obj", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("pn"), makeRef("pt")}}
		dump := protocol.Dump{RunTypes: []*reflection.RunType{value, name, tag, obj}}
		out, sink := renderWithDiag(t, dump, fam, "obj")
		if strings.Contains(out, "\xFE") || strings.Contains(out, "@tag") {
			t.Errorf("[%s] the symbol key must not reach the generated code; got:\n%s", fam, out)
		}
		got, ok := findCode(sink, symbolKeyedDropCodes[fam])
		if !ok {
			t.Errorf("[%s] expected %s; sink=%+v", fam, symbolKeyedDropCodes[fam], sink)
			continue
		}
		if got.Severity != diagnostics.SeverityInfo {
			t.Errorf("[%s] %s severity = %v, want Info", fam, got.Code, got.Severity)
		}
		if len(got.Args) == 0 || got.Args[0] != "[tag]" {
			t.Errorf("[%s] %s must name the key as written, got %v", fam, got.Code, got.Args)
		}
	}
}

// A strict check never counts the symbol key: `{name, [tag]}` has one string key.
func TestSymbolKeyedProperty_StrictCountsStringKeysOnly(t *testing.T) {
	value := &reflection.RunType{ID: "s", Kind: reflection.KindString}
	name := &reflection.RunType{ID: "pn", Kind: reflection.KindPropertySignature, Name: "name", Child: makeRef("s")}
	tag := &reflection.RunType{ID: "pt", Kind: reflection.KindPropertySignature, Name: "\xFE@tag", Child: makeRef("s")}
	obj := &reflection.RunType{ID: "obj", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("pn"), makeRef("pt")}}
	out := renderModule(t, protocol.Dump{RunTypes: []*reflection.RunType{value, name, tag, obj}}, "validateStrict")
	if strings.Contains(out, "\xFE") || strings.Contains(out, "@tag") || !strings.Contains(out, "cntEK(v) === 1") {
		t.Errorf("the strict check must count one key and never name the symbol key; got:\n%s", out)
	}
}

// A union arm's symbol key is dropped with the …013 Info, never merged in as the string key `\xFE@tag`.
func TestSymbolKeyedProperty_UnionArmDropped(t *testing.T) {
	for _, fam := range []string{"validate", "prepareForJsonMutate", "prepareForJsonClone", "restoreFromJsonMutate", "restoreFromJsonClone"} {
		date := mkDate()
		value := &reflection.RunType{ID: "s", Kind: reflection.KindString}
		name := &reflection.RunType{ID: "pn", Kind: reflection.KindPropertySignature, Name: "name", Child: makeRef("s")}
		tag := &reflection.RunType{ID: "pt", Kind: reflection.KindPropertySignature, Name: "\xFE@tag", Child: makeRef("s")}
		obj := &reflection.RunType{ID: "obj", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("pn"), makeRef("pt")}}
		union := &reflection.RunType{
			ID: "uni", Kind: reflection.KindUnion,
			Children:          []*reflection.RunType{makeRef("dat"), makeRef("obj")},
			SafeUnionChildren: []*reflection.RunType{makeRef("dat"), makeRef("obj")},
		}
		dump := protocol.Dump{RunTypes: []*reflection.RunType{date, value, name, tag, obj, union}}
		out, sink := renderWithDiag(t, dump, fam, "uni")
		if strings.Contains(out, "\xFE") || strings.Contains(out, "@tag") {
			t.Errorf("[%s] the symbol key must not reach the union code; got:\n%s", fam, out)
		}
		if _, ok := findCode(sink, symbolKeyedDropCodes[fam]); !ok {
			t.Errorf("[%s] expected %s; sink=%+v", fam, symbolKeyedDropCodes[fam], sink)
		}
	}
}
