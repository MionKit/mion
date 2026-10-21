package program

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"github.com/microsoft/typescript-go/shim/tspath"
)

// Root-widening cost, the number the ambient-declarations fix was asked to
// record: every
// NewInferred call parses lib + roots + import closure from scratch, so this
// measures the REAL per-request delta of unioning the config's declaration
// files (the daemon lanes: per lint request, per HMR edit) versus the full
// config file list (the one-shot convert / enrich CLIs) into the roots of a
// program otherwise rooted at one file.
//
// Run: go -C ts-go-runtypes test ./internal/compiler/program -bench=RootModes -benchmem -run='^$'
func BenchmarkNewInferred_RootModes(b *testing.B) {
	dir := tspath.NormalizePath(b.TempDir())

	// A mid-sized flat project: 200 small modules nothing imports (the worst
	// case for full-list rooting — none would ride the closure otherwise),
	// 4 ambient declaration files, one consumer.
	writeBench := func(rel, content string) {
		if err := os.WriteFile(filepath.Join(dir, rel), []byte(content), 0o644); err != nil {
			b.Fatal(err)
		}
	}
	writeBench("tsconfig.json", `{"compilerOptions": {"module": "ESNext", "moduleResolution": "bundler",
		"target": "ES2022", "strict": true, "skipLibCheck": true, "noEmit": true, "types": []}}`)
	for i := 0; i < 200; i++ {
		writeBench(fmt.Sprintf("module%03d.ts", i), fmt.Sprintf(
			"export interface Model%03d { id: string; count: number; tags: string[] }\n"+
				"export function makeModel%03d(): Model%03d { return {id: '', count: %d, tags: []}; }\n", i, i, i, i))
	}
	for i := 0; i < 4; i++ {
		writeBench(fmt.Sprintf("ambient%d.d.ts", i), fmt.Sprintf(
			"declare interface Ambient%dA { a: string; b: number }\n"+
				"declare interface Ambient%dB { c: boolean; d: string[] }\n", i, i))
	}
	writeBench("consumer.ts", "export const answer: number = 42;\n")

	inferredConfig, err := ParseInferredConfig(dir, "tsconfig.json")
	if err != nil {
		b.Fatalf("ParseInferredConfig: %v", err)
	}
	consumer := tspath.ResolvePath(dir, "consumer.ts")

	modes := []struct {
		name  string
		roots []string
	}{
		{"single-root", []string{consumer}},
		{"single-root+config-decls", UnionRoots([]string{consumer}, inferredConfig.DeclarationFileNames())},
		{"full-config-list", UnionRoots([]string{consumer}, inferredConfig.FileNames())},
	}
	for _, mode := range modes {
		b.Run(mode.name, func(b *testing.B) {
			b.ReportAllocs()
			for i := 0; i < b.N; i++ {
				prog, buildErr := NewInferred(Options{Cwd: dir, Config: inferredConfig}, mode.roots)
				if buildErr != nil {
					b.Fatalf("NewInferred: %v", buildErr)
				}
				_ = prog
			}
		})
	}
}
