package requestbatch

import (
	"context"
	"sort"
	"strconv"
	"strings"
	"testing"

	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefunctions"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/program"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/testfixtures"
)

// clientDts is an ambient stand-in for the `@mionjs/client` surface a batch is
// read against: the routes proxy `initClient()` returns, the `RouteSubRequest`
// every route call yields, the two-overload `inputFrom` mapper factory (name
// lane + branded inline lane) and the branded `batch`. The markers it forwards
// come from the REAL `@mionjs/run-types` package (realMarkerFiles), so the
// brand checks run against the shipped declarations.
const clientDts = `declare module '@mionjs/client' {
  import type {PureFunction, InjectPureFnHash, InjectBatchId} from '@mionjs/run-types';
  export interface RouteSubRequest<PH> { id: string }
  export type ClientRoutes<RA> = { [K in keyof RA]: RA[K] extends (...a: infer P) => infer R ? (...p: P) => RouteSubRequest<RA[K]> : ClientRoutes<RA[K]> };
  export function initClient<RA>(o?: unknown): {client: unknown; routes: ClientRoutes<RA>};
  export interface InputFromRef<F> { asArg(): ReturnType<F> }
  export function inputFrom<S extends RouteSubRequest<any>, M = any>(source: S, name: string): InputFromRef<(v: any) => M>;
  export function inputFrom<S extends RouteSubRequest<any>, M = any>(source: S, mapper: PureFunction<(v: any) => M>, hash?: InjectPureFnHash<(v: any) => M>): InputFromRef<(v: any) => M>;
  export function batch<R extends RouteSubRequest<any>[]>(routes: [...R], batchId?: InjectBatchId<R>): unknown;
}
`

// routesType is the route map every fixture instantiates the client with.
const routesType = `type Routes = {
  users: {getById: (id: number) => {id: number; name: string}; search: (name: string, limit?: number) => string[]};
  orders: {
    list: (userId: number) => string[];
    getById: (id: number) => {id: number};
    report: (userId: number, status: string, limit: number) => string[];
    tail: (userId: number, ...ids: number[]) => string[];
  };
};
`

// fixture prefixes a consumer body with the client import + route map.
func fixture(body string) string {
	return "import {initClient, batch, inputFrom, type RouteSubRequest} from '@mionjs/client';\n" + routesType + body
}

// overlayProgram builds an inferred program over the relative sources plus the
// ambient client module and the real marker package, and returns the handles
// the extractors need. abs holds the callers' files in map-iteration order, so
// tests that index in use a single consumer file.
type overlayProgram struct {
	typeChecker *checker.Checker
	markerOpts  marker.Options
	prog        *program.Program
	files       []string
}

func setupOverlay(t *testing.T, files map[string]string) overlayProgram {
	t.Helper()
	realMarker, err := testfixtures.RealMarkerPackage()
	if err != nil {
		t.Fatalf("real marker package unavailable: %v", err)
	}
	cwd := tspath.NormalizePath(t.TempDir())
	overlay := map[string]string{}
	var abs []string
	names := make([]string, 0, len(files))
	for name := range files {
		names = append(names, name)
	}
	sort.Strings(names)
	for _, name := range names {
		path := tspath.ResolvePath(cwd, name)
		overlay[path] = files[name]
		abs = append(abs, path)
	}
	clientPath := tspath.ResolvePath(cwd, "client.d.ts")
	overlay[clientPath] = clientDts
	abs = append(abs, clientPath)
	for rel, content := range realMarker {
		overlay[tspath.ResolvePath(cwd, rel)] = content
	}
	prog, err := program.NewInferred(program.Options{Cwd: cwd, SingleThreaded: true, Overlay: overlay}, abs)
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
	return overlayProgram{typeChecker: typeChecker, markerOpts: marker.WithDefaults(marker.Options{FS: prog.FS}), prog: prog, files: abs}
}

func (overlay overlayProgram) extract() ([]Site, []diagnostics.Diagnostic) {
	return ExtractFromProgramCached(overlay.typeChecker, overlay.markerOpts, overlay.prog, overlay.files, nil)
}

func extractFromOverlay(t *testing.T, files map[string]string) ([]Site, []diagnostics.Diagnostic) {
	t.Helper()
	return setupOverlay(t, files).extract()
}

// oneSite asserts exactly one clean site came out of the fixture.
func oneSite(t *testing.T, body string) Site {
	t.Helper()
	sites, diags := extractFromOverlay(t, map[string]string{"a.ts": fixture(body)})
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics: %s", diagnosticsDebug(diags))
	}
	if len(sites) != 1 {
		t.Fatalf("expected 1 site, got %d: %+v", len(sites), sites)
	}
	return sites[0]
}

func diagnosticsDebug(diags []diagnostics.Diagnostic) string {
	lines := make([]string, 0, len(diags))
	for _, diag := range diags {
		lines = append(lines, diagnostics.FormatDebug(diag))
	}
	return strings.Join(lines, "\n")
}

func TestExtract_InlineElements(t *testing.T) {
	overlay := setupOverlay(t, map[string]string{"a.ts": fixture(`
const {routes} = initClient<Routes>();
export const b = batch([routes.users.getById(1), routes.orders.list(2)]);
`)})
	sites, diags := overlay.extract()
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics: %s", diagnosticsDebug(diags))
	}
	if len(sites) != 1 {
		t.Fatalf("expected 1 site, got %d", len(sites))
	}
	site := sites[0]
	if got := strings.Join(site.RouteIds, ","); got != "users/getById,orders/list" {
		t.Errorf("RouteIds = %q", got)
	}
	if !strings.HasPrefix(site.BatchId, BatchIdPrefix) || len(site.BatchId) != len(BatchIdPrefix)+14 {
		t.Errorf("BatchId = %q, want b_<14 chars>", site.BatchId)
	}
	if site.BatchId != BatchId(site.RouteIds, site.Mappings) {
		t.Errorf("BatchId %q != BatchId(RouteIds, Mappings) %q", site.BatchId, BatchId(site.RouteIds, site.Mappings))
	}
	if want := ", '" + site.BatchId + "'"; site.InjectText != want {
		t.Errorf("InjectText = %q, want %q", site.InjectText, want)
	}
	source := overlay.prog.SourceFile(site.FilePath)
	if source == nil {
		t.Fatalf("source file %s missing from program", site.FilePath)
	}
	if text := source.Text(); site.InjectPos >= len(text) || text[site.InjectPos] != ')' {
		t.Errorf("InjectPos %d does not sit on the call's closing paren", site.InjectPos)
	}
	if site.InjectPos != site.End-1 {
		t.Errorf("InjectPos = %d, want End-1 = %d", site.InjectPos, site.End-1)
	}
	if len(site.Mappings) != 0 {
		t.Errorf("unexpected mappings %+v", site.Mappings)
	}
	if site.CalleeName != "batch" || site.CalleeModule != ClientModule {
		t.Errorf("callee attribution = %q / %q", site.CalleeName, site.CalleeModule)
	}
}

// ---------------------------------------------------------------------------
// Shape coverage. The extractor is a static resolution over arbitrary client
// code, so every shape a client author writes is pinned here: the exact
// RouteIds / Mappings / InjectText it produces, or the exact diagnostic code,
// args and location it fails with.
// ---------------------------------------------------------------------------

// markerImport is the type-only import the wrapper-forwarding fixtures need.
const markerImport = "import type {PureFunction, InjectPureFnHash, InjectBatchId} from '@mionjs/run-types';\n"

// routesBound is the standard client bootstrap of a single-file fixture.
const routesBound = "const {routes} = initClient<Routes>();\n"

// mapperName is the server-registered mapper key the name lane produces.
func mapperName(name string) string { return constants.ServerMapperNamespace + "::" + name }

// mappingString renders a mapping as `from>to#index@key`, an inline mapper
// key shortened to `rt::*` (its hash is pinned by the pure-fn lane test).
func mappingString(mapping Mapping) string {
	key := mapping.MapperKey
	if strings.HasPrefix(key, purefunctions.AnonymousNamespace+"::") {
		key = purefunctions.AnonymousNamespace + "::*"
	}
	return mapping.FromId + ">" + mapping.ToId + "#" + strconv.Itoa(mapping.ParamIndex) + "@" + key
}

func mappingsString(mappings []Mapping) string {
	parts := make([]string, 0, len(mappings))
	for _, mapping := range mappings {
		parts = append(parts, mappingString(mapping))
	}
	return strings.Join(parts, " ")
}

// assertSite pins a site's route ids, mappings and injected text; wantInject
// "" means the default `, 'b_<id>'` splice.
func assertSite(t *testing.T, site Site, wantRoutes, wantMappings, wantInject string) {
	t.Helper()
	if got := strings.Join(site.RouteIds, ","); got != wantRoutes {
		t.Errorf("RouteIds = %q, want %q", got, wantRoutes)
	}
	if got := mappingsString(site.Mappings); got != wantMappings {
		t.Errorf("Mappings = %q, want %q", got, wantMappings)
	}
	if wantInject == "" {
		wantInject = ", '" + site.BatchId + "'"
	}
	if site.InjectText != wantInject {
		t.Errorf("InjectText = %q, want %q", site.InjectText, wantInject)
	}
	if site.BatchId != BatchId(site.RouteIds, site.Mappings) {
		t.Errorf("BatchId %q is not BatchId(RouteIds, Mappings)", site.BatchId)
	}
}

// endLineOf returns the 1-based line the first occurrence of needle ends on,
// the line a diagnostic reported at that node must end on (a node's start
// swallows leading trivia, its end is exact).
func endLineOf(t *testing.T, source, needle string) int {
	t.Helper()
	offset := strings.Index(source, needle)
	if offset < 0 {
		t.Fatalf("needle %q not in fixture", needle)
	}
	return strings.Count(source[:offset+len(needle)], "\n") + 1
}

// assertDiagAt pins a diagnostic's args and the line it ends on.
func assertDiagAt(t *testing.T, diag diagnostics.Diagnostic, source, needle, wantArgs string) {
	t.Helper()
	if got := strings.Join(diag.Args, "|"); got != wantArgs {
		t.Errorf("%s args = %q, want %q", diag.Code, got, wantArgs)
	}
	if want := endLineOf(t, source, needle); diag.Site.EndLine != want {
		t.Errorf("%s reported ending on line %d, want line %d (%q)", diag.Code, diag.Site.EndLine, want, needle)
	}
}

// singleDiag asserts a fixture yields no site and exactly one diagnostic of code.
func singleDiag(t *testing.T, body, code string) diagnostics.Diagnostic {
	t.Helper()
	sites, diags := extractFromOverlay(t, map[string]string{"a.ts": fixture(body)})
	if len(sites) != 0 {
		t.Fatalf("expected no site, got %+v", sites)
	}
	if len(diags) != 1 || diags[0].Code != code {
		t.Fatalf("expected exactly one %s, got: %s", code, diagnosticsDebug(diags))
	}
	if diags[0].Site.StartLine == 0 || diags[0].Site.EndLine == 0 {
		t.Errorf("%s must carry a source location", code)
	}
	return diags[0]
}

// Shape 1: inline, const-bound, let-bound and mixed elements all read the same
// ordered route list and therefore the same id; order changes the id.
func TestShapes_ElementBindings(t *testing.T) {
	cases := map[string]string{
		"inline":      routesBound + "export const b = batch([routes.users.getById(1), routes.orders.list(2)]);",
		"const-bound": routesBound + "const user = routes.users.getById(1);\nconst orders = routes.orders.list(2);\nexport const b = batch([user, orders]);",
		"let-bound":   routesBound + "let user = routes.users.getById(1);\nlet orders = routes.orders.list(2);\nexport const b = batch([user, orders]);",
		"mixed":       routesBound + "const user = routes.users.getById(1);\nexport const b = batch([user, routes.orders.list(2)]);",
	}
	ids := map[string]string{}
	for name, body := range cases {
		t.Run(name, func(t *testing.T) {
			site := oneSite(t, body)
			assertSite(t, site, "users/getById,orders/list", "", "")
			ids[name] = site.BatchId
		})
	}
	for name, id := range ids {
		if id != ids["inline"] {
			t.Errorf("%s hashed %q, inline hashed %q", name, id, ids["inline"])
		}
	}
	reversed := oneSite(t, routesBound+"export const b = batch([routes.orders.list(2), routes.users.getById(1)]);")
	if reversed.BatchId == ids["inline"] {
		t.Errorf("route order must change the id, both %q", reversed.BatchId)
	}
}

// Shape 2: every way of reaching the routes proxy from initClient().
func TestShapes_RootShapes(t *testing.T) {
	cases := map[string]string{
		"destructured":                routesBound + "export const b = batch([routes.users.getById(1)]);",
		"destructured renamed":        "const {routes: r} = initClient<Routes>();\nexport const b = batch([r.users.getById(1)]);",
		"client object":               "const c = initClient<Routes>();\nexport const b = batch([c.routes.users.getById(1)]);",
		"client object let":           "let c = initClient<Routes>();\nexport const b = batch([c.routes.users.getById(1)]);",
		"nested destructuring":        "const {routes: {users}} = initClient<Routes>();\nexport const b = batch([users.getById(1)]);",
		"sub-proxy const":             routesBound + "const users = routes.users;\nexport const b = batch([users.getById(1)]);",
		"sub-proxy chain two deep":    "const c = initClient<Routes>();\nconst r = c.routes;\nconst users = r.users;\nexport const b = batch([users.getById(1)]);",
		"element access":              routesBound + "export const b = batch([routes['users'].getById(1)]);",
		"element access whole chain":  "const c = initClient<Routes>();\nexport const b = batch([c['routes']['users']['getById'](1)]);",
		"renamed initClient import":   "import {initClient as makeClient, batch} from '@mionjs/client';\n" + routesType + "const {routes} = makeClient<Routes>();\nexport const b = batch([routes.users.getById(1)]);",
		"namespace initClient import": "import * as client from '@mionjs/client';\nimport {batch} from '@mionjs/client';\n" + routesType + "const {routes} = client.initClient<Routes>();\nexport const b = batch([routes.users.getById(1)]);",
	}
	for name, body := range cases {
		t.Run(name, func(t *testing.T) {
			source := body
			if !strings.HasPrefix(body, "import ") {
				source = fixture(body)
			}
			sites, diags := extractFromOverlay(t, map[string]string{"a.ts": source})
			if len(diags) != 0 || len(sites) != 1 {
				t.Fatalf("sites=%+v diags=%s", sites, diagnosticsDebug(diags))
			}
			assertSite(t, sites[0], "users/getById", "", "")
		})
	}
}

// Shape 3: the routes proxy imported from another module, as a named import,
// a namespace import, through a re-export barrel and through `export *`.
func TestShapes_ImportedRoutes(t *testing.T) {
	const apiTs = "import {initClient} from '@mionjs/client';\n" + routesType + "export const {routes} = initClient<Routes>();\nexport const client = initClient<Routes>();\n"
	consumer := func(imports, element string) string {
		return "import {batch} from '@mionjs/client';\n" + imports + "export const b = batch([" + element + "]);\n"
	}
	files := map[string]string{
		"api.ts":       apiTs,
		"barrel.ts":    "export {routes} from './api.ts';\n",
		"star.ts":      "export * from './api.ts';\n",
		"named.ts":     consumer("import {routes} from './api.ts';\n", "routes.users.getById(1)"),
		"renamed.ts":   consumer("import {routes as r} from './api.ts';\n", "r.users.getById(1)"),
		"namespace.ts": consumer("import * as api from './api.ts';\n", "api.routes.users.getById(1)"),
		"nsclient.ts":  consumer("import * as api from './api.ts';\n", "api.client.routes.users.getById(1)"),
		"client.ts":    consumer("import {client} from './api.ts';\n", "client.routes.users.getById(1)"),
		"barreled.ts":  consumer("import {routes} from './barrel.ts';\n", "routes.users.getById(1)"),
		"starred.ts":   consumer("import {routes} from './star.ts';\n", "routes.users.getById(1)"),
		"nsstar.ts":    consumer("import * as all from './star.ts';\n", "all.routes.users.getById(1)"),
		"nsbarrel.ts":  consumer("import * as all from './barrel.ts';\n", "all.routes.users.getById(1)"),
		"subproxy.ts":  consumer("import {routes} from './api.ts';\nconst users = routes.users;\n", "users.getById(1)"),
		"nssub.ts":     consumer("import * as api from './api.ts';\nconst users = api.routes.users;\n", "users.getById(1)"),
	}
	sites, diags := extractFromOverlay(t, files)
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics: %s", diagnosticsDebug(diags))
	}
	if len(sites) != 11 {
		t.Fatalf("expected 11 sites (one per consumer), got %d", len(sites))
	}
	for _, site := range sites {
		assertSite(t, site, "users/getById", "", "")
		if site.BatchId != sites[0].BatchId {
			t.Errorf("%s hashed %q, want the shared id %q", site.FilePath, site.BatchId, sites[0].BatchId)
		}
	}
}

// Shape 4: parentheses, `as`, `satisfies` and `!` wrap an element, the array
// argument or the chain root without changing what is read.
func TestShapes_Wrappers(t *testing.T) {
	cases := map[string]string{
		"parenthesized element": routesBound + "export const b = batch([(routes.users.getById(1))]);",
		"as cast element":       routesBound + "export const b = batch([routes.users.getById(1) as RouteSubRequest<any>]);",
		"satisfies element":     routesBound + "export const b = batch([routes.users.getById(1) satisfies RouteSubRequest<any>]);",
		"non-null element":      routesBound + "export const b = batch([routes.users.getById(1)!]);",
		"stacked wrappers":      routesBound + "export const b = batch([((routes.users.getById(1)!) as RouteSubRequest<any>) satisfies RouteSubRequest<any>]);",
		"wrapped array":         routesBound + "export const b = batch(([routes.users.getById(1)]));",
		"non-null chain root":   routesBound + "export const b = batch([routes!.users.getById(1)]);",
		"parenthesized chain":   routesBound + "export const b = batch([(routes.users).getById(1)]);",
		"wrapped bound element": routesBound + "const user = (routes.users.getById(1) as RouteSubRequest<any>)!;\nexport const b = batch([user!]);",
	}
	for name, body := range cases {
		t.Run(name, func(t *testing.T) {
			assertSite(t, oneSite(t, body), "users/getById", "", "")
		})
	}
}

// Shape 5: only the route identity is static; arguments never matter, and the
// batch call can sit anywhere an expression can.
func TestShapes_DynamicArgumentsAndPositions(t *testing.T) {
	body := routesBound + `
declare const cond: boolean;
export function inFunction(id: number, ...rest: number[]) {
  return batch([routes.users.getById(id), routes.orders.list(...rest)]);
}
export const inArrow = (payload: {id: number}) => batch([routes.users.getById(payload.id), routes.orders.getById({...payload}.id)]);
export class Loader {
  async load(id: Promise<number>) {
    const result = await batch([routes.users.getById(await id), routes.orders.report(cond ? 1 : 2, 'open', 10)]);
    return result;
  }
}
export async function chained() {
  const user = routes.users.getById(1);
  return await (batch([user, routes.orders.list(2)]) as any).call();
}
export const assigned = (() => {
  let plan: unknown;
  plan = batch([routes.orders.getById(1)]);
  return plan;
})();
`
	sites, diags := extractFromOverlay(t, map[string]string{"a.ts": fixture(body)})
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics: %s", diagnosticsDebug(diags))
	}
	want := []string{
		"users/getById,orders/list",
		"users/getById,orders/getById",
		"users/getById,orders/report",
		"users/getById,orders/list",
		"orders/getById",
	}
	if len(sites) != len(want) {
		t.Fatalf("expected %d sites, got %d", len(want), len(sites))
	}
	for i, site := range sites {
		assertSite(t, site, want[i], "", "")
	}
	if sites[0].BatchId != sites[3].BatchId {
		t.Errorf("the function-body and the chained batch name the same routes and must share an id")
	}
}

// mappingFixture batches users/getById then orders/getById, feeding the
// second from the first through the mapper expression `mapper`.
func mappingFixture(prelude, mapper string) string {
	return routesBound + "const user = routes.users.getById(1);\n" + prelude + "\nexport const b = batch([user, routes.orders.getById(" + mapper + ")]);\n"
}

func TestMappings_InlineAsArg_KeyMatchesPureFnLane(t *testing.T) {
	overlay := setupOverlay(t, map[string]string{"a.ts": fixture(mappingFixture("", "inputFrom(user, (u: {id: number}) => u.id).asArg()"))})
	sites, diags := overlay.extract()
	if len(diags) != 0 || len(sites) != 1 {
		t.Fatalf("sites=%+v diags=%s", sites, diagnosticsDebug(diags))
	}
	assertSite(t, sites[0], "users/getById,orders/getById", "users/getById>orders/getById#0@rt::*", "")
	mapping := sites[0].Mappings[0]
	// The pure-fn lane extracts the very same inputFrom call (nested inside the
	// batch) and must intern it under the key the batch report recorded.
	entries, pureDiags := purefunctions.ExtractFromProgramCached(overlay.typeChecker, overlay.markerOpts, overlay.prog, overlay.files, nil)
	if len(pureDiags) != 0 {
		t.Fatalf("pure-fn diagnostics: %s", diagnosticsDebug(pureDiags))
	}
	var keys []string
	for _, entry := range entries {
		keys = append(keys, entry.Key())
	}
	if len(entries) != 1 || entries[0].Key() != mapping.MapperKey {
		t.Errorf("pure-fn lane keys %v, want exactly [%s]", keys, mapping.MapperKey)
	}
	if entries[0].HashInjectText == "" {
		t.Errorf("the nested inputFrom call must still get its own rt:: hash injected")
	}
}

// Shape 6: every way of writing one mapping.
func TestMappings_ReferenceShapes(t *testing.T) {
	cases := map[string]struct{ prelude, mapper, wantKey string }{
		"bare ref":                   {"", "inputFrom(user, (u: {id: number}) => u.id)", "rt::*"},
		"asArg at the call":          {"", "inputFrom(user, (u: {id: number}) => u.id).asArg()", "rt::*"},
		"const-bound ref":            {"const ref = inputFrom(user, (u: {id: number}) => u.id);", "ref", "rt::*"},
		"const-bound asArg":          {"const ref = inputFrom(user, (u: {id: number}) => u.id).asArg();", "ref", "rt::*"},
		"const-bound then asArg":     {"const ref = inputFrom(user, 'toUserId');", "ref.asArg()", mapperName("toUserId")},
		"let-bound ref":              {"let ref = inputFrom(user, 'toUserId');", "ref", mapperName("toUserId")},
		"name literal":               {"", "inputFrom(user, 'toUserId')", mapperName("toUserId")},
		"name const":                 {"const NAME = 'toUserId';", "inputFrom(user, NAME)", mapperName("toUserId")},
		"name template literal":      {"", "inputFrom(user, `toUserId`)", mapperName("toUserId")},
		"name literal asArg":         {"", "inputFrom(user, 'toUserId').asArg()", mapperName("toUserId")},
		"block-body arrow":           {"", "inputFrom(user, (u: {id: number}) => { const id = u.id; return id; })", "rt::*"},
		"function expression":        {"", "inputFrom(user, function (u: {id: number}) { return u.id; })", "rt::*"},
		"typed parameter arrow":      {"", "inputFrom(user, (u: {id: number; name: string}): number => u.id)", "rt::*"},
		"untyped parameter arrow":    {"", "inputFrom(user, (u) => u.id)", "rt::*"},
		"wrapper forwarding":         {"function myInputFrom<S extends RouteSubRequest<any>, M>(source: S, mapper: PureFunction<(v: any) => M>, hash?: InjectPureFnHash<(v: any) => M>) { return inputFrom(source, mapper as never, hash as never); }", "myInputFrom(user, (u: {id: number}) => u.id)", "rt::*"},
		"wrapped in parens":          {"", "(inputFrom(user, 'toUserId'))", mapperName("toUserId")},
		"non-null wrapped":           {"", "inputFrom(user, 'toUserId')!", mapperName("toUserId")},
		"as-cast asArg":              {"", "inputFrom(user, 'toUserId').asArg() as number", mapperName("toUserId")},
		"source wrapped":             {"", "inputFrom(user!, 'toUserId')", mapperName("toUserId")},
		"source inline call":         {"", "inputFrom(routes.users.getById(1), 'toUserId')", mapperName("toUserId")},
		"source bound through alias": {"const alias = user;", "inputFrom(alias, 'toUserId')", mapperName("toUserId")},
	}
	for name, testCase := range cases {
		t.Run(name, func(t *testing.T) {
			site := oneSite(t, markerImport+mappingFixture(testCase.prelude, testCase.mapper))
			assertSite(t, site, "users/getById,orders/getById", "users/getById>orders/getById#0@"+testCase.wantKey, "")
		})
	}
}

// Shape 6 (continued): positions, fan-in, chains and fan-out.
func TestMappings_Topologies(t *testing.T) {
	cases := map[string]struct{ body, routes, mappings string }{
		"param index 1": {
			routesBound + "const user = routes.users.getById(1);\nexport const b = batch([user, routes.orders.report(7, inputFrom(user, 'toStatus'), 10)]);",
			"users/getById,orders/report", "users/getById>orders/report#1@" + mapperName("toStatus"),
		},
		"param index 2": {
			routesBound + "const user = routes.users.getById(1);\nexport const b = batch([user, routes.orders.report(7, 'open', inputFrom(user, 'toLimit'))]);",
			"users/getById,orders/report", "users/getById>orders/report#2@" + mapperName("toLimit"),
		},
		"two mappings into one route": {
			routesBound + "const user = routes.users.getById(1);\nexport const b = batch([user, routes.orders.report(inputFrom(user, 'toUserId'), 'open', inputFrom(user, 'toLimit'))]);",
			"users/getById,orders/report", "users/getById>orders/report#0@" + mapperName("toUserId") + " users/getById>orders/report#2@" + mapperName("toLimit"),
		},
		"two sources into one route": {
			routesBound + "const user = routes.users.getById(1);\nconst orders = routes.orders.list(1);\nexport const b = batch([user, orders, routes.orders.report(inputFrom(user, 'toUserId'), inputFrom(orders, 'toStatus'), 10)]);",
			"users/getById,orders/list,orders/report", "users/getById>orders/report#0@" + mapperName("toUserId") + " orders/list>orders/report#1@" + mapperName("toStatus"),
		},
		"chain A to B to C": {
			routesBound + "const user = routes.users.getById(1);\nconst orders = routes.orders.list(inputFrom(user, 'toUserId'));\nexport const b = batch([user, orders, routes.orders.getById(inputFrom(orders, 'toOrderId'))]);",
			"users/getById,orders/list,orders/getById", "orders/list>orders/getById#0@" + mapperName("toOrderId") + " users/getById>orders/list#0@" + mapperName("toUserId"),
		},
		"one source two targets": {
			routesBound + "const user = routes.users.getById(1);\nexport const b = batch([user, routes.orders.list(inputFrom(user, 'toUserId')), routes.orders.getById(inputFrom(user, 'toOrderId'))]);",
			"users/getById,orders/list,orders/getById", "users/getById>orders/getById#0@" + mapperName("toOrderId") + " users/getById>orders/list#0@" + mapperName("toUserId"),
		},
		"mapping into an optional parameter": {
			routesBound + "const user = routes.users.getById(1);\nexport const b = batch([user, routes.users.search('ann', inputFrom(user, 'toLimit'))]);",
			"users/getById,users/search", "users/getById>users/search#1@" + mapperName("toLimit"),
		},
		"mapping into a rest parameter": {
			routesBound + "const user = routes.users.getById(1);\nexport const b = batch([user, routes.orders.tail(1, 2, 3, inputFrom(user, 'toId'))]);",
			"users/getById,orders/tail", "users/getById>orders/tail#3@" + mapperName("toId"),
		},
		"spread after the mapping": {
			routesBound + "const user = routes.users.getById(1);\nconst ids = [2, 3];\nexport const b = batch([user, routes.orders.tail(inputFrom(user, 'toUserId'), ...ids)]);",
			"users/getById,orders/tail", "users/getById>orders/tail#0@" + mapperName("toUserId"),
		},
	}
	for name, testCase := range cases {
		t.Run(name, func(t *testing.T) {
			assertSite(t, oneSite(t, testCase.body), testCase.routes, testCase.mappings, "")
		})
	}
}

func TestMappings_PlainArgumentsAreNotMappings(t *testing.T) {
	site := oneSite(t, routesBound+"const id = 7;\nlet later = 8;\nlater = 9;\nexport const b = batch([routes.users.getById(id), routes.orders.getById(later)]);")
	assertSite(t, site, "users/getById,orders/getById", "", "")
}

// Shape 7: syntax around the call, and the calls that yield no site at all.
func TestShapes_CallSyntax(t *testing.T) {
	t.Run("trailing comma in the array", func(t *testing.T) {
		assertSite(t, oneSite(t, routesBound+"export const b = batch([routes.users.getById(1), routes.orders.list(2),]);"), "users/getById,orders/list", "", "")
	})
	t.Run("trailing comma in the call", func(t *testing.T) {
		site := oneSite(t, routesBound+"export const b = batch([routes.users.getById(1)],);")
		assertSite(t, site, "users/getById", "", "'"+site.BatchId+"'")
	})
	t.Run("multiline with comments", func(t *testing.T) {
		site := oneSite(t, routesBound+`export const b = batch([
  // the user first
  routes.users.getById(1), // trailing note
  /* then the orders */ routes.orders.list(2),
]);`)
		assertSite(t, site, "users/getById,orders/list", "", "")
	})
	t.Run("wrapper forwarding the brand", func(t *testing.T) {
		body := markerImport + routesBound + `
export function myBatch<R extends RouteSubRequest<any>[]>(routes: [...R], id?: InjectBatchId<R>) {
  return batch(routes, id as never);
}
export const b = myBatch([routes.users.getById(1)]);`
		site := oneSite(t, body)
		assertSite(t, site, "users/getById", "", "")
		if site.CalleeName != "myBatch" {
			t.Errorf("CalleeName = %q, want the wrapper", site.CalleeName)
		}
	})
}

func TestShapes_Silent(t *testing.T) {
	cases := map[string]string{
		// A user's own `batch` with no InjectBatchId brand: the name filter lets
		// it through, the brand check rejects it.
		"same-named batch without the brand": "import {initClient} from '@mionjs/client';\n" + routesType + "function batch(routes: unknown[], id?: string) { return routes; }\nconst {routes} = initClient<Routes>();\nexport const b = batch([routes.users.getById(1)]);",
		"empty route list":                   fixture("export const b = batch([]);"),
		"brand lost through a cast":          fixture(routesBound + "const untransformed = batch as unknown as (routes: any[]) => unknown;\nexport const b = untransformed([routes.users.getById(1)]);"),
		"id slot already written":            fixture(routesBound + "export const b = batch([routes.users.getById(1)], 'b_manual');"),
		"routes proxy used outside a batch":  fixture(routesBound + "export const one = routes.users.getById(1);"),
	}
	for name, source := range cases {
		t.Run(name, func(t *testing.T) {
			sites, diags := extractFromOverlay(t, map[string]string{"a.ts": source})
			if len(sites) != 0 || len(diags) != 0 {
				t.Fatalf("expected no site and no diagnostic, got sites=%+v diags=%s", sites, diagnosticsDebug(diags))
			}
		})
	}
}

// Shape 9: BAT001, every element the build cannot read, with the reason and
// the element it points at.
func TestShapes_Rejections_BAT001(t *testing.T) {
	cases := map[string]struct{ body, at, reason string }{
		"spread":                       {routesBound + "const prepared = [routes.users.getById(1)];\nexport const b = batch([...prepared, routes.orders.list(1)]);", "...prepared", reasonSpread},
		"routes argument identifier":   {routesBound + "const list = [routes.users.getById(1)];\nexport const b = batch(list);", "batch(list", "routes argument is not an inline array literal"},
		"routes argument concat":       {routesBound + "export const b = batch([].concat(routes.users.getById(1) as never));", "as never)", "routes argument is not an inline array literal"},
		"ternary element":              {routesBound + "declare const cond: boolean;\nexport const b = batch([cond ? routes.users.getById(1) : routes.users.getById(2)]);", "getById(2)", reasonNotRouteCall},
		"let without initializer":      {routesBound + "let r: RouteSubRequest<any>;\nr = routes.users.getById(1);\nexport const b = batch([r]);", "batch([r", reasonNotBound},
		"var binding":                  {routesBound + "var r = routes.users.getById(1);\nexport const b = batch([r]);", "batch([r", reasonNotBound},
		"let reassigned":               {routesBound + "let r = routes.users.getById(1);\nr = routes.users.getById(2);\nexport const b = batch([r]);", "batch([r", reasonReassigned},
		"let reassigned destructuring": {routesBound + "let r = routes.users.getById(1);\n[r] = [routes.users.getById(2)];\nexport const b = batch([r]);", "batch([r", reasonReassigned},
		"let nullish-assigned":         {routesBound + "let r = routes.users.getById(1);\nr ??= routes.users.getById(2);\nexport const b = batch([r]);", "batch([r", reasonReassigned},
		"object property":              {routesBound + "const obj = {req: routes.users.getById(1)};\nexport const b = batch([obj.req]);", "obj.req", reasonNotRouteCall},
		"array index":                  {routesBound + "const arr = [routes.users.getById(1)];\nexport const b = batch([arr[0]]);", "arr[0]", reasonNotRouteCall},
		"helper call":                  {routesBound + "function makeReq() { return routes.users.getById(1); }\nexport const b = batch([makeReq()]);", "makeReq()]", reasonNotRoutesProxy},
		"element from map":             {routesBound + "const ids = [1, 2];\nexport const b = batch([ids.map((id) => routes.users.getById(id))[0]]);", "[0]]", reasonNotRouteCall},
		"routes reassigned":            {"let {routes} = initClient<Routes>();\nroutes = initClient<Routes>().routes;\nexport const b = batch([routes.users.getById(1)]);", "getById(1)]", reasonReassigned},
		"routes let reassigned":        {"let routes = initClient<Routes>().routes;\nroutes = initClient<Routes>().routes;\nexport const b = batch([routes.users.getById(1)]);", "getById(1)]", reasonReassigned},
		"routes from a parameter":      {"export function f(routes: ReturnType<typeof initClient<Routes>>['routes']) { return batch([routes.users.getById(1)]); }", "getById(1)]", reasonNotRoutesProxy},
		"this.routes in a class":       {"export class Store {\n  routes = initClient<Routes>().routes;\n  plan() { return batch([this.routes.users.getById(1)]); }\n}", "getById(1)]", reasonChainRoot},
		"optional chaining":            {"const c = initClient<Routes>() as ReturnType<typeof initClient<Routes>> | undefined;\nexport const b = batch([c?.routes.users.getById(1)!]);", "getById(1)!", reasonOptionalChain},
		"computed member":              {routesBound + "declare const name: 'users';\nexport const b = batch([routes[name].getById(1)]);", "getById(1)]", reasonComputedMember},
		"await element":                {routesBound + "export async function f() { return batch([await routes.users.getById(1)]); }", "getById(1)]", reasonNotRouteCall},
		"parameter binding":            {routesBound + "export function f(u: RouteSubRequest<any>) { return batch([u, routes.users.getById(1)]); }", "batch([u", reasonNotBound},
		"same-shaped object":           {"const fake = {routes: {users: {getById: (id: number): RouteSubRequest<any> => ({id: 'x'})}}};\nexport const b = batch([fake.routes.users.getById(1)]);", "getById(1)]", reasonNotRoutesProxy},
		"arbitrary expression":         {routesBound + "export const b = batch([routes.users.getById(1), Promise.resolve(1) as unknown as RouteSubRequest<any>]);", "RouteSubRequest<any>]", reasonNotRouteCall},
		"call in the chain":            {"export const b = batch([initClient<Routes>().routes.users.getById(1)]);", "getById(1)]", reasonChainRoot},
	}
	for name, testCase := range cases {
		t.Run(name, func(t *testing.T) {
			diag := singleDiag(t, testCase.body, diagnostics.CodeBatchElementNotReadable)
			assertDiagAt(t, diag, fixture(testCase.body), testCase.at, testCase.reason)
		})
	}
}

// Shape 10: BAT002, the source must be an earlier element of the same batch.
func TestMappings_SourceOrder_BAT002(t *testing.T) {
	cases := map[string]struct{ body, at, args string }{
		"source outside the batch": {routesBound + "const user = routes.users.getById(1);\nexport const b = batch([routes.orders.list(1), routes.orders.getById(inputFrom(user, 'toUserId'))]);", "inputFrom(user, 'toUserId')", "users/getById|orders/getById"},
		"source after the target":  {routesBound + "const user = routes.users.getById(1);\nexport const b = batch([routes.orders.getById(inputFrom(user, 'toUserId')), user]);", "inputFrom(user, 'toUserId')", "users/getById|orders/getById"},
		"source is the target":     {routesBound + "const self: RouteSubRequest<any> = routes.orders.getById(inputFrom(self, 'toUserId'));\nexport const b = batch([routes.users.getById(1), self]);", "inputFrom(self, 'toUserId')", "orders/getById|orders/getById"},
	}
	for name, testCase := range cases {
		t.Run(name, func(t *testing.T) {
			diag := singleDiag(t, testCase.body, diagnostics.CodeBatchSourceNotInBatch)
			assertDiagAt(t, diag, fixture(testCase.body), testCase.at, testCase.args)
		})
	}
}

// Shape 11: BAT004, every mapper the build cannot read.
func TestMappings_MapperNotReadable_BAT004(t *testing.T) {
	const user = routesBound + "const user = routes.users.getById(1);\n"
	cases := map[string]struct{ body, at, reason string }{
		"mapper identifier":       {user + "const pickId = (u: {id: number}) => u.id;\nexport const b = batch([user, routes.orders.getById(inputFrom(user, pickId))]);", "pickId)", "mapper is not an inline arrow or function expression"},
		"mapper via bind":         {user + "const pickId = (u: {id: number}) => u.id;\nexport const b = batch([user, routes.orders.getById(inputFrom(user, pickId.bind(null)))]);", "bind(null)", "mapper is not an inline arrow or function expression"},
		"mapper method reference": {user + "const picker = {id(u: {id: number}) { return u.id; }};\nexport const b = batch([user, routes.orders.getById(inputFrom(user, picker.id))]);", "picker.id)", "mapper is not an inline arrow or function expression"},
		"name computed":           {user + "declare const suffix: string;\nexport const b = batch([user, routes.orders.getById(inputFrom(user, 'to' + suffix))]);", "'to' + suffix", "mapper name is not a string literal or a const bound to one"},
		"name template with hole": {user + "declare const suffix: string;\nexport const b = batch([user, routes.orders.getById(inputFrom(user, `to${suffix}`))]);", "`to${suffix}`", "mapper name is not a string literal or a const bound to one"},
		"name from a parameter":   {user + "export function f(name: string) { return batch([user, routes.orders.getById(inputFrom(user, name))]); }", "inputFrom(user, name", "mapper name is not a string literal or a const bound to one"},
		"name let reassigned":     {user + "let name = 'toUserId';\nname = 'other';\nexport const b = batch([user, routes.orders.getById(inputFrom(user, name))]);", "inputFrom(user, name", "mapper name is not a string literal or a const bound to one"},
		"unreadable source":       {routesBound + "export function f(u: RouteSubRequest<any>) { return batch([routes.users.getById(1), routes.orders.getById(inputFrom(u, 'toUserId'))]); }", "inputFrom(u", "source is not a route call the build can read: " + reasonNotBound},
		"mapping after a spread":  {user + "const ids = [2, 3];\nexport const b = batch([user, routes.orders.tail(...ids, inputFrom(user, 'toId'))]);", "inputFrom(user, 'toId')", reasonMapperAfterSpread},
		"mapping let reassigned":  {user + "let ref = inputFrom(user, 'toUserId');\nref = inputFrom(user, 'toOrderId');\nexport const b = batch([user, routes.orders.getById(ref)]);", "getById(ref", reasonMapperReassigned},
	}
	for name, testCase := range cases {
		t.Run(name, func(t *testing.T) {
			diag := singleDiag(t, testCase.body, diagnostics.CodeBatchMapperNotReadable)
			assertDiagAt(t, diag, fixture(testCase.body), testCase.at, testCase.reason)
		})
	}
}

// Shape 12: BAT005, one route listed twice; reported at the second element.
func TestShapes_DuplicateRoute_BAT005(t *testing.T) {
	cases := map[string]struct{ body, at string }{
		"inline twice":         {routesBound + "export const b = batch([routes.users.getById(1), routes.users.getById(2)]);", "getById(2)"},
		"same binding twice":   {routesBound + "const user = routes.users.getById(1);\nexport const b = batch([user, user]);", "[user, user"},
		"binding then inline":  {routesBound + "const user = routes.users.getById(1);\nexport const b = batch([user, routes.orders.list(1), routes.users.getById(2)]);", "getById(2)"},
		"through a sub-proxy":  {routesBound + "const users = routes.users;\nexport const b = batch([routes.users.getById(1), users.getById(2)]);", "users.getById(2)"},
		"different arguments":  {routesBound + "export const b = batch([routes.orders.list(1), routes.orders.list(inputFrom(routes.users.getById(1), 'toUserId'))]);", "'toUserId'))"},
		"third element repeat": {routesBound + "export const b = batch([routes.users.getById(1), routes.orders.list(1), routes.orders.list(2)]);", "list(2)"},
	}
	for name, testCase := range cases {
		t.Run(name, func(t *testing.T) {
			diag := singleDiag(t, testCase.body, diagnostics.CodeBatchDuplicateRoute)
			wantId := "users/getById"
			if strings.Contains(testCase.at, "list") || strings.Contains(testCase.at, "toUserId") {
				wantId = "orders/list"
			}
			assertDiagAt(t, diag, fixture(testCase.body), testCase.at, wantId)
		})
	}
	// Three copies: one diagnostic per duplicate element, no site.
	sites, diags := extractFromOverlay(t, map[string]string{"a.ts": fixture(routesBound + "export const b = batch([routes.users.getById(1), routes.users.getById(2), routes.users.getById(3)]);")})
	if len(sites) != 0 || len(diags) != 2 || diags[0].Code != diagnostics.CodeBatchDuplicateRoute || diags[1].Code != diagnostics.CodeBatchDuplicateRoute {
		t.Errorf("three copies must yield two BAT005 and no site, got sites=%+v diags=%s", sites, diagnosticsDebug(diags))
	}
}

// Shape 12: BAT006, a mapping at an argument position the route does not
// declare; the count is the handler's own parameter list.
func TestMappings_ParamOutOfRange_BAT006(t *testing.T) {
	const user = routesBound + "const user = routes.users.getById(1);\n"
	cases := map[string]struct{ body, at, args string }{
		"one past a single param":  {user + "export const b = batch([user, routes.orders.getById(1, inputFrom(user, 'toUserId'))]);", "inputFrom(user, 'toUserId')", "1|1|orders/getById"},
		"far past":                 {user + "export const b = batch([user, routes.orders.getById(1, 2, 3, inputFrom(user, 'toUserId'))]);", "inputFrom(user, 'toUserId')", "3|1|orders/getById"},
		"past an optional param":   {user + "export const b = batch([user, routes.users.search('ann', 5, inputFrom(user, 'toLimit'))]);", "inputFrom(user, 'toLimit')", "2|2|users/search"},
		"past three params":        {user + "export const b = batch([user, routes.orders.report(1, 'open', 10, inputFrom(user, 'toX'))]);", "inputFrom(user, 'toX')", "3|3|orders/report"},
		"bound ref out of range":   {user + "const ref = inputFrom(user, 'toUserId');\nexport const b = batch([user, routes.orders.getById(1, ref.asArg())]);", "ref.asArg()", "1|1|orders/getById"},
		"inline mapper past param": {user + "export const b = batch([user, routes.orders.getById(1, inputFrom(user, (u: {id: number}) => u.id))]);", "u.id)", "1|1|orders/getById"},
	}
	for name, testCase := range cases {
		t.Run(name, func(t *testing.T) {
			diag := singleDiag(t, testCase.body, diagnostics.CodeBatchMappingParamOutOfRange)
			assertDiagAt(t, diag, fixture(testCase.body), testCase.at, testCase.args)
		})
	}
	// Two mappings on one call, one in range and one out: only the second reports.
	diag := singleDiag(t, user+"export const b = batch([user, routes.orders.getById(inputFrom(user, 'toUserId'), inputFrom(user, 'toOther'))]);", diagnostics.CodeBatchMappingParamOutOfRange)
	if got := strings.Join(diag.Args, "|"); got != "1|1|orders/getById" {
		t.Errorf("BAT006 args = %q", got)
	}
}

func TestCheckConflicts(t *testing.T) {
	same := []string{"users/getById", "orders/list"}
	mappingA := Mapping{FromId: "users/getById", ToId: "orders/list", ParamIndex: 0, MapperKey: "rt::aaa"}
	mappingB := Mapping{FromId: "users/getById", ToId: "orders/list", ParamIndex: 0, MapperKey: "mionjs::toUserId"}
	// Same routes, different mappings: two batches with two ids, never a conflict.
	if BatchId(same, []Mapping{mappingA}) == BatchId(same, []Mapping{mappingB}) {
		t.Fatalf("different mappings must give different ids")
	}
	if extra := CheckConflicts([]Site{
		{FilePath: "/a.ts", Start: 0, BatchId: BatchId(same, []Mapping{mappingA}), RouteIds: same, Mappings: []Mapping{mappingA}},
		{FilePath: "/b.ts", Start: 10, BatchId: BatchId(same, []Mapping{mappingB}), RouteIds: same, Mappings: []Mapping{mappingB}},
		{FilePath: "/c.ts", Start: 0, BatchId: BatchId(same, []Mapping{mappingA}), RouteIds: same, Mappings: []Mapping{mappingA}},
	}); len(extra) != 0 {
		t.Errorf("same routes with different mappings are two batches, not a conflict: %s", diagnosticsDebug(extra))
	}
	// A hash collision (synthetic: two definitions forced under one id) is BAT003, pointing at the first site.
	collided := BatchId(same, nil)
	diags := CheckConflicts([]Site{
		{FilePath: "/b.ts", Start: 10, BatchId: collided, RouteIds: same, Mappings: []Mapping{mappingB}},
		{FilePath: "/a.ts", Start: 0, BatchId: collided, RouteIds: same},
		{FilePath: "/a.ts", Start: 50, BatchId: collided, RouteIds: []string{"orders/list"}},
	})
	if len(diags) != 2 {
		t.Fatalf("expected two BAT003, got: %s", diagnosticsDebug(diags))
	}
	for _, diag := range diags {
		if diag.Code != diagnostics.CodeBatchIdCollision || diag.Args[0] != collided || len(diag.Related) != 1 || diag.Related[0].FilePath != "/a.ts" {
			t.Errorf("BAT003 = %+v", diag)
		}
	}
	// Same routes, same mappings in a different order: one batch, no conflict.
	if extra := CheckConflicts([]Site{
		{FilePath: "/a.ts", BatchId: "b_x", RouteIds: same, Mappings: []Mapping{mappingA, {FromId: "users/getById", ToId: "orders/list", ParamIndex: 1, MapperKey: "rt::bbb"}}},
		{FilePath: "/b.ts", BatchId: "b_x", RouteIds: same, Mappings: []Mapping{{FromId: "users/getById", ToId: "orders/list", ParamIndex: 1, MapperKey: "rt::bbb"}, mappingA}},
	}); len(extra) != 0 {
		t.Errorf("mapping order must not count as a conflict: %s", diagnosticsDebug(extra))
	}
}

func TestBatchId_DeterministicAndVersionIndependent(t *testing.T) {
	routes := []string{"users/getById", "orders/list"}
	first := BatchId(routes, nil)
	if first != BatchId([]string{"users/getById", "orders/list"}, nil) {
		t.Errorf("BatchId is not deterministic")
	}
	if !strings.HasPrefix(first, BatchIdPrefix) {
		t.Errorf("BatchId %q lacks the %q prefix", first, BatchIdPrefix)
	}
	if first == BatchId([]string{"orders/list", "users/getById"}, nil) {
		t.Errorf("order must change the id")
	}
	mapping := Mapping{FromId: "users/getById", ToId: "orders/list", ParamIndex: 0, MapperKey: "rt::aaa"}
	if first == BatchId(routes, []Mapping{mapping}) {
		t.Errorf("a mapping must change the id")
	}
	if BatchId(routes, []Mapping{mapping}) == BatchId(routes, []Mapping{{FromId: "users/getById", ToId: "orders/list", ParamIndex: 0, MapperKey: "rt::bbb"}}) {
		t.Errorf("the mapper key must change the id")
	}
	originalVersion := constants.Version
	t.Cleanup(func() { constants.Version = originalVersion })
	constants.Version = "v-batch-A"
	idA := BatchId(routes, nil)
	constants.Version = "v-batch-B"
	idB := BatchId(routes, nil)
	if idA != idB || idA != first {
		t.Errorf("the batch id is a wire contract and must not move with the binary version: %q / %q / %q", first, idA, idB)
	}
}

func TestReportAndFiles(t *testing.T) {
	sites := []Site{
		{FilePath: "/b.ts", Start: 5, End: 9, BatchId: "b_2", RouteIds: []string{"x/y"}, CalleeName: "batch", CalleeModule: ClientModule},
		{FilePath: "/a.ts", Start: 30, End: 40, BatchId: "b_1", RouteIds: []string{"a/b", "c/d"}, Mappings: []Mapping{{FromId: "a/b", ToId: "c/d", ParamIndex: 1, MapperKey: "rt::k"}}},
		{FilePath: "/a.ts", Start: 1, End: 4, BatchId: "b_0", RouteIds: []string{"a/b"}},
	}
	report := Report(sites)
	if len(report) != 3 || report[0].BatchId != "b_0" || report[1].BatchId != "b_1" || report[2].BatchId != "b_2" {
		t.Fatalf("Report order = %+v", report)
	}
	if len(report[1].Mappings) != 1 || report[1].Mappings[0].MapperKey != "rt::k" || report[1].Mappings[0].ParamIndex != 1 {
		t.Errorf("Report mappings = %+v", report[1].Mappings)
	}
	if report[2].CalleeName != "batch" || report[2].CalleeModule != ClientModule {
		t.Errorf("Report callee = %+v", report[2])
	}
	if files := Files(sites); strings.Join(files, ",") != "/a.ts,/b.ts" {
		t.Errorf("Files = %v", files)
	}
}
