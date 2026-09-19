package resolver_test

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefnindex"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefunctions"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/entrymodules"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// End-to-end coverage for serving an INSTALLED package's pure fns: a consumer
// pure fn imports a library id whose `.d.ts` carries no literal, the library's
// artifact (or its src) provides the body, and the consumer's module graph
// binds it like any other pure-fn dep.

const (
	libSlugifyID = "@acme/text#pf_slug00000000000"
	libTitleID   = "@acme/text#pf_title0000000000"
	libSlugMod   = "pf/@acme/text/slug00000000000"
	libTitleMod  = "pf/@acme/text/title0000000000"
	libPackage   = `{"name":"@acme/text","types":"./dist/index.d.ts","exports":{".":{"types":"./dist/index.d.ts","default":"./dist/index.js"}}}`
	libDts       = `import type {PureFnId} from '@mionjs/run-types';
export declare const slugify: PureFnId<string>;
export declare const title: PureFnId<string>;
`
	// The hollowed registrations a library ships when its bodies travel on the
	// artifact; a bundle that inlined the tuples would work the same, unread.
	libIndexJS = `import {registerPureFn} from '@mionjs/run-types';
export const slugify = registerPureFn(null);
export const title = registerPureFn(null);
`
	libArtifactDir = "node_modules/@acme/text/dist/" + constants.PureFnArtifactDir
	libIndexPath   = libArtifactDir + "/" + constants.PureFnArtifactIndexFile
	consumerTS     = `import {registerPureFnFactory} from '@mionjs/run-types';
import {title} from '@acme/text';
export const shout = registerPureFnFactory(function (utl) {
  return function _shout(s: string): string { return utl.getPureFn(title)(s).toUpperCase(); };
});
`
)

var (
	libSlugEntry  = purefunctions.Entry{ID: libSlugifyID, BindingName: "slugify", FilePath: "src/index.ts", ParamNames: []string{"utl"}, Code: "return (s) => s.toLowerCase();"}
	libTitleEntry = purefunctions.Entry{ID: libTitleID, BindingName: "title", FilePath: "src/index.ts", ParamNames: []string{"utl"}, Code: `return (s) => utl.getPureFn('` + libSlugifyID + `')(s) + "!";`, PureFnDependencies: []string{libSlugifyID}}
)

// libArtifact is the artifact directory a mion build of the library writes
// under dir: the index plus one cache module per entry, rendered by the real
// renderer in the library's emit mode.
func libArtifact(dir string, mode constants.EmitMode, entries ...purefunctions.Entry) map[string]string {
	rows := make([]purefnindex.ArtifactIndexRow, 0, len(entries))
	for _, entry := range entries {
		rows = append(rows, purefnindex.ArtifactIndexRow{ID: entry.ID, BindingName: entry.BindingName, File: entry.FilePath})
	}
	payload, err := json.MarshalIndent(purefnindex.ArtifactIndex{Format: purefnindex.ArtifactFormat, Package: "@acme/text", PureFns: rows}, "", "  ")
	if err != nil {
		panic(err)
	}
	files := map[string]string{dir + "/" + constants.PureFnArtifactIndexFile: string(payload) + "\n"}
	graph := purefunctions.CollectEntries(entries, mode)
	graph.AddMissingStubs(nil)
	modules, err := entrymodules.RenderGrouped(graph, nil)
	if err != nil {
		panic(err)
	}
	for _, entry := range entries {
		files[dir+"/"+purefnindex.ModulePath(entry.ID)] = modules[entrymodules.ModuleName(entry.ID, entrymodules.KindPureFn)]
	}
	return files
}

func builtTextLib(artifact map[string]string) map[string]string {
	files := map[string]string{
		"node_modules/@acme/text/package.json":    libPackage,
		"node_modules/@acme/text/dist/index.d.ts": libDts,
		"node_modules/@acme/text/dist/index.js":   libIndexJS,
	}
	for path, content := range artifact {
		files[path] = content
	}
	return files
}

func scanLibConsumer(t *testing.T, files map[string]string) protocol.Response {
	t.Helper()
	files["a.ts"] = consumerTS
	r := setupInline(t, files)
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts"}, IncludeEntryModules: true})
	if resp.Error != "" {
		t.Fatalf("scan: %s", resp.Error)
	}
	return resp
}

// TestPackagePureFns_ServedFromArtifact — the library's dist carries the
// artifact directory: the consumer's pure fn gets the imported id lowered and
// the library's row, plus the row it depends on, served as modules in the
// consumer's graph. The library's JS is hollow, so the artifact is the only
// place the bodies exist. A library built in `functions` mode (a live factory,
// no code string) serves the same body into this code-mode consumer.
func TestPackagePureFns_ServedFromArtifact(t *testing.T) {
	for _, mode := range []constants.EmitMode{constants.EmitCode, constants.EmitFunctions} {
		resp := scanLibConsumer(t, builtTextLib(libArtifact(libArtifactDir, mode, libSlugEntry, libTitleEntry)))
		if len(resp.Diagnostics) != 0 {
			t.Fatalf("%s: expected no diagnostics, got %+v", mode, resp.Diagnostics)
		}
		for _, mod := range []string{libTitleMod, libSlugMod} {
			if _, ok := resp.EntryModules[mod]; !ok {
				t.Errorf("%s: library module %s was not served\nmodules: %v", mode, mod, keys(resp.EntryModules))
			}
		}
		if served := resp.EntryModules[libTitleMod]; !strings.Contains(served, `(s) + "!";`) {
			t.Errorf("%s: served body must come from the library's artifact: %s", mode, served)
		}
		// The consumer's own id has no package half (the fixture cwd is nameless),
		// so its module is the one pure-fn module outside the library's prefix.
		consumer := ""
		for name, mod := range resp.EntryModules {
			if strings.HasPrefix(name, "pf/") && !strings.HasPrefix(name, "pf/@acme/text/") {
				consumer = mod
			}
		}
		if !strings.Contains(consumer, "rtmod:/"+libTitleMod+".js") || !strings.Contains(consumer, `getPureFn(\'`+libTitleID+`\')`) {
			t.Errorf("%s: consumer module must import the served library module and carry the lowered id:\n%s", mode, consumer)
		}
	}
}

// TestPackagePureFns_BundleTuplesAreNotRead — a library whose bundle inlines
// the tuples and the `registerPureFn(<tuple>, '<id>')` registrations but ships
// no artifact is unbuilt: nothing is read out of the bundle.
func TestPackagePureFns_BundleTuplesAreNotRead(t *testing.T) {
	files := builtTextLib(nil)
	files["node_modules/@acme/text/dist/index.d.ts"] = "export declare const title: '" + libTitleID + "';\n"
	files["node_modules/@acme/text/dist/index.js"] = `import {registerPureFn} from '@mionjs/run-types';
const t1 = [2,,,'` + libSlugifyID + `',['utl'],'return (s) => s.toLowerCase();',[]];
const t2 = [2,,,'` + libTitleID + `',['utl'],'return (s) => s;',['` + libSlugifyID + `']];
export const slugify = registerPureFn(t1, '` + libSlugifyID + `');
export const title = registerPureFn(t2, '` + libTitleID + `');
`
	resp := scanLibConsumer(t, files)
	if codes := codesOf(resp); len(codes) != 1 || codes[0] != diagnostics.CodePureFnDepUnbuilt {
		t.Fatalf("expected one PFE9016, got %+v", resp.Diagnostics)
	}
	if _, served := resp.EntryModules[libSlugMod]; served {
		t.Error("a body read out of the bundle was served")
	}
}

// TestPackagePureFns_ServedFromSource — the library ships no artifact (a
// plain tsc emit) but ships src/: the body is extracted from source.
func TestPackagePureFns_ServedFromSource(t *testing.T) {
	files := builtTextLib(nil)
	files["node_modules/@acme/text/dist/index.js"] = `import {registerPureFn} from '@mionjs/run-types';
export const slugify = registerPureFn((s) => s.toLowerCase());
export const title = registerPureFn((s) => s + '!');
`
	files["node_modules/@acme/text/src/slug.ts"] = `import {registerPureFn, registerPureFnFactory} from '@mionjs/run-types';
export const slugify = registerPureFn((s: string): string => s.toLowerCase());
export const title = registerPureFnFactory(function (utl) {
  return function _title(s: string): string { return utl.getPureFn(slugify)(s) + '!'; };
});
`
	resp := scanLibConsumer(t, files)
	if len(resp.Diagnostics) != 0 {
		t.Fatalf("expected no diagnostics, got %+v", resp.Diagnostics)
	}
	// The ids are hashes the extraction produced, so the two served modules are
	// found by their package prefix: one carries the lowered dep, the other is it.
	var served []string
	for name, mod := range resp.EntryModules {
		if strings.HasPrefix(name, "pf/@acme/text/") {
			served = append(served, mod)
		}
	}
	if len(served) != 2 {
		t.Fatalf("expected title and slugify served from src, got modules: %v", keys(resp.EntryModules))
	}
	if !strings.Contains(served[0]+served[1], `getPureFn(\'@acme/text#`) {
		t.Errorf("title must be served from src with its dep lowered:\n%s\n%s", served[0], served[1])
	}
}

// TestPackagePureFns_UnbuiltPackageErrors — an installed package with no
// artifact directory (and no src) cannot serve the body: the edge is reported
// once as the error PFE9016, and the dep stubs out.
func TestPackagePureFns_UnbuiltPackageErrors(t *testing.T) {
	resp := scanLibConsumer(t, map[string]string{
		"node_modules/@acme/text/package.json":    libPackage,
		"node_modules/@acme/text/dist/index.d.ts": libDts,
		"node_modules/@acme/text/dist/index.js":   "export const title = registerPureFn(null, '" + libTitleID + "');\n",
	})
	// The .d.ts carries no literal and the package has no binding to resolve
	// it through, so the consumer's dep arg is unreadable (PFE9013, plus the
	// closure capture it can no longer exempt) as before; a literal-typed .d.ts
	// (the run-types shape) reaches the serve step.
	if codes := codesOf(resp); !strings.Contains(strings.Join(codes, " "), diagnostics.CodePurityDepNotLiteral) {
		t.Fatalf("expected a PFE9013, got %v", codes)
	}
	typed := map[string]string{
		"node_modules/@acme/text/package.json":    libPackage,
		"node_modules/@acme/text/dist/index.d.ts": "export declare const title: '" + libTitleID + "';\n",
		"node_modules/@acme/text/dist/index.js":   "export const title = registerPureFn((s) => s, '" + libTitleID + "');\n",
	}
	resp = scanLibConsumer(t, typed)
	if codes := codesOf(resp); len(codes) != 1 || codes[0] != diagnostics.CodePureFnDepUnbuilt {
		t.Fatalf("expected one PFE9016, got %+v", resp.Diagnostics)
	}
	if args := resp.Diagnostics[0].Args; len(args) != 2 || args[0] != libTitleID || args[1] != "@acme/text" {
		t.Errorf("PFE9016 must name the id and the package, got %v", args)
	}
	if resp.Diagnostics[0].Severity != diagnostics.SeverityError {
		t.Errorf("an unbuilt package is an error, got %d", resp.Diagnostics[0].Severity)
	}
	// Nothing is served: the dep is a missing stub (kind 3), under the pure-fn
	// module name so the consumer's import of it resolves.
	if stub := resp.EntryModules[libTitleMod]; !strings.Contains(stub, "[3,,,'"+libTitleID+"']") {
		t.Errorf("an unbuilt package's id must stub out, got:\n%s", stub)
	}
}

// TestPackagePureFns_BuiltPackageLacksId — a package whose artifact holds rows
// but not the demanded one is a real miss: PFE9012, as for a built-in.
func TestPackagePureFns_BuiltPackageLacksId(t *testing.T) {
	files := builtTextLib(libArtifact(libArtifactDir, constants.EmitCode, libSlugEntry))
	files["node_modules/@acme/text/dist/index.d.ts"] = "export declare const title: '" + libTitleID + "';\n"
	resp := scanLibConsumer(t, files)
	if codes := codesOf(resp); len(codes) != 1 || codes[0] != diagnostics.CodeMissingPureFnDep {
		t.Fatalf("expected one PFE9012, got %+v", resp.Diagnostics)
	}
}

// TestPackagePureFns_ArtifactConflictIsAnError — an ESM and a CJS artifact
// directory of one package disagreeing on a demanded body fail the build,
// naming the id and both modules; the first read is still served so the graph
// stays whole.
func TestPackagePureFns_ArtifactConflictIsAnError(t *testing.T) {
	stale := libTitleEntry
	stale.Code = "return (s) => s;"
	cjsDir := "node_modules/@acme/text/dist/cjs/" + constants.PureFnArtifactDir
	files := builtTextLib(libArtifact(libArtifactDir, constants.EmitCode, libSlugEntry, libTitleEntry))
	for path, content := range libArtifact(cjsDir, constants.EmitCode, libSlugEntry, stale) {
		files[path] = content
	}
	resp := scanLibConsumer(t, files)
	if codes := codesOf(resp); len(codes) != 1 || codes[0] != diagnostics.CodePureFnArtifactConflict {
		t.Fatalf("expected one PFE9018, got %+v", resp.Diagnostics)
	}
	args := resp.Diagnostics[0].Args
	module := purefnindex.ModulePath(libTitleID)
	if len(args) != 3 || args[0] != libTitleID || !strings.HasSuffix(args[1], libArtifactDir+"/"+module) || !strings.HasSuffix(args[2], cjsDir+"/"+module) {
		t.Errorf("PFE9018 must name the id and both modules, got %v", args)
	}
	if resp.Diagnostics[0].Severity != diagnostics.SeverityError {
		t.Errorf("a conflict is an error, got %d", resp.Diagnostics[0].Severity)
	}
	if served := resp.EntryModules[libTitleMod]; !strings.Contains(served, `(s) + "!";`) {
		t.Errorf("the first copy read is served: %s", served)
	}
}

// TestPackagePureFns_NewerArtifactWarns — an index from a newer compiler is
// skipped with PFE9017 naming the file and the reason, and the package then
// reads as unbuilt (PFE9016), never as a silently served guess.
func TestPackagePureFns_NewerArtifactWarns(t *testing.T) {
	files := builtTextLib(libArtifact(libArtifactDir, constants.EmitCode, libSlugEntry, libTitleEntry))
	files[libIndexPath] = strings.Replace(files[libIndexPath], `"format": 1`, `"format": 7`, 1)
	files["node_modules/@acme/text/dist/index.d.ts"] = "export declare const title: '" + libTitleID + "';\n"
	resp := scanLibConsumer(t, files)
	codes := codesOf(resp)
	if len(codes) != 2 || codes[0] != diagnostics.CodePureFnArtifactUnreadable || codes[1] != diagnostics.CodePureFnDepUnbuilt {
		t.Fatalf("expected PFE9017 then PFE9016, got %+v", resp.Diagnostics)
	}
	args := resp.Diagnostics[0].Args
	if len(args) != 2 || !strings.HasSuffix(args[0], libIndexPath) || !strings.Contains(args[1], "newer artifact format 7") {
		t.Errorf("PFE9017 must name the file and the reason, got %v", args)
	}
}

// Marker coverage rule: alongside the pure-fn edge, both getRunTypeId call
// shapes resolve to one cache entry.
func TestPackagePureFns_GetRunTypeIdShapesAgree(t *testing.T) {
	files := builtTextLib(libArtifact(libArtifactDir, constants.EmitCode, libSlugEntry, libTitleEntry))
	files["static.ts"] = `import {getRunTypeId} from '@mionjs/run-types';
getRunTypeId<{slug: string}>();
`
	files["reflect.ts"] = `import {getRunTypeId} from '@mionjs/run-types';
const value: {slug: string} = {slug: 'x'};
getRunTypeId(value);
`
	r := setupInline(t, files)
	a := resolveFile(t, r, "static.ts")
	b := resolveFile(t, r, "reflect.ts")
	if a.ID == "" || a.ID != b.ID {
		t.Errorf("getRunTypeId<T>() and getRunTypeId(value) must agree: %q vs %q", a.ID, b.ID)
	}
}
