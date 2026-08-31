package resolver_test

import (
	"strings"
	"testing"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-runtypes/internal/compiler/program"
	"github.com/mionkit/ts-runtypes/internal/compiler/resolver"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// First-party diagnostic scoping:
// when a dependency resolves to its own `.ts` SOURCE (its package.json `source`
// export condition + a consumer's customConditions:["source"]), the whole-program
// scan walks the library's own internal generic definitions. A non-literal
// CompTimeArgs argument inside the DEPENDENCY's source is not a consumer call site,
// so its CTA diagnostic must be dropped — while the SAME mistake in FIRST-PARTY
// code still fires. Provenance-based (IsSourceFileFromExternalLibrary), so it is
// general to every dependency, not just the marker package.
func TestScan_ExternalLibrarySourceDiagnosticsAreScopedOut(t *testing.T) {
	// A minimal marker package: declares CompTimeArgs (zero-cost identity) and a
	// branded factory, PLUS an INTERNAL non-literal call (like registerPureFnFactory
	// in @mionjs/run-types's own src) that would trip CTA on a raw scan.
	const coreSrc = `export type CompTimeArgs<T> = T & {readonly __rtCompTimeArgsBrand?: never};
export declare function registerThing(name: CompTimeArgs<string>): void;
const internalName: string = ('lib' + String(1)) as string;
registerThing(internalName);
`
	// First-party consumer makes the SAME mistake — a non-literal CompTimeArgs arg.
	const appSrc = `import {registerThing} from '@mionjs/run-types';
const appName: string = ('app' + String(1)) as string;
registerThing(appName);
`
	cwd := tspath.NormalizePath(t.TempDir())
	overlay := map[string]string{
		tspath.ResolvePath(cwd, "runtypes.d.ts"): ``, // suppress the fake ambient
		tspath.ResolvePath(cwd, "tsconfig.json"): `{
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "bundler",
    "target": "ESNext",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "customConditions": ["source"],
    "types": []
  },
  "include": ["app.ts"]
}`,
		tspath.ResolvePath(cwd, "app.ts"): appSrc,
		tspath.ResolvePath(cwd, "node_modules/@mionjs/run-types/package.json"): `{
  "name": "@mionjs/run-types",
  "exports": {".": {"source": "./src/index.ts", "import": {"types": "./dist/index.d.ts", "default": "./dist/index.js"}}}
}`,
		tspath.ResolvePath(cwd, "node_modules/@mionjs/run-types/src/index.ts"):    coreSrc,
		tspath.ResolvePath(cwd, "node_modules/@mionjs/run-types/dist/index.d.ts"): `export declare function registerThing(name: string): void;`,
	}

	p, err := program.New(program.Options{Cwd: cwd, TsconfigPath: "tsconfig.json", SingleThreaded: true, Overlay: overlay})
	if err != nil {
		t.Fatalf("program.New: %v", err)
	}

	// Sanity: the dependency's SOURCE must actually be source-resolved into the
	// program AND flagged external; app.ts must be first-party.
	var coreSF, appSF = findSF(p, "@mionjs/run-types/src/index.ts"), findSF(p, "/app.ts")
	if coreSF == nil {
		t.Fatalf("core src not source-resolved into program — fixture wrong")
	}
	if !p.TS.IsSourceFileFromExternalLibrary(coreSF) {
		t.Fatalf("core src not flagged as external library — provenance signal wrong")
	}
	if appSF == nil || p.TS.IsSourceFileFromExternalLibrary(appSF) {
		t.Fatalf("app.ts must be first-party (non-external)")
	}

	r, err := resolver.New(p, resolver.Options{Cwd: cwd, SingleThreaded: true})
	if err != nil {
		t.Fatalf("resolver.New: %v", err)
	}
	t.Cleanup(r.Close)

	resp := r.Dispatch(protocol.Request{Op: protocol.OpDump})
	if resp.Error != "" {
		t.Fatalf("dump error: %s", resp.Error)
	}

	var appCTA, coreCTA int
	for _, d := range resp.Diagnostics {
		if !strings.HasPrefix(d.Code, "CTA") {
			continue
		}
		switch {
		case strings.Contains(d.Site.FilePath, "/node_modules/"):
			coreCTA++
			t.Logf("LEAKED dependency diagnostic: %s @ %s", d.Code, d.Site.FilePath)
		case strings.HasSuffix(d.Site.FilePath, "app.ts"):
			appCTA++
		}
	}
	// The dependency's own non-literal call must NOT be reported.
	if coreCTA != 0 {
		t.Errorf("dependency-source CTA diagnostics leaked: %d (want 0)", coreCTA)
	}
	// The first-party call with the SAME mistake still fires — no over-suppression.
	if appCTA == 0 {
		t.Errorf("first-party CTA diagnostic was suppressed — over-scoped (want >= 1)")
	}
}

func findSF(p *program.Program, suffix string) *ast.SourceFile {
	for _, sf := range p.TS.SourceFiles() {
		if sf == nil {
			continue
		}
		if strings.Contains(sf.FileName(), suffix) || strings.HasSuffix(sf.FileName(), suffix) {
			return sf
		}
	}
	return nil
}
