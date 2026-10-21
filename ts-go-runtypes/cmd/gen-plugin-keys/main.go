// gen-plugin-keys regenerates the TS mirror of the tsconfig mion plugin
// entry's recognised keys
// (packages/devtools/src/core/go-generated/tsconfig-plugin-keys.generated.ts)
// from the tsRuntypesPlugin struct's json tags in cmd/mion/config.go.
//
// The bundler PluginOptions and this tsconfig key list must stay in parity (every
// project-semantic option settable in both places); the parity vitest test reads
// this generated list. Parsing the struct from the Go AST means adding a field to
// tsRuntypesPlugin flows through untouched — there is no hand-maintained key list.
//
// Run:
//
//	go run ./cmd/gen-plugin-keys
//
// Or via miondevx (regenerates + formats + drift-checks):
//
//	pnpm miondevx core codegen pluginkeys [--check]
package main

import (
	"log"
	"os"
)

func main() {
	body, err := Generate()
	if err != nil {
		log.Fatalf("gen-plugin-keys: %v", err)
	}
	if err := os.WriteFile(outputPath(), []byte(body), 0o644); err != nil {
		log.Fatalf("gen-plugin-keys: write %s: %v", outputPath(), err)
	}
}
