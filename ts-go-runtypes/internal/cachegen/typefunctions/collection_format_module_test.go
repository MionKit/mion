package typefunctions

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// brandedSetDump is a `FormattedSet<Set<string>, {minItems: 1; maxItems: 2;
// uniqueItems: true}>` as the collapse projects it: a KindClass / SubKindSet
// node whose item rides the synthetic SubKindSetItem parameter, carrying the
// formattedSet annotation.
func brandedSetDump() protocol.Dump {
	item := &reflection.RunType{ID: "si", Kind: reflection.KindParameter, SubKind: reflection.SubKindSetItem, Name: "item",
		Child: &reflection.RunType{ID: "str", Kind: reflection.KindString}}
	set := &reflection.RunType{ID: "set", Kind: reflection.KindClass, SubKind: reflection.SubKindSet, TypeName: "Set",
		Arguments:        []*reflection.RunType{item},
		FormatAnnotation: &reflection.FormatAnnotation{Name: "formattedSet", Params: map[string]any{"minItems": 1.0, "maxItems": 2.0, "uniqueItems": true}}}
	return protocol.Dump{RunTypes: []*reflection.RunType{set}}
}

// TestCollectionFormat_ValidateSplicesAfterTheSetBody — the validate lane
// hoists the Set body into a context fn and AND-chains the format check
// after it: the emitter never sees the base, the walker does the splice.
func TestCollectionFormat_ValidateSplicesAfterTheSetBody(t *testing.T) {
	out := renderToString(t, brandedSetDump())
	for _, fragment := range []string{
		"instanceof Set)) return false;",
		".values()) {",
		"&& (v.size >= 1 && v.size <= 2 && ",
		"utl.getPureFn('rt::uniqueItems')",
	} {
		if !strings.Contains(out, fragment) {
			t.Errorf("expected fragment %q in:\n%s", fragment, out)
		}
	}
}

// TestCollectionFormat_ErrorsGatedOnTheSetGuard — the errors lane appends the
// format statements under the Set class guard, so a wrong-kind value reports
// only the base error.
func TestCollectionFormat_ErrorsGatedOnTheSetGuard(t *testing.T) {
	out := renderErrorsToString(t, brandedSetDump())
	for _, fragment := range []string{
		"if (v instanceof Set) {if (v.size < 1) er.push({expected:'set',path:[...pth],format:{name:'formattedSet',formatPath:['minItems'],val:1}});",
		"if (v.size > 2) er.push({expected:'set',path:[...pth],format:{name:'formattedSet',formatPath:['maxItems'],val:2}});",
		"er.push({expected:'set',path:[...pth],format:{name:'formattedSet',formatPath:['uniqueItems'],val:true}})}",
	} {
		if !strings.Contains(out, fragment) {
			t.Errorf("expected fragment %q in:\n%s", fragment, out)
		}
	}
}

func renderErrorsToString(t *testing.T, dump protocol.Dump) string {
	t.Helper()
	return joinEntries(t, FamilyByKey("validationErrors").Collect(dump, RenderOpts{EmitMode: "both"}, nil))
}
