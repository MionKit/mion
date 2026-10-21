// gen-run-type-kind regenerates the TWO TS mirrors of ReflectionKind /
// ReflectionSubKind from internal/reflection/runtype.go and
// internal/reflection/subkind.go:
//
//   - packages/run-types/src/go-generated/runTypeKind.generated.ts — the marker package's
//     `RunTypeKind` / `RunTypeSubKind` const objects.
//   - packages/devtools/src/core/go-generated/reflectionKind.generated.ts — the Vite
//     plugin's dep-free `ReflectionKind` enum + `KIND_REF` sentinel.
//
// Both are written from the SAME parse so they can never drift from each other or
// from the Go wire protocol. The const declarations are parsed from the Go AST —
// there's no hand-maintained list of kind names in this program, so adding a new
// Kind*/SubKind* in protocol/ flows through to both JS mirrors untouched.
//
// The numeric discriminator values MUST match the Go binary's wire output
// byte-for-byte — JS-side consumers dispatch on these to read runTypesCache
// nodes, so any drift silently breaks the JS half. A companion test
// (`gen_test.go`) asserts both committed TS files are in sync with the
// generator's current output.
//
// Run:
//
//	go run ./cmd/gen-run-type-kind      # writes both files
//
// Or via miondevx (regenerates + formats + drift-checks):
//
//	pnpm miondevx core codegen kind [--check]
package main

import (
	"log"
	"os"
)

func main() {
	marker, err := Generate()
	if err != nil {
		log.Fatalf("gen-run-type-kind: %v", err)
	}
	if err := os.WriteFile(runTypeKindOutputPath(), []byte(marker), 0o644); err != nil {
		log.Fatalf("gen-run-type-kind: write %s: %v", runTypeKindOutputPath(), err)
	}
	devtools, err := GenerateDevtools()
	if err != nil {
		log.Fatalf("gen-run-type-kind: %v", err)
	}
	if err := os.WriteFile(reflectionKindOutputPath(), []byte(devtools), 0o644); err != nil {
		log.Fatalf("gen-run-type-kind: write %s: %v", reflectionKindOutputPath(), err)
	}
}
