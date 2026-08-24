// gen-type-formats regenerates the TS mirror of the Go format registry at
// packages/ts-runtypes/src/go-generated/typeFormats.generated.ts.
//
// internal/cachegen/typefunctions/formats is the single source of truth for
// every built-in type format: each emitter registers its canonical Name() +
// base Kind() from an init(). This program blank-imports the formats/all
// aggregator so every emitter registers, enumerates the registry via
// formats.Registered(), and emits the `typeFormats` metadata table + the
// `FormatName` union a reflection consumer keys off (mion's drizzle extension
// maps a reflected prop's formatAnnotation.name to a DB column, and can now
// delete its own hand-maintained FormatNames mirror).
//
// The emitted names MUST match each emitter's Name() exactly (the SAME strings
// the resolver stamps on FormatAnnotation.Name at build time), so gen_test.go
// asserts the committed file carries every registered format (a format-agnostic
// containment check); `pnpm rtx core codegen typeformats --check` (CI) is the
// exact byte-for-byte guard after formatting.
//
// Run:
//
//	go run ./cmd/gen-type-formats > packages/ts-runtypes/src/go-generated/typeFormats.generated.ts
//
// Or via rtx (regenerates + formats + drift-checks):
//
//	pnpm rtx core codegen typeformats [--check]
package main

import (
	"fmt"
	"log"
	"os"
)

func main() {
	if _, err := fmt.Fprint(os.Stdout, Generate()); err != nil {
		log.Fatalf("gen-type-formats: write stdout: %v", err)
	}
}
