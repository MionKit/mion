package typefunctions

import (
	"strings"
	"testing"

	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// Negation nodes (`node.Negations`, the wire form of the `__rtNot` sentinel)
// invert their child's validate expression: validate = base && !(child); the
// verr twin pushes one canonical 'not' error when the child's positive check
// PASSES. These tests pin the emitted shapes end-to-end through the real
// render path (Dump → Collect), hand-building nodes the way the serialize
// side produces them:
//
//   - a format-scoped negation: `string ∧ ¬(string & {minLength: 3})` —
//     the M2 `Not<TF.string({minLength: 3})>` lowering;
//   - a bare negation: `unknown ∧ ¬string` — the JSON Schema `{"not":
//     {"type": "string"}}` lowering — which must ALSO defeat the unknown
//     noop collapse (a bare negation is a real check, never `() => true`).
func negationDump() protocol.Dump {
	minLen3 := &protocol.RunType{
		ID:               "ml3",
		Kind:             protocol.KindString,
		FormatAnnotation: &protocol.FormatAnnotation{Name: "stringFormat", Params: map[string]any{"minLength": float64(3)}},
	}
	str := &protocol.RunType{ID: "str", Kind: protocol.KindString}
	notMinLen := &protocol.RunType{
		ID:           "nml",
		Kind:         protocol.KindString,
		SchemaChecks: protocol.SchemaChecks{Negations: []*protocol.RunType{makeRef("ml3")}},
	}
	bareNotString := &protocol.RunType{
		ID:           "bns",
		Kind:         protocol.KindUnknown,
		SchemaChecks: protocol.SchemaChecks{Negations: []*protocol.RunType{makeRef("str")}},
	}
	return protocol.Dump{
		RunTypes: []*protocol.RunType{minLen3, str, notMinLen, bareNotString},
		Sites: []protocol.Site{
			{File: "call.ts", Pos: 0, ID: "nml", Demand: []protocol.SiteDemand{{FamilyTag: "val"}}},
			{File: "call.ts", Pos: 10, ID: "bns", Demand: []protocol.SiteDemand{{FamilyTag: "val"}}},
		},
	}
}

func TestValidate_NegationInvertsChild(t *testing.T) {
	out := renderToString(t, negationDump())

	formatScoped := extractInitLine(out, valKey("nml"))
	if formatScoped == "" {
		t.Fatalf("no init line for the format-scoped negation; render:\n%s", out)
	}
	// Base stays positive, child check arrives inverted.
	if !strings.Contains(formatScoped, "typeof v === 'string'") {
		t.Errorf("format-scoped negation must keep the positive base check, got:\n%s", formatScoped)
	}
	if !strings.Contains(formatScoped, "!(") {
		t.Errorf("format-scoped negation must invert the child check, got:\n%s", formatScoped)
	}
	if !strings.Contains(formatScoped, "v.length >= 3") {
		t.Errorf("the negated child's own condition must be present (inside the inversion), got:\n%s", formatScoped)
	}

	bare := extractInitLine(out, valKey("bns"))
	if bare == "" {
		t.Fatalf("no init line for the bare negation — the unknown noop collapse swallowed a real check; render:\n%s", out)
	}
	if !strings.Contains(bare, "!(typeof v === 'string')") {
		t.Errorf("bare negation must emit the inverted child check alone, got:\n%s", bare)
	}
	if strings.Contains(bare, "true &&") {
		t.Errorf("bare negation must elide the unknown root's `true`, got:\n%s", bare)
	}
}

func TestValidationErrors_NegationPushesNotError(t *testing.T) {
	dump := negationDump()
	for i := range dump.Sites {
		dump.Sites[i].Demand = []protocol.SiteDemand{{FamilyTag: "verr"}}
	}
	out := joinEntries(t, FamilyByKey("validationErrors").Collect(dump, RenderOpts{EmitMode: "both"}, nil))

	// The child's verr body runs against a scratch array; zero child errors
	// means the child MATCHED, so the canonical 'not' error is pushed.
	if !strings.Contains(out, "format:{name:'not'") {
		t.Errorf("negation verr must push the canonical 'not' format error, got:\n%s", out)
	}
	if !strings.Contains(out, ".length===0)") {
		t.Errorf("negation verr must probe the child's verr body against a scratch array, got:\n%s", out)
	}
	if !strings.Contains(out, "v.length < 3") {
		t.Errorf("the child's own minLength check must run inside the scratch probe, got:\n%s", out)
	}
}
