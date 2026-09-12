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
		"utl.getPureFn('rt::uniqueSetMembers')",
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

// containsSetDump is a `FormattedSet<Set<unknown>, {contains: number;
// minContains: 1; maxContains: 2}>`: the contains check rides the class
// node's Contains slot, no brand params at all.
func containsSetDump() protocol.Dump {
	item := &reflection.RunType{ID: "si", Kind: reflection.KindParameter, SubKind: reflection.SubKindSetItem, Name: "item",
		Child: &reflection.RunType{ID: "unk", Kind: reflection.KindUnknown}}
	set := &reflection.RunType{ID: "set", Kind: reflection.KindClass, SubKind: reflection.SubKindSet, TypeName: "Set",
		Arguments:    []*reflection.RunType{item},
		SchemaChecks: reflection.SchemaChecks{Contains: []*reflection.ContainsCheck{{Child: &reflection.RunType{ID: "num", Kind: reflection.KindNumber}, Min: 1, Max: 2}}}}
	return protocol.Dump{RunTypes: []*reflection.RunType{set}}
}

// containsMapDump is a `FormattedMap<Map<string, number>, {contains: [unknown,
// number]}>`: the contains child is the TUPLE a Map entry is, checked against
// each `[key, value]` pair the default iterator yields. Only the loop variable
// matters here, so the tuple stands in as a plain number child — the pair walk
// is what the test pins.
func containsMapDump() protocol.Dump {
	key := &reflection.RunType{ID: "mk", Kind: reflection.KindParameter, SubKind: reflection.SubKindMapKey, Name: "key",
		Child: &reflection.RunType{ID: "str", Kind: reflection.KindString}}
	value := &reflection.RunType{ID: "mv", Kind: reflection.KindParameter, SubKind: reflection.SubKindMapValue, Name: "value",
		Child: &reflection.RunType{ID: "num", Kind: reflection.KindNumber}}
	mapNode := &reflection.RunType{ID: "map", Kind: reflection.KindClass, SubKind: reflection.SubKindMap, TypeName: "Map",
		Arguments:    []*reflection.RunType{key, value},
		SchemaChecks: reflection.SchemaChecks{Contains: []*reflection.ContainsCheck{{Child: &reflection.RunType{ID: "cnum", Kind: reflection.KindNumber}, Min: 1, Max: -1}}}}
	return protocol.Dump{RunTypes: []*reflection.RunType{mapNode}}
}

// TestCollectionFormat_ContainsIteratesAMapWithForOf — a Map is not indexable
// either, and its default iterator yields the `[key, value]` pair that IS its
// entry, so the same `for…of` head serves it; the errors lane reports the `map`
// kind word.
func TestCollectionFormat_ContainsIteratesAMapWithForOf(t *testing.T) {
	validate := renderToString(t, containsMapDump())
	if !strings.Contains(validate, "for (const ci0 of v) {") {
		t.Errorf("validate: expected the pair walk `for (const ci0 of v)` in:\n%s", validate)
	}
	if strings.Contains(validate, "v.length") || strings.Contains(validate, "v[ci0]") {
		t.Errorf("validate: a Map must not be indexed:\n%s", validate)
	}
	errors := renderErrorsToString(t, containsMapDump())
	for _, fragment := range []string{
		"for (const ci0 of v) {",
		"er.push({expected:'map',path:[...pth],format:{name:'contains',formatPath:['minContains'],val:1}})",
	} {
		if !strings.Contains(errors, fragment) {
			t.Errorf("errors: expected fragment %q in:\n%s", fragment, errors)
		}
	}
}

// TestCollectionFormat_ContainsIteratesASetWithForOf — a Set is not
// indexable, so the contains count walks it with `for…of` (the array loop
// stays an index loop) and the errors lane reports the `set` kind word.
func TestCollectionFormat_ContainsIteratesASetWithForOf(t *testing.T) {
	validate := renderToString(t, containsSetDump())
	for _, fragment := range []string{
		"for (const ci0 of v) {if (Number.isFinite(ci0)) cn0++;}",
		"return (cn0 >= 1 && cn0 <= 2);",
	} {
		if !strings.Contains(validate, fragment) {
			t.Errorf("validate: expected fragment %q in:\n%s", fragment, validate)
		}
	}
	if strings.Contains(validate, "v.length") || strings.Contains(validate, "v[ci0]") {
		t.Errorf("validate: a Set must not be indexed:\n%s", validate)
	}
	errors := renderErrorsToString(t, containsSetDump())
	for _, fragment := range []string{
		"for (const ci0 of v) {",
		"er.push({expected:'set',path:[...pth],format:{name:'contains',formatPath:['minContains'],val:1}})",
		"er.push({expected:'set',path:[...pth],format:{name:'contains',formatPath:['maxContains'],val:2}})",
	} {
		if !strings.Contains(errors, fragment) {
			t.Errorf("errors: expected fragment %q in:\n%s", fragment, errors)
		}
	}
}
