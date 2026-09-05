package resolver_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/program"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/resolver"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// batchClientDTS is an ambient stand-in for the `@mionjs/client` surface the
// batches lane reads: `initClient()` (the routes proxy), `RouteSubRequest`
// (what a route call returns), the two-overload `inputFrom` mapper factory and
// the branded `batch`. The markers come from the REAL `@mionjs/run-types`
// package setupInline mounts, so the brands are the shipped declarations.
const batchClientDTS = `declare module '@mionjs/client' {
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

// batchRoutesTS is the shared client bootstrap every batch fixture imports.
const batchRoutesTS = `import {initClient} from '@mionjs/client';
export type Routes = {
  users: {getById: (id: number) => {id: number; name: string}};
  orders: {list: (userId: number) => string[]; getById: (id: number) => {id: number}};
};
export const {routes} = initClient<Routes>();
`

// batchSources is the program the report/generate tests share: a batch-only
// file (no reflection marker at all) with an inline mapper, and a second file
// batching a different route list.
var batchSources = map[string]string{
	"client.d.ts": batchClientDTS,
	"routes.ts":   batchRoutesTS,
	"a.ts": `import {batch, inputFrom} from '@mionjs/client';
import {routes} from './routes.ts';
const user = routes.users.getById(1);
export const b = batch([user, routes.orders.getById(inputFrom(user, (u: {id: number}) => u.id))]);
`,
	"b.ts": `import {batch} from '@mionjs/client';
import {routes} from './routes.ts';
export const b = batch([routes.orders.list(1)]);
`,
}

// batchIdReplacement finds the batch-id splice: a point insertion whose text
// is a quoted `b_<hash>` id (no ImportFrom).
func batchIdReplacement(reps []protocol.Replacement) (protocol.Replacement, bool) {
	for _, rep := range reps {
		if rep.ImportFrom == "" && rep.Start == rep.End && strings.Contains(rep.Text, "'b_") {
			return rep, true
		}
	}
	return protocol.Replacement{}, false
}

func batchDiags(diags []diagnostics.Diagnostic) []diagnostics.Diagnostic {
	var out []diagnostics.Diagnostic
	for _, diag := range diags {
		if strings.HasPrefix(diag.Code, "BAT") {
			out = append(out, diag)
		}
	}
	return out
}

func setupBatchWith(t *testing.T, wire, file bool, genDir string) *resolver.Session {
	t.Helper()
	return setupInlineWith(t, batchSources, func(programOpts *program.Options, resolverOpts *resolver.Options) {
		programOpts.SingleThreaded = true
		resolverOpts.SingleThreaded = true
		resolverOpts.PureFnReportWire = wire
		resolverOpts.PureFnReportFile = file
		resolverOpts.GenDir = genDir
	})
}

// TestBatch_ScanInjectsId_ReportOnlyOnWire: the id splice rides every scan,
// the report rides only the wire flag.
func TestBatch_ScanInjectsId_ReportOnlyOnWire(t *testing.T) {
	off := setupInline(t, batchSources)
	scan := off.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"b.ts"}})
	if scan.Error != "" {
		t.Fatalf("scanFiles: %s", scan.Error)
	}
	if diags := batchDiags(scan.Diagnostics); len(diags) != 0 {
		t.Fatalf("unexpected batch diagnostics: %+v", diags)
	}
	rep, ok := batchIdReplacement(scan.Replacements)
	if !ok {
		t.Fatalf("missing batch-id replacement in %+v", scan.Replacements)
	}
	if !strings.HasPrefix(rep.Text, ", 'b_") || !strings.HasSuffix(rep.Text, "'") {
		t.Errorf("unexpected batch-id insertion text: %q", rep.Text)
	}
	if len(scan.BatchSites) != 0 {
		t.Errorf("report off but scan carried %d batch sites", len(scan.BatchSites))
	}

	on := setupBatchWith(t, true, false, t.TempDir())
	scanOn := on.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"b.ts"}})
	if scanOn.Error != "" {
		t.Fatalf("scanFiles: %s", scanOn.Error)
	}
	if len(scanOn.BatchSites) != 1 || strings.Join(scanOn.BatchSites[0].RouteIds, ",") != "orders/list" {
		t.Fatalf("scan delta expected one orders/list site, got %+v", scanOn.BatchSites)
	}
	if scanOn.BatchSites[0].BatchId == "" || !strings.Contains(rep.Text, scanOn.BatchSites[0].BatchId) {
		t.Errorf("report id %q must match the injected id %q", scanOn.BatchSites[0].BatchId, rep.Text)
	}
}

// TestBatch_TransformCarriesIdAndMapperHash: the rewritten source carries the
// injected batch id AND the nested inline mapper's own `rt::` hash.
func TestBatch_TransformCarriesIdAndMapperHash(t *testing.T) {
	r := setupInline(t, batchSources)
	tr := r.Dispatch(protocol.Request{Op: protocol.OpTransform, Files: []string{"a.ts"}})
	if tr.Error != "" {
		t.Fatalf("transform: %s", tr.Error)
	}
	if diags := batchDiags(tr.Diagnostics); len(diags) != 0 {
		t.Fatalf("unexpected batch diagnostics: %+v", diags)
	}
	code := tr.Transformed["a.ts"].Code
	if !strings.Contains(code, "'b_") {
		t.Errorf("transformed code lacks the injected batch id:\n%s", code)
	}
	if !strings.Contains(code, "'rt::") {
		t.Errorf("transformed code lacks the nested mapper's rt:: hash:\n%s", code)
	}
	if strings.Count(code, "'b_") != 1 {
		t.Errorf("expected exactly one batch id in:\n%s", code)
	}
}

// TestBatch_GenerateWholeProgram: OpGenerate reports every site, writes the
// JSON file only with the file flag, and lists a batch-only file in SiteFiles.
func TestBatch_GenerateWholeProgram(t *testing.T) {
	outDir := t.TempDir()
	r := setupBatchWith(t, true, true, outDir)
	gen := r.Dispatch(protocol.Request{Op: protocol.OpGenerate})
	if gen.Error != "" {
		t.Fatalf("generate: %s", gen.Error)
	}
	if diags := batchDiags(gen.Diagnostics); len(diags) != 0 {
		t.Fatalf("unexpected batch diagnostics: %+v", diags)
	}
	if len(gen.BatchSites) != 2 {
		t.Fatalf("expected 2 batch sites, got %+v", gen.BatchSites)
	}
	var withMapping *protocol.BatchSite
	for i := range gen.BatchSites {
		if len(gen.BatchSites[i].Mappings) > 0 {
			withMapping = &gen.BatchSites[i]
		}
	}
	if withMapping == nil || withMapping.Mappings[0].FromId != "users/getById" || withMapping.Mappings[0].ToId != "orders/getById" || !strings.HasPrefix(withMapping.Mappings[0].MapperKey, "rt::") {
		t.Errorf("expected the a.ts site to carry the users→orders rt:: mapping, got %+v", gen.BatchSites)
	}
	reportPath := filepath.Join(outDir, "types", "batches-report.json")
	raw, err := os.ReadFile(reportPath)
	if err != nil {
		t.Fatalf("batches-report.json not written: %v", err)
	}
	var fromDisk []protocol.BatchSite
	if err := json.Unmarshal(raw, &fromDisk); err != nil {
		t.Fatalf("report file is not valid JSON: %v", err)
	}
	if len(fromDisk) != 2 || fromDisk[0].BatchId == "" {
		t.Fatalf("disk report = %+v", fromDisk)
	}
	for _, basename := range gen.Generated {
		if strings.Contains(basename, "batches-report") {
			t.Fatalf("report file leaked into the module manifest: %q", basename)
		}
	}
	// b.ts has no reflection marker at all: its only marker use is batch().
	batchOnly := false
	for _, file := range gen.SiteFiles {
		if strings.HasSuffix(file, "/b.ts") {
			batchOnly = true
		}
	}
	if !batchOnly {
		t.Errorf("SiteFiles must include the batch-only file b.ts, got %v", gen.SiteFiles)
	}

	// Wire on, file off: report on the response, nothing on disk.
	wireOnly := t.TempDir()
	genWire := setupBatchWith(t, true, false, wireOnly).Dispatch(protocol.Request{Op: protocol.OpGenerate})
	if genWire.Error != "" || len(genWire.BatchSites) != 2 {
		t.Fatalf("wire-only generate: err=%q sites=%d", genWire.Error, len(genWire.BatchSites))
	}
	if _, err := os.Stat(filepath.Join(wireOnly, "types", "batches-report.json")); err == nil {
		t.Errorf("file flag off but batches-report.json was written")
	}

	// Off by default: no report anywhere, the id still injected on scan.
	offDir := t.TempDir()
	off := setupBatchWith(t, false, false, offDir)
	genOff := off.Dispatch(protocol.Request{Op: protocol.OpGenerate})
	if genOff.Error != "" || len(genOff.BatchSites) != 0 {
		t.Fatalf("off-by-default generate: err=%q sites=%d", genOff.Error, len(genOff.BatchSites))
	}
	if _, err := os.Stat(filepath.Join(offDir, "types", "batches-report.json")); err == nil {
		t.Errorf("report off but batches-report.json was written")
	}
	if _, ok := batchIdReplacement(off.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts"}}).Replacements); !ok {
		t.Errorf("report off must not disable the id injection")
	}
}

// TestBatch_SameRoutesDifferentMappings_TwoBatches: two files batching the
// same routes with different mappings are two batches with two ids, on the
// single-file scan and on the whole-program generate alike; only a real hash
// collision (BAT003) is a conflict.
func TestBatch_SameRoutesDifferentMappings_TwoBatches(t *testing.T) {
	sources := map[string]string{
		"client.d.ts": batchClientDTS,
		"routes.ts":   batchRoutesTS,
		"x.ts": `import {batch, inputFrom} from '@mionjs/client';
import {routes} from './routes.ts';
const user = routes.users.getById(1);
export const b = batch([user, routes.orders.getById(inputFrom(user, 'toUserId'))]);
`,
		"y.ts": `import {batch, inputFrom} from '@mionjs/client';
import {routes} from './routes.ts';
const user = routes.users.getById(1);
export const b = batch([user, routes.orders.getById(inputFrom(user, 'toOrderId'))]);
`,
	}
	r := setupInlineWith(t, sources, func(programOpts *program.Options, resolverOpts *resolver.Options) {
		resolverOpts.PureFnReportWire = true
	})
	scan := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"x.ts"}})
	if scan.Error != "" {
		t.Fatalf("scanFiles: %s", scan.Error)
	}
	if diags := batchDiags(scan.Diagnostics); len(diags) != 0 {
		t.Fatalf("single-file scan must stay clean: %+v", diags)
	}
	gen := r.Dispatch(protocol.Request{Op: protocol.OpGenerate})
	if gen.Error != "" {
		t.Fatalf("generate: %s", gen.Error)
	}
	if diags := batchDiags(gen.Diagnostics); len(diags) != 0 {
		t.Fatalf("same routes with different mappings must not be reported: %+v", diags)
	}
	if len(gen.BatchSites) != 2 || gen.BatchSites[0].BatchId == gen.BatchSites[1].BatchId {
		t.Fatalf("expected two batches with two ids, got %+v", gen.BatchSites)
	}
}

// TestBatch_ElementDiagnosticsFlowOnScan: a BAT001 reaches the scan response
// and suppresses the injection for that call.
func TestBatch_ElementDiagnosticsFlowOnScan(t *testing.T) {
	r := setupInline(t, map[string]string{
		"client.d.ts": batchClientDTS,
		"routes.ts":   batchRoutesTS,
		"a.ts": `import {batch} from '@mionjs/client';
import {routes} from './routes.ts';
const prepared = [routes.users.getById(1)];
export const b = batch([...prepared]);
`,
	})
	scan := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts"}})
	if scan.Error != "" {
		t.Fatalf("scanFiles: %s", scan.Error)
	}
	diags := batchDiags(scan.Diagnostics)
	if len(diags) != 1 || diags[0].Code != diagnostics.CodeBatchElementNotReadable || diags[0].Args[0] != "spread element" {
		t.Fatalf("expected one BAT001 (spread element), got %+v", diags)
	}
	if diags[0].Severity != diagnostics.SeverityError || diags[0].Family != diagnostics.FamilyMarker {
		t.Errorf("BAT001 must be a marker-family error: %+v", diags[0])
	}
	if _, ok := batchIdReplacement(scan.Replacements); ok {
		t.Errorf("a rejected batch must not be injected: %+v", scan.Replacements)
	}
}

// TestBatch_MarkerCoverage_BothGetRunTypeIdForms pins the Marker test coverage
// rule for this lane: a file mixing a batch() call with BOTH getRunTypeId call
// shapes resolves every site, the two reflection forms agree on one id, and
// the batch id is spliced alongside them.
func TestBatch_MarkerCoverage_BothGetRunTypeIdForms(t *testing.T) {
	const staticForm = `import {getRunTypeId} from '@mionjs/run-types';
import {batch} from '@mionjs/client';
import {routes} from './routes.ts';
export type User = {id: number; name: string};
export const userId = getRunTypeId<User>();
export const b = batch([routes.users.getById(1)]);
`
	const reflectForm = `import {getRunTypeId} from '@mionjs/run-types';
import {batch} from '@mionjs/client';
import {routes} from './routes.ts';
export type User = {id: number; name: string};
const user: User = {id: 1, name: 'ann'};
export const userId = getRunTypeId(user);
export const b = batch([routes.users.getById(1)]);
`
	r := setupInline(t, map[string]string{
		"client.d.ts": batchClientDTS,
		"routes.ts":   batchRoutesTS,
		"static.ts":   staticForm,
		"reflect.ts":  reflectForm,
	})
	staticScan := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"static.ts"}})
	reflectScan := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"reflect.ts"}})
	if staticScan.Error != "" || reflectScan.Error != "" {
		t.Fatalf("scanFiles: %q / %q", staticScan.Error, reflectScan.Error)
	}
	if len(staticScan.Sites) != 1 || len(reflectScan.Sites) != 1 {
		t.Fatalf("expected one reflection site per file, got %d / %d", len(staticScan.Sites), len(reflectScan.Sites))
	}
	if staticScan.Sites[0].ID != reflectScan.Sites[0].ID {
		t.Errorf("static vs reflect getRunTypeId must agree next to a batch(): %q vs %q", staticScan.Sites[0].ID, reflectScan.Sites[0].ID)
	}
	staticRep, okStatic := batchIdReplacement(staticScan.Replacements)
	reflectRep, okReflect := batchIdReplacement(reflectScan.Replacements)
	if !okStatic || !okReflect {
		t.Fatalf("both files must carry the batch-id splice: %+v / %+v", staticScan.Replacements, reflectScan.Replacements)
	}
	if staticRep.Text != reflectRep.Text {
		t.Errorf("same routes must inject the same id: %q vs %q", staticRep.Text, reflectRep.Text)
	}
}

// TestBatch_PlanDiagnosticsFlowOnScan: the two plan-level codes the server
// would otherwise refuse at request time (BAT005 duplicate route, BAT006
// mapping position) reach the scan response and suppress the injection.
func TestBatch_PlanDiagnosticsFlowOnScan(t *testing.T) {
	cases := map[string]struct{ source, code, args string }{
		"duplicate route": {`import {batch} from '@mionjs/client';
import {routes} from './routes.ts';
export const b = batch([routes.users.getById(1), routes.users.getById(2)]);
`, diagnostics.CodeBatchDuplicateRoute, "users/getById"},
		"mapping out of range": {`import {batch, inputFrom} from '@mionjs/client';
import {routes} from './routes.ts';
const user = routes.users.getById(1);
export const b = batch([user, routes.orders.getById(1, inputFrom(user, 'toUserId'))]);
`, diagnostics.CodeBatchMappingParamOutOfRange, "1|1|orders/getById"},
	}
	for name, testCase := range cases {
		t.Run(name, func(t *testing.T) {
			r := setupInline(t, map[string]string{"client.d.ts": batchClientDTS, "routes.ts": batchRoutesTS, "a.ts": testCase.source})
			scan := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts"}})
			if scan.Error != "" {
				t.Fatalf("scanFiles: %s", scan.Error)
			}
			diags := batchDiags(scan.Diagnostics)
			if len(diags) != 1 || diags[0].Code != testCase.code || strings.Join(diags[0].Args, "|") != testCase.args {
				t.Fatalf("expected one %s (%s), got %+v", testCase.code, testCase.args, diags)
			}
			if diags[0].Severity != diagnostics.SeverityError || diags[0].Family != diagnostics.FamilyMarker {
				t.Errorf("%s must be a marker-family error: %+v", testCase.code, diags[0])
			}
			if diags[0].Site.StartLine == 0 {
				t.Errorf("%s must carry a source location", testCase.code)
			}
			if _, ok := batchIdReplacement(scan.Replacements); ok {
				t.Errorf("a rejected batch must not be injected: %+v", scan.Replacements)
			}
		})
	}
}

// TestBatch_NamespaceImportAndBarrel_SameId: the routes proxy reached through
// `import * as api` and through a re-export barrel resolves on the full
// pipeline to the same id the named import gets, and the transform splices it.
func TestBatch_NamespaceImportAndBarrel_SameId(t *testing.T) {
	r := setupInline(t, map[string]string{
		"client.d.ts": batchClientDTS,
		"routes.ts":   batchRoutesTS,
		"barrel.ts":   "export * from './routes.ts';\n",
		"named.ts": `import {batch} from '@mionjs/client';
import {routes} from './routes.ts';
export const b = batch([routes.users.getById(1), routes.orders.list(2)]);
`,
		"namespace.ts": `import {batch} from '@mionjs/client';
import * as api from './routes.ts';
export const b = batch([api.routes.users.getById(1), api.routes.orders.list(2)]);
`,
		"barreled.ts": `import {batch} from '@mionjs/client';
import * as all from './barrel.ts';
const users = all.routes.users;
export const b = batch([users.getById(1), all.routes.orders.list(2)]);
`,
	})
	var texts []string
	for _, file := range []string{"named.ts", "namespace.ts", "barreled.ts"} {
		tr := r.Dispatch(protocol.Request{Op: protocol.OpTransform, Files: []string{file}})
		if tr.Error != "" {
			t.Fatalf("transform %s: %s", file, tr.Error)
		}
		if diags := batchDiags(tr.Diagnostics); len(diags) != 0 {
			t.Fatalf("%s: unexpected batch diagnostics: %+v", file, diags)
		}
		code := tr.Transformed[file].Code
		start := strings.Index(code, "'b_")
		if start < 0 {
			t.Fatalf("%s: transformed code lacks the injected batch id:\n%s", file, code)
		}
		texts = append(texts, code[start:start+len("'b_")+14+1])
	}
	if texts[0] != texts[1] || texts[0] != texts[2] {
		t.Errorf("the three import shapes name the same routes and must share one id: %v", texts)
	}
}
