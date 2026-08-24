// gen-fn-hashes regenerates the TS mirror of the operation registry's
// version-independent fnHashes at packages/ts-runtypes/src/go-generated/fnHashes.generated.ts.
//
// internal/cachegen/operations is the single source of truth for every RT
// operation and its fnHash (fnhash.go). This program enumerates the registry via
// operations.All() and emits, for each marker fnKey, the `variant token → fnHash`
// table the ts-runtypes runtime's getFnHash resolves against. Because the fnHash
// salt no longer folds constants.Version, the emitted table is stable across
// releases — the whole point of the mirror is that a consumer (e.g. mion) can
// derive `fnKey (+ options) → fnHash` instead of hand-pinning a family→prefix map
// that used to churn on every version bump.
//
// The values MUST match operations.FnHashFor exactly (the plugin injects the
// SAME hashes at each createX call site), so gen_test.go asserts the committed
// file carries every fnKey/fnHash this generator produces (a format-agnostic
// containment check); `pnpm rtx core codegen fnhashes --check` (CI) is the exact
// byte-for-byte guard after formatting.
//
// Run:
//
//	go run ./cmd/gen-fn-hashes > packages/ts-runtypes/src/go-generated/fnHashes.generated.ts
//
// Or via rtx (regenerates + formats + drift-checks):
//
//	pnpm rtx core codegen fnhashes [--check]
package main

import (
	"fmt"
	"log"
	"os"
)

func main() {
	if _, err := fmt.Fprint(os.Stdout, Generate()); err != nil {
		log.Fatalf("gen-fn-hashes: write stdout: %v", err)
	}
}
