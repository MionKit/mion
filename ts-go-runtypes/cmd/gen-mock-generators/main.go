// gen-mock-generators writes the TS mirrors of the built-in mock generator table
// (internal/cachegen/typefunctions/formats/mockgenerators.go):
//
//   - packages/run-types/src/go-generated/mockGenerators.generated.ts: the `GEN` namespace, one const + type per name,
//     so `GEN.lastName` autocompletes in type and value positions.
//   - packages/run-types/src/go-generated/mockGeneratorMeta.generated.ts: the `BuiltinMockGenerators` names and the
//     length / character table the mock reads at run time. Import-free, so the MockData type harness can inline it.
//
// Run:
//
//	go run ./cmd/gen-mock-generators
//
// Or via miondevx (regenerates + formats + drift-checks):
//
//	pnpm miondevx core codegen mockgenerators [--check]
package main

import (
	"log"
	"os"
)

func main() {
	for _, output := range outputs() {
		if err := os.WriteFile(output.path, []byte(output.generate()), 0o644); err != nil {
			log.Fatalf("gen-mock-generators: write %s: %v", output.path, err)
		}
	}
}
