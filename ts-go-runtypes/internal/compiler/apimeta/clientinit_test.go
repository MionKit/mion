package apimeta

import (
	"fmt"
	"strings"
	"testing"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
)

const routerDts = "declare module '@mionjs/router' { export function createMionRouter(): {route(fn: any): any}; }\n"

const otherClientDts = "declare module 'other-client' { export function initClient<T>(options: {baseURL: string}): {routes: T}; }\n"

const serverApi = "import {createMionRouter} from '@mionjs/router';\n" +
	"export const mion = createMionRouter();\n" +
	"export const routes = {hello: mion.route(() => 'hi')};\n" +
	"export type MyApi = typeof routes;\n" +
	"export default routes;\n" +
	"export const startServer = () => routes;\n"

const clientImport = "import {initClient} from '@mionjs/client';\n"

// apiTypeImports returns "line name specifier" for each SRV001 in client.ts.
func apiTypeImports(t *testing.T, client string) []string {
	t.Helper()
	overlay := setupOverlay(t, map[string]string{"router.d.ts": routerDts, "other.d.ts": otherClientDts, "server/api.ts": serverApi, "client.ts": client})
	clientPath := ""
	for _, file := range overlay.files {
		if strings.HasSuffix(file, "/client.ts") {
			clientPath = file
		}
	}
	var found []string
	for _, diagnostic := range ApiTypeImports(overlay.typeChecker, overlay.markerOpts, overlay.prog.SourceFile(tspath.NormalizePath(clientPath)), "client.ts") {
		if diagnostic.Code != diagnostics.CodeServerImportInClient || diagnostic.Site.FilePath != "client.ts" {
			t.Fatalf("unexpected diagnostic %s at %+v", diagnostic.Code, diagnostic.Site)
		}
		found = append(found, fmt.Sprintf("%d %s %s", diagnostic.Site.StartLine, diagnostic.Args[0], diagnostic.Args[1]))
	}
	return found
}

func assertFound(t *testing.T, got []string, want ...string) {
	t.Helper()
	if strings.Join(got, "|") != strings.Join(want, "|") {
		t.Fatalf("found = %q, want %q", got, want)
	}
}

func TestApiTypeImports_TypeOnlyImportsPass(t *testing.T) {
	assertFound(t, apiTypeImports(t, clientImport+
		"import type {MyApi} from './server/api';\n"+
		"export const a = initClient<MyApi>({baseURL: ''});\n"))
	assertFound(t, apiTypeImports(t, clientImport+
		"import {type MyApi} from './server/api';\n"+
		"export const a = initClient<MyApi>({baseURL: ''});\n"))
	assertFound(t, apiTypeImports(t, clientImport+
		"import type * as api from './server/api';\n"+
		"export const a = initClient<api.MyApi>({baseURL: ''});\n"))
}

func TestApiTypeImports_ValueImportIsFlagged(t *testing.T) {
	assertFound(t, apiTypeImports(t, clientImport+
		"import {MyApi} from './server/api';\n"+
		"export const a = initClient<MyApi>({baseURL: ''});\n"),
		"2 MyApi ./server/api")
}

func TestApiTypeImports_EveryValueImportShapeIsFlagged(t *testing.T) {
	assertFound(t, apiTypeImports(t, clientImport+
		"import * as api from './server/api';\n"+
		"export const a = initClient<api.MyApi>({baseURL: ''});\n"),
		"2 api ./server/api")
	assertFound(t, apiTypeImports(t, clientImport+
		"import {routes} from './server/api';\n"+
		"export const a = initClient<typeof routes>({baseURL: ''});\n"),
		"2 routes ./server/api")
	assertFound(t, apiTypeImports(t, clientImport+
		"import routes from './server/api';\n"+
		"export const a = initClient<{api: typeof routes}>({baseURL: ''});\n"),
		"2 routes ./server/api")
	assertFound(t, apiTypeImports(t, clientImport+
		"import api = require('./server/api');\n"+
		"export const a = initClient<typeof api.routes>({baseURL: ''});\n"),
		"2 api ./server/api")
}

func TestApiTypeImports_LocalAliasIsFollowed(t *testing.T) {
	assertFound(t, apiTypeImports(t, clientImport+
		"import {MyApi} from './server/api';\n"+
		"type Api = MyApi;\n"+
		"export const a = initClient<Api>({baseURL: ''});\n"),
		"2 MyApi ./server/api")
	assertFound(t, apiTypeImports(t, clientImport+
		"import {routes} from './server/api';\n"+
		"type Api = {nested: typeof routes};\n"+
		"export const a = initClient<Api>({baseURL: ''});\n"),
		"2 routes ./server/api")
	assertFound(t, apiTypeImports(t, clientImport+
		"import type {MyApi} from './server/api';\n"+
		"type Api = MyApi;\n"+
		"export const a = initClient<Api>({baseURL: ''});\n"))
}

// A test that starts the server imports server code on purpose.
func TestApiTypeImports_OtherServerImportsAreNotJudged(t *testing.T) {
	assertFound(t, apiTypeImports(t, clientImport+
		"import {startServer} from './server/api';\n"+
		"import type {MyApi} from './server/api';\n"+
		"startServer();\n"+
		"export const a = initClient<MyApi>({baseURL: ''});\n"))
}

func TestApiTypeImports_OneReportPerImport(t *testing.T) {
	assertFound(t, apiTypeImports(t, clientImport+
		"import {MyApi, routes} from './server/api';\n"+
		"export const a = initClient<MyApi>({baseURL: ''});\n"+
		"export const b = initClient<typeof routes>({baseURL: ''});\n"),
		"2 MyApi ./server/api")
}

func TestApiTypeImports_NoTypeArgumentOrAnotherInitClientPasses(t *testing.T) {
	assertFound(t, apiTypeImports(t, clientImport+
		"import {MyApi} from './server/api';\n"+
		"export const a = initClient({baseURL: ''});\n"+
		"export const b: MyApi | undefined = undefined;\n"))
	assertFound(t, apiTypeImports(t, "import {initClient} from 'other-client';\n"+
		"import {MyApi} from './server/api';\n"+
		"export const a = initClient<MyApi>({baseURL: ''});\n"))
}

func TestApiTypeImports_LocalTypePasses(t *testing.T) {
	assertFound(t, apiTypeImports(t, clientImport+
		"type LocalApi = {hello: () => string};\n"+
		"export const a = initClient<LocalApi>({baseURL: ''});\n"))
}
