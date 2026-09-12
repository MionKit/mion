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

// apiClientDTS is an ambient stand-in for the `@mionjs/client` surface the
// bundled-API lane reads (the subrequest interfaces carrying the route id and
// the API, the dispatch methods with their trailing marker slot, the proxies,
// the batch builder and the initClient anchor). The marker is the REAL one.
const apiClientDTS = `declare module '@mionjs/client' {
  import type {InjectApiMetadata} from '@mionjs/run-types';
  export interface RouteSubRequest<PH, Id extends string = string, RA = any> {
    id: Id;
    call(setup?: unknown, apiMetadata?: InjectApiMetadata<RA, Id>): Promise<unknown>;
    typeErrors(apiMetadata?: InjectApiMetadata<RA, Id>): Promise<unknown>;
  }
  export interface MiddlewareSubRequest<PH, Id extends string = string, RA = any> {
    id: Id;
    prefill(apiMetadata?: InjectApiMetadata<RA, Id>): unknown;
  }
  type Handler = (...args: any[]) => any;
  export type ClientRoutes<RA, Prefix extends string = '', Root = RA> = {
    [K in keyof RA as RA[K] extends {type: 1} ? K : RA[K] extends {type: number} ? never : K]: RA[K] extends {type: 1; handler: infer H extends Handler}
      ? (...params: Parameters<H>) => RouteSubRequest<H, ` + "`${Prefix}${K & string}`" + `, Root>
      : ClientRoutes<RA[K], ` + "`${Prefix}${K & string}/`" + `, Root>;
  };
  export type ClientMiddleFns<RA, Prefix extends string = '', Root = RA> = {
    [K in keyof RA as RA[K] extends {type: 2 | 3} ? K : RA[K] extends {type: number} ? never : K]: RA[K] extends {type: 2 | 3; handler: infer H extends Handler}
      ? (...params: Parameters<H>) => MiddlewareSubRequest<H, ` + "`${Prefix}${K & string}`" + `, Root>
      : ClientMiddleFns<RA[K], ` + "`${Prefix}${K & string}/`" + `, Root>;
  };
  export type ApiOf<Routes extends {id: string}[]> = Routes[number] extends RouteSubRequest<any, any, infer RA> ? RA : never;
  export interface BatchBuilder<Routes extends RouteSubRequest<any>[]> {
    call(setup?: unknown, apiMetadata?: InjectApiMetadata<ApiOf<Routes>, Routes[number]['id']>): Promise<unknown>;
  }
  export function batch<R extends RouteSubRequest<any>[]>(routes: [...R]): BatchBuilder<R>;
  export function initClient<RA>(o?: unknown, mode?: InjectApiMetadata<RA>): {routes: ClientRoutes<RA>; middleFns: ClientMiddleFns<RA>};
}
`

// apiTypeTS is the client's view of the API, the shape PublicApi<typeof routes>
// takes: a headers middleFn, a plain middleFn, two routes in a group and one
// at the root.
const apiTypeTS = `type Headers = {headers: {authorization: string}};
type MfOpts = {alwaysRun: false; validateParams: true; validateReturn: false; description: undefined; encoder: {params: 'clone'; return: 'clone'}; strictTypes: undefined; sanitizeParams: undefined};
type RouteOpts = {alwaysRun: false; validateParams: true; validateReturn: false; description: undefined; encoder: {params: 'clone'; return: 'clone'}; isMutation: undefined; strictTypes: undefined; sanitizeParams: undefined};
export type Api = {
  auth: {type: 3; handler: (h: Headers) => Promise<void>; options: MfOpts; types?: {params: []; return: void; headers: Headers; isAsync: false}};
  users: {
    getById: {type: 1; handler: (id: number) => Promise<{id: number; name: string}>; options: RouteOpts; types?: {params: [id: number]; return: {id: number; name: string}; headers: never; isAsync: true}};
    audit: {type: 2; handler: (why: string) => Promise<void>; options: MfOpts; types?: {params: [why: string]; return: void; headers: never; isAsync: false}};
    remove: {type: 1; handler: (id: number) => Promise<boolean>; options: RouteOpts; types?: {params: [id: number]; return: boolean; headers: never; isAsync: false}};
  };
  sum: {type: 1; handler: (a: number, b: number) => Promise<number>; options: RouteOpts; types?: {params: [a: number, b: number]; return: number; headers: never; isAsync: false}};
};
`

// apiClientTS is the client program: one route call, one prefill, a batch,
// and a route (users/remove) the program never calls.
const apiClientTS = `import {initClient, batch} from '@mionjs/client';
import type {Api} from './api.ts';
export const {routes, middleFns} = initClient<Api>({baseURL: 'http://x'});
export const a = routes.users.getById(1).call();
export const b = middleFns.auth({headers: {authorization: 'x'}}).prefill();
export const c = batch([routes.users.getById(2), routes.sum(1, 2)]).call();
`

func apiSources(client string) map[string]string {
	return map[string]string{"client.d.ts": apiClientDTS, "api.ts": apiTypeTS, "client.ts": client}
}

func setupApi(t *testing.T, sources map[string]string, genDir string, mode constants.BundleApiMode, apiTsconfig string) *resolver.Session {
	t.Helper()
	return setupInlineWith(t, sources, func(programOpts *program.Options, resolverOpts *resolver.Options) {
		programOpts.SingleThreaded = true
		resolverOpts.SingleThreaded = true
		resolverOpts.GenDir = genDir
		resolverOpts.TransformRelative = true
		resolverOpts.BundleApi = mode
		resolverOpts.ApiTsconfig = apiTsconfig
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
// module per called route or middleFn plus its chain, one per site shape, the
// entry mirror under api/types in factory form, and nothing for an uncalled
// route.
func TestApiGen_GenerateWritesUsedRoutesWithTheirChains(t *testing.T) {
	genDir := t.TempDir()
	r := setupApi(t, apiSources(apiClientTS), genDir, constants.BundleApiBundled, "")
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
	for _, want := range []string{"m/users/getById.js", "m/users/audit.js", "m/auth.js", "m/sum.js", "s/users/getById.js", "s/auth.js"} {
		if !strings.Contains(joined, want) {
			t.Errorf("missing %s in api/:\n%s", want, joined)
		}
	}
	if strings.Contains(joined, "m/users/remove.js") {
		t.Errorf("users/remove is never called and must not be bundled:\n%s", joined)
	}
	// the batch site module is hashed over both ids and lists both routes plus
	// the chain middleFns
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
	for _, want := range []string{`"id":"users/getById"`, `"pointer":["users","getById"]`, `"nestLevel":1`, `"type":1`, `"isAsync":true`, `"middleFnIds":["auth","users/audit"]`, `"encoder":{"params":"clone","return":"clone"}`, `"rtFns": {paramsFns: [`, `returnFns: [`, `paramsId: __rt_`, `returnId: __rt_`, "from '../../types/"} {
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
	if strings.Contains(auth, "middleFnIds") {
		t.Errorf("a middleFn carries no chain:\n%s", auth)
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
			from := line[strings.LastIndex(line, "'")+1:]
			_ = from
			specifier := line[strings.Index(line, "from '")+6 : len(line)-2]
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

// TestApiGen_TransformInjectsModeAndSiteBindings: the rewritten client file
// carries the mode literal at initClient and, at every dispatch site, an
// import of its site module relative to the file.
func TestApiGen_TransformInjectsModeAndSiteBindings(t *testing.T) {
	genDir := t.TempDir()
	r := setupApi(t, apiSources(apiClientTS), genDir, constants.BundleApiMixed, "")
	tr := r.Dispatch(protocol.Request{Op: protocol.OpTransform, Files: []string{"client.ts"}})
	if tr.Error != "" {
		t.Fatalf("transform: %s", tr.Error)
	}
	if diags := metDiags(tr.Diagnostics); len(diags) != 0 {
		t.Fatalf("unexpected MET diagnostics: %+v", diags)
	}
	code := tr.Transformed["client.ts"].Code
	if !strings.Contains(code, "initClient<Api>({baseURL: 'http://x'}, 'mixed')") {
		t.Errorf("the anchor did not receive the mode:\n%s", code)
	}
	if !strings.Contains(code, ".call(undefined, __rt_s$2Fusers$2FgetById)") {
		t.Errorf("the route call did not receive its binding:\n%s", code)
	}
	if !strings.Contains(code, ".prefill(__rt_s$2Fauth)") {
		t.Errorf("the prefill did not receive its binding:\n%s", code)
	}
	if !strings.Contains(code, "from '") || !strings.Contains(code, "/api/s/users/getById.js'") || !strings.Contains(code, "/api/s/auth.js'") {
		t.Errorf("site module imports must be relative paths under <genDir>/api:\n%s", code)
	}
	if strings.Contains(code, "rtapi:/") {
		t.Errorf("virtual specifier survived relativization:\n%s", code)
	}
}

// TestApiGen_OffMeansNothing: without bundleApi the sites are not sites, no
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
	r := setupApi(t, apiSources(apiClientTS), genDir, constants.BundleApiOff, "")
	tr := r.Dispatch(protocol.Request{Op: protocol.OpTransform, Files: []string{"client.ts"}})
	if tr.Error != "" {
		t.Fatalf("transform: %s", tr.Error)
	}
	code := tr.Transformed["client.ts"].Code
	if strings.Contains(code, "__rt_s$2F") || strings.Contains(code, "'bundled'") || strings.Contains(code, "'mixed'") {
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
	full := setupApi(t, apiSources(apiClientTS), genDir, constants.BundleApiBundled, "")
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
`), genDir, constants.BundleApiBundled, "")
	if gen := fewer.Dispatch(protocol.Request{Op: protocol.OpGenerate}); gen.Error != "" {
		t.Fatalf("generate: %s", gen.Error)
	}
	after := strings.Join(listGenerated(t, apiDir), "\n")
	if strings.Contains(after, "m/sum.js") || strings.Contains(after, "s/b_") || strings.Contains(after, "s/auth.js") {
		t.Errorf("modules of dropped calls survived:\n%s", after)
	}
	if !strings.Contains(after, "m/users/getById.js") || !strings.Contains(after, "m/auth.js") {
		t.Errorf("the remaining call and its chain must stay:\n%s", after)
	}
	none := setupApi(t, apiSources(`import {initClient} from '@mionjs/client';
import type {Api} from './api.ts';
export const {routes} = initClient<Api>({baseURL: 'http://x'});
`), genDir, constants.BundleApiBundled, "")
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
`}, genDir, constants.BundleApiBundled, "")
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
export const {routes} = initClient<Api>({baseURL: 'http://x'});
declare const ghost: {call(setup?: unknown, apiMetadata?: InjectApiMetadata<Api, 'users/ghost'>): Promise<unknown>};
export const a = ghost.call();
export const b = routes.sum(1, 2).call();
`}, t.TempDir(), constants.BundleApiBundled, "")
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
// PublicApi shape, for the on-disk API project the apiTsconfig pointer names
// and for the inline "server build" session of the manifest tests.
const apiServerRouterDTS = `declare module '@mionjs/router' {
  type Handler = (...args: any[]) => any;
  type Opts = {alwaysRun: false; validateParams: true; validateReturn: false; description: undefined; encoder: {params: 'clone'; return: 'clone'}; isMutation: undefined; strictTypes: undefined; sanitizeParams: undefined};
  export type PublicApi<R> = {
    [K in keyof R]: R[K] extends {type: infer T; handler: infer H extends Handler}
      ? {type: T; handler: H; options: Opts; types?: {params: Parameters<H>; return: Awaited<ReturnType<H>>; headers: never; isAsync: false}}
      : PublicApi<R[K]>;
  };
  export interface MionRouter { initRoutes<R>(routes: R): PublicApi<R> }
  export function createMionRouter(): MionRouter;
}
`

// apiServerRoutesTS is the API project's source: initCalls `initRoutes`
// calls over the same two routes. getById's params tuple carries a boolean
// the client's own declaration lacks, so a validator mentioning `boolean`
// proves the ids came from this program; extraParam adds a third parameter,
// the kind of server-side edit api-check exists to catch.
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

// writeApiServerProject writes the on-disk API project the apiTsconfig
// pointer can name: the ambient router and a source file initializing the
// routes initCalls times.
func writeApiServerProject(t *testing.T, dir string, initCalls int) string {
	t.Helper()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	tsconfig := filepath.Join(dir, "tsconfig.json")
	writeFile(t, tsconfig, `{"compilerOptions": {"strict": true, "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler", "noEmit": true}, "include": ["*.ts"]}`)
	writeFile(t, filepath.Join(dir, "router.d.ts"), apiServerRouterDTS)
	writeFile(t, filepath.Join(dir, "routes.ts"), apiServerRoutesTS(initCalls, false))
	return tsconfig
}

func writeFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

// apiPeerClientTS is the client whose API declaration (numbers only) differs
// from the server project's (a boolean too), with the same route ids.
const apiPeerClientTS = `import {initClient} from '@mionjs/client';
type RouteOpts = {alwaysRun: false; validateParams: true; validateReturn: false; description: undefined; encoder: {params: 'clone'; return: 'clone'}; isMutation: undefined; strictTypes: undefined; sanitizeParams: undefined};
type Api = {
  users: {getById: {type: 1; handler: (id: number) => Promise<{id: number; name: string}>; options: RouteOpts; types?: {params: [id: number]; return: {id: number; name: string}; headers: never; isAsync: false}}};
  sum: {type: 1; handler: (a: number, b: number) => Promise<number>; options: RouteOpts; types?: {params: [a: number, b: number]; return: number; headers: never; isAsync: false}};
};
export const {routes} = initClient<Api>({baseURL: 'http://x'});
export const a = routes.users.getById(1).call();
`

func paramsValidatorsMentionBoolean(t *testing.T, apiDir string) bool {
	t.Helper()
	for _, file := range listGenerated(t, apiDir) {
		if strings.HasPrefix(file, "types/") && strings.HasSuffix(file, ".js") && strings.Contains(readGenerated(t, apiDir, file), "boolean") {
			return true
		}
	}
	return false
}

// TestApiGen_ApiTsconfigResolvesTypesInTheApiProgram: with the pointer the
// route types come from the API project's own program (the boolean the client
// never declared shows up); without it the client's declaration is used.
func TestApiGen_ApiTsconfigResolvesTypesInTheApiProgram(t *testing.T) {
	serverTsconfig := writeApiServerProject(t, filepath.Join(t.TempDir(), "server"), 1)
	genDir := t.TempDir()
	peer := setupApi(t, map[string]string{"client.d.ts": apiClientDTS, "client.ts": apiPeerClientTS}, genDir, constants.BundleApiBundled, serverTsconfig)
	gen := peer.Dispatch(protocol.Request{Op: protocol.OpGenerate})
	if gen.Error != "" {
		t.Fatalf("generate: %s", gen.Error)
	}
	if diags := metDiags(gen.Diagnostics); len(diags) != 0 {
		t.Fatalf("unexpected MET diagnostics: %+v", diags)
	}
	apiDir := filepath.Join(genDir, constants.ApiModuleDir)
	if !paramsValidatorsMentionBoolean(t, apiDir) {
		t.Errorf("the API program's params (with a boolean) were not the ones compiled:\n%s", strings.Join(listGenerated(t, apiDir), "\n"))
	}
	ownDir := t.TempDir()
	own := setupApi(t, map[string]string{"client.d.ts": apiClientDTS, "client.ts": apiPeerClientTS}, ownDir, constants.BundleApiBundled, "")
	if gen := own.Dispatch(protocol.Request{Op: protocol.OpGenerate}); gen.Error != "" {
		t.Fatalf("generate: %s", gen.Error)
	}
	if paramsValidatorsMentionBoolean(t, filepath.Join(ownDir, constants.ApiModuleDir)) {
		t.Errorf("without the pointer the client's own declaration (no boolean) must be compiled")
	}
}

// TestApiGen_ApiTsconfigNeedsOneMatchingInitRoutes: two initRoutes calls
// declaring the same routes, or none, are MET005.
func TestApiGen_ApiTsconfigNeedsOneMatchingInitRoutes(t *testing.T) {
	two := writeApiServerProject(t, filepath.Join(t.TempDir(), "server"), 2)
	r := setupApi(t, map[string]string{"client.d.ts": apiClientDTS, "client.ts": apiPeerClientTS}, t.TempDir(), constants.BundleApiBundled, two)
	gen := r.Dispatch(protocol.Request{Op: protocol.OpGenerate})
	if gen.Error != "" {
		t.Fatalf("generate: %s", gen.Error)
	}
	diags := metDiags(gen.Diagnostics)
	if len(diags) != 1 || diags[0].Code != diagnostics.CodeApiMetaSourceAmbiguous || !strings.Contains(strings.Join(diags[0].Args, " "), "2") {
		t.Fatalf("expected one MET005 naming 2 candidates, got %+v", diags)
	}
	none := writeApiServerProject(t, filepath.Join(t.TempDir(), "server"), 0)
	r = setupApi(t, map[string]string{"client.d.ts": apiClientDTS, "client.ts": apiPeerClientTS}, t.TempDir(), constants.BundleApiBundled, none)
	gen = r.Dispatch(protocol.Request{Op: protocol.OpGenerate})
	if gen.Error != "" {
		t.Fatalf("generate: %s", gen.Error)
	}
	diags = metDiags(gen.Diagnostics)
	if len(diags) != 1 || diags[0].Code != diagnostics.CodeApiMetaSourceAmbiguous {
		t.Fatalf("expected one MET005, got %+v", diags)
	}
}

func readManifest(t *testing.T, genDir string) *apimeta.Manifest {
	t.Helper()
	manifest, err := apimeta.ReadManifest(filepath.Join(genDir, constants.ApiModuleDir, constants.ApiManifestFile))
	if err != nil {
		t.Fatalf("reading the manifest under %s: %v", genDir, err)
	}
	return manifest
}

// TestApiGen_ClientManifestListsTheBundledMethods: a client build writes a
// client manifest holding exactly the bundled methods, with the ids, families,
// options and chains the modules carry.
func TestApiGen_ClientManifestListsTheBundledMethods(t *testing.T) {
	genDir := t.TempDir()
	r := setupApi(t, apiSources(apiClientTS), genDir, constants.BundleApiMixed, "")
	if gen := r.Dispatch(protocol.Request{Op: protocol.OpGenerate}); gen.Error != "" {
		t.Fatalf("generate: %s", gen.Error)
	}
	manifest := readManifest(t, genDir)
	if manifest.Kind != apimeta.ManifestKindClient || manifest.Mode != "mixed" {
		t.Fatalf("expected a client manifest under mixed, got kind %q mode %q", manifest.Kind, manifest.Mode)
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
	if got := strings.Join(getById.MiddleFnIds, ","); got != "auth,users/audit" {
		t.Errorf("getById chain: %s", got)
	}
	if got := strings.Join(getById.Families, ","); got != "val,verr,huk,uke,fmt,pjs,rj,val,verr,huk,uke,pjs,rj" {
		t.Errorf("getById families: %s", got)
	}
	if getById.Options["validateParams"] != true {
		t.Errorf("getById options: %+v", getById.Options)
	}
	if auth := manifest.Methods["auth"]; auth.Type != 3 || auth.HeadersId == "" || len(auth.MiddleFnIds) != 0 {
		t.Errorf("auth row: %+v", auth)
	}
}

// TestApiGen_ManifestsAgreeAcrossProjects: the server build's manifest (kind
// server, from its initRoutes call) and a client built with apiTsconfig over
// the same project compare equal; a server-side edit of a handler no longer
// does, on exactly the field that changed.
func TestApiGen_ManifestsAgreeAcrossProjects(t *testing.T) {
	serverTsconfig := writeApiServerProject(t, filepath.Join(t.TempDir(), "server"), 1)
	serverGen := t.TempDir()
	server := setupApi(t, map[string]string{"router.d.ts": apiServerRouterDTS, "routes.ts": apiServerRoutesTS(1, false)}, serverGen, "", "")
	if gen := server.Dispatch(protocol.Request{Op: protocol.OpGenerate}); gen.Error != "" {
		t.Fatalf("server generate: %s", gen.Error)
	}
	serverManifest := readManifest(t, serverGen)
	if serverManifest.Kind != apimeta.ManifestKindServer || len(serverManifest.Methods) != 2 || len(serverManifest.Ambiguous) != 0 {
		t.Fatalf("server manifest: %+v", serverManifest)
	}
	clientGen := t.TempDir()
	client := setupApi(t, map[string]string{"client.d.ts": apiClientDTS, "client.ts": apiPeerClientTS}, clientGen, constants.BundleApiBundled, serverTsconfig)
	if gen := client.Dispatch(protocol.Request{Op: protocol.OpGenerate}); gen.Error != "" {
		t.Fatalf("client generate: %s", gen.Error)
	}
	clientManifest := readManifest(t, clientGen)
	if clientManifest.Kind != apimeta.ManifestKindClient || clientManifest.ApiTsconfig != serverTsconfig || len(clientManifest.Methods) != 1 {
		t.Fatalf("client manifest: %+v", clientManifest)
	}
	if mismatches := apimeta.Compare(clientManifest, serverManifest); len(mismatches) != 0 {
		t.Fatalf("the two builds disagree: %v", mismatches)
	}

	// the server grows a parameter: its manifest moves, the client's (built
	// against the old server) no longer matches on paramsId
	editedGen := t.TempDir()
	edited := setupApi(t, map[string]string{"router.d.ts": apiServerRouterDTS, "routes.ts": apiServerRoutesTS(1, true)}, editedGen, "", "")
	if gen := edited.Dispatch(protocol.Request{Op: protocol.OpGenerate}); gen.Error != "" {
		t.Fatalf("edited server generate: %s", gen.Error)
	}
	mismatches := apimeta.Compare(clientManifest, readManifest(t, editedGen))
	if len(mismatches) != 1 || mismatches[0].Id != "users/getById" || mismatches[0].Field != "paramsId" {
		t.Fatalf("expected one paramsId mismatch on users/getById, got %v", mismatches)
	}
}

// TestApiGen_ServerManifestFlagsAnAmbiguousId: two initRoutes calls declaring
// one id with different types list it as ambiguous; equal declarations do not.
func TestApiGen_ServerManifestFlagsAnAmbiguousId(t *testing.T) {
	sameGen := t.TempDir()
	same := setupApi(t, map[string]string{"router.d.ts": apiServerRouterDTS, "routes.ts": apiServerRoutesTS(2, false)}, sameGen, "", "")
	if gen := same.Dispatch(protocol.Request{Op: protocol.OpGenerate}); gen.Error != "" {
		t.Fatalf("generate: %s", gen.Error)
	}
	if manifest := readManifest(t, sameGen); len(manifest.Ambiguous) != 0 || len(manifest.Methods) != 2 {
		t.Fatalf("equal declarations must not be ambiguous: %+v", manifest)
	}
	differGen := t.TempDir()
	source := apiServerRoutesTS(1, false) + strings.Replace(strings.TrimPrefix(apiServerRoutesTS(1, true), apiServerRoutesTS(0, true)), "api0", "api1", 1)
	differ := setupApi(t, map[string]string{"router.d.ts": apiServerRouterDTS, "routes.ts": source}, differGen, "", "")
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

// TestApiGen_MarkerFormsAgreeWithTheBundledParamsId: the marker coverage rule of
// ts-go-runtypes/CLAUDE.md, in the suite where it is observable. The STATIC form
// `getRunTypeId<T>()` and the REFLECTION form `getRunTypeId(value)` over the same
// params tuple inject the same id, and that id is the `paramsId` the bundled
// route's manifest row carries: a client bundles the very type the ids name.
func TestApiGen_MarkerFormsAgreeWithTheBundledParamsId(t *testing.T) {
	genDir := t.TempDir()
	r := setupApi(t, apiSources(apiMarkerClientTS), genDir, constants.BundleApiBundled, "")
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
	if paramsId := readManifest(t, genDir).Methods["users/getById"].ParamsId; paramsId != staticForm {
		t.Fatalf("the bundled route's paramsId %q must be the id both marker forms name, %q", paramsId, staticForm)
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
	r := setupApi(t, map[string]string{"a.ts": "import {getRunTypeId} from '@mionjs/run-types';\nexport const id = getRunTypeId<{a: number}>();\n"}, genDir, "", "")
	if gen := r.Dispatch(protocol.Request{Op: protocol.OpGenerate}); gen.Error != "" {
		t.Fatalf("generate: %s", gen.Error)
	}
	if _, err := os.Stat(stale); !os.IsNotExist(err) {
		t.Fatalf("a stale api/ dir must be removed, stat: %v", err)
	}
}

// TestApiGen_MirrorShipsBuiltInPureFnsAsFunctions: the built-in pure fns a
// bundled validator depends on (rt::newRunTypeErr and friends) ride the api/
// mirror as live factories like everything else in it, never as code strings,
// whatever the program's own emit mode. A code string there would be rebuilt
// with `new Function` at the first validation, on the client that bundled its
// API precisely to run without dynamic code.
func TestApiGen_MirrorShipsBuiltInPureFnsAsFunctions(t *testing.T) {
	genDir := t.TempDir()
	r := setupApi(t, apiSources(apiClientTS), genDir, constants.BundleApiBundled, "")
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
