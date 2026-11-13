// gen-diag-catalog dumps diagnostics.Definitions as JSON for scripts/core/gen-diagnostics-catalog.mjs,
// which emits the devtools headline dictionary and the website page JSON from it; the wire carries only
// code + args. Run it with `pnpm miondevx core codegen diag`.
package main

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/mionkit/mion/ts-go-runtypes/pkg/diagnostics"
)

func main() {
	// Only mion's own codes: an extension's codes ride its binary's capabilities op.
	records := diagnostics.Catalog(func(definition diagnostics.Definition) bool { return definition.Owner == "" })
	encoder := json.NewEncoder(os.Stdout)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(records); err != nil {
		fmt.Fprintln(os.Stderr, "gen-diag-catalog:", err)
		os.Exit(1)
	}
}
