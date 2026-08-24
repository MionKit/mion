package resolver_test

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"

	"github.com/mionkit/ts-runtypes/internal/compiler/program"
	"github.com/mionkit/ts-runtypes/internal/compiler/resolver"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// Parallel-scan equivalence suite. Every fixture-bearing test follows the
// marker coverage rule: each scenario exercises both the static form
// (getRunTypeId<T>() / createX<T>()) and the reflection form
// (getRunTypeId(value) / createX(value)).

// parallelFixtureLarge builds a 24-property interface so at least one
// group carries projection-heavy work.
func parallelFixtureLarge() string {
	var sb strings.Builder
	sb.WriteString("import {createValidateFn, createGetValidationErrorsFn} from '@ts-runtypes/core';\n")
	sb.WriteString("export interface Big {\n")
	for i := 0; i < 6; i++ {
		fmt.Fprintf(&sb, "  s%d: string; n%d: number; o%d?: {a: string; b: number[]; c: 'x' | 'y' | %d}; d%d: Date;\n", i, i, i, i, i)
	}
	sb.WriteString("}\n")
	sb.WriteString("export const v = createValidateFn<Big>();\n")
	sb.WriteString("export const e = createGetValidationErrorsFn<Big>();\n")
	return sb.String()
}

// parallelFixtureSources is the shared multi-file fixture set: enough
// files to spread across the 4-checker pool, covering objects, unions
// (discriminated + mixed), a large object, cross-file structural dedup,
// diagnostics (MKR001/MKR003/MKR004/CTA), enums/templates/tuples,
// reflect-form annotation honoring, and classes/builtins.
func parallelFixtureSources() map[string]string {
	return map[string]string{
		"a_objects.ts": `import {createValidateFn, createGetValidationErrorsFn, getRunTypeId} from '@ts-runtypes/core';
export interface Address {street: string; city: string; zip?: string}
export interface User {
  id: number;
  name: string;
  active: boolean;
  tags: string[];
  address: Address;
  friends: User[];
  createdAt: Date;
  meta: {[key: string]: string};
}
export const v = createValidateFn<User>();
export const e = createGetValidationErrorsFn<User>();
export const idStatic = getRunTypeId<Address>();
const addr: Address = {street: 's', city: 'c'};
export const idReflect = getRunTypeId(addr);
`,
		"b_unions.ts": `import {createValidateFn, createJsonEncoderFn, createJsonDecoderFn, getRunTypeId} from '@ts-runtypes/core';
export type Shape = {kind: 'circle'; radius: number} | {kind: 'square'; size: number} | {kind: 'rect'; w: number; h: number};
export type Mixed = string | number | Date | {a: string} | string[];
export const v = createValidateFn<Shape>();
export const enc = createJsonEncoderFn<Shape>();
export const dec = createJsonDecoderFn<Mixed>();
export const idStatic = getRunTypeId<Shape>();
const sh: Shape = {kind: 'circle', radius: 1};
export const idReflect = getRunTypeId(sh);
`,
		"c_large.ts": parallelFixtureLarge(),
		"d_shared.ts": `import {createValidateFn, getRunTypeId} from '@ts-runtypes/core';
export interface AddressClone {street: string; city: string; zip?: string}
export const v = createValidateFn<AddressClone>();
export const idStatic = getRunTypeId<AddressClone>();
const a: AddressClone = {street: 'x', city: 'y'};
export const idReflect = getRunTypeId(a);
`,
		"e_diags.ts": `import {createValidateFn, getRunTypeId} from '@ts-runtypes/core';
export function wrap<T>() { return createValidateFn<T>(); }
function make() { return {a: 1}; }
export const viaCall = createValidateFn(make());
export const noopOpt = createValidateFn<string>(undefined, {noLiterals: true});
const opts = {noLiterals: true};
export const nonLiteral = createValidateFn<string>(undefined, opts);
const made: {a: number} = {a: 2};
export const reflected = getRunTypeId(made);
`,
		"f_enum_literals.ts": `import {createValidateFn, getRunTypeId} from '@ts-runtypes/core';
export enum Color {Red, Green = 'green', Blue = 2}
export type Route = ` + "`api/user/${number}`" + `;
export type Pair = [string, number?];
export const a = getRunTypeId<Color>();
export const b = createValidateFn<Route>();
export const c = createValidateFn<Pair>();
const pair: Pair = ['x', 1];
export const d = getRunTypeId(pair);
`,
		"g_reflect.ts": `import {createValidateFn, getRunTypeId} from '@ts-runtypes/core';
export type Mode = 'on' | 'off';
const mode: Mode = 'on';
export const fromValue = createValidateFn(mode);
export const fromType = createValidateFn<Mode>();
export const idStatic = getRunTypeId<Mode>();
`,
		"h_classes.ts": `import {createValidateFn, getRunTypeId} from '@ts-runtypes/core';
export class Account {
  id: number = 0;
  name = '';
  tags: Set<string> = new Set();
  meta: Map<string, number> = new Map();
}
export const v = createValidateFn<Account>();
export const p = getRunTypeId<Promise<string>>();
export const r = createValidateFn<RegExp>();
export const d = createValidateFn<Date>();
const acc = new Account();
export const idReflect = getRunTypeId(acc);
`,
		// Non-serialisable members silently drop with per-family Warning
		// diagnostics (VL010 / VE010 / json-family codes) — multiple
		// families emit RT-render diagnostics for the same type, which
		// pins the cross-family diagnostic merge order in parallel mode.
		"i_dropped.ts": `import {createValidateFn, createGetValidationErrorsFn, createJsonEncoderFn, getRunTypeId} from '@ts-runtypes/core';
export interface WithFn { name: string; onClick: () => void; }
export const v = createValidateFn<WithFn>();
export const e = createGetValidationErrorsFn<WithFn>();
export const enc = createJsonEncoderFn<WithFn>();
const w: WithFn = {name: 'x', onClick: () => {}};
export const idReflect = getRunTypeId(w);
`,
	}
}

// parallelFixtureFiles is the canonical request order for the fixture set.
func parallelFixtureFiles() []string {
	return []string{
		"a_objects.ts", "b_unions.ts", "c_large.ts", "d_shared.ts",
		"e_diags.ts", "f_enum_literals.ts", "g_reflect.ts", "h_classes.ts",
		"i_dropped.ts",
	}
}

// setupSerialResolver builds a multi-checker program whose resolver is
// forced onto the serial scan path — the equivalence baseline.
func setupSerialResolver(t testing.TB, sources map[string]string) *resolver.Session {
	t.Helper()
	return setupInlineWith(t, sources, func(_ *program.Options, resolverOpts *resolver.Options) {
		resolverOpts.DisableParallelScan = true
	})
}

// setupParallelResolver builds a multi-checker program with the default
// (parallel-on) resolver options.
func setupParallelResolver(t testing.TB, sources map[string]string) *resolver.Session {
	t.Helper()
	return setupInlineWith(t, sources, nil)
}

func scanAllRequest(files []string) protocol.Request {
	return protocol.Request{
		Op:                  protocol.OpScanFiles,
		Files:               files,
		IncludeRunTypes:     true,
		IncludeEntryModules: true,
	}
}

func responseJSON(t testing.TB, response protocol.Response) string {
	t.Helper()
	if response.Error != "" {
		t.Fatalf("dispatch returned error: %s", response.Error)
	}
	encoded, err := json.Marshal(response)
	if err != nil {
		t.Fatalf("marshal response: %v", err)
	}
	return string(encoded)
}

// stripCwd normalizes a resolver's absolute working directory out of a
// response JSON string so two resolvers built over different temp dirs
// compare equal. Dump-path sites carry absolute file names.
func stripCwd(t testing.TB, target *resolver.Session, encoded string) string {
	t.Helper()
	cwd := target.Program.TS.GetCurrentDirectory()
	return strings.ReplaceAll(encoded, cwd, "<root>")
}

// TestParallelScan_EquivalentToSerial pins the whole scanFiles response —
// sites (order included), diagnostics (order included), Added* booleans,
// every rendered cache source, and the interned cache size — byte-equal
// between the serial and parallel paths over the same multi-file fixture.
func TestParallelScan_EquivalentToSerial(t *testing.T) {
	sources := parallelFixtureSources()
	files := parallelFixtureFiles()

	serial := setupSerialResolver(t, sources)
	parallel := setupParallelResolver(t, sources)

	serialResponse := serial.Dispatch(scanAllRequest(files))
	parallelResponse := parallel.Dispatch(scanAllRequest(files))

	// Sanity: the fixture must actually produce work in both modes.
	if len(serialResponse.Sites) == 0 {
		t.Fatalf("fixture produced no sites")
	}
	if len(serialResponse.Diagnostics) == 0 {
		t.Fatalf("fixture produced no diagnostics (MKR/CTA coverage missing)")
	}

	serialJSON := responseJSON(t, serialResponse)
	parallelJSON := responseJSON(t, parallelResponse)
	if serialJSON != parallelJSON {
		t.Fatalf("parallel response differs from serial.\nserial:   %s\nparallel: %s", serialJSON, parallelJSON)
	}
	if serial.Cache().Size() != parallel.Cache().Size() {
		t.Fatalf("cache size mismatch: serial %d, parallel %d", serial.Cache().Size(), parallel.Cache().Size())
	}
}

// TestParallelScan_Deterministic pins that two fresh parallel sessions
// over identical sources produce byte-identical responses.
func TestParallelScan_Deterministic(t *testing.T) {
	sources := parallelFixtureSources()
	files := parallelFixtureFiles()

	first := setupParallelResolver(t, sources)
	second := setupParallelResolver(t, sources)

	firstJSON := responseJSON(t, first.Dispatch(scanAllRequest(files)))
	secondJSON := responseJSON(t, second.Dispatch(scanAllRequest(files)))
	if firstJSON != secondJSON {
		t.Fatalf("two parallel sessions diverged.\nfirst:  %s\nsecond: %s", firstJSON, secondJSON)
	}
}

// TestParallelScan_CrossCheckerDedup pins that structurally equal types
// declared in files assigned to (potentially) different checkers collapse
// to the same wire id — the structural layer is the cross-checker merge
// point. Covered in both marker forms via the fixture's getRunTypeId /
// getRunTypeId sites.
func TestParallelScan_CrossCheckerDedup(t *testing.T) {
	sources := parallelFixtureSources()
	files := parallelFixtureFiles()

	parallel := setupParallelResolver(t, sources)
	response := parallel.Dispatch(scanAllRequest(files))
	if response.Error != "" {
		t.Fatalf("dispatch: %s", response.Error)
	}

	// getRunTypeId sites carry no FnId; Address (a_objects) and
	// AddressClone (d_shared) are the same shape, so their static AND
	// reflect ids must all coincide.
	idsByFile := map[string][]string{}
	for _, site := range response.Sites {
		if site.FnId == "" {
			idsByFile[site.File] = append(idsByFile[site.File], site.ID)
		}
	}
	addressIDs := idsByFile["a_objects.ts"]
	cloneIDs := idsByFile["d_shared.ts"]
	if len(addressIDs) != 2 || len(cloneIDs) != 2 {
		t.Fatalf("expected 2 reflection-marker sites per file, got %v / %v", addressIDs, cloneIDs)
	}
	want := addressIDs[0]
	for _, id := range append(addressIDs[1:], cloneIDs...) {
		if id != want {
			t.Fatalf("structural dedup broke across checkers: ids %v / %v", addressIDs, cloneIDs)
		}
	}
}

// TestParallelScan_SingleCheckerPoolFallsBack pins the degeneration path:
// a single-threaded PROGRAM (one pool checker) with parallel-enabled
// resolver options must take the serial fallback and match the fully
// serial configuration byte for byte.
func TestParallelScan_SingleCheckerPoolFallsBack(t *testing.T) {
	sources := parallelFixtureSources()
	files := parallelFixtureFiles()

	baseline := setupInlineWith(t, sources, func(programOpts *program.Options, resolverOpts *resolver.Options) {
		programOpts.SingleThreaded = true
		resolverOpts.SingleThreaded = true
	})
	// Parallel enabled, but the pool has one checker → planScanGroups
	// yields one group → serial fallback.
	degenerate := setupInlineWith(t, sources, func(programOpts *program.Options, _ *resolver.Options) {
		programOpts.SingleThreaded = true
	})

	baselineJSON := responseJSON(t, baseline.Dispatch(scanAllRequest(files)))
	degenerateJSON := responseJSON(t, degenerate.Dispatch(scanAllRequest(files)))
	if baselineJSON != degenerateJSON {
		t.Fatalf("single-checker degeneration diverged from serial baseline")
	}
}

// TestParallelScan_RescanIdempotence pins that a second identical request
// behaves the same in both modes (cache hits, duplicated session sites —
// whatever the semantics, they must match).
func TestParallelScan_RescanIdempotence(t *testing.T) {
	sources := parallelFixtureSources()
	files := parallelFixtureFiles()

	serial := setupSerialResolver(t, sources)
	parallel := setupParallelResolver(t, sources)

	serial.Dispatch(scanAllRequest(files))
	parallel.Dispatch(scanAllRequest(files))
	serialSecond := responseJSON(t, serial.Dispatch(scanAllRequest(files)))
	parallelSecond := responseJSON(t, parallel.Dispatch(scanAllRequest(files)))
	if serialSecond != parallelSecond {
		t.Fatalf("second-scan responses diverged.\nserial:   %s\nparallel: %s", serialSecond, parallelSecond)
	}
	if len(serial.Sites()) != len(parallel.Sites()) {
		t.Fatalf("session site lists diverged: serial %d, parallel %d", len(serial.Sites()), len(parallel.Sites()))
	}
}

// TestParallelScan_ErrorParity pins the unresolvable-file behavior: the
// parallel path must reproduce the serial path's error AND its partial
// session mutation (files before the bad one are scanned, the rest are
// not) — it does so by falling back to the serial loop when planning
// fails.
func TestParallelScan_ErrorParity(t *testing.T) {
	sources := parallelFixtureSources()
	requested := []string{"a_objects.ts", "missing.ts", "b_unions.ts"}

	serial := setupSerialResolver(t, sources)
	parallel := setupParallelResolver(t, sources)

	serialResponse := serial.Dispatch(scanAllRequest(requested))
	parallelResponse := parallel.Dispatch(scanAllRequest(requested))

	if serialResponse.Error == "" || parallelResponse.Error == "" {
		t.Fatalf("expected both modes to error, got serial=%q parallel=%q", serialResponse.Error, parallelResponse.Error)
	}
	if stripCwd(t, serial, serialResponse.Error) != stripCwd(t, parallel, parallelResponse.Error) {
		t.Fatalf("error mismatch: serial=%q parallel=%q", serialResponse.Error, parallelResponse.Error)
	}
	if len(serial.Sites()) != len(parallel.Sites()) {
		t.Fatalf("partial-scan residue diverged: serial %d sites, parallel %d sites", len(serial.Sites()), len(parallel.Sites()))
	}
}

// TestParallelScan_DumpEquivalence pins the OpDump path — its eager
// scanAllProgramFiles inherits the parallel scan, and the resulting full
// dump must match serial mode (absolute temp paths normalized out).
func TestParallelScan_DumpEquivalence(t *testing.T) {
	sources := parallelFixtureSources()

	serial := setupSerialResolver(t, sources)
	parallel := setupParallelResolver(t, sources)

	serialResponse := serial.Dispatch(protocol.Request{Op: protocol.OpDump})
	parallelResponse := parallel.Dispatch(protocol.Request{Op: protocol.OpDump})

	serialJSON := stripCwd(t, serial, responseJSON(t, serialResponse))
	parallelJSON := stripCwd(t, parallel, responseJSON(t, parallelResponse))
	if serialJSON != parallelJSON {
		t.Fatalf("dump responses diverged.\nserial:   %s\nparallel: %s", serialJSON, parallelJSON)
	}
	if len(serialResponse.Sites) == 0 {
		t.Fatalf("dump produced no sites — eager scan did not run")
	}
}
