// gen-diag-catalog dumps the authoritative diagnostic catalog as JSON.
//
// internal/diagnostics is the single source of truth for which diagnostic codes
// exist, what level each one carries, the headline (authored in
// internal/diagnostics/messages.go), and the website text (summary, fix, and the
// verified triggering example, authored in internal/diagnostics/prose.go). This
// program imports that package, reads diagnostics.Definitions, and prints one JSON
// array of {code, family, level, completeness, title, headline, summary, fix,
// example} records (sorted by code) to stdout.
//
// scripts/core/gen-diagnostics-catalog.mjs consumes this dump and emits BOTH generated
// artifacts: the front-end message dictionary
// (packages/devtools/src/core/go-generated/diagnosticCatalog.generated.ts) that the
// bundler + lint plugins render diagnostics from, and the website
// diagnostics-page JSON. The binary ships only code + args over the wire;
// everything user-readable comes from this dump.
//
// Run via the miondevx command:
//
//	pnpm miondevx core codegen diag
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"sort"

	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
)

// record is the per-code shape emitted to stdout. Family and level are rendered as
// their string labels so the JS side never has to mirror the numeric enum values.
// Severity stays off: it is derived from level, and only the live wire diagnostic needs it.
type record struct {
	Code         string `json:"code"`
	Family       string `json:"family"`
	Level        string `json:"level"`
	Completeness bool   `json:"completeness,omitempty"`
	Title        string `json:"title"`
	Headline     string `json:"headline"`
	Summary      string `json:"summary"`
	Fix          string `json:"fix,omitempty"`
	Example      string `json:"example,omitempty"`
}

// familyLabel maps the numeric Family to a stable lowercase string.
func familyLabel(family diagnostics.Family) string {
	switch family {
	case diagnostics.FamilyPureFn:
		return "purefn"
	case diagnostics.FamilyMarker:
		return "marker"
	case diagnostics.FamilyRunType:
		return "runtype"
	case diagnostics.FamilyEnrich:
		return "enrich"
	case diagnostics.FamilyMionRoute:
		return "mionroute"
	}
	return "unknown"
}

func main() {
	records := make([]record, 0, len(diagnostics.Definitions))
	for _, definition := range diagnostics.Definitions {
		records = append(records, record{
			Code:         definition.Code,
			Family:       familyLabel(definition.Family),
			Level:        diagnostics.LevelLabel(definition.Level),
			Completeness: definition.Completeness,
			Title:        definition.Title,
			Headline:     definition.Headline,
			Summary:      definition.Summary,
			Fix:          definition.Fix,
			Example:      definition.Example,
		})
	}
	sort.Slice(records, func(left, right int) bool {
		return records[left].Code < records[right].Code
	})

	encoder := json.NewEncoder(os.Stdout)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(records); err != nil {
		fmt.Fprintln(os.Stderr, "gen-diag-catalog:", err)
		os.Exit(1)
	}
}
