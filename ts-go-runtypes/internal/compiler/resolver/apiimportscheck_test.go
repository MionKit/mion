package resolver_test

import (
	"strings"
	"testing"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/program"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/resolver"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// serverImportSources is a client that imports its API type without `type`; no setting names either side.
var serverImportSources = map[string]string{
	"packages.d.ts": "declare module '@mionjs/router' { export function createMionRouter(): {route(fn: any): any}; }\n" +
		"declare module '@mionjs/client' { export function initClient<T>(options: {baseURL: string}): {routes: T}; }\n",
	"api.ts": "import {createMionRouter} from '@mionjs/router';\n" +
		"export const routes = {hello: createMionRouter().route(() => 'hi')};\n" +
		"export type MyApi = typeof routes;\n",
	"client.ts": "import {initClient} from '@mionjs/client';\n" +
		"import {MyApi} from './api';\n" +
		"export const {routes} = initClient<MyApi>({baseURL: ''});\n",
}

func serverImportSites(response protocol.Response) []diagnostics.Site {
	var sites []diagnostics.Site
	for _, diagnostic := range response.Diagnostics {
		if diagnostic.Code == diagnostics.CodeServerImportInClient {
			sites = append(sites, diagnostic.Site)
		}
	}
	return sites
}

// The editor (scanFiles, no opt-in) and the build (generate) both report it, at the import line.
func TestApiImports_ScanAndGenerateBothReport(t *testing.T) {
	session := setupInline(t, serverImportSources)
	scan := session.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"client.ts"}})
	if scan.Error != "" {
		t.Fatalf("scan error: %s", scan.Error)
	}
	if sites := serverImportSites(scan); len(sites) != 1 || sites[0].FilePath != "client.ts" || sites[0].StartLine != 2 {
		t.Fatalf("scan: SRV001 sites = %+v, want one at client.ts:2", sites)
	}
	build := session.Dispatch(protocol.Request{Op: protocol.OpGenerate})
	if build.Error != "" {
		t.Fatalf("generate error: %s", build.Error)
	}
	if sites := serverImportSites(build); len(sites) != 1 || sites[0].StartLine != 2 {
		t.Fatalf("generate: SRV001 sites = %+v, want one at line 2", sites)
	}
	for _, diagnostic := range build.Diagnostics {
		if diagnostic.Code == diagnostics.CodeServerImportInClient && diagnostic.Severity != diagnostics.SeverityError {
			t.Fatalf("SRV001 severity = %d, want an error", diagnostic.Severity)
		}
	}
}

// A `@mion-expect-error SRV001` above the import silences it on both ops and is not reported as unused.
func TestApiImports_ExpectErrorSilences(t *testing.T) {
	sources := map[string]string{}
	for name, content := range serverImportSources {
		sources[name] = content
	}
	sources["client.ts"] = "import {initClient} from '@mionjs/client';\n" +
		"// @mion-expect-error SRV001\n" +
		"import {MyApi} from './api';\n" +
		"export const {routes} = initClient<MyApi>({baseURL: ''});\n"
	session := setupInline(t, sources)
	for _, response := range []protocol.Response{
		session.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"client.ts"}}),
		session.Dispatch(protocol.Request{Op: protocol.OpGenerate}),
	} {
		for _, diagnostic := range response.Diagnostics {
			if diagnostic.Code == diagnostics.CodeServerImportInClient || diagnostic.Code == diagnostics.CodeExpectErrorUnused {
				t.Fatalf("got %s at %+v, want the directive to silence SRV001", diagnostic.Code, diagnostic.Site)
			}
		}
	}
}

// A dependency resolved to its own `.ts` source is not the user's to fix: its SRV001 is dropped by TypeScript's own
// provenance, while the same import in first-party code still fires, on both ops.
func TestApiImports_DependencySourceIsNotReported(t *testing.T) {
	const clientSrc = "import {initClient} from '@mionjs/client';\nimport {MyApi} from './api';\nexport const client = initClient<MyApi>({baseURL: ''});\n"
	const apiSrc = "export type MyApi = {hello: () => string};\nexport const version = 1;\n"
	cwd := tspath.NormalizePath(t.TempDir())
	overlay := map[string]string{
		tspath.ResolvePath(cwd, "runtypes.d.ts"): ``,
		tspath.ResolvePath(cwd, "tsconfig.json"): `{
  "compilerOptions": {"module": "ESNext", "moduleResolution": "bundler", "target": "ESNext", "strict": true, "skipLibCheck": true, "noEmit": true, "customConditions": ["source"], "types": []},
  "include": ["app.ts", "api.ts", "packages.d.ts"]
}`,
		tspath.ResolvePath(cwd, "packages.d.ts"):                    "declare module '@mionjs/client' { export function initClient<T>(options: {baseURL: string}): {routes: T}; }\n",
		tspath.ResolvePath(cwd, "app.ts"):                           clientSrc + "import {client as dependencyClient} from 'dep';\nexport const both = [client, dependencyClient];\n",
		tspath.ResolvePath(cwd, "api.ts"):                           apiSrc,
		tspath.ResolvePath(cwd, "node_modules/dep/package.json"):    `{"name": "dep", "exports": {".": {"source": "./src/index.ts", "types": "./dist/index.d.ts"}}}`,
		tspath.ResolvePath(cwd, "node_modules/dep/src/index.ts"):    clientSrc,
		tspath.ResolvePath(cwd, "node_modules/dep/src/api.ts"):      apiSrc,
		tspath.ResolvePath(cwd, "node_modules/dep/dist/index.d.ts"): "export declare const client: unknown;\n",
	}
	prog, err := program.New(program.Options{Cwd: cwd, TsconfigPath: "tsconfig.json", SingleThreaded: true, Overlay: overlay})
	if err != nil {
		t.Fatalf("program.New: %v", err)
	}
	dependencyFile := findSF(prog, "dep/src/index.ts")
	if dependencyFile == nil || !prog.TS.IsSourceFileFromExternalLibrary(dependencyFile) {
		t.Fatalf("the dependency's source must be in the program and flagged external; fixture wrong")
	}
	session, err := resolver.New(prog, resolver.Options{Cwd: cwd, GenDir: t.TempDir(), SingleThreaded: true})
	if err != nil {
		t.Fatalf("resolver.New: %v", err)
	}
	t.Cleanup(session.Close)
	for name, response := range map[string]protocol.Response{
		"scan":     session.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"app.ts", dependencyFile.FileName()}}),
		"generate": session.Dispatch(protocol.Request{Op: protocol.OpGenerate}),
	} {
		if response.Error != "" {
			t.Fatalf("%s error: %s", name, response.Error)
		}
		sites := serverImportSites(response)
		if len(sites) != 1 || !strings.HasSuffix(sites[0].FilePath, "app.ts") {
			t.Fatalf("%s: SRV001 sites = %+v, want one in app.ts and none in the dependency", name, sites)
		}
	}
}
