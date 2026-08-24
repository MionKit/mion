package resolver_test

import (
	"sort"
	"testing"

	"github.com/mionkit/ts-runtypes/internal/diagnostics"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// TestDiagExamples_TriggerTheirCode is the standardized error-example suite.
// internal/diagnostics/prose.go gives diagnostic codes an Example: a complete
// TypeScript snippet (import + type + marker call) meant to trigger exactly
// that code. This test feeds each Example through the real scan pipeline and
// asserts the code fires at its registered severity, so a shipped example can
// never drift from the diagnostic it demonstrates — and the very same string
// is what the website renders under "what triggers this".
//
// The gate is a non-empty Example, never the whole catalog: codes with no
// simple type-only trigger (internal invariants, etc.) carry no Example and
// are skipped here.
func TestDiagExamples_TriggerTheirCode(t *testing.T) {
	codes := make([]string, 0, len(diagnostics.Definitions))
	for code, definition := range diagnostics.Definitions {
		if definition.Example != "" {
			codes = append(codes, code)
		}
	}
	sort.Strings(codes)
	if len(codes) == 0 {
		t.Fatal("no diagnostic Examples registered — prose.go should populate at least the validation family")
	}

	for _, code := range codes {
		definition := diagnostics.Definitions[code]
		t.Run(code, func(t *testing.T) {
			r := setupInline(t, map[string]string{"example.ts": definition.Example})
			resp := r.Dispatch(protocol.Request{
				Op:                  protocol.OpScanFiles,
				Files:               []string{"example.ts"},
				IncludeEntryModules: true,
			})
			if resp.Error != "" {
				t.Fatalf("scanFiles: %s\n--- example ---\n%s", resp.Error, definition.Example)
			}

			var found *diagnostics.Diagnostic
			seen := map[string]bool{}
			for i := range resp.Diagnostics {
				seen[resp.Diagnostics[i].Code] = true
				if resp.Diagnostics[i].Code == code {
					found = &resp.Diagnostics[i]
				}
			}
			if found == nil {
				t.Fatalf("Example for %s did not emit %s; codes seen: %v\n--- example ---\n%s",
					code, code, sortedKeys(seen), definition.Example)
			}
			if found.Severity != definition.Severity {
				t.Errorf("%s severity: example fired %d, catalog says %d (Title %q)",
					code, found.Severity, definition.Severity, definition.Title)
			}
		})
	}
}

func sortedKeys(set map[string]bool) []string {
	out := make([]string, 0, len(set))
	for key := range set {
		out = append(out, key)
	}
	sort.Strings(out)
	return out
}
