package typefunctions

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/operations"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// The jsc family end-to-end through the real render path (Dump → Collect):
// a demanded type renders ONE self-contained entry whose fn returns the JSON
// Schema document — children inline, no cross-entry deps, cycles via $defs.

func jscKey(id string) string { return operations.PlainHash("jsonSchema") + "_" + id }

func jsonSchemaDump() protocol.Dump {
	total := &reflection.RunType{ID: "big1", Kind: reflection.KindBigInt}
	name := &reflection.RunType{ID: "str1", Kind: reflection.KindString}
	order := &reflection.RunType{ID: "ord1", Kind: reflection.KindObjectLiteral}
	order.Children = []*reflection.RunType{
		{Kind: reflection.KindProperty, Name: "name", IsSafeName: true, Child: makeRef("str1")},
		{Kind: reflection.KindProperty, Name: "total", IsSafeName: true, Optional: true, Child: makeRef("big1")},
	}
	linked := &reflection.RunType{ID: "lnk1", Kind: reflection.KindObjectLiteral}
	linked.Children = []*reflection.RunType{
		{Kind: reflection.KindProperty, Name: "next", IsSafeName: true, Optional: true, Child: makeRef("lnk1")},
	}
	return protocol.Dump{
		RunTypes: []*reflection.RunType{total, name, order, linked},
		Sites: []protocol.Site{
			{File: "call.ts", Pos: 0, ID: "ord1", Demand: []protocol.SiteDemand{{FamilyTag: "jsc"}}},
			{File: "call.ts", Pos: 10, ID: "lnk1", Demand: []protocol.SiteDemand{{FamilyTag: "jsc"}}},
		},
	}
}

// renderJscToString collects the jsonSchema family (renderToString collects
// validate) with the body-visible EmitMode.
func renderJscToString(t *testing.T, dump protocol.Dump) string {
	t.Helper()
	return joinEntries(t, FamilyByKey("jsonSchema").Collect(dump, RenderOpts{EmitMode: "both"}, nil))
}

func TestJsonSchemaDoc_EmitsWholeDocumentEntry(t *testing.T) {
	out := renderJscToString(t, jsonSchemaDump())
	entry := extractInitLine(out, jscKey("ord1"))
	if entry == "" {
		t.Fatalf("no jsc entry for the demanded object; render:\n%s", out)
	}
	// The whole document, inline: standard keywords for the wire, the jsType
	// dialect row for the bigint member, required reflecting optionality.
	for _, fragment := range []string{
		"type: 'object'",
		"name: {type: 'string'}",
		"total: {type: 'string', pattern: '^-?[0-9]+$', jsType: 'bigint'}",
		"required: ['name']",
	} {
		if !strings.Contains(entry, fragment) {
			t.Errorf("jsc entry missing %q, got:\n%s", fragment, entry)
		}
	}
	// Self-contained: no dep-call into the member types' own entries.
	if strings.Contains(entry, "getRT(") {
		t.Errorf("jsc entry must not dep-call, got:\n%s", entry)
	}
}

func TestJsonSchemaDoc_SelfCycleClosesWithRootRef(t *testing.T) {
	out := renderJscToString(t, jsonSchemaDump())
	entry := extractInitLine(out, jscKey("lnk1"))
	if entry == "" {
		t.Fatalf("no jsc entry for the self-recursive object; render:\n%s", out)
	}
	if !strings.Contains(entry, "{$ref: '#'}") {
		t.Errorf("self-recursive document must close with {$ref: '#'}, got:\n%s", entry)
	}
}

// Union documents describe the WIRE: a wrapped union (any member with an
// encode/decode transform) renders the flat-union `[index, value]` envelope
// the JSON encoders write — buildFlatLayout is the single source for both —
// while a raw union keeps the natural spelling.

func jscUnionDump() protocol.Dump {
	date := &reflection.RunType{ID: "dat1", Kind: reflection.KindClass, SubKind: reflection.SubKindDate}
	str := &reflection.RunType{ID: "str2", Kind: reflection.KindString}
	wrapped := &reflection.RunType{ID: "uni1", Kind: reflection.KindUnion,
		Children: []*reflection.RunType{makeRef("dat1"), makeRef("str2")}}
	litA := &reflection.RunType{ID: "litA", Kind: reflection.KindLiteral, Literal: "a"}
	litB := &reflection.RunType{ID: "litB", Kind: reflection.KindLiteral, Literal: "b"}
	raw := &reflection.RunType{ID: "uni2", Kind: reflection.KindUnion,
		Children: []*reflection.RunType{makeRef("litA"), makeRef("litB")}}
	circle := &reflection.RunType{ID: "cir1", Kind: reflection.KindObjectLiteral}
	circle.Children = []*reflection.RunType{
		{Kind: reflection.KindProperty, Name: "kind", IsSafeName: true, Child: makeRef("litA")},
		{Kind: reflection.KindProperty, Name: "r", IsSafeName: true, Child: makeRef("dat1")},
	}
	square := &reflection.RunType{ID: "squ1", Kind: reflection.KindObjectLiteral}
	square.Children = []*reflection.RunType{
		{Kind: reflection.KindProperty, Name: "kind", IsSafeName: true, Child: makeRef("litB")},
		{Kind: reflection.KindProperty, Name: "n", IsSafeName: true, Child: makeRef("str2")},
	}
	objects := &reflection.RunType{ID: "uni3", Kind: reflection.KindUnion,
		Children: []*reflection.RunType{makeRef("cir1"), makeRef("squ1")}}
	return protocol.Dump{
		RunTypes: []*reflection.RunType{date, str, wrapped, litA, litB, raw, circle, square, objects},
		Sites: []protocol.Site{
			{File: "call.ts", Pos: 0, ID: "uni1", Demand: []protocol.SiteDemand{{FamilyTag: "jsc"}}},
			{File: "call.ts", Pos: 10, ID: "uni2", Demand: []protocol.SiteDemand{{FamilyTag: "jsc"}}},
			{File: "call.ts", Pos: 20, ID: "uni3", Demand: []protocol.SiteDemand{{FamilyTag: "jsc"}}},
		},
	}
}

func TestJsonSchemaDoc_WrappedUnionRendersTheEnvelope(t *testing.T) {
	out := renderJscToString(t, jscUnionDump())
	entry := extractInitLine(out, jscKey("uni1"))
	if entry == "" {
		t.Fatalf("no jsc entry for the wrapped union; render:\n%s", out)
	}
	for _, fragment := range []string{
		"jsType: 'union'",
		"prefixItems: [{const: 0}, {type: 'string', format: 'date-time', jsType: 'Date'}]",
		"prefixItems: [{const: 1}, {type: 'string'}]",
		"minItems: 2, items: false",
	} {
		if !strings.Contains(entry, fragment) {
			t.Errorf("wrapped-union document missing %q, got:\n%s", fragment, entry)
		}
	}
	if strings.Contains(entry, "anyOf: [{type: 'string'") {
		t.Errorf("wrapped union must not render the natural anyOf, got:\n%s", entry)
	}
}

func TestJsonSchemaDoc_RawUnionKeepsTheNaturalSpelling(t *testing.T) {
	out := renderJscToString(t, jscUnionDump())
	entry := extractInitLine(out, jscKey("uni2"))
	if entry == "" {
		t.Fatalf("no jsc entry for the raw union; render:\n%s", out)
	}
	if !strings.Contains(entry, "{enum: ['a', 'b']}") {
		t.Errorf("raw literal union must stay the natural enum, got:\n%s", entry)
	}
	if strings.Contains(entry, "jsType: 'union'") {
		t.Errorf("raw union must not wrap, got:\n%s", entry)
	}
}

func TestJsonSchemaDoc_ObjectUnionRendersTheMergedArm(t *testing.T) {
	out := renderJscToString(t, jscUnionDump())
	entry := extractInitLine(out, jscKey("uni3"))
	if entry == "" {
		t.Fatalf("no jsc entry for the object union; render:\n%s", out)
	}
	for _, fragment := range []string{
		"jsType: 'union'",
		"prefixItems: [{const: -1}, {type: 'object', properties: {",
		"r: {type: 'string', format: 'date-time', jsType: 'Date'}",
		"n: {type: 'string'}",
		"required: ['kind']",
	} {
		if !strings.Contains(entry, fragment) {
			t.Errorf("object-union document missing %q, got:\n%s", fragment, entry)
		}
	}
}
