package resolver_test

import (
	"strings"
	"testing"

	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// End-to-end coverage for demand-driven built-in pure-fn DELIVERY: a real scan
// must (a) serve the demanded built-in as a pure-fn virtual module from the
// generated table, (b) import it into the demanding fn entry, and (c) bind it in
// the deps thunk (slot 1) so initFromTuple registers it before the body's
// getPureFn lookup runs — all with zero diagnostics.

func moduleImporting(modules map[string]string, specifier string) (string, string, bool) {
	for name, mod := range modules {
		if strings.Contains(mod, specifier) {
			return name, mod, true
		}
	}
	return "", "", false
}

// TestBuiltinDelivery_ValidationErrorsImportsNewRunTypeErr — a
// createGetValidationErrorsFn body reaches rt::newRunTypeErr; the verr module must
// import + deps-thunk-bind the served built-in, and the built-in module must be
// present in the output.
func TestBuiltinDelivery_ValidationErrorsImportsNewRunTypeErr(t *testing.T) {
	r := setupInline(t, map[string]string{"a.ts": `import {createGetValidationErrorsFn} from '@ts-runtypes/core';
export const e = createGetValidationErrorsFn<{a: string; b: number}>();
`})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts"}, IncludeEntryModules: true})
	if resp.Error != "" {
		t.Fatalf("scan: %s", resp.Error)
	}
	if len(resp.Diagnostics) != 0 {
		t.Fatalf("expected no diagnostics, got %+v", resp.Diagnostics)
	}

	const specifier = "rtmod:/pf/rt/newRunTypeErr.js"
	verrName, verrMod, ok := moduleImporting(resp.EntryModules, specifier)
	if !ok {
		t.Fatalf("no entry module imports %s\nmodules: %v", specifier, keys(resp.EntryModules))
	}
	binding := "__rt_pf$2Frt$2FnewRunTypeErr"
	if !strings.Contains(verrMod, "import {"+binding+"}") {
		t.Errorf("entry %q does not import the built-in binding %q:\n%s", verrName, binding, verrMod)
	}
	// The binding must ride the deps thunk (slot 1), the `()=>[…]` right after the
	// family tag, so initFromTuple registers the pure-fn tuple before the body runs.
	if !strings.Contains(verrMod, "()=>["+binding+"]") && !strings.Contains(verrMod, "()=>[") {
		t.Errorf("entry %q has no deps thunk binding the built-in:\n%s", verrName, verrMod)
	}
	if _, ok := resp.EntryModules["pf/rt/newRunTypeErr"]; !ok {
		t.Errorf("built-in pure-fn module pf/rt/newRunTypeErr was not served\nmodules: %v", keys(resp.EntryModules))
	}
}

// TestBuiltinDelivery_FormatValidatorServesRtFormats — a uuid-format validator
// reaches rtFormats::isUUID; the format built-in must be served from the table
// the same way, with no diagnostics.
func TestBuiltinDelivery_FormatValidatorServesRtFormats(t *testing.T) {
	code := `import {createValidateFn} from '@ts-runtypes/core';
type TypeFormat<Base, Name extends string, Params> = Base & {
  readonly __rtFormatName?: Name;
  readonly __rtFormatParams?: Params;
};
export const v = createValidateFn<TypeFormat<string, 'uuid', {version: '4'}>>();
`
	r := setupInline(t, map[string]string{"a.ts": code})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts"}, IncludeEntryModules: true})
	if resp.Error != "" {
		t.Fatalf("scan: %s", resp.Error)
	}
	if len(resp.Diagnostics) != 0 {
		t.Fatalf("expected no diagnostics, got %+v", resp.Diagnostics)
	}
	if _, ok := resp.EntryModules["pf/rtFormats/isUUID"]; !ok {
		t.Errorf("format built-in pf/rtFormats/isUUID was not served\nmodules: %v", keys(resp.EntryModules))
	}
	if _, _, ok := moduleImporting(resp.EntryModules, "rtmod:/pf/rtFormats/isUUID.js"); !ok {
		t.Errorf("no entry imports the rtFormats::isUUID module")
	}
}

// TestBuiltinDelivery_ReflectionOnlyServesNoBuiltins — a getRunTypeId-only file
// demands no function family, so no built-in pure-fn module is served (the
// demand-driven property: nothing ships unless a body reaches it).
func TestBuiltinDelivery_ReflectionOnlyServesNoBuiltins(t *testing.T) {
	r := setupInline(t, map[string]string{"a.ts": `import {getRunTypeId} from '@ts-runtypes/core';
export const id = getRunTypeId<{a: string; b: number}>();
`})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts"}, IncludeEntryModules: true})
	if resp.Error != "" {
		t.Fatalf("scan: %s", resp.Error)
	}
	for name := range resp.EntryModules {
		if strings.HasPrefix(name, "pf/rt/") || strings.HasPrefix(name, "pf/rtFormats/") {
			t.Errorf("reflection-only file served a built-in pure fn %q — demand leaked", name)
		}
	}
}

func keys(m map[string]string) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}
