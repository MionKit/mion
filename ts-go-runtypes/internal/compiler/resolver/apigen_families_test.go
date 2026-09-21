package resolver

import (
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/operations"
)

// TestApiGen_EveryHardcodedFamilyResolves guards the one place fn keys are written out by hand rather than read
// off a marker. apiFnSite SKIPS a key it cannot resolve, so a typo in a parsing row would quietly drop a compiled
// function from every generated API method instead of failing anything.
func TestApiGen_EveryHardcodedFamilyResolves(t *testing.T) {
	keys := []string{"validate", "validationErrors", "hasUnknownKeys", "unknownKeyErrors", "formatTransform"}
	for _, row := range parseModes {
		keys = append(keys, row.validate, row.validationErrors, row.encode, row.decode)
	}
	for _, fnKey := range keys {
		op, known := operations.ByFnKey(fnKey)
		if !known {
			t.Errorf("apigen names fnKey %q, which resolves to no operation", fnKey)
			continue
		}
		if !op.Public {
			t.Errorf("apigen names fnKey %q, which is not a public operation", fnKey)
		}
	}
}

// TestApiGen_ParseModesMatchTheTsTable pins every row against PARSE_MODES in packages/core/src/constants.ts.
// A disagreement makes strategyFromFamilies match no row on the bundled lane.
func TestApiGen_ParseModesMatchTheTsTable(t *testing.T) {
	want := map[string]parsingRow{
		"clone":        {"validateUnionKeys", "validationErrorsUnionKeys", "prepareForJsonClone", "restoreFromJsonClone"},
		"mutate":       {"validate", "validationErrors", "prepareForJsonMutate", "restoreFromJsonMutate"},
		"mutateStrict": {"validateStrict", "validationErrorsStrict", "prepareForJsonMutate", "restoreFromJsonMutate"},
		"compact":      {"validateUnionKeys", "validationErrorsUnionKeys", "compactForJson", "compactFromJson"},
	}
	if len(parseModes) != len(want) {
		t.Fatalf("parseModes has %d rows, want %d", len(parseModes), len(want))
	}
	for strategy, row := range want {
		if got := parseMode(strategy); got != row {
			t.Errorf("row %q = %+v, want %+v", strategy, got, row)
		}
	}
	// A widened or unknown strategy takes the same default parserStrategies applies.
	if got := parseMode(""); got != want["clone"] {
		t.Errorf("empty strategy = %+v, want the clone row", got)
	}
}

// TestApiGen_MarkerKeysAreParamsOnlyForFormatTransform pins that `formatTransform` (sanitizeParams) rides the
// params slot only: the answer side is written by the handler, never by a caller.
func TestApiGen_MarkerKeysAreParamsOnlyForFormatTransform(t *testing.T) {
	row := parseMode("clone")
	if keys := row.markerKeys(true); len(keys) != 5 || keys[2] != "formatTransform" {
		t.Errorf("params marker keys = %v, want the formatTransform slot at index 2", keys)
	}
	for _, key := range parseMode("clone").markerKeys(false) {
		if key == "formatTransform" {
			t.Errorf("the return marker must not name formatTransform: %v", parseMode("clone").markerKeys(false))
		}
	}
}
