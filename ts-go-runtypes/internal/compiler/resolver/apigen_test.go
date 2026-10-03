package resolver_test

import (
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/apimeta"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/program"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/resolver"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// apiClientDTS is an ambient stand-in for the `@mionjs/client` surface the bundled-API lane reads; the marker is REAL.
const apiClientDTS = `declare module '@mionjs/client' {
  import type {InjectApiMetadata, InjectBuildVersion} from '@mionjs/run-types';
  export interface RouteSubRequest<PH, Id extends string = string, RA = any> {
    id: Id;
    call(setup?: unknown, apiMetadata?: InjectApiMetadata<RA, Id>): Promise<unknown>;
    typeErrors(apiMetadata?: InjectApiMetadata<RA, Id>): Promise<unknown>;
  }
  export interface ClientMiddleware<PH, Id extends string = string> {
    onRequest(handler: (call: (...params: Parameters<PH>) => void) => void): ClientMiddleware<PH, Id>;
  }
  type Handler = (...args: any[]) => any;
  export type ClientRoutes<RA, Prefix extends string = '', Root = RA> = {
    [K in keyof RA as RA[K] extends {type: 1} ? K : RA[K] extends {type: number} ? never : K]: RA[K] extends {type: 1; handler: infer H extends Handler}
      ? (...params: Parameters<H>) => RouteSubRequest<H, ` + "`${Prefix}${K & string}`" + `, Root>
      : ClientRoutes<RA[K], ` + "`${Prefix}${K & string}/`" + `, Root>;
  };
  export type ClientMiddlewares<RA, Prefix extends string = ''> = {
    [K in keyof RA as RA[K] extends {type: 2 | 3} ? K : RA[K] extends {type: number} ? never : K]: RA[K] extends {type: 2 | 3; handler: infer H extends Handler}
      ? ClientMiddleware<H, ` + "`${Prefix}${K & string}`" + `>
      : ClientMiddlewares<RA[K], ` + "`${Prefix}${K & string}/`" + `>;
  };
  export type ApiOf<Routes extends {id: string}[]> = Routes[number] extends RouteSubRequest<any, any, infer RA> ? RA : never;
  export interface BatchBuilder<Routes extends RouteSubRequest<any>[]> {
    call(setup?: unknown, apiMetadata?: InjectApiMetadata<ApiOf<Routes>, Routes[number]['id']>): Promise<unknown>;
  }
  export function batch<R extends RouteSubRequest<any>[]>(routes: [...R]): BatchBuilder<R>;
  export function initClient<RA>(o?: unknown, buildVersion?: InjectBuildVersion<RA>): {routes: ClientRoutes<RA>; middlewares: ClientMiddlewares<RA>};
  export function useFetchMetadata(middleware: ClientMiddleware<any>): void;
}
`

// apiTypeTS is the client's view of the API, the shape PublicApi<typeof routes>
// takes: a headers middleware, a plain middleware, two routes in a group and one
// at the root.
const apiTypeTS = `type Headers = {headers: {authorization: string}};
type MfOpts = {alwaysRun: false; description: undefined; parser: {params: 'clone'; return: 'clone'}; sanitizeParams: undefined};
type RouteOpts = {alwaysRun: false; description: undefined; parser: {params: 'clone'; return: 'clone'}; isMutation: undefined; sanitizeParams: undefined};
export type Api = {
  auth: {type: 3; handler: (h: Headers) => Promise<void>; options: MfOpts; types?: {params: []; return: void; headers: Headers; isAsync: false}};
  users: {
    getById: {type: 1; handler: (id: number) => Promise<{id: number; name: string}>; options: RouteOpts; types?: {params: [id: number]; return: {id: number; name: string}; headers: never; isAsync: true; sync: [[id: number], {id: number; name: string}, 'json', 'json']}};
    audit: {type: 2; handler: (why: string) => Promise<void>; options: MfOpts; types?: {params: [why: string]; return: void; headers: never; isAsync: false}};
    remove: {type: 1; handler: (id: number) => Promise<boolean>; options: RouteOpts; types?: {params: [id: number]; return: boolean; headers: never; isAsync: false}};
  };
  sum: {type: 1; handler: (a: number, b: number) => Promise<number>; options: RouteOpts; types?: {params: [a: number, b: number]; return: number; headers: never; isAsync: false}};
};
`

// apiClientTS makes a route call, a typeErrors and a batch, skips users/remove, and sets up both middlewares (no MET008).
const apiClientTS = `import {initClient, batch} from '@mionjs/client';
import type {Api} from './api.ts';
export const {routes, middlewares} = initClient<Api>({baseURL: 'http://x'});
middlewares.auth.onRequest((call) => call({headers: {authorization: 'x'}}));
middlewares.users.audit.onRequest((call) => call('why'));
export const a = routes.users.getById(1).call();
export const b = routes.sum(3, 4).typeErrors();
export const c = batch([routes.users.getById(2), routes.sum(1, 2)]).call();
`

func apiSources(client string) map[string]string {
	return map[string]string{"client.d.ts": apiClientDTS, "api.ts": apiTypeTS, "client.ts": client}
}

func setupApi(t *testing.T, sources map[string]string, genDir string, mode constants.ClientRoutesMode) *resolver.Session {
	t.Helper()
	return setupInlineWith(t, sources, func(programOpts *program.Options, resolverOpts *resolver.Options) {
		programOpts.SingleThreaded = true
		resolverOpts.SingleThreaded = true
		resolverOpts.GenDir = genDir
		resolverOpts.TransformRelative = true
		resolverOpts.ClientRoutes = mode
	})
}

func metDiags(diags []diagnostics.Diagnostic) []diagnostics.Diagnostic {
	var out []diagnostics.Diagnostic
	for _, diag := range diags {
		if strings.HasPrefix(diag.Code, "MET") {
			out = append(out, diag)
		}
	}
	return out
}

func readGenerated(t *testing.T, genDir, rel string) string {
	t.Helper()
	content, err := os.ReadFile(filepath.Join(genDir, filepath.FromSlash(rel)))
	if err != nil {
		t.Fatalf("reading %s: %v", rel, err)
	}
	return string(content)
}

func listGenerated(t *testing.T, dir string) []string {
	t.Helper()
	var out []string
	_ = filepath.WalkDir(dir, func(path string, entry os.DirEntry, err error) error {
		if err != nil || entry.IsDir() {
			return nil
		}
		rel, _ := filepath.Rel(dir, path)
		out = append(out, filepath.ToSlash(rel))
		return nil
	})
	return out
}

// TestApiGen_GenerateWritesUsedRoutesWithTheirChains: generate writes one
// module per called route or middleware plus its chain, one per site shape, the
// entry mirror under api/types in factory form, and nothing for an uncalled
// route.
func TestApiGen_GenerateWritesUsedRoutesWithTheirChains(t *testing.T) {
	genDir := t.TempDir()
	r := setupApi(t, apiSources(apiClientTS), genDir, constants.ClientRoutesBundle)
	gen := r.Dispatch(protocol.Request{Op: protocol.OpGenerate})
	if gen.Error != "" {
		t.Fatalf("generate: %s", gen.Error)
	}
	if diags := metDiags(gen.Diagnostics); len(diags) != 0 {
		t.Fatalf("unexpected MET diagnostics: %+v", diags)
	}
	apiDir := filepath.Join(genDir, constants.ApiModuleDir)
	files := listGenerated(t, apiDir)
	joined := strings.Join(files, "\n")
	for _, want := range []string{"m/users/getById.js", "m/users/audit.js", "m/auth.js", "m/sum.js", "s/users/getById.js", "s/sum.js"} {
		if !strings.Contains(joined, want) {
			t.Errorf("missing %s in api/:\n%s", want, joined)
		}
	}
	if strings.Contains(joined, "m/users/remove.js") {
		t.Errorf("users/remove is never called and must not be bundled:\n%s", joined)
	}
	// the batch site module is hashed over both ids and lists both routes plus
	// the chain middlewares
	var batchModule string
	for _, file := range files {
		if strings.HasPrefix(file, "s/b_") {
			batchModule = file
		}
	}
	if batchModule == "" {
		t.Fatalf("missing the batch site module:\n%s", joined)
	}
	batchSource := readGenerated(t, apiDir, batchModule)
	for _, want := range []string{"m/users/getById.js", "m/sum.js", "m/auth.js", "m/users/audit.js"} {
		if !strings.Contains(batchSource, want) {
			t.Errorf("batch site module lacks %s:\n%s", want, batchSource)
		}
	}
	// a route module carries its row and the marker payload the server helper
	// receives, with its entries imported from the mirror
	getById := readGenerated(t, apiDir, "m/users/getById.js")
	for _, want := range []string{`"id":"users/getById"`, `"pointer":["users","getById"]`, `"nestLevel":1`, `"type":1`, `"isAsync":true`, `"middlewareIds":["auth","users/audit"]`, `"parser":{"params":"clone","return":"clone"}`, `"rtFns": {paramsFns: [`, `returnFns: [`, `paramsId: __rt_`, `returnId: __rt_`, "from '../../types/"} {
		if !strings.Contains(getById, want) {
			t.Errorf("m/users/getById.js lacks %s:\n%s", want, getById)
		}
	}
	if strings.Contains(getById, "headersFns") {
		t.Errorf("a route carries no headers slot:\n%s", getById)
	}
	auth := readGenerated(t, apiDir, "m/auth.js")
	for _, want := range []string{`"type":3`, "headersFns: [", "headersId: __rt_"} {
		if !strings.Contains(auth, want) {
			t.Errorf("m/auth.js lacks %s:\n%s", want, auth)
		}
	}
	if strings.Contains(auth, "middlewareIds") {
		t.Errorf("a middleware carries no chain:\n%s", auth)
	}
	// the mirror renders factories, never code strings
	sawFactory := false
	for _, file := range files {
		if !strings.HasPrefix(file, "types/") || !strings.HasSuffix(file, ".js") {
			continue
		}
		source := readGenerated(t, apiDir, file)
		if strings.Contains(source, "function g_") {
			sawFactory = true
		}
		if strings.Contains(source, "new Function") {
			t.Errorf("%s evaluates code:\n%s", file, source)
		}
	}
	if !sawFactory {
		t.Errorf("no live factory found under api/types/:\n%s", joined)
	}
	// every import inside api/ resolves to a file the same generate wrote
	live := map[string]bool{}
	for _, file := range files {
		live[file] = true
	}
	for _, file := range files {
		if !strings.HasSuffix(file, ".js") {
			continue
		}
		source := readGenerated(t, apiDir, file)
		for _, line := range strings.Split(source, "\n") {
			if !strings.HasPrefix(line, "import ") {
				continue
			}
			specifier := line[strings.Index(line, "from '")+6 : len(line)-2]
			// a bare package specifier is the bundler's to resolve (lane.js imports the client
			// package, as the batch module imports the router's); only a relative one must land
			// on a file this tree generated
			if !strings.HasPrefix(specifier, ".") {
				continue
			}
			target := filepath.ToSlash(filepath.Join(filepath.Dir(file), specifier))
			if !live[target] {
				t.Errorf("%s imports %s, which was not generated", file, target)
			}
		}
	}
	// the client file is a site file, so the plugin transforms it
	if !strings.Contains(strings.Join(gen.SiteFiles, "\n"), "client.ts") {
		t.Errorf("client.ts missing from SiteFiles: %v", gen.SiteFiles)
	}
}

// TestApiGen_TransformInjectsLaneImportAndSiteBindings: each dispatch site imports its module relative to the file.
func TestApiGen_TransformInjectsLaneImportAndSiteBindings(t *testing.T) {
	genDir := t.TempDir()
	r := setupApi(t, apiSources(apiClientTS), genDir, constants.ClientRoutesBundle)
	tr := r.Dispatch(protocol.Request{Op: protocol.OpTransform, Files: []string{"client.ts"}})
	if tr.Error != "" {
		t.Fatalf("transform: %s", tr.Error)
	}
	if diags := metDiags(tr.Diagnostics); len(diags) != 0 {
		t.Fatalf("unexpected MET diagnostics: %+v", diags)
	}
	code := tr.Transformed["client.ts"].Code
	if !strings.Contains(code, "import '../001/api/lane.js';") {
		t.Errorf("the file calling initClient did not get the lane import:\n%s", code)
	}
	if !strings.Contains(code, "initClient<Api>({baseURL: 'http://x'}, '") {
		t.Errorf("a bundling client gets its build version:\n%s", code)
	}
	if !strings.Contains(code, ".call(undefined, __rt_s$2Fusers$2FgetById)") {
		t.Errorf("the route call did not receive its binding:\n%s", code)
	}
	if !strings.Contains(code, ".typeErrors(__rt_s$2Fsum)") {
		t.Errorf("the typeErrors call did not receive its binding:\n%s", code)
	}
	if !strings.Contains(code, "from '") || !strings.Contains(code, "/api/s/users/getById.js'") || !strings.Contains(code, "/api/s/sum.js'") {
		t.Errorf("site module imports must be relative paths under <genDir>/api:\n%s", code)
	}
	if strings.Contains(code, "rtapi:/") {
		t.Errorf("virtual specifier survived relativization:\n%s", code)
	}
}

// TestApiGen_OffMeansNothing: without bundled routes the sites are not sites, no
// module is written and a stale api/ tree is removed.
func TestApiGen_OffMeansNothing(t *testing.T) {
	genDir := t.TempDir()
	stale := filepath.Join(genDir, constants.ApiModuleDir, "s")
	if err := os.MkdirAll(stale, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(stale, "old.js"), []byte("export const x = 1;\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	r := setupApi(t, apiSources(apiClientTS), genDir, constants.ClientRoutesFetch)
	tr := r.Dispatch(protocol.Request{Op: protocol.OpTransform, Files: []string{"client.ts"}})
	if tr.Error != "" {
		t.Fatalf("transform: %s", tr.Error)
	}
	code := tr.Transformed["client.ts"].Code
	if strings.Contains(code, "__rt_s$2F") || strings.Contains(code, "api/lane.js") {
		t.Errorf("nothing must be injected with the lane off:\n%s", code)
	}
	gen := r.Dispatch(protocol.Request{Op: protocol.OpGenerate})
	if gen.Error != "" {
		t.Fatalf("generate: %s", gen.Error)
	}
	if _, err := os.Stat(filepath.Join(genDir, constants.ApiModuleDir)); !os.IsNotExist(err) {
		t.Errorf("a stale api/ tree must be removed when the lane is off")
	}
}

// TestApiGen_ModuleSetFollowsTheCalls: a second generate over a program that
// dropped a call prunes that route's modules, and one that added a call
// writes them.
func TestApiGen_ModuleSetFollowsTheCalls(t *testing.T) {
	genDir := t.TempDir()
	full := setupApi(t, apiSources(apiClientTS), genDir, constants.ClientRoutesBundle)
	if gen := full.Dispatch(protocol.Request{Op: protocol.OpGenerate}); gen.Error != "" {
		t.Fatalf("generate: %s", gen.Error)
	}
	apiDir := filepath.Join(genDir, constants.ApiModuleDir)
	if !strings.Contains(strings.Join(listGenerated(t, apiDir), "\n"), "m/sum.js") {
		t.Fatalf("sum expected after the full program")
	}
	fewer := setupApi(t, apiSources(`import {initClient} from '@mionjs/client';
import type {Api} from './api.ts';
export const {routes} = initClient<Api>({baseURL: 'http://x'});
export const a = routes.users.getById(1).call();
`), genDir, constants.ClientRoutesBundle)
	if gen := fewer.Dispatch(protocol.Request{Op: protocol.OpGenerate}); gen.Error != "" {
		t.Fatalf("generate: %s", gen.Error)
	}
	after := strings.Join(listGenerated(t, apiDir), "\n")
	if strings.Contains(after, "m/sum.js") || strings.Contains(after, "s/b_") || strings.Contains(after, "s/sum.js") {
		t.Errorf("modules of dropped calls survived:\n%s", after)
	}
	if !strings.Contains(after, "m/users/getById.js") || !strings.Contains(after, "m/auth.js") {
		t.Errorf("the remaining call and its chain must stay:\n%s", after)
	}
	none := setupApi(t, apiSources(`import {initClient} from '@mionjs/client';
import type {Api} from './api.ts';
export const {routes} = initClient<Api>({baseURL: 'http://x'});
`), genDir, constants.ClientRoutesBundle)
	if gen := none.Dispatch(protocol.Request{Op: protocol.OpGenerate}); gen.Error != "" {
		t.Fatalf("generate: %s", gen.Error)
	}
	if _, err := os.Stat(apiDir); !os.IsNotExist(err) {
		t.Errorf("a program with no dispatch call leaves no api/ tree")
	}
}

// TestApiGen_ReportsUnreadableApiAndUndeclaredRoute: a loose API type is
// MET001 at each site; a site naming a route the type lacks is MET002 and the
// other sites still bundle.
func TestApiGen_ReportsUnreadableApiAndUndeclaredRoute(t *testing.T) {
	genDir := t.TempDir()
	loose := setupApi(t, map[string]string{"client.d.ts": apiClientDTS, "client.ts": `import {initClient} from '@mionjs/client';
type Api = {sum: {type: 1; handler: (n: number) => Promise<number>; options: any; types?: unknown}};
export const {routes} = initClient<Api>({baseURL: 'http://x'});
export const a = routes.sum(1).call();
`}, genDir, constants.ClientRoutesBundle)
	gen := loose.Dispatch(protocol.Request{Op: protocol.OpGenerate})
	if gen.Error != "" {
		t.Fatalf("generate: %s", gen.Error)
	}
	diags := metDiags(gen.Diagnostics)
	if len(diags) != 1 || diags[0].Code != diagnostics.CodeApiMetaUnreadable {
		t.Fatalf("expected one MET001, got %+v", diags)
	}
	undeclared := setupApi(t, map[string]string{"client.d.ts": apiClientDTS, "api.ts": apiTypeTS, "client.ts": `import {initClient} from '@mionjs/client';
import type {Api, RouteSubRequestOf} from './api.ts';
import type {InjectApiMetadata} from '@mionjs/run-types';
export const {routes, middlewares} = initClient<Api>({baseURL: 'http://x'});
middlewares.auth.onRequest((call) => call({headers: {authorization: 'x'}}));
declare const ghost: {call(setup?: unknown, apiMetadata?: InjectApiMetadata<Api, 'users/ghost'>): Promise<unknown>};
export const a = ghost.call();
export const b = routes.sum(1, 2).call();
`}, t.TempDir(), constants.ClientRoutesBundle)
	gen = undeclared.Dispatch(protocol.Request{Op: protocol.OpGenerate})
	if gen.Error != "" {
		t.Fatalf("generate: %s", gen.Error)
	}
	diags = metDiags(gen.Diagnostics)
	if len(diags) != 1 || diags[0].Code != diagnostics.CodeApiMetaRouteNotDeclared || !strings.Contains(strings.Join(diags[0].Args, " "), "users/ghost") {
		t.Fatalf("expected one MET002 naming users/ghost, got %+v", diags)
	}
}

// apiServerRouterDTS is an ambient router whose initRoutes returns the
// PublicApi shape, for the inline "server build" session of the manifest tests.
const apiServerRouterDTS = `declare module '@mionjs/router' {
  type Handler = (...args: any[]) => any;
  type Opts = {alwaysRun: false; description: undefined; parser: {params: 'clone'; return: 'clone'}; isMutation: undefined; sanitizeParams: undefined};
  export type PublicApi<R> = {
    [K in keyof R]: R[K] extends {type: infer T; handler: infer H extends Handler}
      ? {type: T; handler: H; options: Opts; types?: {params: Parameters<H>; return: Awaited<ReturnType<H>>; headers: never; isAsync: false}}
      : PublicApi<R[K]>;
  };
  export interface MionRouter { initRoutes<R>(routes: R): PublicApi<R> }
  export function createMionRouter(): MionRouter;
}
`

// apiServerRoutesTS repeats `initRoutes` initCalls times; extraParam grows getById, the edit api-check exists to catch.
func apiServerRoutesTS(initCalls int, extraParam bool) string {
	getById := "handler: (id: number, verbose: boolean): {id: number; name: string} => ({id, name: ''})"
	if extraParam {
		getById = "handler: (id: number, verbose: boolean, tenant: string): {id: number; name: string} => ({id, name: tenant})"
	}
	source := "import {createMionRouter} from '@mionjs/router';\nconst mion = createMionRouter();\n"
	for i := 0; i < initCalls; i++ {
		source += "export const api" + string(rune('0'+i)) + " = mion.initRoutes({users: {getById: {type: 1 as const, " + getById + "}}, sum: {type: 1 as const, handler: (a: number, b: number): number => a + b}});\n"
	}
	return source
}

func writeFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func readManifest(t *testing.T, genDir string) *apimeta.Manifest {
	t.Helper()
	return readManifestFile(t, genDir, constants.ApiManifestFile)
}

func readClientManifest(t *testing.T, genDir string) *apimeta.Manifest {
	t.Helper()
	return readManifestFile(t, genDir, constants.ApiClientManifestFile)
}

func readManifestFile(t *testing.T, genDir, name string) *apimeta.Manifest {
	t.Helper()
	manifest, err := apimeta.ReadManifest(filepath.Join(genDir, constants.ApiModuleDir, name))
	if err != nil {
		t.Fatalf("reading %s under %s: %v", name, genDir, err)
	}
	return manifest
}

func manifestExists(genDir, name string) bool {
	_, err := os.Stat(filepath.Join(genDir, constants.ApiModuleDir, name))
	return err == nil
}

// TestApiGen_ClientManifestListsTheBundledMethods: exactly the bundled methods, with their ids, families, options and chains.
func TestApiGen_ClientManifestListsTheBundledMethods(t *testing.T) {
	genDir := t.TempDir()
	r := setupApi(t, apiSources(apiClientTS), genDir, constants.ClientRoutesBundle)
	if gen := r.Dispatch(protocol.Request{Op: protocol.OpGenerate}); gen.Error != "" {
		t.Fatalf("generate: %s", gen.Error)
	}
	manifest := readClientManifest(t, genDir)
	if manifest.Kind != apimeta.ManifestKindClient {
		t.Fatalf("expected a client manifest, got kind %q", manifest.Kind)
	}
	ids := make([]string, 0, len(manifest.Methods))
	for id := range manifest.Methods {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	if got := strings.Join(ids, ","); got != "auth,sum,users/audit,users/getById" {
		t.Fatalf("bundled ids: %s", got)
	}
	getById := manifest.Methods["users/getById"]
	if getById.Type != 1 || getById.ParamsId == "" || getById.ReturnId == "" || getById.HeadersId != "" {
		t.Errorf("getById row: %+v", getById)
	}
	if got := strings.Join(getById.MiddlewareIds, ","); got != "auth,users/audit" {
		t.Errorf("getById chain: %s", got)
	}
	// clone both ways: the prepare writes the declared shape and the restore rebuilds it, so both wires take the
	// union-scoped validator; only `formatTransform` stays params-only. Families are named by MARKER token.
	if got := strings.Join(getById.Families, ","); got != "validateUnionKeys,validationErrorsUnionKeys,formatTransform,prepareForJsonClone,restoreFromJsonClone,validateUnionKeys,validationErrorsUnionKeys,prepareForJsonClone,restoreFromJsonClone" {
		t.Errorf("getById families: %s", got)
	}
	if getById.Options["alwaysRun"] != false {
		t.Errorf("getById options: %+v", getById.Options)
	}
	if auth := manifest.Methods["auth"]; auth.Type != 3 || auth.HeadersId == "" || len(auth.MiddlewareIds) != 0 {
		t.Errorf("auth row: %+v", auth)
	}
}

// apiFullstackClientTS calls the API of routes.ts from the same program, the fullstack shape.
func apiFullstackClientTS(extraParam bool) string {
	args := "1, true"
	if extraParam {
		args += ", 't'"
	}
	return "import {initClient} from '@mionjs/client';\nimport type {api0} from './routes.ts';\n" +
		"export const {routes} = initClient<typeof api0>({baseURL: 'http://x'});\n" +
		"export const a = routes.users.getById(" + args + ").call();\n"
}

func fullstackSources(extraParam bool) map[string]string {
	return map[string]string{
		"router.d.ts": versionRouterDTS,
		"routes.ts":   apiServerRoutesTS(1, extraParam),
		"client.d.ts": apiClientDTS,
		"client.ts":   apiFullstackClientTS(extraParam),
	}
}

// TestApiGen_FullstackBuildWritesBothManifests: one program writes matching server and client manifests; a later
// server build that grows a parameter fails against the earlier client on exactly that field.
func TestApiGen_FullstackBuildWritesBothManifests(t *testing.T) {
	genDir := t.TempDir()
	build := setupApi(t, fullstackSources(false), genDir, constants.ClientRoutesBundle)
	if gen := build.Dispatch(protocol.Request{Op: protocol.OpGenerate}); gen.Error != "" {
		t.Fatalf("generate: %s", gen.Error)
	}
	serverManifest := readManifest(t, genDir)
	if serverManifest.Kind != apimeta.ManifestKindServer || len(serverManifest.Methods) != 2 || len(serverManifest.Ambiguous) != 0 {
		t.Fatalf("server manifest: %+v", serverManifest)
	}
	clientManifest := readClientManifest(t, genDir)
	if clientManifest.Kind != apimeta.ManifestKindClient || len(clientManifest.Methods) != 1 {
		t.Fatalf("client manifest: %+v", clientManifest)
	}
	if serverManifest.BuildVersion == "" || clientManifest.BuildVersion != serverManifest.BuildVersion {
		t.Fatalf("one program's two manifests carry different versions: server %q, client %q", serverManifest.BuildVersion, clientManifest.BuildVersion)
	}
	if mismatches := apimeta.Compare(clientManifest, serverManifest); len(mismatches) != 0 {
		t.Fatalf("the two manifests of one build disagree: %v", mismatches)
	}

	editedGen := t.TempDir()
	edited := setupApi(t, fullstackSources(true), editedGen, constants.ClientRoutesBundle)
	if gen := edited.Dispatch(protocol.Request{Op: protocol.OpGenerate}); gen.Error != "" {
		t.Fatalf("edited generate: %s", gen.Error)
	}
	mismatches := apimeta.Compare(clientManifest, readManifest(t, editedGen))
	if len(mismatches) != 1 || mismatches[0].Id != "users/getById" || mismatches[0].Field != "paramsId" {
		t.Fatalf("expected one paramsId mismatch on users/getById, got %v", mismatches)
	}
}

// TestApiGen_ManifestsFollowWhatTheBuildHolds: a server-only build writes only the server's manifest, a
// fetching build drops a client manifest an earlier bundling build left behind.
func TestApiGen_ManifestsFollowWhatTheBuildHolds(t *testing.T) {
	genDir := t.TempDir()
	bundling := setupApi(t, fullstackSources(false), genDir, constants.ClientRoutesBundle)
	if gen := bundling.Dispatch(protocol.Request{Op: protocol.OpGenerate}); gen.Error != "" {
		t.Fatalf("generate: %s", gen.Error)
	}
	if !manifestExists(genDir, constants.ApiClientManifestFile) {
		t.Fatal("a bundling build writes the client manifest")
	}
	fetching := setupApi(t, fullstackSources(false), genDir, constants.ClientRoutesFetch)
	if gen := fetching.Dispatch(protocol.Request{Op: protocol.OpGenerate}); gen.Error != "" {
		t.Fatalf("generate: %s", gen.Error)
	}
	if manifestExists(genDir, constants.ApiClientManifestFile) {
		t.Fatal("a fetching build must remove the stale client manifest")
	}
	if !manifestExists(genDir, constants.ApiManifestFile) {
		t.Fatal("the server manifest stays")
	}
	clientOnly := setupApi(t, apiSources(apiClientTS), genDir, constants.ClientRoutesBundle)
	if gen := clientOnly.Dispatch(protocol.Request{Op: protocol.OpGenerate}); gen.Error != "" {
		t.Fatalf("generate: %s", gen.Error)
	}
	if manifestExists(genDir, constants.ApiManifestFile) || !manifestExists(genDir, constants.ApiClientManifestFile) {
		t.Fatal("a client-only build into the same gen dir removes the stale server manifest and writes its own")
	}
	serverOnly := t.TempDir()
	server := setupApi(t, map[string]string{"router.d.ts": apiServerRouterDTS, "routes.ts": apiServerRoutesTS(1, false)}, serverOnly, constants.ClientRoutesBundle)
	if gen := server.Dispatch(protocol.Request{Op: protocol.OpGenerate}); gen.Error != "" {
		t.Fatalf("generate: %s", gen.Error)
	}
	if !manifestExists(serverOnly, constants.ApiManifestFile) || manifestExists(serverOnly, constants.ApiClientManifestFile) {
		t.Fatal("a server-only build writes only the server manifest")
	}
}

// TestApiGen_ServerManifestFlagsAnAmbiguousId: two initRoutes calls declaring
// one id with different types list it as ambiguous; equal declarations do not.
func TestApiGen_ServerManifestFlagsAnAmbiguousId(t *testing.T) {
	sameGen := t.TempDir()
	same := setupApi(t, map[string]string{"router.d.ts": apiServerRouterDTS, "routes.ts": apiServerRoutesTS(2, false)}, sameGen, "")
	if gen := same.Dispatch(protocol.Request{Op: protocol.OpGenerate}); gen.Error != "" {
		t.Fatalf("generate: %s", gen.Error)
	}
	if manifest := readManifest(t, sameGen); len(manifest.Ambiguous) != 0 || len(manifest.Methods) != 2 {
		t.Fatalf("equal declarations must not be ambiguous: %+v", manifest)
	}
	differGen := t.TempDir()
	source := apiServerRoutesTS(1, false) + strings.Replace(strings.TrimPrefix(apiServerRoutesTS(1, true), apiServerRoutesTS(0, true)), "api0", "api1", 1)
	differ := setupApi(t, map[string]string{"router.d.ts": apiServerRouterDTS, "routes.ts": source}, differGen, "")
	if gen := differ.Dispatch(protocol.Request{Op: protocol.OpGenerate}); gen.Error != "" {
		t.Fatalf("generate: %s", gen.Error)
	}
	manifest := readManifest(t, differGen)
	if got := strings.Join(manifest.Ambiguous, ","); got != "users/getById" {
		t.Fatalf("ambiguous ids: %q (%+v)", got, manifest)
	}
	client := &apimeta.Manifest{Kind: apimeta.ManifestKindClient, Methods: map[string]apimeta.ManifestMethod{"users/getById": manifest.Methods["users/getById"]}}
	if mismatches := apimeta.Compare(client, manifest); len(mismatches) != 1 || !strings.Contains(mismatches[0].Server, "more than once") {
		t.Fatalf("a client row for an ambiguous id must fail the check: %v", mismatches)
	}
}

// apiMarkerClientTS is the client program plus both getRunTypeId call shapes
// over the very type a bundled route is compiled from, so the ids they inject
// can be compared with each other and with the manifest's.
const apiMarkerClientTS = `import {initClient} from '@mionjs/client';
import {getRunTypeId} from '@mionjs/run-types';
import type {Api} from './api.ts';
export const {routes} = initClient<Api>({baseURL: 'http://x'});
export const a = routes.users.getById(1).call();
export const staticId = getRunTypeId<[id: number]>();
declare const params: [id: number];
export const valueId = getRunTypeId(params);
`

// TestApiGen_LaneRidesAModuleNotTheInitClientCall: nothing is spliced into the call, so no caller can claim a bundle.
func TestApiGen_LaneRidesAModuleNotTheInitClientCall(t *testing.T) {
	genDir := t.TempDir()
	r := setupApi(t, apiSources(apiClientTS), genDir, constants.ClientRoutesBundle)
	if gen := r.Dispatch(protocol.Request{Op: protocol.OpGenerate}); gen.Error != "" {
		t.Fatalf("generate: %s", gen.Error)
	}
	lane := readGenerated(t, filepath.Join(genDir, constants.ApiModuleDir), constants.ApiLaneFile+".js")
	if !strings.Contains(lane, "setApiBundled()") || !strings.Contains(lane, apimeta.ClientModule) {
		t.Fatalf("the lane module must set the flag through the client package:\n%s", lane)
	}

	tr := r.Dispatch(protocol.Request{Op: protocol.OpTransform, Files: []string{"client.ts"}})
	if tr.Error != "" {
		t.Fatalf("transform: %s", tr.Error)
	}
	code := tr.Transformed["client.ts"].Code
	if strings.Count(code, "api/lane.js") != 1 {
		t.Errorf("exactly one lane import belongs in a file calling initClient:\n%s", code)
	}
	if strings.Contains(code, "setApiBundled") {
		t.Errorf("the flag must not be spliced into the source:\n%s", code)
	}
}

// TestApiGen_MarkerFormsAgreeWithTheBundledParamsId: the marker coverage rule of
// ts-go-runtypes/CLAUDE.md, in the suite where it is observable. The STATIC form
// `getRunTypeId<T>()` and the REFLECTION form `getRunTypeId(value)` over the same
// params tuple inject the same id, and that id is the `paramsId` the bundled
// route's manifest row carries: a client bundles the very type the ids name.
func TestApiGen_MarkerFormsAgreeWithTheBundledParamsId(t *testing.T) {
	genDir := t.TempDir()
	r := setupApi(t, apiSources(apiMarkerClientTS), genDir, constants.ClientRoutesBundle)
	tr := r.Dispatch(protocol.Request{Op: protocol.OpTransform, Files: []string{"client.ts"}})
	if tr.Error != "" {
		t.Fatalf("transform: %s", tr.Error)
	}
	if diags := metDiags(tr.Diagnostics); len(diags) != 0 {
		t.Fatalf("unexpected MET diagnostics: %+v", diags)
	}
	code := tr.Transformed["client.ts"].Code
	staticForm := injectedId(t, code, "staticId")
	valueForm := injectedId(t, code, "valueId")
	if staticForm != valueForm {
		t.Fatalf("the two getRunTypeId forms must resolve to one id, got %q and %q:\n%s", staticForm, valueForm, code)
	}

	if gen := r.Dispatch(protocol.Request{Op: protocol.OpGenerate}); gen.Error != "" {
		t.Fatalf("generate: %s", gen.Error)
	}
	if paramsId := readClientManifest(t, genDir).Methods["users/getById"].ParamsId; paramsId != staticForm {
		t.Fatalf("the bundled route's paramsId %q must be the id both marker forms name, %q", paramsId, staticForm)
	}
}

const apiSyncClientTS = `import {initClient} from '@mionjs/client';
import {getRunTypeId} from '@mionjs/run-types';
import type {Api} from './api.ts';
export const {routes} = initClient<Api>({baseURL: 'http://x'});
export const a = routes.users.getById(1).call();
export const b = routes.sum(1, 2).call();
export const staticId = getRunTypeId<[[id: number], {id: number; name: string}, 'json', 'json']>();
declare const pair: [[id: number], {id: number; name: string}, 'json', 'json'];
export const valueId = getRunTypeId(pair);
`

// TestApiGen_BundledRowCarriesTheSyncIdOfItsParamsReturnPair: both getRunTypeId forms name it, as a server's syncId slot does.
// A method whose router declares no pair carries none.
func TestApiGen_BundledRowCarriesTheSyncIdOfItsParamsReturnPair(t *testing.T) {
	genDir := t.TempDir()
	r := setupApi(t, apiSources(apiSyncClientTS), genDir, constants.ClientRoutesBundle)
	tr := r.Dispatch(protocol.Request{Op: protocol.OpTransform, Files: []string{"client.ts"}})
	if tr.Error != "" {
		t.Fatalf("transform: %s", tr.Error)
	}
	code := tr.Transformed["client.ts"].Code
	staticForm := injectedId(t, code, "staticId")
	if valueForm := injectedId(t, code, "valueId"); valueForm != staticForm {
		t.Fatalf("the two getRunTypeId forms must resolve to one id, got %q and %q", staticForm, valueForm)
	}
	if gen := r.Dispatch(protocol.Request{Op: protocol.OpGenerate}); gen.Error != "" {
		t.Fatalf("generate: %s", gen.Error)
	}
	apiDir := filepath.Join(genDir, constants.ApiModuleDir)
	if getById := readGenerated(t, apiDir, "m/users/getById.js"); !strings.Contains(getById, `syncId: "`+staticForm+`"`) {
		t.Fatalf("users/getById must carry syncId %q:\n%s", staticForm, getById)
	}
	if sum := readGenerated(t, apiDir, "m/sum.js"); strings.Contains(sum, "syncId") {
		t.Fatalf("sum declares no pair and must carry no syncId:\n%s", sum)
	}
}

// injectedId reads the entry-module binding the transform injected at
// `export const <name> = getRunTypeId(...)`, whose suffix is the type's id.
func injectedId(t *testing.T, code, name string) string {
	t.Helper()
	match := regexp.MustCompile(`export const ` + name + ` = getRunTypeId(?:<[^>]*>)?\([^)]*__rt_(\w+)\)`).FindStringSubmatch(code)
	if match == nil {
		t.Fatalf("no injected id for %s in:\n%s", name, code)
	}
	return match[1]
}

// TestApiGen_NoApiMeansNoApiDir: a program that neither bundles nor
// initializes an API writes no api/ dir, and a stale one is removed.
func TestApiGen_NoApiMeansNoApiDir(t *testing.T) {
	genDir := t.TempDir()
	stale := filepath.Join(genDir, constants.ApiModuleDir)
	if err := os.MkdirAll(stale, 0o755); err != nil {
		t.Fatal(err)
	}
	writeFile(t, filepath.Join(stale, constants.ApiManifestFile), "{}")
	r := setupApi(t, map[string]string{"a.ts": "import {getRunTypeId} from '@mionjs/run-types';\nexport const id = getRunTypeId<{a: number}>();\n"}, genDir, "")
	if gen := r.Dispatch(protocol.Request{Op: protocol.OpGenerate}); gen.Error != "" {
		t.Fatalf("generate: %s", gen.Error)
	}
	if _, err := os.Stat(stale); !os.IsNotExist(err) {
		t.Fatalf("a stale api/ dir must be removed, stat: %v", err)
	}
}

// TestApiGen_MirrorShipsBuiltInPureFnsAsFunctions: the built-in pure fns a
// bundled validator depends on (@mionjs/run-types/src/runtypes/pure-fns-utils#newRunTypeErr and friends) ride the api/
// mirror as live factories like everything else in it, never as code strings,
// whatever the program's own emit mode. A code string there would be rebuilt
// with `new Function` at the first validation, on the client that bundled its
// API precisely to run without dynamic code.
func TestApiGen_MirrorShipsBuiltInPureFnsAsFunctions(t *testing.T) {
	genDir := t.TempDir()
	r := setupApi(t, apiSources(apiClientTS), genDir, constants.ClientRoutesBundle)
	if gen := r.Dispatch(protocol.Request{Op: protocol.OpGenerate}); gen.Error != "" {
		t.Fatalf("generate: %s", gen.Error)
	}
	apiDir := filepath.Join(genDir, constants.ApiModuleDir)
	var pureFnModules []string
	for _, file := range listGenerated(t, apiDir) {
		if strings.HasPrefix(file, "types/pf/") {
			pureFnModules = append(pureFnModules, file)
		}
	}
	if len(pureFnModules) == 0 {
		t.Fatalf("expected the mirror to serve built-in pure fns, got:\n%s", strings.Join(listGenerated(t, apiDir), "\n"))
	}
	for _, file := range pureFnModules {
		source := readGenerated(t, apiDir, file)
		// functions mode: the code slot is a hole and the live factory follows the dep list
		if !strings.Contains(source, "],,[],function") || strings.Contains(source, ",'return ") || strings.Contains(source, ",'const ") {
			t.Errorf("%s must ship a live factory and no code string:\n%s", file, source)
		}
	}
}

// optionalApiTS adds an API with one middleware taking optional params (MET009) and one taking none.
const optionalApiTS = apiTypeTS + `export type OptionalApi = {
  note: {type: 2; handler: (tag?: string) => Promise<void>; options: MfOpts; types?: {params: [tag?: string]; return: void; headers: never; isAsync: false}};
  stamp: {type: 2; handler: () => Promise<number>; options: MfOpts; types?: {params: []; return: number; headers: never; isAsync: false}};
  ping: {type: 1; handler: () => Promise<string>; options: RouteOpts; types?: {params: []; return: string; headers: never; isAsync: false; sync: [[], string, 'json', 'json']}};
};
`

func generateMetDiags(t *testing.T, client string) []diagnostics.Diagnostic {
	t.Helper()
	sess := setupApi(t, map[string]string{"client.d.ts": apiClientDTS, "api.ts": optionalApiTS, "client.ts": client}, t.TempDir(), constants.ClientRoutesBundle)
	gen := sess.Dispatch(protocol.Request{Op: protocol.OpGenerate})
	if gen.Error != "" {
		t.Fatalf("generate: %s", gen.Error)
	}
	return metDiags(gen.Diagnostics)
}

// TestApiGen_ReportsMiddlewaresTheClientNeverSetsUp: MET008 when the middleware needs params, MET009 when all optional.
func TestApiGen_ReportsMiddlewaresTheClientNeverSetsUp(t *testing.T) {
	t.Run("required, never set up", func(t *testing.T) {
		diags := generateMetDiags(t, `import {initClient} from '@mionjs/client';
import type {Api} from './api.ts';
export const {routes, middlewares} = initClient<Api>({baseURL: 'http://x'});
export const a = routes.users.getById(1).call();
export const b = routes.users.getById(2).call();
`)
		if len(diags) != 2 {
			t.Fatalf("expected MET008 for auth and users/audit, got %+v", diags)
		}
		for index, want := range []string{"auth", "users/audit"} {
			diag := diags[index]
			if diag.Code != diagnostics.CodeApiMetaMiddlewareNotSetUp || diag.Args[0] != want || diag.Args[1] != "users/getById" {
				t.Errorf("diag %d: want MET008 for %s on users/getById, got %+v", index, want, diag)
			}
			if diag.Site.StartLine != 4 {
				t.Errorf("diag %d: reported once, at the first call (line 4), got line %d", index, diag.Site.StartLine)
			}
		}
	})

	t.Run("set up through a hook, an installer or a destructured name", func(t *testing.T) {
		diags := generateMetDiags(t, `import {initClient} from '@mionjs/client';
import type {ClientMiddleware} from '@mionjs/client';
import type {Api} from './api.ts';
export const {routes, middlewares} = initClient<Api>({baseURL: 'http://x'});
function installAudit(audit: ClientMiddleware<(why: string) => Promise<void>>) {
  audit.onRequest((call) => call('why'));
}
installAudit(middlewares.users.audit);
const {auth} = middlewares;
auth.onRequest((call) => call({headers: {authorization: 'x'}}));
export const a = routes.users.getById(1).call();
`)
		if len(diags) != 0 {
			t.Fatalf("every middleware is set up, got %+v", diags)
		}
	})

	t.Run("set up through a bracket read", func(t *testing.T) {
		diags := generateMetDiags(t, `import {initClient} from '@mionjs/client';
import type {Api} from './api.ts';
export const {routes, middlewares} = initClient<Api>({baseURL: 'http://x'});
middlewares['auth'].onRequest((call) => call({headers: {authorization: 'x'}}));
export const a = routes.sum(1, 2).call();
`)
		if len(diags) != 0 {
			t.Fatalf("auth is set up, got %+v", diags)
		}
	})

	t.Run("optional, never set up", func(t *testing.T) {
		diags := generateMetDiags(t, `import {initClient} from '@mionjs/client';
import type {OptionalApi} from './api.ts';
export const {routes, middlewares} = initClient<OptionalApi>({baseURL: 'http://x'});
export const a = routes.ping().call();
`)
		if len(diags) != 1 || diags[0].Code != diagnostics.CodeApiMetaOptionalMiddlewareNotSetUp || diags[0].Args[0] != "note" {
			t.Fatalf("expected one MET009 for note, got %+v", diags)
		}
		if diags[0].Level != diagnostics.LevelRuntimeError {
			t.Errorf("MET009 stops the build, got level %v", diags[0].Level)
		}
	})

	t.Run("no params, never set up: nothing to report", func(t *testing.T) {
		diags := generateMetDiags(t, `import {initClient} from '@mionjs/client';
import type {OptionalApi} from './api.ts';
export const {routes, middlewares} = initClient<OptionalApi>({baseURL: 'http://x'});
middlewares.note.onRequest((call) => call('tag'));
export const a = routes.ping().call();
`)
		if len(diags) != 0 {
			t.Fatalf("stamp takes no params, so it needs no setup, got %+v", diags)
		}
	})

	t.Run("optional, silenced above the call", func(t *testing.T) {
		diags := generateMetDiags(t, `import {initClient} from '@mionjs/client';
import type {OptionalApi} from './api.ts';
export const {routes, middlewares} = initClient<OptionalApi>({baseURL: 'http://x'});
// @mion-expect-error MET009
export const a = routes.ping().call();
`)
		if len(diags) != 0 {
			t.Fatalf("the comment silences MET009, got %+v", diags)
		}
	})
}

// metadataRouterDTS declares the metadata middleware the way @mionjs/router does, so the walk recognises it by its declaration.
const metadataRouterDTS = `declare module '@mionjs/router' {
  type Opts = {alwaysRun: true; description: undefined; parser: {params: 'clone'; return: 'clone'}; sanitizeParams: undefined};
  export const mionFetchMetadata: {type: 2; handler: (ids?: string[]) => Promise<void>; options: Opts; types?: {params: [ids?: string[]]; return: void; headers: never; isAsync: false}};
}
`

// metadataApiTS maps each routes object as PublicApi does, so members keep their routes entry's declaration.
const metadataApiTS = optionalApiTS + `import {mionFetchMetadata} from '@mionjs/router';
type Ping = {type: 1; handler: () => Promise<string>; options: RouteOpts; types?: {params: []; return: string; headers: never; isAsync: false; sync: [[], string, 'json', 'json']}};
declare const ping: Ping;
type Mapped<R> = {[K in keyof R]: R[K]};
const routes = {mionFetchMetadata, ping};
export type MetadataApi = Mapped<typeof routes>;
const renamed = {meta: mionFetchMetadata, ping};
export type RenamedApi = Mapped<typeof renamed>;
const served = {mionFetchMetadata, note: {} as OptionalApi['note'], ping};
export type ServedApi = Mapped<typeof served>;
declare const computedKey: 'computed';
const lookAlike = {
  [computedKey]: ping,
  mionFetchMetadata: {} as {type: 2; handler: (ids?: string[]) => Promise<void>; options: MfOpts; types?: {params: [ids?: string[]]; return: void; headers: never; isAsync: false}},
  ping,
};
export type LookAlikeApi = Mapped<typeof lookAlike>;
`

func metadataSession(t *testing.T, mode constants.ClientRoutesMode, client string) *resolver.Session {
	t.Helper()
	sources := map[string]string{"client.d.ts": apiClientDTS, "router.d.ts": metadataRouterDTS, "api.ts": metadataApiTS, "client.ts": client}
	return setupApi(t, sources, t.TempDir(), mode)
}

func generateMetadataDiags(t *testing.T, mode constants.ClientRoutesMode, client string) []diagnostics.Diagnostic {
	t.Helper()
	gen := metadataSession(t, mode, client).Dispatch(protocol.Request{Op: protocol.OpGenerate})
	if gen.Error != "" {
		t.Fatalf("generate: %s", gen.Error)
	}
	return metDiags(gen.Diagnostics)
}

// TestApiGen_MetadataMiddleware: mion's own metadata middleware is set up by `useFetchMetadata`, never reported as unset.
func TestApiGen_MetadataMiddleware(t *testing.T) {
	neverSetUp := func(api string) string {
		return `import {initClient} from '@mionjs/client';
import type {` + api + `} from './api.ts';
export const {routes, middlewares} = initClient<` + api + `>({baseURL: 'http://x'});
export const a = routes.ping().call();
`
	}

	t.Run("bundled, never set up: nothing to report", func(t *testing.T) {
		if diags := generateMetadataDiags(t, constants.ClientRoutesBundle, neverSetUp("MetadataApi")); len(diags) != 0 {
			t.Fatalf("a bundled client never asks for metadata, got %+v", diags)
		}
	})

	t.Run("bundled, under another key: still recognised", func(t *testing.T) {
		if diags := generateMetadataDiags(t, constants.ClientRoutesBundle, neverSetUp("RenamedApi")); len(diags) != 0 {
			t.Fatalf("the middleware is the router's whatever key holds it, got %+v", diags)
		}
	})

	t.Run("bundled, a look-alike the app declares is still a middleware to set up", func(t *testing.T) {
		diags := generateMetadataDiags(t, constants.ClientRoutesBundle, neverSetUp("LookAlikeApi"))
		if len(diags) != 1 || diags[0].Code != diagnostics.CodeApiMetaOptionalMiddlewareNotSetUp || diags[0].Args[0] != "mionFetchMetadata" {
			t.Fatalf("expected one MET009 for the look-alike, got %+v", diags)
		}
	})
}

// fetchingClient: `ping` is called directly on line 6, fetching set up on line 7, then a wide helper's call is widened.
func fetchingClient(api string, setUp, widened bool) string {
	source := `import {initClient, useFetchMetadata} from '@mionjs/client';
import type {RouteSubRequest} from '@mionjs/client';
import type {` + api + `} from './api.ts';
export const {routes, middlewares} = initClient<` + api + `>({baseURL: 'http://x'});
middlewares.note.onRequest((call) => call());
export const a = routes.ping().call();
`
	if setUp {
		source += "useFetchMetadata(middlewares.note as any);\n"
	}
	if widened {
		source += "function wide(sub: RouteSubRequest<any>) { return sub.call(); }\nexport const w = wide(routes.ping());\n"
	}
	return source
}

// TestApiGen_MetadataFetchingSetup: every fetching-table row; a widened call is the only one a bundled client fetches.
func TestApiGen_MetadataFetchingSetup(t *testing.T) {
	const served, bare = "ServedApi", "OptionalApi"
	for _, tc := range []struct {
		name    string
		mode    constants.ClientRoutesMode
		api     string
		setUp   bool
		widened bool
		want    []string
		line    int
	}{
		{"bundled, not set up, widened call fails", constants.ClientRoutesBundle, served, false, true, []string{diagnostics.CodeApiMetaRouteWidened}, 7},
		{"bundled, not set up, API without middleware: same", constants.ClientRoutesBundle, bare, false, true, []string{diagnostics.CodeApiMetaRouteWidened}, 7},
		{"bundled, not set up, nothing widened: nothing to check", constants.ClientRoutesBundle, bare, false, false, nil, 0},
		{"bundled, set up, widened call fetches", constants.ClientRoutesBundle, served, true, true, []string{diagnostics.CodeApiMetaRouteWidenedFetched}, 8},
		{"bundled, set up, nothing widened: fine", constants.ClientRoutesBundle, served, true, false, nil, 0},
		{"bundled, set up, API without middleware: the fetching call fails", constants.ClientRoutesBundle, bare, true, true, []string{diagnostics.CodeApiMetaNoMetadataToFetch}, 8},
		{"bundled, set up, API without middleware, nothing widened: the setup fails", constants.ClientRoutesBundle, bare, true, false, []string{diagnostics.CodeApiMetaNoMetadataToFetch}, 7},
		{"off, set up: fine", constants.ClientRoutesFetch, served, true, true, nil, 0},
		{"off, set up, API without middleware", constants.ClientRoutesFetch, bare, true, false, []string{diagnostics.CodeApiMetaNoMetadataToFetch}, 4},
		{"off, not set up", constants.ClientRoutesFetch, served, false, false, []string{diagnostics.CodeApiMetaFetchNotSetUp}, 4},
		{"off, not set up, API without middleware", constants.ClientRoutesFetch, bare, false, true, []string{diagnostics.CodeApiMetaNoMetadataToFetch}, 4},
	} {
		t.Run(tc.name, func(t *testing.T) {
			client := fetchingClient(tc.api, tc.setUp, tc.widened)
			diags := generateMetadataDiags(t, tc.mode, client)
			var codes []string
			for _, diag := range diags {
				codes = append(codes, diag.Code)
			}
			if strings.Join(codes, ",") != strings.Join(tc.want, ",") {
				t.Fatalf("want %v, got %+v", tc.want, diags)
			}
			if len(diags) == 1 && diags[0].Site.StartLine != tc.line {
				t.Errorf("%s reported on line %d, want %d", diags[0].Code, diags[0].Site.StartLine, tc.line)
			}
			for _, diag := range diags {
				if want := diagnostics.LevelRuntimeError; diag.Code != diagnostics.CodeApiMetaRouteWidenedFetched && diag.Level != want {
					t.Errorf("%s must stop the build, got level %v", diag.Code, diag.Level)
				}
			}
			if tc.mode == constants.ClientRoutesBundle && tc.widened {
				scan := metadataSession(t, tc.mode, client).Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"client.ts"}})
				scanDiags := metDiags(scan.Diagnostics)
				if len(scanDiags) != 1 || scanDiags[0].Code != tc.want[0] || scanDiags[0].Site.StartLine != tc.line {
					t.Errorf("a scan reports the widened call as the build does (%s on line %d), got %+v", tc.want[0], tc.line, scanDiags)
				}
			}
		})
	}
}

// TestApiGen_MetadataFetchingPerClient: `useFetchMetadata` sets up the client its argument comes from, not every client.
func TestApiGen_MetadataFetchingPerClient(t *testing.T) {
	const header = "import {initClient, useFetchMetadata} from '@mionjs/client';\nimport type {RouteSubRequest} from '@mionjs/client';\nimport type {ServedApi, MetadataApi, OptionalApi} from './api.ts';\n"
	t.Run("off: the client that never sets it up is reported, at its own initClient", func(t *testing.T) {
		client := header + `const served = initClient<ServedApi>({baseURL: 'http://x'});
useFetchMetadata(served.middlewares.note as any);
served.middlewares.note.onRequest((call) => call());
export const other = initClient<MetadataApi>({baseURL: 'http://y'});
`
		diags := generateMetadataDiags(t, constants.ClientRoutesFetch, client)
		if len(diags) != 1 || diags[0].Code != diagnostics.CodeApiMetaFetchNotSetUp || diags[0].Site.StartLine != 7 {
			t.Fatalf("expected one MET011 at the second initClient, got %+v", diags)
		}
	})
	t.Run("off: a setup the build cannot follow covers every client", func(t *testing.T) {
		client := header + `export function setUp(middleware: unknown) { useFetchMetadata(middleware as any); }
const served = initClient<ServedApi>({baseURL: 'http://x'});
served.middlewares.note.onRequest((call) => call());
export const other = initClient<MetadataApi>({baseURL: 'http://y'});
`
		if diags := generateMetadataDiags(t, constants.ClientRoutesFetch, client); len(diags) != 0 {
			t.Fatalf("an untraced setup may belong to any client, got %+v", diags)
		}
	})
	t.Run("bundled: a widened call of a client that never sets it up fails", func(t *testing.T) {
		client := header + `const served = initClient<ServedApi>({baseURL: 'http://x'});
useFetchMetadata(served.middlewares.note as any);
served.middlewares.note.onRequest((call) => call());
const bare = initClient<OptionalApi>({baseURL: 'http://y'});
bare.middlewares.note.onRequest((call) => call());
function wide(sub: RouteSubRequest<any, string, OptionalApi>) { return sub.call(); }
export const w = wide(bare.routes.ping());
`
		diags := generateMetadataDiags(t, constants.ClientRoutesBundle, client)
		if len(diags) != 1 || diags[0].Code != diagnostics.CodeApiMetaRouteWidened || diags[0].Site.StartLine != 9 {
			t.Fatalf("expected MET003 at the helper's call, got %+v", diags)
		}
	})
	t.Run("bundled: a widened call that keeps its API answers from that API", func(t *testing.T) {
		client := header + `export function setUp(middleware: unknown) { useFetchMetadata(middleware as any); }
const served = initClient<ServedApi>({baseURL: 'http://x'});
served.middlewares.note.onRequest((call) => call());
const bare = initClient<OptionalApi>({baseURL: 'http://y'});
bare.middlewares.note.onRequest((call) => call());
function wide(sub: RouteSubRequest<any, string, OptionalApi>) { return sub.call(); }
export const w = wide(bare.routes.ping());
`
		diags := generateMetadataDiags(t, constants.ClientRoutesBundle, client)
		if len(diags) != 1 || diags[0].Code != diagnostics.CodeApiMetaNoMetadataToFetch || diags[0].Site.StartLine != 9 {
			t.Fatalf("expected MET010 from OptionalApi, not the served client's fallback, got %+v", diags)
		}
	})
	t.Run("off: an API the build cannot read still needs its setup", func(t *testing.T) {
		client := "import {initClient} from '@mionjs/client';\nexport const loose = initClient<{nothing: string}>({baseURL: 'http://x'});\n"
		diags := generateMetadataDiags(t, constants.ClientRoutesFetch, client)
		if len(diags) != 1 || diags[0].Code != diagnostics.CodeApiMetaFetchNotSetUp || diags[0].Site.StartLine != 2 {
			t.Fatalf("expected MET011 at initClient, got %+v", diags)
		}
	})
}

// TestApiGen_MetadataFetchingReportsOncePerApi: two clients of one API get one report, at the first `initClient`.
func TestApiGen_MetadataFetchingReportsOncePerApi(t *testing.T) {
	client := fetchingClient("ServedApi", false, false) + "export const second = initClient<ServedApi>({baseURL: 'http://y'});\n"
	diags := generateMetadataDiags(t, constants.ClientRoutesFetch, client)
	if len(diags) != 1 || diags[0].Code != diagnostics.CodeApiMetaFetchNotSetUp || diags[0].Site.StartLine != 4 {
		t.Fatalf("expected one MET011 at the first initClient, got %+v", diags)
	}
	bare := fetchingClient("OptionalApi", true, false) + "export const second = initClient<OptionalApi>({baseURL: 'http://y'});\n"
	diags = generateMetadataDiags(t, constants.ClientRoutesFetch, bare)
	if len(diags) != 1 || diags[0].Code != diagnostics.CodeApiMetaNoMetadataToFetch || diags[0].Site.StartLine != 4 {
		t.Fatalf("expected one MET010 at the first initClient, got %+v", diags)
	}
}

// TestApiGen_MetadataFetchingNeedsAClient: an off build that never calls `initClient` checks nothing.
func TestApiGen_MetadataFetchingNeedsAClient(t *testing.T) {
	if diags := generateMetadataDiags(t, constants.ClientRoutesFetch, "export const x = 1;\n"); len(diags) != 0 {
		t.Fatalf("a program with no client has nothing to fetch, got %+v", diags)
	}
}

// TestApiGen_MetadataFetchingSurvivesAnEdit: the fetching facts drop with the Program, so adding the setup clears MET011.
func TestApiGen_MetadataFetchingSurvivesAnEdit(t *testing.T) {
	sources := map[string]string{"client.d.ts": apiClientDTS, "router.d.ts": metadataRouterDTS, "api.ts": metadataApiTS, "client.ts": fetchingClient("ServedApi", false, false)}
	sess := setupApi(t, sources, t.TempDir(), constants.ClientRoutesFetch)
	if diags := metDiags(sess.Dispatch(protocol.Request{Op: protocol.OpGenerate}).Diagnostics); len(diags) != 1 {
		t.Fatalf("expected MET011 before the edit, got %+v", diags)
	}
	sources["client.ts"] = fetchingClient("ServedApi", true, false)
	if resp := sess.Dispatch(protocol.Request{Op: protocol.OpSetSources, Sources: withRealMarker(t, sources)}); resp.Error != "" {
		t.Fatalf("setSources: %s", resp.Error)
	}
	if diags := metDiags(sess.Dispatch(protocol.Request{Op: protocol.OpGenerate}).Diagnostics); len(diags) != 0 {
		t.Fatalf("the edit set up fetching, got %+v", diags)
	}
}

// TestApiGen_MiddlewareReadsFollowAnEdit: the middleware reads drop with the Program, so setting one up clears MET009.
func TestApiGen_MiddlewareReadsFollowAnEdit(t *testing.T) {
	client := func(setUp string) string {
		return `import {initClient} from '@mionjs/client';
import type {OptionalApi} from './api.ts';
export const {routes, middlewares} = initClient<OptionalApi>({baseURL: 'http://x'});
` + setUp + `export const a = routes.ping().call();
`
	}
	sources := map[string]string{"client.d.ts": apiClientDTS, "router.d.ts": metadataRouterDTS, "api.ts": metadataApiTS, "client.ts": client("")}
	sess := setupApi(t, sources, t.TempDir(), constants.ClientRoutesBundle)
	if diags := metDiags(sess.Dispatch(protocol.Request{Op: protocol.OpGenerate}).Diagnostics); len(diags) != 1 || diags[0].Code != diagnostics.CodeApiMetaOptionalMiddlewareNotSetUp {
		t.Fatalf("expected MET009 before the edit, got %+v", diags)
	}
	sources["client.ts"] = client("middlewares.note.onRequest((call) => call());\n")
	if resp := sess.Dispatch(protocol.Request{Op: protocol.OpSetSources, Sources: withRealMarker(t, sources)}); resp.Error != "" {
		t.Fatalf("setSources: %s", resp.Error)
	}
	if diags := metDiags(sess.Dispatch(protocol.Request{Op: protocol.OpGenerate}).Diagnostics); len(diags) != 0 {
		t.Fatalf("the edit set the middleware up, got %+v", diags)
	}
}

// TestApiGen_DirectiveAboveALineOpeningCall: a call opening its line is reported there, where the directive above reaches.
func TestApiGen_DirectiveAboveALineOpeningCall(t *testing.T) {
	client := strings.Replace(fetchingClient("OptionalApi", true, false), "useFetchMetadata(", "// @mion-expect-error MET010\nuseFetchMetadata(", 1)
	if diags := generateMetadataDiags(t, constants.ClientRoutesBundle, client); len(diags) != 0 {
		t.Fatalf("the directive silences MET010 at the setup call, got %+v", diags)
	}
}

// publishedMetadataDTS is a built API's .d.ts: the middleware type is inlined, only its handler names FetchMetadataHandler.
const publishedMetadataDTS = `declare module '@mionjs/core' {
  export type FetchMetadataHandler = (ids?: string[]) => Promise<void>;
}
declare module '@acme/api' {
  type Opts = {alwaysRun: true; description: undefined; parser: {params: 'clone'; return: 'clone'}; sanitizeParams: undefined};
  type RouteOpts = {alwaysRun: false; description: undefined; parser: {params: 'clone'; return: 'clone'}; isMutation: undefined; sanitizeParams: undefined};
  export const api: {
    mionFetchMetadata: {type: 2; handler: (ids?: string[]) => ReturnType<import('@mionjs/core').FetchMetadataHandler>; options: Opts; types?: {params: [ids?: string[]]; return: void; headers: never; isAsync: false}};
    ping: {type: 1; handler: () => Promise<string>; options: RouteOpts; types?: {params: []; return: string; headers: never; isAsync: false; sync: [[], string, 'json', 'json']}};
  };
}
`

func publishedMetadataDiags(t *testing.T, mode constants.ClientRoutesMode, setUp bool) []diagnostics.Diagnostic {
	t.Helper()
	client := `import {initClient, useFetchMetadata} from '@mionjs/client';
import type {api} from '@acme/api';
export const {routes, middlewares} = initClient<typeof api>({baseURL: 'http://x'});
export const a = routes.ping().call();
`
	if setUp {
		client += "useFetchMetadata(middlewares.mionFetchMetadata as any);\n"
	}
	sources := map[string]string{"client.d.ts": apiClientDTS, "router.d.ts": metadataRouterDTS, "published.d.ts": publishedMetadataDTS, "client.ts": client}
	gen := setupApi(t, sources, t.TempDir(), mode).Dispatch(protocol.Request{Op: protocol.OpGenerate})
	if gen.Error != "" {
		t.Fatalf("generate: %s", gen.Error)
	}
	var out []diagnostics.Diagnostic
	for _, diag := range metDiags(gen.Diagnostics) {
		// The fixture has no build version; MET013 is not this test's business.
		if diag.Code != diagnostics.CodeApiMetaNoServerVersion {
			out = append(out, diag)
		}
	}
	return out
}

// TestApiGen_MetadataMiddlewareFromPublishedTypes: a .d.ts loses the value's origin, so the handler type identifies it.
func TestApiGen_MetadataMiddlewareFromPublishedTypes(t *testing.T) {
	t.Run("bundled, never set up: nothing to report", func(t *testing.T) {
		if diags := publishedMetadataDiags(t, constants.ClientRoutesBundle, false); len(diags) != 0 {
			t.Fatalf("a bundled client never asks for metadata, got %+v", diags)
		}
	})
	t.Run("fetching, set up: the API places the middleware", func(t *testing.T) {
		if diags := publishedMetadataDiags(t, constants.ClientRoutesFetch, true); len(diags) != 0 {
			t.Fatalf("expected no MET diagnostics, got %+v", diags)
		}
	})
}
