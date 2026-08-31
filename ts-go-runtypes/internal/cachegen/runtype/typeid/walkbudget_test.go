package typeid_test

import (
	"slices"
	"testing"

	"github.com/mionkit/ts-runtypes/internal/cachegen/runtype/typeid"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// budgetSource is an ordinary, perfectly legitimate type: a handful of nested
// objects, nowhere near maxWalkDepth. It resolves cleanly under the real
// budget and is refused only when the budget is moved below its node count.
const budgetSource = `import {getRunTypeId} from '@mionjs/run-types';
interface Leaf {a: string; b: number; c: boolean}
interface Branch {one: Leaf; two: Leaf; three: Leaf}
export const id = getRunTypeId<{left: Branch; right: Branch; extra: Leaf}>();
`

func diagnosticCodes(response protocol.Response) []string {
	codes := make([]string, 0, len(response.Diagnostics))
	for _, diagnostic := range response.Diagnostics {
		codes = append(codes, diagnostic.Code)
	}
	return codes
}

// TestWalkBudget_OpsCapRefusesTheSite pins the OPS branch of the walk backstop
// (maxWalkOps), which the depth branch otherwise hides: a real spiral goes deep
// before it goes wide, so maxWalkDepth always latches first and no source
// fixture reaches the op count. Moving the cap to the walk is the only way to
// exercise it, and it is worth exercising — the ops cap is what bounded the
// `enrich --update` hang on a fuzz-corrupted source, where tsgo's error
// recovery minted a fresh type per member query at shallow depth.
//
// The two halves are one test on purpose: the same source resolving under the
// real budget is what proves the refusal came from the cap and not the type.
func TestWalkBudget_OpsCapRefusesTheSite(t *testing.T) {
	_, resolved := scanUnderLib(t, "es2023", budgetSource)
	if len(resolved.Sites) != 1 {
		t.Fatalf("under the real budget the type must resolve, got %d sites", len(resolved.Sites))
	}

	defer typeid.SetMaxWalkOpsForTest(3)()

	_, capped := scanUnderLib(t, "es2023", budgetSource)
	if len(capped.Sites) != 0 {
		t.Fatalf("with the ops budget at 3 the walk must latch and emit no site, got %d", len(capped.Sites))
	}
	// MKR008 (too-deep nesting) is the classification for a latch with no
	// dominant named type on the stack; MKR009 names one when there is.
	codes := diagnosticCodes(capped)
	if !slices.Contains(codes, "MKR008") && !slices.Contains(codes, "MKR009") {
		t.Fatalf("a latched walk must be diagnosed, got %v", codes)
	}
}

// TestWalkBudget_OpsCapIsRestored — the seam is a test knob, so a leaked cap
// would silently refuse every later site in the package. Pin the restore.
func TestWalkBudget_OpsCapIsRestored(t *testing.T) {
	typeid.SetMaxWalkOpsForTest(3)()
	_, response := scanUnderLib(t, "es2023", budgetSource)
	if len(response.Sites) != 1 {
		t.Fatalf("after restore the type must resolve again, got %d sites", len(response.Sites))
	}
}
