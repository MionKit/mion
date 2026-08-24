package main

import (
	"os"
	"strings"
	"testing"
)

// TestFnHashesFileInSync asserts the committed fnHashes.generated.ts carries
// every (fnKey, fnHash) the operation registry currently produces — a fast,
// format-agnostic drift guard: add or change an operation / validate option /
// JSON strategy / the fnHash salt without regenerating and this fails.
//
// It is a CONTAINMENT check, not a raw byte compare: oxfmt reflows the emitted TS
// (line wrapping, trailing commas) in ways the generator doesn't replicate, so a
// literal `Generate() == committed` would false-fail on formatting. The exact
// byte-for-byte guard (after formatting) is `pnpm rtx core codegen fnhashes
// --check`, which CI runs; this test is the cheap Go-level companion that needs
// no node/oxfmt and pins the values themselves.
func TestFnHashesFileInSync(t *testing.T) {
	committed, err := os.ReadFile(fnHashesOutputPath())
	if err != nil {
		t.Fatalf("read %s: %v", fnHashesOutputPath(), err)
	}
	src := string(committed)
	for _, entry := range collectEntries() {
		if !strings.Contains(src, tsKey(entry.fnKey)+":") {
			t.Errorf("fnKey %q missing from %s — regenerate via `pnpm rtx core codegen fnhashes`",
				entry.fnKey, fnHashesOutputPath())
		}
		for token, hash := range entry.variants {
			if !strings.Contains(src, jsStr(hash)) {
				t.Errorf("fnHash %s (fnKey %q, variant %q) missing from the committed table — "+
					"stale? regenerate via `pnpm rtx core codegen fnhashes`", jsStr(hash), entry.fnKey, token)
			}
		}
	}
}

// TestCollectEntriesNonEmpty guards against a registry-walk regression that
// silently produces an empty table (a valid-but-useless file). Mirrors
// gen-run-type-kind's TestParseConstsFoundEntries.
func TestCollectEntriesNonEmpty(t *testing.T) {
	if got := len(collectEntries()); got < 10 {
		t.Errorf("collectEntries returned %d entries, expected the full operation registry (>=10)", got)
	}
}
