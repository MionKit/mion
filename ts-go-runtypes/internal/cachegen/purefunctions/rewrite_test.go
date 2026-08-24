package purefunctions

import (
	"strings"
	"testing"
)

func TestExtract_CapturesFactoryArgBounds(t *testing.T) {
	source := `
import {registerPureFnFactory} from '@ts-runtypes/core';
export const _ = registerPureFnFactory('rt::foo', function (utl) {
  return function _f(x: number) { return x + 1; };
});`
	entries, diags := extractFromOverlay(t, map[string]string{"a.ts": source})
	if len(diags) != 0 {
		t.Fatalf("unexpected diags: %+v", diags)
	}
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(entries))
	}
	entry := entries[0]
	if entry.FactoryArgStart <= 0 || entry.FactoryArgEnd <= entry.FactoryArgStart {
		t.Fatalf("bad factory-arg bounds: start=%d end=%d", entry.FactoryArgStart, entry.FactoryArgEnd)
	}
	if entry.FilePath == "" {
		t.Fatalf("FilePath should be populated, got empty")
	}
	// Replacements() should produce a single binding-swap record matching
	// those bounds.
	reps := Replacements(entries, false)
	if len(reps) != 1 {
		t.Fatalf("expected 1 replacement, got %d (%+v)", len(reps), reps)
	}
	if reps[0].Text != "__rt_pf$2Frt$2Ffoo" {
		t.Errorf("expected the entry-module binding, got %q", reps[0].Text)
	}
	if reps[0].ImportFrom != "rtmod:/pf/rt/foo.js" {
		t.Errorf("expected the virtual specifier, got %q", reps[0].ImportFrom)
	}
	if reps[0].Start != entry.FactoryArgStart || reps[0].End != entry.FactoryArgEnd {
		t.Errorf("replacement bounds %d..%d don't match entry %d..%d",
			reps[0].Start, reps[0].End, entry.FactoryArgStart, entry.FactoryArgEnd)
	}
	if reps[0].File != entry.FilePath {
		t.Errorf("replacement file %q != entry file %q", reps[0].File, entry.FilePath)
	}
	// Spot-check: applying the replacement to the source should swap the
	// factory literal for the imported tuple binding.
	rewritten := source[:reps[0].Start] + reps[0].Text + source[reps[0].End:]
	// The factory-arg byte range includes its leading trivia (the space
	// after the comma), so the rewrite collapses to `'rt::foo',<binding>`
	// rather than `'rt::foo', <binding>` — both forms parse identically.
	if !strings.Contains(rewritten, "registerPureFnFactory('rt::foo',__rt_pf$2Frt$2Ffoo)") {
		t.Errorf("rewritten source missing binding-swapped call form:\n%s", rewritten)
	}
}

func TestExtract_NoReplacement_OnFailedExtraction(t *testing.T) {
	// When the factory arg can't be resolved (e.g. it's a function call
	// returning the factory rather than an inline function), the
	// walker silently skips the entry — no replacement, no walker
	// diagnostic. The shape diagnostic (PFN001) is emitted by the
	// marker layer in resolver.scanCall, not by this extractor.
	source := `
import {registerPureFnFactory} from '@ts-runtypes/core';
declare function buildFactory(): any;
export const _ = registerPureFnFactory('rt::bad', buildFactory());`
	entries, _ := extractFromOverlay(t, map[string]string{"a.ts": source})
	if len(entries) != 0 {
		t.Fatalf("expected no entries, got %+v", entries)
	}
	if len(Replacements(entries, false)) != 0 {
		t.Fatalf("expected no replacements for failed extraction")
	}
}
