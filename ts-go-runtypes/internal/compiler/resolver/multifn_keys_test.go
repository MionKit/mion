package resolver_test

import (
	"testing"

	"github.com/mionkit/ts-runtypes/internal/cachegen/operations"
	"github.com/mionkit/ts-runtypes/internal/diagnostics"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// multiFnDTS declares wrapper factories carrying InjectTypeFnArgs markers with
// MORE than the historical three fn keys, plus a duplicate-key variant. The
// alias itself is the widened arity (F1…F12) so the type checker accepts any
// realistic family count; the scanner reads every type argument after T.
const multiFnDTS = `declare module '@ts-runtypes/core' {
  export type InjectTypeFnArgs<T, F1 extends string, F2 extends string = never, F3 extends string = never, F4 extends string = never, F5 extends string = never, F6 extends string = never, F7 extends string = never, F8 extends string = never, F9 extends string = never, F10 extends string = never, F11 extends string = never, F12 extends string = never> = string & {readonly __rtInjectTypeFnArgsBrand?: T; readonly __rtInjectTypeFnArgsFns?: [F1, F2, F3, F4, F5, F6, F7, F8, F9, F10, F11, F12]};
  // Four DISTINCT leaf families — proves the >3-key cap and exact ordered fnIds.
  export function createFour<T>(val?: T, id?: InjectTypeFnArgs<T, 'verr', 'huk', 'ces', 'uke'>): unknown;
  // mion's interim route() shape: validator + JSON decoder + JSON encoder.
  export function createMion<T>(val?: T, id?: InjectTypeFnArgs<T, 'verr', 'jsonDecoder', 'jsonEncoder'>): unknown;
  // A repeated family — must be rejected with MKR006 and deduped. The duplicate
  // 'verr' is deliberately NOT the first key, so the reported family pins the
  // FIRST-REPEATED-KEY rule (a naive "report the first key" impl would say 'huk').
  export function createDup<T>(val?: T, id?: InjectTypeFnArgs<T, 'huk', 'verr', 'ces', 'verr'>): unknown;
}
`

// leafFnHash returns the plain fnHash for a leaf family fn key (no options / no
// strategy axis). Panics via t if the key is not a registered operation.
func leafFnHash(t *testing.T, fnKey string) string {
	t.Helper()
	op, ok := operations.ByFnKey(fnKey)
	if !ok {
		t.Fatalf("no operation registered for fnKey %q", fnKey)
	}
	return operations.FnHashFor(op, nil, "", false)
}

// TestResolver_MultiFn_FourKeys pins the widened fn-key cap: a single marker
// naming FOUR distinct families injects four fnIds in declaration order and
// demands all four family entries. This is the core of the "any list of
// functions, no fixed length" requirement — the historical alias capped at
// three keys, so a four-key marker used to drop the tail.
func TestResolver_MultiFn_FourKeys(t *testing.T) {
	const code = `import {createFour} from '@ts-runtypes/core';
createFour<string>();
`
	r := setupInline(t, map[string]string{"runtypes.d.ts": multiFnDTS, "call.ts": code})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"call.ts"}})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	if len(resp.Sites) != 1 {
		t.Fatalf("expected 1 site, got %d (%+v)", len(resp.Sites), resp.Sites)
	}
	site := resp.Sites[0]

	want := []string{
		leafFnHash(t, "verr"),
		leafFnHash(t, "huk"),
		leafFnHash(t, "ces"),
		leafFnHash(t, "uke"),
	}
	if len(site.FnIds) != len(want) {
		t.Fatalf("expected %d fnIds, got %d (%+v)", len(want), len(site.FnIds), site.FnIds)
	}
	for i := range want {
		if site.FnIds[i] != want[i] {
			t.Errorf("FnIds[%d] = %q, want %q (declaration order verr, huk, ces, uke)", i, site.FnIds[i], want[i])
		}
	}
	// Scalar FnId mirrors FnIds[0] for byte-stable single-fn consumers.
	if site.FnId != want[0] {
		t.Errorf("scalar FnId = %q, want %q (mirror of FnIds[0])", site.FnId, want[0])
	}
	// Demand must request every named family so all four entry modules render.
	for _, fnKey := range []string{"verr", "huk", "ces", "uke"} {
		op, _ := operations.ByFnKey(fnKey)
		found := false
		for _, demand := range site.Demand {
			if demand.FamilyTag == op.FamilyTag {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("Demand is missing family %q", op.FamilyTag)
		}
	}
}

// TestResolver_MultiFn_FormEquivalence honors the marker-coverage rule: the
// static form createFour<string>() and the reflection form createFour(value)
// (T inferred from a value) resolve to the SAME structural id and the SAME
// ordered fnIds — the two call shapes are interchangeable for a multi-family
// marker exactly as they are for getRunTypeId.
func TestResolver_MultiFn_FormEquivalence(t *testing.T) {
	scan := func(code string) protocol.Site {
		r := setupInline(t, map[string]string{"runtypes.d.ts": multiFnDTS, "call.ts": code})
		resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"call.ts"}})
		if resp.Error != "" {
			t.Fatalf("scanFiles: %s", resp.Error)
		}
		if len(resp.Sites) != 1 {
			t.Fatalf("expected 1 site, got %d (%+v)", len(resp.Sites), resp.Sites)
		}
		return resp.Sites[0]
	}
	static := scan(`import {createFour} from '@ts-runtypes/core';
createFour<string>();
`)
	reflect := scan(`import {createFour} from '@ts-runtypes/core';
const s: string = 'hello';
createFour(s);
`)
	if static.ID != reflect.ID {
		t.Errorf("id mismatch: static %q vs reflection %q", static.ID, reflect.ID)
	}
	if len(static.FnIds) != len(reflect.FnIds) {
		t.Fatalf("fnIds length mismatch: static %d vs reflection %d", len(static.FnIds), len(reflect.FnIds))
	}
	for i := range static.FnIds {
		if static.FnIds[i] != reflect.FnIds[i] {
			t.Errorf("FnIds[%d] mismatch: static %q vs reflection %q", i, static.FnIds[i], reflect.FnIds[i])
		}
	}
}

// TestResolver_MultiFn_MionShape pins mion's interim route() marker verbatim:
// verr + jsonDecoder + jsonEncoder in one marker yields three distinct, ordered
// fnIds. This is the exact three-family combination mion forwards to
// createGetValidationErrorsFn / createJsonDecoderFn / createJsonEncoderFn, so it must
// keep resolving to three separate handles (a silent regression to fewer would
// mis-wire mion's routes).
func TestResolver_MultiFn_MionShape(t *testing.T) {
	const code = `import {createMion} from '@ts-runtypes/core';
createMion<{name: string}>();
`
	r := setupInline(t, map[string]string{"runtypes.d.ts": multiFnDTS, "call.ts": code})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"call.ts"}})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	if len(resp.Sites) != 1 {
		t.Fatalf("expected 1 site, got %d (%+v)", len(resp.Sites), resp.Sites)
	}
	site := resp.Sites[0]
	if len(site.FnIds) != 3 {
		t.Fatalf("expected 3 fnIds (verr, jsonDecoder, jsonEncoder), got %d (%+v)", len(site.FnIds), site.FnIds)
	}
	seen := map[string]bool{}
	for i, fnId := range site.FnIds {
		if fnId == "" {
			t.Errorf("FnIds[%d] is empty", i)
		}
		if seen[fnId] {
			t.Errorf("FnIds[%d] = %q is a duplicate — the three families must resolve to distinct handles", i, fnId)
		}
		seen[fnId] = true
	}
	// verr rides FnIds[0]; the two JSON families follow in declaration order.
	if want := leafFnHash(t, "verr"); site.FnIds[0] != want {
		t.Errorf("FnIds[0] = %q, want verr hash %q", site.FnIds[0], want)
	}
}

// TestResolver_MultiFn_DuplicateKey pins the duplicate-family rule: a marker
// that names the same family twice (InjectTypeFnArgs<T, 'verr', 'huk', 'verr'>)
// emits MKR006 (Error) naming the repeated key, and the injected fnIds are
// DEDUPED so the emitted output carries each family once.
func TestResolver_MultiFn_DuplicateKey(t *testing.T) {
	const code = `import {createDup} from '@ts-runtypes/core';
createDup<string>();
`
	r := setupInline(t, map[string]string{"runtypes.d.ts": multiFnDTS, "call.ts": code})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"call.ts"}})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}

	var dupDiag *diagnostics.Diagnostic
	for i := range resp.Diagnostics {
		if resp.Diagnostics[i].Code == diagnostics.CodeMarkerDuplicateFnKey {
			dupDiag = &resp.Diagnostics[i]
		}
	}
	if dupDiag == nil {
		t.Fatalf("expected an MKR006 duplicate-fn-key diagnostic, got %+v", resp.Diagnostics)
	}
	if dupDiag.Severity != diagnostics.SeverityError {
		t.Errorf("MKR006 severity = %v, want Error", dupDiag.Severity)
	}
	// The reported family is the FIRST REPEATED key ('verr'), NOT the first key
	// of the list ('huk') — pins first-repeated-key reporting, not first-key.
	if len(dupDiag.Args) != 1 || dupDiag.Args[0] != "verr" {
		t.Errorf("MKR006 args = %v, want [verr] (the first repeated family, not the first key 'huk')", dupDiag.Args)
	}

	// Injection still proceeds with the duplicate removed, first-occurrence order
	// preserved: huk, verr, ces (the trailing duplicate 'verr' dropped).
	if len(resp.Sites) != 1 {
		t.Fatalf("expected 1 site, got %d", len(resp.Sites))
	}
	want := []string{leafFnHash(t, "huk"), leafFnHash(t, "verr"), leafFnHash(t, "ces")}
	site := resp.Sites[0]
	if len(site.FnIds) != len(want) {
		t.Fatalf("expected deduped fnIds %v, got %+v", want, site.FnIds)
	}
	for i := range want {
		if site.FnIds[i] != want[i] {
			t.Errorf("deduped FnIds[%d] = %q, want %q", i, site.FnIds[i], want[i])
		}
	}
}
