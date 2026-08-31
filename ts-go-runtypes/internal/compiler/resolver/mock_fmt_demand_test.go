package resolver_test

// Pins the createMockDataFn fmt demand: a mock-shaped reflection site (a
// signature with a CompTimeHints options param) demands the fmt
// (formatTransform) family alongside the runtype graph — riding the facade's
// SoftDeps — so generated mocks resolve declared format transforms without a
// separate createFormatTransformFn call site. Plain getRunTypeId reflection
// stays fmt-free (the demand keys off the signature shape, not reflection
// itself).

import (
	"sort"
	"strings"
	"testing"

	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// moduleBasenames lists every emitted entry-module basename, sorted — for
// failure messages only.
func moduleBasenames(resp protocol.Response) []string {
	names := make([]string, 0, len(resp.EntryModules))
	for basename := range resp.EntryModules {
		names = append(names, basename)
	}
	sort.Strings(names)
	return names
}

// TestMockData_DemandsFormatTransform — a createMockDataFn site demands the
// fmt family for its type, and the reflection facade imports the entry (soft
// dep) so the injected import loads it.
func TestMockData_DemandsFormatTransform(t *testing.T) {
	resp := scopeScan(t, `import {createMockDataFn} from '@mionjs/run-types';
import type {Lowercase} from '@mionjs/run-types/formats';
type Tag = Lowercase<{maxLength: 12}>;
export const mock = createMockDataFn<Tag>();
`)
	fmtKeys := familyEntryKeys(resp, "formatTransform")
	if len(fmtKeys) == 0 {
		t.Fatal("a createMockDataFn site must demand the fmt family for its type")
	}
	rootID := strings.SplitN(fmtKeys[0], "_", 2)[1]
	facade := entryModule(resp, rootID)
	if facade == "" {
		t.Fatalf("no reflection facade module for mock root %q (basenames: %v)", rootID, moduleBasenames(resp))
	}
	if !strings.Contains(facade, fmtKeys[0]) {
		t.Errorf("the facade must import the fmt entry %q as a soft dep, got: %s", fmtKeys[0], facade)
	}
}

// TestGetRunTypeId_NoFormatTransformDemand — plain reflection does NOT inherit
// the mock site's fmt demand: the signal is the CompTimeHints options param on
// the callee's signature, which getRunTypeId does not have.
func TestGetRunTypeId_NoFormatTransformDemand(t *testing.T) {
	resp := scopeScan(t, `import {getRunTypeId} from '@mionjs/run-types';
import type {Lowercase} from '@mionjs/run-types/formats';
type Tag = Lowercase<{maxLength: 12}>;
export const id = getRunTypeId<Tag>();
`)
	if hasFamilyEntry(resp, "formatTransform") {
		t.Errorf("getRunTypeId must not demand fmt entries, got %v", familyEntryKeys(resp, "formatTransform"))
	}
}
