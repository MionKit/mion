package apiimports

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"testing"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/program"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
)

// ambients stand in for the installed packages: the check reads only which module declares `initClient`.
var ambients = map[string]string{
	"router.d.ts": "declare module '@mionjs/router' { export function createMionRouter(): {route(fn: any): any}; }\n",
	"client.d.ts": "declare module '@mionjs/client' { export function initClient<T>(options: {baseURL: string}): {routes: T}; }\n" +
		"declare module 'other-client' { export function initClient<T>(options: {baseURL: string}): {routes: T}; }\n",
}

const serverApi = "import {createMionRouter} from '@mionjs/router';\n" +
	"export const mion = createMionRouter();\n" +
	"export const routes = {hello: mion.route(() => 'hi')};\n" +
	"export type MyApi = typeof routes;\n" +
	"export default routes;\n" +
	"export const startServer = () => routes;\n"

// check returns "line name specifier" for each SRV001 in client.ts.
func check(t *testing.T, client string) []string {
	t.Helper()
	cwd := tspath.NormalizePath(t.TempDir())
	files := map[string]string{"server/api.ts": serverApi, "client.ts": client}
	for name, content := range ambients {
		files[name] = content
	}
	overlay := map[string]string{}
	var roots []string
	for name, content := range files {
		overlay[tspath.ResolvePath(cwd, name)] = content
		roots = append(roots, tspath.ResolvePath(cwd, name))
	}
	sort.Strings(roots)
	prog, err := program.NewInferred(program.Options{Cwd: cwd, SingleThreaded: true, Overlay: overlay}, roots)
	if err != nil {
		t.Fatalf("program.NewInferred: %v", err)
	}
	typeChecker, releaseLease := prog.TS.GetTypeChecker(context.Background())
	if typeChecker == nil {
		t.Fatalf("GetTypeChecker returned nil")
	}
	t.Cleanup(func() {
		if releaseLease != nil {
			releaseLease()
		}
	})
	markerOpts := marker.WithDefaults(marker.Options{FS: prog.FS})
	var found []string
	for _, diagnostic := range CheckSourceFile(typeChecker, markerOpts, prog.SourceFile(tspath.ResolvePath(cwd, "client.ts")), "client.ts") {
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

const clientImport = "import {initClient} from '@mionjs/client';\n"

func TestTypeOnlyImportsPass(t *testing.T) {
	assertFound(t, check(t, clientImport+
		"import type {MyApi} from './server/api';\n"+
		"export const a = initClient<MyApi>({baseURL: ''});\n"))
	assertFound(t, check(t, clientImport+
		"import {type MyApi} from './server/api';\n"+
		"export const a = initClient<MyApi>({baseURL: ''});\n"))
	assertFound(t, check(t, clientImport+
		"import type * as api from './server/api';\n"+
		"export const a = initClient<api.MyApi>({baseURL: ''});\n"))
}

func TestValueImportOfTheApiTypeIsFlagged(t *testing.T) {
	assertFound(t, check(t, clientImport+
		"import {MyApi} from './server/api';\n"+
		"export const a = initClient<MyApi>({baseURL: ''});\n"),
		"2 MyApi ./server/api")
}

func TestEveryValueImportShapeIsFlagged(t *testing.T) {
	assertFound(t, check(t, clientImport+
		"import * as api from './server/api';\n"+
		"export const a = initClient<api.MyApi>({baseURL: ''});\n"),
		"2 api ./server/api")
	assertFound(t, check(t, clientImport+
		"import {routes} from './server/api';\n"+
		"export const a = initClient<typeof routes>({baseURL: ''});\n"),
		"2 routes ./server/api")
	assertFound(t, check(t, clientImport+
		"import routes from './server/api';\n"+
		"export const a = initClient<{api: typeof routes}>({baseURL: ''});\n"),
		"2 routes ./server/api")
}

// A test that starts the server imports server code on purpose: only the API type's own import is judged.
func TestOtherServerImportsAreNotJudged(t *testing.T) {
	assertFound(t, check(t, clientImport+
		"import {startServer} from './server/api';\n"+
		"import type {MyApi} from './server/api';\n"+
		"startServer();\n"+
		"export const a = initClient<MyApi>({baseURL: ''});\n"))
}

// One report per import statement, however often its names appear.
func TestOneReportPerImport(t *testing.T) {
	assertFound(t, check(t, clientImport+
		"import {MyApi, routes} from './server/api';\n"+
		"export const a = initClient<MyApi>({baseURL: ''});\n"+
		"export const b = initClient<typeof routes>({baseURL: ''});\n"),
		"2 MyApi ./server/api")
}

func TestNoTypeArgumentOrAnotherInitClientPasses(t *testing.T) {
	assertFound(t, check(t, clientImport+
		"import {MyApi} from './server/api';\n"+
		"export const a = initClient({baseURL: ''});\n"+
		"export const b: MyApi | undefined = undefined;\n"))
	assertFound(t, check(t, "import {initClient} from 'other-client';\n"+
		"import {MyApi} from './server/api';\n"+
		"export const a = initClient<MyApi>({baseURL: ''});\n"))
}

func TestLocalTypePasses(t *testing.T) {
	assertFound(t, check(t, clientImport+
		"type LocalApi = {hello: () => string};\n"+
		"export const a = initClient<LocalApi>({baseURL: ''});\n"))
}
