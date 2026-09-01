package typefunctions

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/operations"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/entrymodules"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// compositeBodyFor renders one composite entry's factory body for the given
// tag over a plain object type, returning the cached-args text (which embeds
// the prologue + inner fn in emitMode both).
func compositeBodyFor(t *testing.T, tag string) string {
	t.Helper()
	composite, ok := constants.JsonCompositeByTag(tag)
	if !ok {
		t.Fatalf("unknown composite tag %q", tag)
	}
	runType := &reflection.RunType{ID: "obj1", Kind: reflection.KindObjectLiteral}
	entry := collectJsonCompositeEntry(runType, tag, composite, RenderOpts{EmitMode: constants.EmitBoth}, nil, nil, false)
	if entry == nil {
		t.Fatalf("no composite entry rendered for %q", tag)
	}
	return entry.ArgsText
}

// The composite prologue binds each primitive with a DIRECT
// `utl.getRT(key).fn` read — no guarded resolver IIFE, no inline
// identity/stringify fallback. Noop primitives register with the family
// noop fn pre-set runtime-side (entryTuple.ts familyMeta) and getRT
// materializes before returning, so the read is always live.
func TestJsonComposite_DirectFnBind_DecoderStrip(t *testing.T) {
	body := compositeBodyFor(t, "jdST")
	rjKey := operations.PlainHash("restoreFromJson") + "_obj1"
	ukuwKey := operations.PlainHash("unknownKeysToUndefinedWire") + "_obj1"
	for _, want := range []string{
		"const rjFn = utl.getRT('" + rjKey + "').fn",
		"const ukuwFn = utl.getRT('" + ukuwKey + "').fn",
		"return rjFn(ukuwFn(JSON.parse(s)));",
	} {
		if !strings.Contains(body, want) {
			t.Errorf("jdST body missing %q:\n%s", want, body)
		}
	}
	if strings.Contains(body, "e ? e.fn") || strings.Contains(body, "(function(") {
		t.Errorf("jdST body must carry no guarded resolver IIFE or inline fallback:\n%s", body)
	}
}

func TestJsonComposite_DirectFnBind_EncoderDirect(t *testing.T) {
	body := compositeBodyFor(t, "jeDI")
	sjKey := operations.PlainHash("stringifyJson") + "_obj1"
	if !strings.Contains(body, "const sjFn = utl.getRT('"+sjKey+"').fn") {
		t.Errorf("jeDI body missing direct sjFn bind:\n%s", body)
	}
	if strings.Contains(body, "JSON.stringify(x)") {
		t.Errorf("the inline stringify fallback must be gone (sj noop registers fn = JSON.stringify runtime-side):\n%s", body)
	}
}

// The compact encoder wraps the new compactForJson (cj) walking primitive with
// native JSON.stringify; the compact decoder wraps compactFromJson (cjr) around
// JSON.parse. Same DIRECT `utl.getRT(key).fn` bind shape as the other strategies.
func TestJsonComposite_DirectFnBind_CompactEncoder(t *testing.T) {
	body := compositeBodyFor(t, "jeCO")
	cjKey := operations.PlainHash("compactForJson") + "_obj1"
	for _, want := range []string{
		"const cjFn = utl.getRT('" + cjKey + "').fn",
		"return JSON.stringify(cjFn(v));",
	} {
		if !strings.Contains(body, want) {
			t.Errorf("jeCO body missing %q:\n%s", want, body)
		}
	}
}

func TestJsonComposite_DirectFnBind_CompactDecoder(t *testing.T) {
	body := compositeBodyFor(t, "jdCO")
	cjrKey := operations.PlainHash("compactFromJson") + "_obj1"
	for _, want := range []string{
		"const cjrFn = utl.getRT('" + cjrKey + "').fn",
		"return cjrFn(JSON.parse(s));",
	} {
		if !strings.Contains(body, want) {
			t.Errorf("jdCO body missing %q:\n%s", want, body)
		}
	}
}

// AssertCompositeSoftDeps — the build-time belt for the demand invariant:
// a composite whose primitive never rendered surfaces as an Error diag
// (JCP001) instead of a runtime `undefined.fn` TypeError.
func TestAssertCompositeSoftDeps_MissingPrimitiveFails(t *testing.T) {
	rjKey := operations.PlainHash("restoreFromJson") + "_obj1"
	graph := entrymodules.Graph{}
	graph.Add(&entrymodules.Entry{
		Key: "jd1_obj1", Kind: entrymodules.KindTypeFn, FamilyTag: "jdPR",
		ArgsText: "'jd1_obj1'", SoftDeps: []string{rjKey},
	})
	var sink []diagnostics.Diagnostic
	AssertCompositeSoftDeps(graph, nil, &sink)
	if len(sink) != 1 || sink[0].Code != diagnostics.CodeCompositeMissingPrimitive {
		t.Fatalf("expected one %s diagnostic, got %+v", diagnostics.CodeCompositeMissingPrimitive, sink)
	}
	if sink[0].Severity != diagnostics.SeverityError {
		t.Fatalf("invariant breach must be Error severity, got %v", sink[0].Severity)
	}
	// The offending type id (`obj1`, split off the composite key) rides as the
	// third arg so a breach names the type even without a resolvable site.
	if len(sink[0].Args) != 3 || sink[0].Args[2] != "obj1" {
		t.Fatalf("expected type-id arg `obj1`, got args %v", sink[0].Args)
	}
	if sink[0].Site.FilePath != "" {
		t.Fatalf("nil provenance must yield a file-less diagnostic, got site %+v", sink[0].Site)
	}

	// With provenance, the breach fans out one diagnostic per demanding call
	// site — anchored at the user's createJsonDecoderFn so it's reproducible.
	provenance := map[string][]diagnostics.Site{
		"obj1": {
			{FilePath: "a.ts", StartLine: 3, StartCol: 11},
			{FilePath: "b.ts", StartLine: 7, StartCol: 5},
		},
	}
	sink = nil
	AssertCompositeSoftDeps(graph, provenance, &sink)
	if len(sink) != 2 {
		t.Fatalf("expected one diagnostic per demanding site (2), got %d: %+v", len(sink), sink)
	}
	for _, d := range sink {
		if d.Site.FilePath == "" || d.Site.StartLine == 0 {
			t.Errorf("provenance site must populate file:line, got %+v", d.Site)
		}
	}

	// Present primitive (even a noop short-form entry) satisfies the assert.
	graph.Add(&entrymodules.Entry{Key: rjKey, Kind: entrymodules.KindTypeFn, FamilyTag: "rj", ArgsText: "'" + rjKey + "'"})
	sink = nil
	AssertCompositeSoftDeps(graph, nil, &sink)
	if len(sink) != 0 {
		t.Fatalf("present primitive must not diag, got %+v", sink)
	}

	// A KindMissing stub registers NOTHING at runtime — still a breach.
	graph2 := entrymodules.Graph{}
	graph2.Add(&entrymodules.Entry{
		Key: "jd1_obj2", Kind: entrymodules.KindTypeFn, FamilyTag: "jdPR",
		ArgsText: "'jd1_obj2'", SoftDeps: []string{"stub1"},
	})
	graph2.Add(&entrymodules.Entry{Key: "stub1", Kind: entrymodules.KindMissing})
	sink = nil
	AssertCompositeSoftDeps(graph2, nil, &sink)
	if len(sink) != 1 {
		t.Fatalf("KindMissing stub dep must diag, got %+v", sink)
	}
}
