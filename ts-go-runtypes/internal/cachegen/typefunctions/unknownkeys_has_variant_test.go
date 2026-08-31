package typefunctions

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/mionkit/ts-runtypes/internal/cachegen/diskcache"

	"github.com/mionkit/ts-runtypes/internal/cachegen/operations"
	"github.com/mionkit/ts-runtypes/internal/protocol"
	"github.com/mionkit/ts-runtypes/internal/reflection"
)

// hukRunsAfterValidationOptions is the one option set the hasUnknownKeys family
// propagates (see HasUnknownKeysEmitter.PropagatesVariant).
var hukRunsAfterValidationOptions = []string{"runsAfterValidation"}

// hukKey returns the plain hasUnknownKeys cache key for a type id.
func hukKey(id string) string { return operations.PlainHash("hasUnknownKeys") + "_" + id }

// hukVariantKey returns the hasUnknownKeys cache key for an option variant —
// `<variant-fnHash>_<id>`, mirroring variantKey without the settings plumbing.
func hukVariantKey(optionNames []string, id string) string {
	op, _ := operations.ByName("hasUnknownKeys")
	return operations.FnHashFor(op, optionNames, "", false) + "_" + id
}

// buildNamedVsInlineNestedFixture builds the two shapes the fast-path contract
// turns on, differing ONLY in whether the nested object carries a TypeName:
//
//	type Inner  = {a: string; b: string};
//	type Named  = {inner: Inner};              // nested type is NAMED  → external entry
//	type Inline = {inner: {a: string; b: string}}; // nested type is anonymous → inlined
//
// DefaultIsRTInlined inlines the anonymous one and sends the named one to its
// own entry, so the pair separates "the fast path reached this node" from "the
// fast path reached the root body it happened to be inlined into".
func buildNamedVsInlineNestedFixture() []*reflection.RunType {
	return []*reflection.RunType{
		{ID: "str", Kind: reflection.KindString},
		{ID: "pa", Kind: reflection.KindProperty, Name: "a", IsSafeName: true, Child: makeRef("str")},
		{ID: "pb", Kind: reflection.KindProperty, Name: "b", IsSafeName: true, Child: makeRef("str")},
		{ID: "inner", Kind: reflection.KindObjectLiteral, TypeName: "Inner", Children: []*reflection.RunType{makeRef("pa"), makeRef("pb")}},
		{ID: "anon", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("pa"), makeRef("pb")}},
		{ID: "pnamed", Kind: reflection.KindProperty, Name: "inner", IsSafeName: true, Child: makeRef("inner")},
		{ID: "panon", Kind: reflection.KindProperty, Name: "inner", IsSafeName: true, Child: makeRef("anon")},
		{ID: "named", Kind: reflection.KindObjectLiteral, TypeName: "Named", Children: []*reflection.RunType{makeRef("pnamed")}},
		{ID: "inline", Kind: reflection.KindObjectLiteral, TypeName: "Inline", Children: []*reflection.RunType{makeRef("panon")}},
	}
}

// renderHukToString collects the hasUnknownKeys family for a dump, same
// EmitMode 'both' body-visible shape renderToString uses for validate.
func renderHukToString(t *testing.T, dump protocol.Dump) string {
	t.Helper()
	return joinEntries(t, FamilyByKey("hasUnknownKeys").Collect(dump, RenderOpts{EmitMode: "both"}, nil))
}

// hukSite builds one createHasUnknownKeysFn call site demanding `options`.
func hukSite(pos int, id string, options []string) protocol.Site {
	demand := protocol.SiteDemand{FamilyTag: "huk"}
	if len(options) > 0 {
		demand.VariantSuffix = "OV"
		demand.Options = options
	}
	return protocol.Site{File: "call.ts", Pos: pos, ID: id, Demand: []protocol.SiteDemand{demand}}
}

// TestHasUnknownKeys_RunsAfterValidationReachesNamedNestedTypes — the
// runsAfterValidation fast path must reach a NAMED nested object exactly as it
// reaches an inline one. The option is a claim about the VALUE (if `v` passed
// validate then so did `v.inner`), so it propagates down the subtree: the named
// child renders its own variant entry with the key-count compare, and the
// parent dep-calls THAT entry instead of the plain scan-based one.
func TestHasUnknownKeys_RunsAfterValidationReachesNamedNestedTypes(t *testing.T) {
	dump := protocol.Dump{
		RunTypes: buildNamedVsInlineNestedFixture(),
		Sites: []protocol.Site{
			hukSite(0, "named", hukRunsAfterValidationOptions),
			hukSite(40, "inline", hukRunsAfterValidationOptions),
		},
	}
	out := renderHukToString(t, dump)

	// The inline shape is the control: one body, fast path at BOTH depths.
	inlineLine := extractInitLine(out, hukVariantKey(hukRunsAfterValidationOptions, "inline"))
	if inlineLine == "" {
		t.Fatalf("no inline variant entry in:\n%s", out)
	}
	if strings.Count(inlineLine, "cntEK(") < 2 {
		t.Errorf("inline nested object must use the key-count compare at both depths, got:\n%s", inlineLine)
	}

	// The named parent must dep-call the VARIANT child entry, never the plain
	// one — the plain entry is the O(props×keys) scan this option exists to skip.
	namedLine := extractInitLine(out, hukVariantKey(hukRunsAfterValidationOptions, "named"))
	if namedLine == "" {
		t.Fatalf("no named variant entry in:\n%s", out)
	}
	variantChild := hukVariantKey(hukRunsAfterValidationOptions, "inner")
	if !strings.Contains(namedLine, variantChild+".fn(") {
		t.Errorf("named parent must dep-call the variant child %q, got:\n%s", variantChild, namedLine)
	}
	if strings.Contains(namedLine, hukKey("inner")) {
		t.Errorf("named parent must not reach the plain child entry, got:\n%s", namedLine)
	}

	// And the child entry itself carries the fast path — key-count compare, no
	// key-array scan, and no typeof guard (validation already proved the shape).
	childLine := extractInitLine(out, variantChild)
	if childLine == "" {
		t.Fatalf("no variant entry for the named child in:\n%s", out)
	}
	if !strings.Contains(childLine, "cntEK(v) !== 2") {
		t.Errorf("named nested object must use the key-count compare, got:\n%s", childLine)
	}
	if strings.Contains(childLine, "hUKFA") {
		t.Errorf("named nested object must not keep the key-array scan, got:\n%s", childLine)
	}
	if strings.Contains(childLine, "typeof v ===") {
		t.Errorf("runsAfterValidation drops the per-object guard, got:\n%s", childLine)
	}
}

// TestHasUnknownKeys_PlainNamedNestedKeepsScan — the plain (no-option) family is
// untouched: a named nested object still renders the guarded key-array scan, and
// the plain parent still dep-calls the PLAIN child entry.
func TestHasUnknownKeys_PlainNamedNestedKeepsScan(t *testing.T) {
	dump := protocol.Dump{
		RunTypes: buildNamedVsInlineNestedFixture(),
		Sites:    []protocol.Site{hukSite(0, "named", nil)},
	}
	out := renderHukToString(t, dump)

	namedLine := extractInitLine(out, hukKey("named"))
	if namedLine == "" {
		t.Fatalf("no plain named entry in:\n%s", out)
	}
	if !strings.Contains(namedLine, hukKey("inner")+".fn(") {
		t.Errorf("plain parent must dep-call the plain child entry, got:\n%s", namedLine)
	}
	childLine := extractInitLine(out, hukKey("inner"))
	if !strings.Contains(childLine, "hUKFA") {
		t.Errorf("plain nested object must keep the key-array scan, got:\n%s", childLine)
	}
	if !strings.Contains(childLine, "typeof v ===") {
		t.Errorf("plain nested object must keep its guard, got:\n%s", childLine)
	}
	if strings.Contains(out, hukVariantKey(hukRunsAfterValidationOptions, "inner")) {
		t.Errorf("a plain-only call site must not render variant entries, got:\n%s", out)
	}
}

// TestHasUnknownKeys_BothVariantsOfNestedTypeCoexist — a plain call site and a
// runsAfterValidation one over the SAME type render two independent subtrees,
// keyed apart at every depth. Pay-for-use: neither body is rewritten by the
// other's presence.
func TestHasUnknownKeys_BothVariantsOfNestedTypeCoexist(t *testing.T) {
	dump := protocol.Dump{
		RunTypes: buildNamedVsInlineNestedFixture(),
		Sites: []protocol.Site{
			hukSite(0, "named", nil),
			hukSite(40, "named", hukRunsAfterValidationOptions),
		},
	}
	out := renderHukToString(t, dump)

	for _, key := range []string{
		hukKey("named"), hukKey("inner"),
		hukVariantKey(hukRunsAfterValidationOptions, "named"),
		hukVariantKey(hukRunsAfterValidationOptions, "inner"),
	} {
		if extractInitLine(out, key) == "" {
			t.Errorf("expected entry %q in:\n%s", key, out)
		}
	}
	if !strings.Contains(extractInitLine(out, hukKey("inner")), "hUKFA") {
		t.Errorf("the plain child entry must keep the scan")
	}
	if !strings.Contains(extractInitLine(out, hukVariantKey(hukRunsAfterValidationOptions, "inner")), "cntEK(v) !== 2") {
		t.Errorf("the variant child entry must use the key-count compare")
	}
}

// TestHasUnknownKeys_VariantHonoursOverride — a user override on a type reaches
// the propagated variant too. Root-scoped variants skip the redirect (their
// option changes behaviour the override fn can't express); a propagating
// variant's option only refines HOW the same answer is computed, so dropping
// the redirect would silently lose the user's function at every named nested
// type the variant now reaches.
func TestHasUnknownKeys_VariantHonoursOverride(t *testing.T) {
	runTypes := buildNamedVsInlineNestedFixture()
	for _, runType := range runTypes {
		if runType.ID == "inner" {
			runType.Overrides = map[string]string{"huk": "cfnhash1"}
		}
	}
	dump := protocol.Dump{
		RunTypes: runTypes,
		Sites:    []protocol.Site{hukSite(0, "named", hukRunsAfterValidationOptions)},
	}
	out := renderHukToString(t, dump)
	childLine := extractInitLine(out, hukVariantKey(hukRunsAfterValidationOptions, "inner"))
	if childLine == "" {
		t.Fatalf("no variant entry for the overridden child in:\n%s", out)
	}
	if !strings.Contains(childLine, "cfn::cfnhash1") {
		t.Errorf("overridden child must redirect to the user's fn, got:\n%s", childLine)
	}
}

// TestHasUnknownKeys_VariantSubtreeIsDiskCached — a propagating variant renders
// the WHOLE subtree, so it must be disk-cached like the plain family or every
// build would re-walk it. Its files live under `<typeID>/<tag><suffix>.json`, a
// basename of their own, so the variant body never overwrites the plain one for
// the same type.
func TestHasUnknownKeys_VariantSubtreeIsDiskCached(t *testing.T) {
	root := t.TempDir()
	store := diskcache.New(root, "fp1")
	lookup := newFakeLookup()
	for _, runType := range buildNamedVsInlineNestedFixture() {
		lookup.set(runType.ID, "1:"+runType.ID)
	}
	dump := protocol.Dump{
		RunTypes: buildNamedVsInlineNestedFixture(),
		Sites: []protocol.Site{
			hukSite(0, "named", nil),
			hukSite(40, "named", hukRunsAfterValidationOptions),
		},
	}
	opts := RenderOpts{Store: store, Lookup: lookup, EmitMode: "both"}
	first := joinEntries(t, FamilyByKey("hasUnknownKeys").Collect(dump, opts, nil))

	// The nested type is cached under BOTH basenames, one file per body.
	for _, name := range []string{"huk.json", "hukOV.json"} {
		if _, err := os.Stat(filepath.Join(root, "fp1", "inner", name)); err != nil {
			t.Fatalf("expected a cache file for the nested type at %s, got %v", name, err)
		}
	}
	plainRaw, err := os.ReadFile(filepath.Join(root, "fp1", "inner", "huk.json"))
	if err != nil {
		t.Fatal(err)
	}
	variantRaw, err := os.ReadFile(filepath.Join(root, "fp1", "inner", "hukOV.json"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(plainRaw), "hUKFA") {
		t.Errorf("the plain cache file must hold the scan body, got:\n%s", plainRaw)
	}
	if !strings.Contains(string(variantRaw), "cntEK") {
		t.Errorf("the variant cache file must hold the key-count body, got:\n%s", variantRaw)
	}

	// A second collect served from disk must reproduce the first byte for byte.
	second := joinEntries(t, FamilyByKey("hasUnknownKeys").Collect(dump, opts, nil))
	if first != second {
		t.Errorf("variant cache round-trip changed output:\nfirst:\n%s\nsecond:\n%s", first, second)
	}
}
