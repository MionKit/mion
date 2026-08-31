package resolver_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-runtypes/internal/compiler/resolver"
	"github.com/mionkit/ts-runtypes/internal/diagnostics"
	"github.com/mionkit/ts-runtypes/internal/protocol"
	"github.com/mionkit/ts-runtypes/internal/reflection"
)

// The inline-server (ESLint / lint) path builds an inferred Program per
// setSources request. Before the tsconfig-fidelity fix it applied no
// customConditions, so a cross-package type behind a `source` export condition
// (the source-resolved monorepo dev setup, dist unbuilt) collapsed to `any` —
// emitting false-positive MKR007 at lint time only, while the build resolved it.
//
// These tests drive the REAL server path (NewServer -> OpSetSources ->
// dispatchSetSources -> ParseInferredConfig), NOT setupInline (which
// pre-builds via NewInferred and would bypass discovery). The tsconfig and the
// cross-package dependency live on REAL disk (production: tsconfig + node_modules
// on disk, the linted buffer in the setSources overlay); only the consumer buffer
// and the @mionjs/run-types ambient ride the overlay.

// @app/models is a SEPARATE cross-package type provider whose only resolvable
// entry sits behind the `source` condition; its `import`/default entry points at
// an unbuilt dist that does not exist (the mion "dist not built" shape). Without
// customConditions:["source"] the import degrades to `any`.
const crossPkgJSON = `{"name":"@app/models","exports":{".":{"source":"./src/index.ts","import":"./dist/index.js"}}}`
const crossPkgSrc = `export interface CrossPkgUser { id: string; name: string; age: number }
`

// consumerSrc covers BOTH getRunTypeId call shapes (marker coverage rule) plus a
// createValidateFn<CrossPkgType>() site — the exact mion repro shape.
const consumerSrc = `import {getRunTypeId, createValidateFn} from '@mionjs/run-types';
import type {CrossPkgUser} from '@app/models';

// static getRunTypeId<T>()
getRunTypeId<CrossPkgUser>();

// value-first getRunTypeId(value)
declare const sample: CrossPkgUser;
getRunTypeId(sample);

// createValidateFn<CrossPkgType>() — the site that produced 59 MKR007 in mion
export const validateUser = createValidateFn<CrossPkgUser>();
`

const tsconfigWithSource = `{
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "bundler",
    "target": "ESNext",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "customConditions": ["source"],
    "types": []
  }
}`

const tsconfigNoConditions = `{
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "bundler",
    "target": "ESNext",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": []
  }
}`

func writeDisk(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir %s: %v", filepath.Dir(path), err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}

// scanConsumerOverSourceCondition writes the @app/models dependency (and, when
// tsconfig is non-empty, the tsconfig) to a real temp dir, opens a server-mode
// session pointed at it, installs the consumer + @mionjs/run-types ambient via
// setSources, and scans the consumer. Returns the scan response.
func scanConsumerOverSourceCondition(t *testing.T, tsconfig string) protocol.Response {
	t.Helper()
	dir := tspath.NormalizePath(t.TempDir())

	tsconfigPath := ""
	if tsconfig != "" {
		writeDisk(t, tspath.ResolvePath(dir, "tsconfig.json"), tsconfig)
		tsconfigPath = "tsconfig.json"
	}
	writeDisk(t, tspath.ResolvePath(dir, "node_modules/@app/models/package.json"), crossPkgJSON)
	writeDisk(t, tspath.ResolvePath(dir, "node_modules/@app/models/src/index.ts"), crossPkgSrc)

	r := resolver.NewServer(resolver.Options{Cwd: dir, TsconfigPath: tsconfigPath, SingleThreaded: true})
	t.Cleanup(r.Close)

	if resp := r.Dispatch(protocol.Request{
		Op:      protocol.OpSetSources,
		Sources: withRealMarker(t, map[string]string{"consumer.ts": consumerSrc}),
	}); resp.Error != "" {
		t.Fatalf("setSources: %s", resp.Error)
	}
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"consumer.ts"}, IncludeRunTypes: true})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	return resp
}

func kindByID(resp protocol.Response) map[string]reflection.ReflectionKind {
	byID := make(map[string]reflection.ReflectionKind, len(resp.RunTypes))
	for _, rt := range resp.RunTypes {
		byID[rt.ID] = rt.Kind
	}
	return byID
}

func mkr007Count(resp protocol.Response) int {
	count := 0
	for _, diagnostic := range resp.Diagnostics {
		if diagnostic.Code == diagnostics.CodeMarkerAnyFromUnresolvedImport {
			count++
		}
	}
	return count
}

// TestInlineServer_SourceCondition_ResolvesCrossPackage — with the project's
// customConditions:["source"] threaded in, the cross-package marker resolves to
// the real type: no MKR007, every site an ObjectLiteral, and the two
// getRunTypeId forms share one reflection id.
func TestInlineServer_SourceCondition_ResolvesCrossPackage(t *testing.T) {
	resp := scanConsumerOverSourceCondition(t, tsconfigWithSource)

	if got := mkr007Count(resp); got != 0 {
		t.Fatalf("customConditions:[source] must resolve @app/models — got %d MKR007 diagnostic(s): %+v", got, resp.Diagnostics)
	}
	if len(resp.Sites) != 3 {
		t.Fatalf("want 3 marker sites (2 getRunTypeId shapes + createValidateFn), got %d: %+v", len(resp.Sites), resp.Sites)
	}

	byID := kindByID(resp)
	for _, site := range resp.Sites {
		if byID[site.ID] != reflection.KindObjectLiteral {
			t.Errorf("site %q resolved to kind %d, want %d (ObjectLiteral) — CrossPkgUser did not resolve through the source condition",
				site.ID, byID[site.ID], reflection.KindObjectLiteral)
		}
	}

	// createValidateFn is a function-family marker (carries an fnId); the two
	// getRunTypeId sites are reflection-only (empty fnId).
	var reflectIDs []string
	fnSites := 0
	for _, site := range resp.Sites {
		if site.FnId == "" {
			reflectIDs = append(reflectIDs, site.ID)
		} else {
			fnSites++
		}
	}
	if fnSites != 1 {
		t.Errorf("want 1 createValidateFn site carrying an fnId, got %d", fnSites)
	}
	// Marker coverage rule: static getRunTypeId<T>() and value-first
	// getRunTypeId(value) must resolve to the SAME reflection id.
	if len(reflectIDs) != 2 {
		t.Fatalf("want 2 reflection getRunTypeId sites, got %d", len(reflectIDs))
	}
	if reflectIDs[0] != reflectIDs[1] {
		t.Errorf("static vs value-first getRunTypeId(CrossPkgUser) diverged: %q vs %q", reflectIDs[0], reflectIDs[1])
	}
}

// TestInlineServer_NoSourceCondition_BestEffortDoesNotResolve — without the
// source condition (no tsconfig at all, or a tsconfig that omits it) the server
// must keep working (best-effort, no crash) and the cross-package type must NOT
// resolve to an ObjectLiteral. This proves the tsconfig is the mechanism without
// pinning whether MKR007 specifically fires.
func TestInlineServer_NoSourceCondition_BestEffortDoesNotResolve(t *testing.T) {
	cases := []struct {
		name     string
		tsconfig string
	}{
		{"no tsconfig", ""},
		{"tsconfig without customConditions", tsconfigNoConditions},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			resp := scanConsumerOverSourceCondition(t, tc.tsconfig)
			// scanConsumerOverSourceCondition fatals on a dispatch error, so
			// reaching here already proves the server did not crash.
			if len(resp.Sites) == 0 {
				t.Fatalf("expected marker sites even when the dependency is unresolved")
			}
			byID := kindByID(resp)
			for _, site := range resp.Sites {
				if byID[site.ID] == reflection.KindObjectLiteral {
					t.Errorf("CrossPkgUser resolved to ObjectLiteral WITHOUT customConditions:[source] — the source entry should be unreachable (fixture/contract wrong)")
				}
			}
			t.Logf("without source condition: %d MKR007 diagnostic(s) (today-behavior)", mkr007Count(resp))
		})
	}
}
