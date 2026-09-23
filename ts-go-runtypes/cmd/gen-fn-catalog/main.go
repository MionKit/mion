// gen-fn-catalog prints internal/cachegen/operations as JSON so the "All Compiled Functions" page cannot drift.
// Run it with `pnpm miondevx core codegen fncatalog`: scripts/core/gen-fn-catalog.mjs writes the dump under
// components/content/go-generated/, and server/utils/function-catalog.ts renders it.
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/operations"
)

// fn is the per-function shape the page renders. Tag is the short name the EMITTED code
// uses, Name the one a marker spells: separate vocabularies, so the page shows both.
type fn struct {
	Name     string   `json:"name"`
	Call     string   `json:"call,omitempty"`
	Tag      string   `json:"tag,omitempty"`
	Doc      string   `json:"doc"`
	Factory  string   `json:"factory,omitempty"`
	Options  string   `json:"options,omitempty"`
	Variants []string `json:"variants,omitempty"`
	Circular bool     `json:"rejectCircularRefs,omitempty"`
}

// optionsLabel names the compile-time options bag that refines an operation,
// in the words the reader sees at the call site.
func optionsLabel(op operations.Operation) string {
	switch op.Axis {
	case operations.AxisValidateOptions:
		return "ValidateOptions"
	case operations.AxisHasUnknownKeysOptions:
		return "HasUnknownKeysOptions"
	case operations.AxisJsonStrategy:
		return "strategy"
	default:
		return ""
	}
}

// callOf spells the call with its options: one factory compiles a different function per options literal.
func callOf(op operations.Operation) string {
	if op.Factory == "" {
		return ""
	}
	switch {
	case op.Axis == operations.AxisJsonStrategy:
		quoted := make([]string, len(op.Strategies))
		for i, strategy := range op.Strategies {
			quoted[i] = "'" + strategy + "'"
		}
		return op.Factory + "<T>(undefined, {strategy: " + strings.Join(quoted, " | ") + "})"
	case op.CallOptions != "":
		return op.Factory + "<T>(undefined, " + op.CallOptions + ")"
	default:
		return op.Factory + "<T>()"
	}
}

func main() {
	all := operations.All()
	out := make([]fn, 0, len(all))
	for _, op := range all {
		// Non-Public rows are plumbing with no factory a reader could call.
		if !op.Public {
			continue
		}
		out = append(out, fn{
			Name:     op.FnKey,
			Call:     callOf(op),
			Tag:      op.FamilyTag,
			Doc:      op.Doc,
			Factory:  op.Factory,
			Options:  optionsLabel(op),
			Variants: op.Strategies,
			Circular: op.CircularGuarded,
		})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })

	// No timestamp or version: `codegen --check` compares the committed file byte for byte.
	payload := struct {
		Functions []fn `json:"functions"`
	}{Functions: out}
	encoder := json.NewEncoder(os.Stdout)
	encoder.SetIndent("", "  ")
	// So the committed file shows `<T>`, not `\u003cT\u003e`.
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(payload); err != nil {
		fmt.Fprintln(os.Stderr, "gen-fn-catalog:", err)
		os.Exit(1)
	}
}
