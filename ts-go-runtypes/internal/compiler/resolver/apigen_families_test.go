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
	for _, table := range []map[string]parsingRow{paramsParsing, returnParsing} {
		for _, row := range table {
			keys = append(keys, row.validate, row.validationErrors, row.encode, row.decode)
		}
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

// TestApiGen_ParsingRowsMatchTheTsTables pins every row against PARAMS_PARSING / RETURN_PARSING in
// packages/core/src/constants.ts. A disagreement makes strategyFromFamilies match no row on the bundled lane.
func TestApiGen_ParsingRowsMatchTheTsTables(t *testing.T) {
	params := map[string]parsingRow{
		"clone":        {"validateUnionKeys", "validationErrorsUnionKeys", "prepareForJsonClone", "restoreFromJsonClone"},
		"mutate":       {"validate", "validationErrors", "prepareForJsonMutate", "restoreFromJsonMutate"},
		"mutateStrict": {"validateStrict", "validationErrorsStrict", "prepareForJsonMutate", "restoreFromJsonMutate"},
		"compact":      {"validateUnionKeys", "validationErrorsUnionKeys", "compactForJson", "compactFromJson"},
	}
	ret := map[string]parsingRow{
		"clone":   {"validate", "validationErrors", "prepareForJsonClone", "restoreFromJsonClone"},
		"mutate":  {"validate", "validationErrors", "prepareForJsonMutate", "restoreFromJsonClone"},
		"compact": {"validate", "validationErrors", "compactForJson", "compactFromJson"},
	}
	for strategy, want := range params {
		if got := parsingFamilies(strategy, false); got != want {
			t.Errorf("params row %q = %+v, want %+v", strategy, got, want)
		}
	}
	for strategy, want := range ret {
		if got := parsingFamilies(strategy, true); got != want {
			t.Errorf("return row %q = %+v, want %+v", strategy, got, want)
		}
	}
	// mutateStrict is params-only, so the return side falls back to clone rather than inventing a row.
	if got := parsingFamilies("mutateStrict", true); got != ret["clone"] {
		t.Errorf("mutateStrict return row = %+v, want the clone row", got)
	}
	// A widened or unknown strategy takes the same default parserStrategies applies.
	if got := parsingFamilies("", false); got != params["clone"] {
		t.Errorf("empty strategy = %+v, want the clone row", got)
	}
}

// TestApiGen_MarkerKeysAreParamsOnlyForFormatTransform pins that `formatTransform` (sanitizeParams) rides the
// params slot only: the answer side is written by the handler, never by a caller.
func TestApiGen_MarkerKeysAreParamsOnlyForFormatTransform(t *testing.T) {
	row := parsingFamilies("clone", false)
	if keys := row.markerKeys(true); len(keys) != 5 || keys[2] != "formatTransform" {
		t.Errorf("params marker keys = %v, want the formatTransform slot at index 2", keys)
	}
	for _, key := range parsingFamilies("clone", true).markerKeys(false) {
		if key == "formatTransform" {
			t.Errorf("the return marker must not name formatTransform: %v", parsingFamilies("clone", true).markerKeys(false))
		}
	}
}
