package resolver_test

import (
	"testing"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/resolver"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// A dependency's own package.json decides where its type definitions live, and the resolver
// follows it: it never guesses a directory (tsgo owns the whole lookup, program.New/NewInferred
// adopt the parsed CompilerOptions wholesale). Every layout here resolves with NO
// customConditions, through `exports`/`types` alone, which is what lets the mion packages stop
// publishing src.

const layoutDeclaration = `export interface LayoutUser { id: string; name: string; age: number }
`

// Both getRunTypeId shapes (marker coverage rule) plus a createValidateFn site, so a function-cache entry is demanded.
const layoutConsumer = `import {getRunTypeId, createValidateFn} from '@mionjs/run-types';
import type {LayoutUser} from '@dep/models';

// static getRunTypeId<T>()
getRunTypeId<LayoutUser>();

// value-first getRunTypeId(value)
declare const sample: LayoutUser;
getRunTypeId(sample);

export const validateUser = createValidateFn<LayoutUser>();
`

func TestTypeDefinitionLayouts_ResolveFromThePackageManifest(t *testing.T) {
	for _, layout := range []struct {
		name        string
		packageJSON string
		declAt      string
	}{
		{
			name:        "definitions in dist",
			packageJSON: `{"name":"@dep/models","types":"./dist/index.d.ts","exports":{".":{"types":"./dist/index.d.ts","default":"./dist/index.js"}}}`,
			declAt:      "dist/index.d.ts",
		},
		{
			// A package that keeps its definitions under src/ and says so; `src` is not special to the resolver.
			name:        "definitions in src",
			packageJSON: `{"name":"@dep/models","types":"./src/index.d.ts","exports":{".":{"types":"./src/index.d.ts","default":"./dist/index.js"}}}`,
			declAt:      "src/index.d.ts",
		},
		{
			name:        "flat exports entry",
			packageJSON: `{"name":"@dep/models","exports":{".":"./index.d.ts"}}`,
			declAt:      "index.d.ts",
		},
		{
			// No `exports` at all — the pre-exports layout npm still serves.
			name:        "types field only",
			packageJSON: `{"name":"@dep/models","types":"./typings/index.d.ts","main":"./index.js"}`,
			declAt:      "typings/index.d.ts",
		},
	} {
		t.Run(layout.name, func(t *testing.T) {
			resp := scanOverDependencyLayout(t, layout.packageJSON, layout.declAt)

			if got := mkr007Count(resp); got != 0 {
				t.Fatalf("the dependency's definitions did not resolve — %d MKR007 diagnostic(s): %+v", got, resp.Diagnostics)
			}
			if len(resp.Sites) != 3 {
				t.Fatalf("want 3 marker sites (2 getRunTypeId shapes + createValidateFn), got %d: %+v", len(resp.Sites), resp.Sites)
			}

			byID := kindByID(resp)
			for _, site := range resp.Sites {
				if kind := byID[site.ID]; kind != reflection.KindObjectLiteral {
					t.Errorf("site %s resolved to kind %d, want %d (ObjectLiteral)", site.ID, kind, reflection.KindObjectLiteral)
				}
			}

			// Marker coverage rule: the two getRunTypeId shapes must agree on one reflection id.
			var reflectIDs []string
			for _, site := range resp.Sites {
				if site.FnId == "" {
					reflectIDs = append(reflectIDs, site.ID)
				}
			}
			if len(reflectIDs) != 2 {
				t.Fatalf("want 2 reflection getRunTypeId sites, got %d", len(reflectIDs))
			}
			if reflectIDs[0] != reflectIDs[1] {
				t.Errorf("static vs value-first getRunTypeId(LayoutUser) diverged: %q vs %q", reflectIDs[0], reflectIDs[1])
			}
		})
	}
}

// Writes @dep/models to a temp dir in the given layout, then scans a consumer under a tsconfig with no conditions.
func scanOverDependencyLayout(t *testing.T, packageJSON, declAt string) protocol.Response {
	t.Helper()
	dir := tspath.NormalizePath(t.TempDir())

	writeDisk(t, tspath.ResolvePath(dir, "tsconfig.json"), tsconfigNoConditions)
	writeDisk(t, tspath.ResolvePath(dir, "node_modules/@dep/models/package.json"), packageJSON)
	writeDisk(t, tspath.ResolvePath(dir, "node_modules/@dep/models/"+declAt), layoutDeclaration)

	r := resolver.NewServer(resolver.Options{Cwd: dir, TsconfigPath: "tsconfig.json", SingleThreaded: true})
	t.Cleanup(r.Close)

	if resp := r.Dispatch(protocol.Request{
		Op:      protocol.OpSetSources,
		Sources: withRealMarker(t, map[string]string{"consumer.ts": layoutConsumer}),
	}); resp.Error != "" {
		t.Fatalf("setSources: %s", resp.Error)
	}
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"consumer.ts"}, IncludeRunTypes: true})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	return resp
}
