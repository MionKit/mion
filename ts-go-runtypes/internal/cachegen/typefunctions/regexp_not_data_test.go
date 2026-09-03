package typefunctions

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// A RegExp value is not data: a pattern is code the receiver would run, so it
// never rides the wire. Every serialization family treats it exactly like a
// function-valued position — dropped at a property with the …015 Warning, an
// alwaysThrow factory at a root — while validate / validationErrors keep the
// `instanceof RegExp` check (a root `createValidateFn<RegExp>()` still works).

func mkRegexp() *reflection.RunType {
	return &reflection.RunType{ID: "re", Kind: reflection.KindRegexp}
}

var serdeFamilies = []string{"prepareForJson", "prepareForJsonSafe", "stringifyJson", "restoreFromJson", "toBinary", "fromBinary"}

var regexpRootCodes = map[string]string{
	"prepareForJson":     diagnostics.CodePJNonSerializableRoot,
	"prepareForJsonSafe": diagnostics.CodePJSNonSerializableRoot,
	"stringifyJson":      diagnostics.CodeSJNonSerializableRoot,
	"restoreFromJson":    diagnostics.CodeRJNonSerializableRoot,
	"toBinary":           diagnostics.CodeTBNonSerializableRoot,
	"fromBinary":         diagnostics.CodeFBNonSerializableRoot,
}

func TestRegexp_PropertyDropsLikeAFunction(t *testing.T) {
	for _, fam := range allSerdeFamilies {
		dump := objWithProp(mkRegexp(), false)
		out, sink := renderWithDiag(t, dump, fam, "obj")
		if objFactoryIsAlwaysThrow(out) {
			t.Errorf("[%s] a RegExp-valued property must drop (object serializes), not alwaysThrow; got:\n%s", fam, out)
		}
		if strings.Contains(out, "RegExp(") || strings.Contains(out, ".source") || strings.Contains(out, ".toString()") {
			t.Errorf("[%s] no RegExp wire code may remain in the factory; got:\n%s", fam, out)
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

func TestRegexp_RootFailsEverySerializationFamily(t *testing.T) {
	for _, fam := range serdeFamilies {
		dump := protocol.Dump{RunTypes: []*reflection.RunType{mkRegexp()}}
		out, sink := renderWithDiag(t, dump, fam, "re")
		if !strings.Contains(out, "_re','regexp',,,,,,'") {
			t.Errorf("[%s] a root RegExp must render an alwaysThrow factory; got:\n%s", fam, out)
		}
		got, ok := findCode(sink, regexpRootCodes[fam])
		if !ok {
			t.Errorf("[%s] expected root error %s; sink=%+v", fam, regexpRootCodes[fam], sink)
			continue
		}
		if got.Severity != diagnostics.SeverityError {
			t.Errorf("[%s] %s severity = %v, want Error", fam, regexpRootCodes[fam], got.Severity)
		}
		if len(got.Args) == 0 || got.Args[0] != "RegExp" {
			t.Errorf("[%s] the diagnostic must name the kind `RegExp`; args=%v", fam, got.Args)
		}
	}
}

func TestRegexp_ValidateKeepsTheIdentityCheck(t *testing.T) {
	for _, fam := range []string{"validate", "validationErrors"} {
		dump := protocol.Dump{RunTypes: []*reflection.RunType{mkRegexp()}}
		out, sink := renderWithDiag(t, dump, fam, "re")
		if !strings.Contains(out, "instanceof RegExp") {
			t.Errorf("[%s] a root RegExp must still validate by identity; got:\n%s", fam, out)
		}
		for _, d := range sink {
			if d.Severity == diagnostics.SeverityError {
				t.Errorf("[%s] a root RegExp must not fail the build for the validators, got %s", fam, d.Code)
			}
		}
	}
}

// `Date | RegExp` serializes as `Date`: the RegExp member is dropped from the
// union with the …014 Warning, like `Date | symbol`.
func TestRegexp_UnionMemberDrops(t *testing.T) {
	date := &reflection.RunType{ID: "dat", Kind: reflection.KindClass, SubKind: reflection.SubKindDate}
	union := &reflection.RunType{ID: "uni", Kind: reflection.KindUnion, Children: []*reflection.RunType{makeRef("dat"), makeRef("re")}}
	dump := protocol.Dump{RunTypes: []*reflection.RunType{date, mkRegexp(), union}}
	for fam, code := range map[string]string{
		"prepareForJson": diagnostics.CodePJUnionMemberDropped,
		"toBinary":       diagnostics.CodeTBUnionMemberDropped,
	} {
		out, sink := renderWithDiag(t, dump, fam, "uni")
		if strings.Contains(out, "_uni','union',,,,,,'") {
			t.Errorf("[%s] `Date | RegExp` must serialize as Date, not alwaysThrow; got:\n%s", fam, out)
		}
		if _, ok := findCode(sink, code); !ok {
			t.Errorf("[%s] expected union-member drop warning %s; sink=%+v", fam, code, sink)
		}
	}
}
