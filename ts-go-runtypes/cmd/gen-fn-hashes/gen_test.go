package main

import (
	"os"
	"regexp"
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
// byte-for-byte guard (after formatting) is `pnpm miondevx core codegen fnhashes
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
			t.Errorf("fnKey %q missing from %s — regenerate via `pnpm miondevx core codegen fnhashes`",
				entry.fnKey, fnHashesOutputPath())
		}
		for token, hash := range entry.variants {
			if !strings.Contains(src, jsStr(hash)) {
				t.Errorf("fnHash %s (fnKey %q, variant %q) missing from the committed table — "+
					"stale? regenerate via `pnpm miondevx core codegen fnhashes`", jsStr(hash), entry.fnKey, token)
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

// TestJitFnIdsFileInSync is the same containment guard for mion's narrow mirror. It exists separately from
// the full table because a consumer bundle cannot afford the full one, and a second file is a second thing
// to forget: add a public family without regenerating and this fails.
func TestJitFnIdsFileInSync(t *testing.T) {
	committed, err := os.ReadFile(jitFnIdsOutputPath())
	if err != nil {
		t.Fatalf("read %s: %v", jitFnIdsOutputPath(), err)
	}
	src := string(committed)
	for _, row := range plainVariantHashes() {
		if !strings.Contains(src, tsKey(row[0])+": "+jsStr(row[1])) {
			t.Errorf("%s: %s missing from %s — regenerate via `pnpm miondevx core codegen fnhashes`",
				row[0], row[1], jitFnIdsOutputPath())
		}
	}
}

// TestJitFnIdsMatchTheFullTable pins the one thing splitting the mirrors could break: the narrow table's
// value for a family must be that family's PLAIN variant in the full one, not some other variant.
func TestJitFnIdsMatchTheFullTable(t *testing.T) {
	plain := map[string]string{}
	for _, entry := range collectEntries() {
		if hash, ok := entry.variants[""]; ok {
			plain[entry.fnKey] = hash
		}
	}
	for _, row := range plainVariantHashes() {
		if plain[row[0]] != row[1] {
			t.Errorf("%s: narrow table says %q, the full table's plain variant is %q", row[0], row[1], plain[row[0]])
		}
	}
}

// numberMode is one option, so no validate variant token may carry both its T and M letters.
func TestFnHashesTableHasNoImpossibleNumberModes(t *testing.T) {
	committed, err := os.ReadFile(fnHashesOutputPath())
	if err != nil {
		t.Fatalf("read %s: %v", fnHashesOutputPath(), err)
	}
	if match := regexp.MustCompile(`\bN[A-Z]*T[A-Z]*M[A-Z]*:`).FindString(string(committed)); match != "" {
		t.Errorf("committed table lists impossible variant %q, regenerate via `pnpm miondevx core codegen fnhashes`", match)
	}
	for _, entry := range collectEntries() {
		for token := range entry.variants {
			if strings.Contains(token, "T") && strings.Contains(token, "M") {
				t.Errorf("fnKey %q emits impossible variant %q", entry.fnKey, token)
			}
		}
	}
}
