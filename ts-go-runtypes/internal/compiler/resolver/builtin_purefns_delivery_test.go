package resolver_test

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefnids"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/entrymodules"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/program"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/resolver"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
	"github.com/mionkit/mion/ts-go-runtypes/internal/testfixtures"

	"github.com/microsoft/typescript-go/shim/tspath"
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

// markerBuild drops the named parts of the marker install, so a test can say where the built-in
// bodies came from. The base fixture is the CONSUMER INSTALL; addSources layers the workspace's src/ back in.
func markerBuild(t *testing.T, addSources bool, dropSegments ...string) protocol.Response {
	t.Helper()
	r := setupInlineWith(t, map[string]string{"a.ts": `import {createGetValidationErrorsFn} from '@mionjs/run-types';
export const e = createGetValidationErrorsFn<{a: string; b: number}>();
`}, func(programOpts *program.Options, resolverOpts *resolver.Options) {
		programOpts.SingleThreaded = true
		resolverOpts.SingleThreaded = true
		if addSources {
			sources, err := testfixtures.RealMarkerSources()
			if err != nil {
				t.Fatalf("marker sources: %v", err)
			}
			for rel, content := range sources {
				programOpts.Overlay[tspath.ResolvePath(programOpts.Cwd, rel)] = content
			}
		}
		for path := range programOpts.Overlay {
			for _, segment := range dropSegments {
				if strings.Contains(path, segment) {
					delete(programOpts.Overlay, path)
				}
			}
		}
	})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts"}, IncludeEntryModules: true})
	if resp.Error != "" {
		t.Fatalf("scan: %s", resp.Error)
	}
	return resp
}

// An install with the artifact and no src serves the built-ins, which is every install: the tarball has no sources.
func TestBuiltinDelivery_ArtifactServesWithoutSources(t *testing.T) {
	resp := markerBuild(t, false)
	for _, diag := range resp.Diagnostics {
		if diag.Code == diagnostics.CodePureFnDepUnbuilt || diag.Code == diagnostics.CodeMissingPureFnDep {
			t.Fatalf("the artifact must serve the built-ins on its own, got %s %v", diag.Code, diag.Args)
		}
	}
	var served bool
	for name := range resp.EntryModules {
		if strings.HasPrefix(name, "pf/") {
			served = true
		}
	}
	if !served {
		t.Fatalf("no pure-fn module served, got %v", keys(resp.EntryModules))
	}
}

// The mirror, and what the WORKSPACE relies on: with sources and no artifact the package is
// scanned for its registrations like any unbuilt dependency, so a sibling compiles against a
// run-types that has never been built.
func TestBuiltinDelivery_SourcesServeWithoutArtifact(t *testing.T) {
	resp := markerBuild(t, true, "/"+constants.PureFnArtifactDir+"/")
	for _, diag := range resp.Diagnostics {
		if diag.Code == diagnostics.CodePureFnDepUnbuilt || diag.Code == diagnostics.CodeMissingPureFnDep {
			t.Fatalf("the sources must still serve the built-ins, got %s %v", diag.Code, diag.Args)
		}
	}
	for name := range resp.EntryModules {
		if strings.HasPrefix(name, "pf/") {
			return
		}
	}
	t.Fatalf("no pure-fn module served, got %v", keys(resp.EntryModules))
}

// With neither artifact nor sources the bodies are nowhere (the dist is hollowed), so the build must fail
// naming the package; the alternative is a validator that throws at its first call.
func TestBuiltinDelivery_MarkerWithNothingToServeFails(t *testing.T) {
	resp := markerBuild(t, false, "/"+constants.PureFnArtifactDir+"/")
	for _, diag := range resp.Diagnostics {
		if diag.Code == diagnostics.CodePureFnDepUnbuilt {
			return
		}
	}
	t.Fatalf("expected PFE9016 for a marker package with nothing to serve, got %+v", resp.Diagnostics)
}
