// gen-mock-generators writes the TS mirrors of formats.MockGenerators: the `GEN` namespace, so `GEN.lastName`
// autocompletes in type and value positions, and mockGeneratorMeta, kept import-free so the MockData type harness
// can inline it. Run `pnpm miondevx core codegen mockgenerators [--check]`, which also formats and drift-checks.
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
