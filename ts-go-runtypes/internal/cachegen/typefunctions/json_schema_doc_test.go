package typefunctions

import (
	"strings"
	"testing"

	"github.com/mionkit/ts-runtypes/internal/cachegen/operations"
	"github.com/mionkit/ts-runtypes/internal/protocol"
	"github.com/mionkit/ts-runtypes/internal/reflection"
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
