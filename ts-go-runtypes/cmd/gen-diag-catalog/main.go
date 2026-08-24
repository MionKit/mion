// gen-diag-catalog dumps the authoritative diagnostic catalog as JSON.
//
// internal/diagnostics is the single source of truth for which diagnostic codes
// exist, what severity each one carries, the user-facing wording (headline +
// detail, authored in internal/diagnostics/messages.go), and the docs prose
// (summary, fix, and the verified triggering example, authored in
// internal/diagnostics/prose.go). This program imports that package, reads
// diagnostics.Definitions, and prints one JSON array of {code, family, severity,
// title, headline, detail, summary, fix, example} records (sorted by code)
// to stdout.
//
// scripts/core/gen-diagnostics-catalog.mjs consumes this dump and emits BOTH generated
// artifacts: the front-end message dictionary
// (packages/ts-runtypes-devtools/src/go-generated/diagnosticCatalog.generated.ts) that the
// bundler + lint plugins render diagnostics from, and the website
// diagnostics-page JSON. The binary ships only code + args over the wire;
// everything user-readable comes from this dump.
//
// Run via the pnpm script:
//
//	pnpm run gen:diag-catalog
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"sort"

	"github.com/mionkit/ts-runtypes/internal/diagnostics"
)

// record is the per-code shape emitted to stdout. Family and severity are
// rendered as their lowercase string labels so the JS side never has to
// mirror the numeric enum values. Headline is the user-facing message
// template (mandatory for every code); Detail the optional multi-line
// explanation + example fix. Summary/Fix/Example are the docs prose; they
// are omitempty so codes that are not yet documented stay terse.
type record struct {
	Code     string `json:"code"`
	Family   string `json:"family"`
	Severity string `json:"severity"`
	Title    string `json:"title"`
	Headline string `json:"headline"`
	Detail   string `json:"detail,omitempty"`
	Summary  string `json:"summary,omitempty"`
	Fix      string `json:"fix,omitempty"`
	Example  string `json:"example,omitempty"`
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
	}
	return "unknown"
}

func main() {
	records := make([]record, 0, len(diagnostics.Definitions))
	for _, definition := range diagnostics.Definitions {
		records = append(records, record{
			Code:     definition.Code,
			Family:   familyLabel(definition.Family),
			Severity: diagnostics.SeverityLabel(definition.Severity),
			Title:    definition.Title,
			Headline: definition.Headline,
			Detail:   definition.Detail,
			Summary:  definition.Summary,
			Fix:      definition.Fix,
			Example:  definition.Example,
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
