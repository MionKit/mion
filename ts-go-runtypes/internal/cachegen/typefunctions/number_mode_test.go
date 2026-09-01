package typefunctions

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// valNumberSites returns a dump for a single number RunType demanded three ways
// on the validate family — plain (isFinite default), the numberTypeof variant,
// and the numberNotNaN variant — so one render carries all three factories.
func valNumberSites(id string) protocol.Dump {
	return protocol.Dump{
		RunTypes: []*reflection.RunType{{ID: id, Kind: reflection.KindNumber}},
		Sites: []protocol.Site{
			{File: "call.ts", Pos: 0, ID: id, Demand: []protocol.SiteDemand{{FamilyTag: "val"}}},
			{File: "call.ts", Pos: 10, ID: id, Demand: []protocol.SiteDemand{{FamilyTag: "val", VariantSuffix: "NT", Options: []string{"numberTypeof"}}}},
			{File: "call.ts", Pos: 20, ID: id, Demand: []protocol.SiteDemand{{FamilyTag: "val", VariantSuffix: "NM", Options: []string{"numberNotNaN"}}}},
		},
	}
}

// renderVerrVariant renders the validationErrors factory for a single number
// RunType under one numberMode variant, in isolation (verr bodies are multi-line
// error builders, so assert on the whole rendered string rather than one line).
func renderVerrVariant(t *testing.T, options []string) string {
	t.Helper()
	dump := protocol.Dump{
		RunTypes: []*reflection.RunType{{ID: "num", Kind: reflection.KindNumber}},
		Sites: []protocol.Site{{
			File: "call.ts", Pos: 0, ID: "num",
			Demand: []protocol.SiteDemand{{FamilyTag: "verr", VariantSuffix: constants.ValidateVariantSuffix(options), Options: options}},
		}},
	}
	return joinEntries(t, FamilyByKey("validationErrors").Collect(dump, RenderOpts{EmitMode: "both"}, nil))
}

// TestValidateModule_NumberMode pins the numberMode ValidateOption across BOTH
// validate and validationErrors: the plain entry keeps Number.isFinite, the
// typeof variant swaps in `typeof v === 'number'`, and the notNaN variant adds
// the `!Number.isNaN` guard — mirrored in both emitters so validate and
// validationErrors never disagree on what a number is.
func TestValidateModule_NumberMode(t *testing.T) {
	valOut := renderToString(t, valNumberSites("num"))
	valCases := []struct {
		name    string
		line    string
		want    string
		notWant string
	}{
		{"val plain", extractInitLine(valOut, valKey("num")), "Number.isFinite(v)", ""},
		{"val typeof", extractInitLine(valOut, itVariantKey([]string{"numberTypeof"}, "num")), "typeof v === 'number'", "isFinite"},
		{"val notNaN", extractInitLine(valOut, itVariantKey([]string{"numberNotNaN"}, "num")), "(typeof v === 'number' && !Number.isNaN(v))", "isFinite"},
	}
	for _, c := range valCases {
		t.Run(c.name, func(t *testing.T) {
			if c.line == "" {
				t.Fatalf("no init line found for %s", c.name)
			}
			if !strings.Contains(c.line, c.want) {
				t.Errorf("%s: want body to contain %q, got:\n%s", c.name, c.want, c.line)
			}
			if c.notWant != "" && strings.Contains(c.line, c.notWant) {
				t.Errorf("%s: body must not contain %q, got:\n%s", c.name, c.notWant, c.line)
			}
		})
	}

	verrCases := []struct {
		name    string
		options []string
		want    string
		notWant string
	}{
		{"verr plain", nil, "!(Number.isFinite(v))", ""},
		{"verr typeof", []string{"numberTypeof"}, "!(typeof v === 'number')", "isFinite"},
		{"verr notNaN", []string{"numberNotNaN"}, "!((typeof v === 'number' && !Number.isNaN(v)))", "isFinite"},
	}
	for _, c := range verrCases {
		t.Run(c.name, func(t *testing.T) {
			out := renderVerrVariant(t, c.options)
			if !strings.Contains(out, c.want) {
				t.Errorf("%s: want body to contain %q, got:\n%s", c.name, c.want, out)
			}
			if c.notWant != "" && strings.Contains(out, c.notWant) {
				t.Errorf("%s: body must not contain %q, got:\n%s", c.name, c.notWant, out)
			}
		})
	}
}

// TestValidateModule_NumberModeObjectProperty confirms numberMode reaches an
// INLINED number property of a variant-root object — the common case (validating
// {amount: number} with numberMode:'typeof' must accept NaN at `amount`).
func TestValidateModule_NumberModeObjectProperty(t *testing.T) {
	numberRT := &reflection.RunType{ID: "num", Kind: reflection.KindNumber}
	propB := &reflection.RunType{
		ID:         "pB",
		Kind:       reflection.KindPropertySignature,
		Name:       "b",
		IsSafeName: true,
		Child:      &reflection.RunType{ID: "num", Kind: reflection.KindRef},
	}
	iface := &reflection.RunType{
		ID:       "if1",
		Kind:     reflection.KindObjectLiteral,
		Children: []*reflection.RunType{{ID: "pB", Kind: reflection.KindRef}},
	}
	dump := protocol.Dump{
		RunTypes: []*reflection.RunType{iface, propB, numberRT},
		Sites: []protocol.Site{
			{File: "call.ts", Pos: 0, ID: "if1", Demand: []protocol.SiteDemand{{FamilyTag: "val"}}},
			{File: "call.ts", Pos: 10, ID: "if1", Demand: []protocol.SiteDemand{{FamilyTag: "val", VariantSuffix: "NT", Options: []string{"numberTypeof"}}}},
		},
	}
	out := renderToString(t, dump)
	plain := extractInitLine(out, valKey("if1"))
	variant := extractInitLine(out, itVariantKey([]string{"numberTypeof"}, "if1"))
	if !strings.Contains(plain, "Number.isFinite(v.b)") {
		t.Errorf("plain object body must keep Number.isFinite(v.b), got:\n%s", plain)
	}
	if !strings.Contains(variant, "typeof v.b === 'number'") || strings.Contains(variant, "isFinite") {
		t.Errorf("typeof-variant object body must check v.b via typeof (no isFinite), got:\n%s", variant)
	}
}
