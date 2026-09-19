// gen-fn-catalog dumps the compiled-function catalog as JSON.
//
// internal/cachegen/operations is the single source of truth for which functions the
// build can compile for a type: the name a marker calls each one by, the createX factory
// that compiles it, the compile-time options that refine it, and the one-line description
// authored on the registry row. This program imports that package and prints one JSON
// object of {functions} to stdout.
//
// scripts/core/gen-fn-catalog.mjs writes the dump to the website's
// components/content/go-generated/ directory, where FunctionCatalog.vue renders
// it as the "All Compiled Functions" docs page. Keeping the page generated is
// what stops it drifting the moment a function is added or removed.
//
// Run via the miondevx command:
//
//	pnpm miondevx core codegen fncatalog
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"sort"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/operations"
)

// fn is the per-function shape the page renders. Tag is the short name the
// EMITTED code uses; Name is the readable one a marker spells. They are separate
// vocabularies on purpose, so the page shows both.
type fn struct {
	Name     string   `json:"name"`
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

func main() {
	all := operations.All()
	out := make([]fn, 0, len(all))
	for _, op := range all {
		// Non-Public rows are plumbing another feature compiles for you; they have no
		// factory a reader could call, so the page never lists them.
		if !op.Public {
			continue
		}
		out = append(out, fn{
			Name:     op.FnKey,
			Tag:      op.FamilyTag,
			Doc:      op.Doc,
			Factory:  op.Factory,
			Options:  optionsLabel(op),
			Variants: op.Strategies,
			Circular: op.CircularGuarded,
		})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })

	// No timestamp and no version in the payload: the committed file is compared
	// byte-for-byte by `codegen --check`, so anything that moves on its own would
	// report drift on every run.
	payload := struct {
		Functions []fn `json:"functions"`
	}{Functions: out}
	encoder := json.NewEncoder(os.Stdout)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(payload); err != nil {
		fmt.Fprintln(os.Stderr, "gen-fn-catalog:", err)
		os.Exit(1)
	}
}
