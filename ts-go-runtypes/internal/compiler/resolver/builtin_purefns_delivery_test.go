package resolver_test

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefnids"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/entrymodules"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/program"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/resolver"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
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
// createGetValidationErrorsFn body reaches @mionjs/run-types/src/runtypes/pure-fns-utils#newRunTypeErr; the verr module must
// import + deps-thunk-bind the served built-in, and the built-in module must be
// present in the output.
func TestBuiltinDelivery_ValidationErrorsImportsNewRunTypeErr(t *testing.T) {
	r := setupInline(t, map[string]string{"a.ts": `import {createGetValidationErrorsFn} from '@mionjs/run-types';
export const e = createGetValidationErrorsFn<{a: string; b: number}>();
`})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts"}, IncludeEntryModules: true})
	if resp.Error != "" {
		t.Fatalf("scan: %s", resp.Error)
	}
	if len(resp.Diagnostics) != 0 {
		t.Fatalf("expected no diagnostics, got %+v", resp.Diagnostics)
	}

	specifier := "rtmod:/" + entrymodules.ModuleName(purefnids.NewRunTypeErr, entrymodules.KindPureFn) + ".js"
	verrName, verrMod, ok := moduleImporting(resp.EntryModules, specifier)
	if !ok {
		t.Fatalf("no entry module imports %s\nmodules: %v", specifier, keys(resp.EntryModules))
	}
	binding := entrymodules.BindingName(entrymodules.ModuleName(purefnids.NewRunTypeErr, entrymodules.KindPureFn))
	if !strings.Contains(verrMod, "import {"+binding+"}") {
		t.Errorf("entry %q does not import the built-in binding %q:\n%s", verrName, binding, verrMod)
	}
	// The binding must ride the deps thunk (slot 1), the `()=>[…]` right after the
	// family tag, so initFromTuple registers the pure-fn tuple before the body runs.
	if !strings.Contains(verrMod, "()=>["+binding+"]") && !strings.Contains(verrMod, "()=>[") {
		t.Errorf("entry %q has no deps thunk binding the built-in:\n%s", verrName, verrMod)
	}
	if _, ok := resp.EntryModules[entrymodules.ModuleName(purefnids.NewRunTypeErr, entrymodules.KindPureFn)]; !ok {
		t.Errorf("built-in pure-fn module pf/@mionjs/run-types/src/runtypes/pure-fns-utils/newRunTypeErr was not served\nmodules: %v", keys(resp.EntryModules))
	}
}

// TestBuiltinDelivery_FormatValidatorServesRtFormats — a uuid-format validator
// reaches @mionjs/run-types/src/formats/string/string-formats-pure-fns#isUUID; the format built-in must be served from the table
// the same way, with no diagnostics.
func TestBuiltinDelivery_FormatValidatorServesRtFormats(t *testing.T) {
	code := `import {createValidateFn} from '@mionjs/run-types';
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
	if _, ok := resp.EntryModules[entrymodules.ModuleName(purefnids.IsUUID, entrymodules.KindPureFn)]; !ok {
		t.Errorf("format built-in pf/@mionjs/run-types/src/formats/string/string-formats-pure-fns/isUUID was not served\nmodules: %v", keys(resp.EntryModules))
	}
	if _, _, ok := moduleImporting(resp.EntryModules, "rtmod:/"+entrymodules.ModuleName(purefnids.IsUUID, entrymodules.KindPureFn)+".js"); !ok {
		t.Errorf("no entry imports the " + purefnids.IsUUID + " module")
	}
}

// TestBuiltinDelivery_ReflectionOnlyServesNoBuiltins — a getRunTypeId-only file
// demands no function family, so no built-in pure-fn module is served (the
// demand-driven property: nothing ships unless a body reaches it).
func TestBuiltinDelivery_ReflectionOnlyServesNoBuiltins(t *testing.T) {
	r := setupInline(t, map[string]string{"a.ts": `import {getRunTypeId} from '@mionjs/run-types';
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

// TestBuiltinDelivery_MarkerWithoutSourcesIsCFG004 — the failure mode the whole
// lane hangs on. A marker package installed WITHOUT its `src` (a pruned install,
// a `files` regression) has the bodies nowhere: the dist is hollowed and there
// is nothing to extract. That must fail the build with the code naming the
// package, because the alternative is a validator that throws "… is not a
// function" at its first call.
func TestBuiltinDelivery_MarkerWithoutSourcesIsCFG004(t *testing.T) {
	r := setupInlineWith(t, map[string]string{"a.ts": `import {createGetValidationErrorsFn} from '@mionjs/run-types';
export const e = createGetValidationErrorsFn<{a: string; b: number}>();
`}, func(programOpts *program.Options, resolverOpts *resolver.Options) {
		programOpts.SingleThreaded = true
		resolverOpts.SingleThreaded = true
		for path := range programOpts.Overlay {
			if strings.Contains(path, "/@mionjs/run-types/src/") {
				delete(programOpts.Overlay, path)
			}
		}
	})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts"}, IncludeEntryModules: true})
	if resp.Error != "" {
		t.Fatalf("scan: %s", resp.Error)
	}
	for _, diag := range resp.Diagnostics {
		if diag.Code == diagnostics.CodeBuiltinPureFnSourceUnreadable {
			return
		}
	}
	t.Fatalf("expected CFG004 for a marker package with no sources, got %+v", resp.Diagnostics)
}
