package batches

import (
	"context"
	"sort"
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
  users: {getById: (id: number) => {id: number; name: string}};
  orders: {list: (userId: number) => string[]; getById: (id: number) => {id: number}};
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
	if !strings.HasPrefix(site.BatchId, BatchIdPrefix) || len(site.BatchId) != len(BatchIdPrefix)+7 {
		t.Errorf("BatchId = %q, want b_<7 chars>", site.BatchId)
	}
	if site.BatchId != BatchId(site.RouteIds) {
		t.Errorf("BatchId %q != BatchId(RouteIds) %q", site.BatchId, BatchId(site.RouteIds))
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

func TestExtract_BoundElementsMatchInline_ReversedOrderDiffers(t *testing.T) {
	inline := oneSite(t, `
const {routes} = initClient<Routes>();
export const b = batch([routes.users.getById(1), routes.orders.list(2)]);
`)
	bound := oneSite(t, `
const {routes} = initClient<Routes>();
const user = routes.users.getById(1);
let orders = routes.orders.list(2);
export const b = batch([user, orders]);
`)
	if bound.BatchId != inline.BatchId {
		t.Errorf("const/let-bound elements must hash like inline ones: %q vs %q", bound.BatchId, inline.BatchId)
	}
	reversed := oneSite(t, `
const {routes} = initClient<Routes>();
export const b = batch([routes.orders.list(2), routes.users.getById(1)]);
`)
	if reversed.BatchId == inline.BatchId {
		t.Errorf("route order must change the id, both %q", reversed.BatchId)
	}
}

func TestExtract_RootShapes(t *testing.T) {
	cases := map[string]string{
		"destructured":         "const {routes} = initClient<Routes>();\nexport const b = batch([routes.users.getById(1)]);",
		"destructured renamed": "const {routes: r} = initClient<Routes>();\nexport const b = batch([r.users.getById(1)]);",
		"client object":        "const c = initClient<Routes>();\nexport const b = batch([c.routes.users.getById(1)]);",
		"sub-proxy const":      "const {routes} = initClient<Routes>();\nconst users = routes.users;\nexport const b = batch([users.getById(1)]);",
		"element access":       "const {routes} = initClient<Routes>();\nexport const b = batch([routes['users'].getById(1)]);",
		"nested destructuring": "const {routes: {users}} = initClient<Routes>();\nexport const b = batch([users.getById(1)]);",
	}
	for name, body := range cases {
		t.Run(name, func(t *testing.T) {
			site := oneSite(t, body)
			if got := strings.Join(site.RouteIds, ","); got != "users/getById" {
				t.Errorf("RouteIds = %q", got)
			}
		})
	}
}

// bat001Reason returns the single BAT001 reason a fixture produces, failing
// when a site slipped through or another code fired.
func bat001Reason(t *testing.T, body string) string {
	t.Helper()
	sites, diags := extractFromOverlay(t, map[string]string{"a.ts": fixture(body)})
	if len(sites) != 0 {
		t.Fatalf("a rejected batch must produce no site, got %+v", sites)
	}
	if len(diags) != 1 || diags[0].Code != diagnostics.CodeBatchElementNotReadable {
		t.Fatalf("expected exactly one BAT001, got: %s", diagnosticsDebug(diags))
	}
	if diags[0].Site.StartLine == 0 {
		t.Errorf("BAT001 must carry a source location")
	}
	return diags[0].Args[0]
}

func TestExtract_Rejections(t *testing.T) {
	cases := map[string]struct{ body, reason string }{
		"spread":                                 {"const {routes} = initClient<Routes>();\nconst prepared = [routes.users.getById(1)];\nexport const b = batch([...prepared, routes.orders.list(1)]);", reasonSpread},
		"arbitrary expression":                   {"const {routes} = initClient<Routes>();\nexport const b = batch([routes.users.getById(1), Promise.resolve(1) as unknown as RouteSubRequest<any>]);", reasonNotRouteCall},
		"parameter binding":                      {"const {routes} = initClient<Routes>();\nexport function f(u: RouteSubRequest<any>) { return batch([u, routes.users.getById(1)]); }", reasonNotBound},
		"same-shaped object not from initClient": {"const fake = {routes: {users: {getById: (id: number): RouteSubRequest<any> => ({id: 'x'})}}};\nexport const b = batch([fake.routes.users.getById(1)]);", reasonNotRoutesProxy},
		"routes argument not an array literal":   {"const {routes} = initClient<Routes>();\nconst list = [routes.users.getById(1)];\nexport const b = batch(list);", "routes argument is not an inline array literal"},
	}
	for name, testCase := range cases {
		t.Run(name, func(t *testing.T) {
			if got := bat001Reason(t, testCase.body); got != testCase.reason {
				t.Errorf("reason = %q, want %q", got, testCase.reason)
			}
		})
	}
}

func TestExtract_Silent(t *testing.T) {
	cases := map[string]string{
		// A user's own `batch` with no InjectBatchId brand: the name filter lets
		// it through, the brand check rejects it.
		"same-named batch without the brand": "import {initClient} from '@mionjs/client';\n" + routesType + "function batch(routes: unknown[], id?: string) { return routes; }\nconst {routes} = initClient<Routes>();\nexport const b = batch([routes.users.getById(1)]);",
		"empty route list":                   fixture("export const b = batch([]);"),
		"brand lost through a cast":          fixture("const {routes} = initClient<Routes>();\nconst untransformed = batch as unknown as (routes: any[]) => unknown;\nexport const b = untransformed([routes.users.getById(1)]);"),
		"id slot already written":            fixture("const {routes} = initClient<Routes>();\nexport const b = batch([routes.users.getById(1)], 'b_manual');"),
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

// mappingFixture batches users/getById then orders/getById, feeding the
// second from the first through the mapper expression `mapper`.
func mappingFixture(prelude, mapper string) string {
	return "const {routes} = initClient<Routes>();\nconst user = routes.users.getById(1);\n" + prelude + "\nexport const b = batch([user, routes.orders.getById(" + mapper + ")]);\n"
}

func assertSingleMapping(t *testing.T, site Site, wantKey string) Mapping {
	t.Helper()
	if len(site.Mappings) != 1 {
		t.Fatalf("expected 1 mapping, got %+v", site.Mappings)
	}
	mapping := site.Mappings[0]
	if mapping.FromId != "users/getById" || mapping.ToId != "orders/getById" || mapping.ParamIndex != 0 {
		t.Errorf("mapping = %+v", mapping)
	}
	if wantKey != "" && mapping.MapperKey != wantKey {
		t.Errorf("MapperKey = %q, want %q", mapping.MapperKey, wantKey)
	}
	return mapping
}

func TestMappings_InlineAsArg_KeyMatchesPureFnLane(t *testing.T) {
	overlay := setupOverlay(t, map[string]string{"a.ts": fixture(mappingFixture("", "inputFrom(user, (u: {id: number}) => u.id).asArg()"))})
	sites, diags := overlay.extract()
	if len(diags) != 0 || len(sites) != 1 {
		t.Fatalf("sites=%+v diags=%s", sites, diagnosticsDebug(diags))
	}
	mapping := assertSingleMapping(t, sites[0], "")
	if !strings.HasPrefix(mapping.MapperKey, purefunctions.AnonymousNamespace+"::") {
		t.Fatalf("inline mapper key = %q, want rt::<hash>", mapping.MapperKey)
	}
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

func TestMappings_ReferenceShapes(t *testing.T) {
	cases := map[string]struct {
		prelude, mapper, wantKey string
	}{
		"bare ref":           {"", "inputFrom(user, (u: {id: number}) => u.id)", ""},
		"const-bound ref":    {"const ref = inputFrom(user, (u: {id: number}) => u.id);", "ref", ""},
		"const-bound asArg":  {"const ref = inputFrom(user, (u: {id: number}) => u.id).asArg();", "ref", ""},
		"name literal":       {"", "inputFrom(user, 'toUserId')", constants.ServerMapperNamespace + "::toUserId"},
		"name const-traced":  {"const name = 'toUserId';", "inputFrom(user, name)", constants.ServerMapperNamespace + "::toUserId"},
		"name literal asArg": {"", "inputFrom(user, 'toUserId').asArg()", constants.ServerMapperNamespace + "::toUserId"},
		"wrapper forwarding": {"function myInputFrom<S extends RouteSubRequest<any>, M>(source: S, mapper: PureFunction<(v: any) => M>, hash?: InjectPureFnHash<(v: any) => M>) { return inputFrom(source, mapper as never, hash as never); }", "myInputFrom(user, (u: {id: number}) => u.id)", ""},
		"wrapped in parens":  {"", "(inputFrom(user, 'toUserId'))", constants.ServerMapperNamespace + "::toUserId"},
	}
	for name, testCase := range cases {
		t.Run(name, func(t *testing.T) {
			body := "import type {PureFunction, InjectPureFnHash} from '@mionjs/run-types';\n" + mappingFixture(testCase.prelude, testCase.mapper)
			site := oneSite(t, body)
			mapping := assertSingleMapping(t, site, testCase.wantKey)
			if testCase.wantKey == "" && !strings.HasPrefix(mapping.MapperKey, purefunctions.AnonymousNamespace+"::") {
				t.Errorf("inline mapper key = %q, want rt::<hash>", mapping.MapperKey)
			}
		})
	}
}

func TestMappings_PlainArgumentsAreNotMappings(t *testing.T) {
	site := oneSite(t, "const {routes} = initClient<Routes>();\nconst id = 7;\nexport const b = batch([routes.users.getById(id), routes.orders.getById(3)]);")
	if len(site.Mappings) != 0 {
		t.Errorf("plain arguments must not produce mappings: %+v", site.Mappings)
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
	return diags[0]
}

func TestMappings_SourceOrder_BAT003(t *testing.T) {
	notInBatch := singleDiag(t, `
const {routes} = initClient<Routes>();
const user = routes.users.getById(1);
export const b = batch([routes.orders.list(1), routes.orders.getById(inputFrom(user, 'toUserId'))]);
`, diagnostics.CodeBatchSourceNotInBatch)
	if got := strings.Join(notInBatch.Args, "|"); got != "users/getById|orders/getById" {
		t.Errorf("BAT003 args = %q", got)
	}
	afterTarget := singleDiag(t, `
const {routes} = initClient<Routes>();
const user = routes.users.getById(1);
export const b = batch([routes.orders.getById(inputFrom(user, 'toUserId')), user]);
`, diagnostics.CodeBatchSourceNotInBatch)
	if got := strings.Join(afterTarget.Args, "|"); got != "users/getById|orders/getById" {
		t.Errorf("BAT003 args = %q", got)
	}
}

func TestMappings_MapperNotReadable_BAT005(t *testing.T) {
	cases := map[string]string{
		"function reference":  "const {routes} = initClient<Routes>();\nconst user = routes.users.getById(1);\nconst pickId = (u: {id: number}) => u.id;\nexport const b = batch([user, routes.orders.getById(inputFrom(user, pickId))]);",
		"dynamic mapper name": "const {routes} = initClient<Routes>();\nconst user = routes.users.getById(1);\nexport function f(name: string) { return batch([user, routes.orders.getById(inputFrom(user, name))]); }",
		"unreadable source":   "const {routes} = initClient<Routes>();\nexport function f(u: RouteSubRequest<any>) { return batch([routes.users.getById(1), routes.orders.getById(inputFrom(u, 'toUserId'))]); }",
	}
	for name, body := range cases {
		t.Run(name, func(t *testing.T) {
			diag := singleDiag(t, body, diagnostics.CodeBatchMapperNotReadable)
			if len(diag.Args) != 1 || diag.Args[0] == "" {
				t.Errorf("BAT005 must carry a reason, got %v", diag.Args)
			}
		})
	}
}

func TestCheckConflicts(t *testing.T) {
	same := []string{"users/getById", "orders/list"}
	mappingA := Mapping{FromId: "users/getById", ToId: "orders/list", ParamIndex: 0, MapperKey: "rt::aaa"}
	mappingB := Mapping{FromId: "users/getById", ToId: "orders/list", ParamIndex: 0, MapperKey: "mionjs::toUserId"}
	sites := []Site{
		{FilePath: "/b.ts", Start: 10, BatchId: BatchId(same), RouteIds: same, Mappings: []Mapping{mappingB}},
		{FilePath: "/a.ts", Start: 0, BatchId: BatchId(same), RouteIds: same, Mappings: []Mapping{mappingA}},
		{FilePath: "/a.ts", Start: 50, BatchId: BatchId(same), RouteIds: []string{"orders/list"}},
		{FilePath: "/c.ts", Start: 0, BatchId: BatchId(same), RouteIds: same, Mappings: []Mapping{mappingA}},
	}
	diags := CheckConflicts(sites)
	if len(diags) != 2 {
		t.Fatalf("expected BAT004 + BAT002, got: %s", diagnosticsDebug(diags))
	}
	byCode := map[string]diagnostics.Diagnostic{}
	for _, diag := range diags {
		byCode[diag.Code] = diag
	}
	collision, ok := byCode[diagnostics.CodeBatchIdCollision]
	if !ok || collision.Site.FilePath != "/a.ts" || len(collision.Related) != 1 || collision.Related[0].FilePath != "/a.ts" {
		t.Errorf("BAT004 = %+v", collision)
	}
	conflict, ok := byCode[diagnostics.CodeBatchMappingConflict]
	if !ok || conflict.Site.FilePath != "/b.ts" || conflict.Args[0] != BatchId(same) || len(conflict.Related) != 1 || conflict.Related[0].FilePath != "/a.ts" {
		t.Errorf("BAT002 = %+v", conflict)
	}
	// Same routes, same mappings in a different order: no conflict.
	if extra := CheckConflicts([]Site{
		{FilePath: "/a.ts", BatchId: "b_x", RouteIds: same, Mappings: []Mapping{mappingA, {FromId: "users/getById", ToId: "orders/list", ParamIndex: 1, MapperKey: "rt::bbb"}}},
		{FilePath: "/b.ts", BatchId: "b_x", RouteIds: same, Mappings: []Mapping{{FromId: "users/getById", ToId: "orders/list", ParamIndex: 1, MapperKey: "rt::bbb"}, mappingA}},
	}); len(extra) != 0 {
		t.Errorf("mapping order must not count as a conflict: %s", diagnosticsDebug(extra))
	}
}

func TestInjection_TrailingCommaAndOptionalGap(t *testing.T) {
	trailing := oneSite(t, "const {routes} = initClient<Routes>();\nexport const b = batch([routes.users.getById(1)],);")
	if want := "'" + trailing.BatchId + "'"; trailing.InjectText != want {
		t.Errorf("trailing comma: InjectText = %q, want %q", trailing.InjectText, want)
	}
	gap := oneSite(t, `import type {InjectBatchId} from '@mionjs/run-types';
const {routes} = initClient<Routes>();
function myBatch<R extends RouteSubRequest<any>[]>(routes: [...R], opts?: {label?: string}, batchId?: InjectBatchId<R>) { return batch(routes, batchId); }
export const b = myBatch([routes.users.getById(1)]);
`)
	if want := ", undefined, '" + gap.BatchId + "'"; gap.InjectText != want {
		t.Errorf("optional gap: InjectText = %q, want %q", gap.InjectText, want)
	}
	if gap.CalleeName != "myBatch" {
		t.Errorf("wrapper callee = %q", gap.CalleeName)
	}
	if reps := Replacements([]Site{gap, {FilePath: "/x.ts", InjectPos: 3}}); len(reps) != 1 || reps[0].Start != gap.InjectPos || reps[0].End != gap.InjectPos || reps[0].Text != gap.InjectText || reps[0].ImportFrom != "" {
		t.Errorf("Replacements = %+v", reps)
	}
}

func TestBatchId_DeterministicAndVersionIndependent(t *testing.T) {
	routes := []string{"users/getById", "orders/list"}
	first := BatchId(routes)
	if first != BatchId([]string{"users/getById", "orders/list"}) {
		t.Errorf("BatchId is not deterministic")
	}
	if !strings.HasPrefix(first, BatchIdPrefix) {
		t.Errorf("BatchId %q lacks the %q prefix", first, BatchIdPrefix)
	}
	if first == BatchId([]string{"orders/list", "users/getById"}) {
		t.Errorf("order must change the id")
	}
	originalVersion := constants.Version
	t.Cleanup(func() { constants.Version = originalVersion })
	constants.Version = "v-batch-A"
	idA := BatchId(routes)
	constants.Version = "v-batch-B"
	idB := BatchId(routes)
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
