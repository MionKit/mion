package resolver_test

import (
	"fmt"
	"strings"
	"testing"

	"github.com/mionkit/ts-runtypes/internal/compiler/program"
	"github.com/mionkit/ts-runtypes/internal/compiler/resolver"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// Micro-benchmarks for the resolver pipeline. These isolate OUR pipeline
// phases against a warm checker so `benchstat` deltas reflect Go-side changes,
// not tsgo program-construction noise.
//
// Run:  go test ./internal/compiler/resolver -bench=. -benchmem -run='^$' -count=10
// Compare: benchstat old.txt new.txt
//
// Stationarity: every iteration that mutates resolver state first restores
// a fixed starting point (SetProgram resets sites/scannedFiles and clears
// the pointer cache; Cache().Clear() additionally drops the structural
// table + hash dicts). Dump-based render benchmarks are stationary as-is.

const benchAtomicTS = `import {createValidateFn, getRunTypeId} from '@ts-runtypes/core';
export const a = createValidateFn<string>();
export const b = createValidateFn<number>();
export const c = createValidateFn<boolean>();
export const d = getRunTypeId<string[]>();
`

const benchObjectTS = `import {createValidateFn, createGetValidationErrorsFn, createJsonEncoderFn, createJsonDecoderFn} from '@ts-runtypes/core';
interface Address {street: string; city: string; zip?: string}
interface User {
  id: number;
  name: string;
  email: string;
  active: boolean;
  tags: string[];
  address: Address;
  friends: User[];
  createdAt: Date;
  meta: {[key: string]: string};
}
export const v = createValidateFn<User>();
export const e = createGetValidationErrorsFn<User>();
export const enc = createJsonEncoderFn<User>();
export const dec = createJsonDecoderFn<User>();
`

const benchUnionTS = `import {createValidateFn, createJsonEncoderFn, createJsonDecoderFn, createBinaryEncoderFn, createBinaryDecoderFn} from '@ts-runtypes/core';
type Shape = {kind: 'circle'; radius: number} | {kind: 'square'; size: number} | {kind: 'rect'; w: number; h: number};
type Mixed = string | number | Date | {a: string} | string[];
export const v = createValidateFn<Shape>();
export const je = createJsonEncoderFn<Shape>();
export const jd = createJsonDecoderFn<Shape>();
export const be = createBinaryEncoderFn<Mixed>();
export const bd = createBinaryDecoderFn<Mixed>();
`

// benchLargeTS is a generated 48-property object (mixed kinds, nested
// blocks, arrays, optionals, a union and a Date per block) that stresses
// projection, structural-id text building, and the per-family walkers.
var benchLargeTS = func() string {
	var sb strings.Builder
	sb.WriteString("import {createValidateFn, createGetValidationErrorsFn, createJsonEncoderFn, createJsonDecoderFn} from '@ts-runtypes/core';\n")
	sb.WriteString("interface Big {\n")
	for i := 0; i < 12; i++ {
		fmt.Fprintf(&sb, "  s%d: string; n%d: number; o%d?: {a: string; b: number[]; c: 'x' | 'y' | %d}; d%d: Date;\n", i, i, i, i, i)
	}
	sb.WriteString("}\n")
	sb.WriteString("export const v = createValidateFn<Big>();\n")
	sb.WriteString("export const e = createGetValidationErrorsFn<Big>();\n")
	sb.WriteString("export const enc = createJsonEncoderFn<Big>();\n")
	sb.WriteString("export const dec = createJsonDecoderFn<Big>();\n")
	return sb.String()
}()

var benchFixtures = []struct {
	name string
	code string
}{
	{"atomic", benchAtomicTS},
	{"object", benchObjectTS},
	{"union", benchUnionTS},
	{"large", benchLargeTS},
}

func benchScanRequest(files []string, includeEntryModules bool) protocol.Request {
	return protocol.Request{Op: protocol.OpScanFiles, Files: files, IncludeEntryModules: includeEntryModules}
}

// BenchmarkScan_ColdCache measures the full our-side pipeline per scan —
// AST walk, marker detection, structural-id computation, projection,
// purefn extraction, response prep — with a warm checker and a cold
// resolver cache. No cache sources requested (the Vite transform shape).
func BenchmarkScan_ColdCache(b *testing.B) {
	for _, fixture := range benchFixtures {
		b.Run(fixture.name, func(b *testing.B) {
			r := setupInline(b, map[string]string{"a.ts": fixture.code})
			prog := r.Program
			files := []string{"a.ts"}
			if resp := r.Dispatch(benchScanRequest(files, false)); resp.Error != "" {
				b.Fatalf("warmup scan: %s", resp.Error)
			}
			b.ReportAllocs()
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				if err := r.SetProgram(prog); err != nil {
					b.Fatalf("SetProgram: %v", err)
				}
				r.Cache().Clear()
				if resp := r.Dispatch(benchScanRequest(files, false)); resp.Error != "" {
					b.Fatalf("scan: %s", resp.Error)
				}
			}
		})
	}
}

// BenchmarkScan_WarmCache is BenchmarkScan_ColdCache with the structural
// table kept — every AssignID recomputes the structural id (the pointer
// cache is dropped by SetProgram) but hits byStructural, so projection
// and hash-dict work are excluded. The delta against ColdCache isolates
// projection + dict cost.
func BenchmarkScan_WarmCache(b *testing.B) {
	for _, fixture := range benchFixtures {
		b.Run(fixture.name, func(b *testing.B) {
			r := setupInline(b, map[string]string{"a.ts": fixture.code})
			prog := r.Program
			files := []string{"a.ts"}
			if resp := r.Dispatch(benchScanRequest(files, false)); resp.Error != "" {
				b.Fatalf("warmup scan: %s", resp.Error)
			}
			b.ReportAllocs()
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				if err := r.SetProgram(prog); err != nil {
					b.Fatalf("SetProgram: %v", err)
				}
				if resp := r.Dispatch(benchScanRequest(files, false)); resp.Error != "" {
					b.Fatalf("scan: %s", resp.Error)
				}
			}
		})
	}
}

// BenchmarkRender measures the dump-driven cache renders over a session
// holding all bench fixtures. `validate` exposes the CrossFamilyValRoots
// collection passes; `all` renders every family (the cache-module
// transform shape). Stationary: the session is scanned once, renders are
// pure reads.
func BenchmarkRender(b *testing.B) {
	sources := map[string]string{
		"object.ts": benchObjectTS,
		"union.ts":  benchUnionTS,
		"large.ts":  benchLargeTS,
	}
	b.Run("all", func(b *testing.B) {
		r := setupInline(b, sources)
		if resp := r.Dispatch(benchScanRequest([]string{"object.ts", "union.ts", "large.ts"}, false)); resp.Error != "" {
			b.Fatalf("warmup scan: %s", resp.Error)
		}
		req := protocol.Request{Op: protocol.OpDump}
		if resp := r.Dispatch(req); resp.Error != "" {
			b.Fatalf("warmup dump: %s", resp.Error)
		}
		b.ReportAllocs()
		b.ResetTimer()
		for i := 0; i < b.N; i++ {
			if resp := r.Dispatch(req); resp.Error != "" {
				b.Fatalf("dump: %s", resp.Error)
			}
		}
	})
}

// BenchmarkScanWithCaches measures the scanFiles-with-cache-sources shape
// the bench harness and tests drive (scan + scoped projection + per-family
// renders in one dispatch), per fixture, all families.
func BenchmarkScanWithCaches(b *testing.B) {
	for _, fixture := range benchFixtures {
		b.Run(fixture.name, func(b *testing.B) {
			r := setupInline(b, map[string]string{"a.ts": fixture.code})
			prog := r.Program
			files := []string{"a.ts"}
			if resp := r.Dispatch(benchScanRequest(files, true)); resp.Error != "" {
				b.Fatalf("warmup scan: %s", resp.Error)
			}
			b.ReportAllocs()
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				if err := r.SetProgram(prog); err != nil {
					b.Fatalf("SetProgram: %v", err)
				}
				r.Cache().Clear()
				if resp := r.Dispatch(benchScanRequest(files, true)); resp.Error != "" {
					b.Fatalf("scan: %s", resp.Error)
				}
			}
		})
	}
}

// benchMultiFileSources builds n files from the object template with
// per-file-unique type names, so structural dedup cannot collapse the
// cross-file checker work the parallel scan distributes across the pool.
func benchMultiFileSources(n int) (map[string]string, []string) {
	sources := make(map[string]string, n)
	files := make([]string, 0, n)
	for i := 0; i < n; i++ {
		name := fmt.Sprintf("f%02d.ts", i)
		var sb strings.Builder
		sb.WriteString("import {createValidateFn, createGetValidationErrorsFn, createJsonEncoderFn, createJsonDecoderFn} from '@ts-runtypes/core';\n")
		fmt.Fprintf(&sb, "interface Address%d {street: string; city: string; zip?: string}\n", i)
		fmt.Fprintf(&sb, "interface User%d {\n", i)
		fmt.Fprintf(&sb, "  id: number;\n  name: string;\n  email: string;\n  active: boolean;\n")
		fmt.Fprintf(&sb, "  tags: string[];\n  address: Address%d;\n  friends: User%d[];\n", i, i)
		fmt.Fprintf(&sb, "  createdAt: Date;\n  meta: {[key: string]: string};\n  choice: 'a%d' | 'b%d' | number;\n}\n", i, i)
		fmt.Fprintf(&sb, "export const v%d = createValidateFn<User%d>();\n", i, i)
		fmt.Fprintf(&sb, "export const e%d = createGetValidationErrorsFn<User%d>();\n", i, i)
		fmt.Fprintf(&sb, "export const enc%d = createJsonEncoderFn<User%d>();\n", i, i)
		fmt.Fprintf(&sb, "export const dec%d = createJsonDecoderFn<User%d>();\n", i, i)
		sources[name] = sb.String()
		files = append(files, name)
	}
	return sources, files
}

// BenchmarkScanMultiFile measures one multi-file scanFiles dispatch (no
// cache sources — the rewrite-pipeline shape) in three configurations:
// serialST (single-threaded program — the historical bench baseline),
// serialMT (4-checker pool, parallel disabled — isolates pool/program
// cost), and parallelMT (4-checker pool, parallel scan on — the shipped
// default). Cold resolver cache per iteration, warm checkers, mirroring
// BenchmarkScan_ColdCache.
func BenchmarkScanMultiFile(b *testing.B) {
	modes := []struct {
		name   string
		mutate func(*program.Options, *resolver.Options)
	}{
		{"serialST", func(programOpts *program.Options, resolverOpts *resolver.Options) {
			programOpts.SingleThreaded = true
			resolverOpts.SingleThreaded = true
		}},
		{"serialMT", func(_ *program.Options, resolverOpts *resolver.Options) {
			resolverOpts.DisableParallelScan = true
			resolverOpts.DisableParallelRender = true
		}},
		{"parallelMT", nil},
	}
	for _, fileCount := range []int{8, 16} {
		sources, files := benchMultiFileSources(fileCount)
		for _, mode := range modes {
			b.Run(fmt.Sprintf("files%d/%s", fileCount, mode.name), func(b *testing.B) {
				r := setupInlineWith(b, sources, mode.mutate)
				prog := r.Program
				if resp := r.Dispatch(benchScanRequest(files, false)); resp.Error != "" {
					b.Fatalf("warmup scan: %s", resp.Error)
				}
				b.ReportAllocs()
				b.ResetTimer()
				for i := 0; i < b.N; i++ {
					if err := r.SetProgram(prog); err != nil {
						b.Fatalf("SetProgram: %v", err)
					}
					r.Cache().Clear()
					if resp := r.Dispatch(benchScanRequest(files, false)); resp.Error != "" {
						b.Fatalf("scan: %s", resp.Error)
					}
				}
			})
		}
	}
}

// BenchmarkRenderParallel is BenchmarkRender with the render fan-out on
// (scan stays serial so the fan-out is the only variable). Compare against
// BenchmarkRender's matching variants to size the render-track win.
func BenchmarkRenderParallel(b *testing.B) {
	sources := map[string]string{
		"object.ts": benchObjectTS,
		"union.ts":  benchUnionTS,
		"large.ts":  benchLargeTS,
	}
	b.Run("all", func(b *testing.B) {
		r := setupInlineWith(b, sources, func(_ *program.Options, resolverOpts *resolver.Options) {
			resolverOpts.DisableParallelScan = true
		})
		if resp := r.Dispatch(benchScanRequest([]string{"object.ts", "union.ts", "large.ts"}, false)); resp.Error != "" {
			b.Fatalf("warmup scan: %s", resp.Error)
		}
		req := protocol.Request{Op: protocol.OpDump}
		if resp := r.Dispatch(req); resp.Error != "" {
			b.Fatalf("warmup dump: %s", resp.Error)
		}
		b.ReportAllocs()
		b.ResetTimer()
		for i := 0; i < b.N; i++ {
			if resp := r.Dispatch(req); resp.Error != "" {
				b.Fatalf("dump: %s", resp.Error)
			}
		}
	})
}
