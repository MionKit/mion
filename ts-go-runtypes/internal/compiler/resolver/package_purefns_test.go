package resolver_test

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// End-to-end coverage for serving an INSTALLED package's pure fns: a consumer
// pure fn imports a library id whose `.d.ts` carries no literal, the library's
// compiled file (or its src) provides the body, and the consumer's module graph
// binds it like any other pure-fn dep.

const (
	libSlugifyID = "@acme/text#pf_slug00000000000"
	libTitleID   = "@acme/text#pf_title0000000000"
	libSlugMod   = "pf/@acme/text/slug00000000000"
	libTitleMod  = "pf/@acme/text/title0000000000"
	libSlugRow   = `[2,,,'` + libSlugifyID + `',['utl'],'return (s) => s.toLowerCase();',[]]`
	libTitleRow  = `[2,,,'` + libTitleID + `',['utl'],'return (s) => utl.getPureFn(\'` + libSlugifyID + `\')(s) + "!";',['` + libSlugifyID + `']]`
	libPackage   = `{"name":"@acme/text","types":"./dist/index.d.ts","exports":{".":{"types":"./dist/index.d.ts","default":"./dist/index.js"}}}`
	libDts       = `import type {PureFnId} from '@mionjs/run-types';
export declare const slugify: PureFnId<string>;
export declare const title: PureFnId<string>;
`
	consumerTS = `import {registerPureFnFactory} from '@mionjs/run-types';
import {title} from '@acme/text';
export const shout = registerPureFnFactory(function (utl) {
  return function _shout(s: string): string { return utl.getPureFn(title)(s).toUpperCase(); };
});
`
)

func builtTextLib(indexJS string) map[string]string {
	return map[string]string{
		"node_modules/@acme/text/package.json":    libPackage,
		"node_modules/@acme/text/dist/index.d.ts": libDts,
		"node_modules/@acme/text/dist/index.js":   indexJS,
	}
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

// TestPackagePureFns_ServedFromBuiltFiles — the library's dist carries the
// tuples: the consumer's pure fn gets the imported id lowered and the library's
// row, plus the row it depends on, served as modules in the consumer's graph.
func TestPackagePureFns_ServedFromBuiltFiles(t *testing.T) {
	resp := scanLibConsumer(t, builtTextLib(`import {registerPureFn} from '@mionjs/run-types';
const t1 = `+libSlugRow+`;
const t2 = `+libTitleRow+`;
export const slugify = registerPureFn(t1, '`+libSlugifyID+`');
export const title = registerPureFn(t2, '`+libTitleID+`');
`))
	if len(resp.Diagnostics) != 0 {
		t.Fatalf("expected no diagnostics, got %+v", resp.Diagnostics)
	}
	for _, mod := range []string{libTitleMod, libSlugMod} {
		if _, ok := resp.EntryModules[mod]; !ok {
			t.Errorf("library module %s was not served\nmodules: %v", mod, keys(resp.EntryModules))
		}
	}
	if served := resp.EntryModules[libTitleMod]; !strings.Contains(served, `(s) + "!";`) {
		t.Errorf("served body must come from the library's tuple: %s", served)
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
		t.Errorf("consumer module must import the served library module and carry the lowered id:\n%s", consumer)
	}
}

// TestPackagePureFns_ServedFromSource — the library's dist has no tuple (a
// plain tsc emit) but ships src/: the body is extracted from source.
func TestPackagePureFns_ServedFromSource(t *testing.T) {
	files := builtTextLib(`import {registerPureFn} from '@mionjs/run-types';
export const slugify = registerPureFn((s) => s.toLowerCase());
export const title = registerPureFn((s) => s + '!');
`)
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

// TestPackagePureFns_UnbuiltPackageWarns — an installed package with no
// compiled pure fn (and no src) is the runtime-only lane: the edge is reported
// once as PFE9016, the build goes on, and the dep stubs out as before.
func TestPackagePureFns_UnbuiltPackageWarns(t *testing.T) {
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
	// Nothing is served: the dep is a missing stub (kind 3), under the pure-fn
	// module name so the consumer's import of it resolves.
	if stub := resp.EntryModules[libTitleMod]; !strings.Contains(stub, "[3,,,'"+libTitleID+"']") {
		t.Errorf("an unbuilt package's id must stub out, got:\n%s", stub)
	}
}

// TestPackagePureFns_BuiltPackageLacksId — a built package that ships tuples
// but not the demanded one is a real miss: PFE9012, as for a built-in.
func TestPackagePureFns_BuiltPackageLacksId(t *testing.T) {
	resp := scanLibConsumer(t, map[string]string{
		"node_modules/@acme/text/package.json":    libPackage,
		"node_modules/@acme/text/dist/index.d.ts": "export declare const title: '" + libTitleID + "';\n",
		"node_modules/@acme/text/dist/index.js":   "const t1 = " + libSlugRow + ";\nexport const slugify = registerPureFn(t1, '" + libSlugifyID + "');\n",
	})
	if codes := codesOf(resp); len(codes) != 1 || codes[0] != diagnostics.CodeMissingPureFnDep {
		t.Fatalf("expected one PFE9012, got %+v", resp.Diagnostics)
	}
}

// Marker coverage rule: alongside the pure-fn edge, both getRunTypeId call
// shapes resolve to one cache entry.
func TestPackagePureFns_GetRunTypeIdShapesAgree(t *testing.T) {
	files := builtTextLib(`const t1 = ` + libSlugRow + `;
const t2 = ` + libTitleRow + `;
export const slugify = registerPureFn(t1, '` + libSlugifyID + `');
export const title = registerPureFn(t2, '` + libTitleID + `');
`)
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
