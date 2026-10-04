// gen-diag-catalog dumps diagnostics.Definitions as JSON for scripts/core/gen-diagnostics-catalog.mjs,
// which emits the devtools headline dictionary and the website page JSON from it; the wire carries only
// code + args. Run it with `pnpm miondevx core codegen diag`.
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
)

// record carries Family and Level as labels so the JS side never mirrors the numeric enum values.
// Severity stays off: it derives from Level, and only the live wire diagnostic needs it.
type record struct {
	Code         string   `json:"code"`
	Family       string   `json:"family"`
	Level        string   `json:"level"`
	Completeness bool     `json:"completeness,omitempty"`
	Internal     bool     `json:"internal,omitempty"`
	Headline     string   `json:"headline"`
	Slots        []string `json:"slots,omitempty"`
	Summary      string   `json:"summary"`
	Fix          string   `json:"fix,omitempty"`
	Example      string   `json:"example,omitempty"`
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
			Internal:     strings.HasPrefix(definition.Headline, "Internal error:"),
			Headline:     definition.Headline,
			Slots:        definition.Slots,
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
