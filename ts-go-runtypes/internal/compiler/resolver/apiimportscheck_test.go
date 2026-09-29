package resolver_test

import (
	"testing"

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
