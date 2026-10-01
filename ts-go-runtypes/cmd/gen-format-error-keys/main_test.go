package main

import (
	"os"
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/typefunctions/formats"
)

// TestFormatErrorKeysFileInSync fails when the committed file misses a format's keys; CI's `--check` is the exact guard.
func TestFormatErrorKeysFileInSync(t *testing.T) {
	committed, err := os.ReadFile(outputPath())
	if err != nil {
		t.Fatalf("read %s: %v", outputPath(), err)
	}
	src := compact(string(committed))
	for _, name := range formatNames() {
		row := compact(name + ": [" + strings.Join(quoted(formats.AllErrorKeys(name)), ", ") + "],")
		if !strings.Contains(src, row) {
			t.Errorf("%s row %q is stale: run `pnpm miondevx core codegen errorkeys`", outputPath(), row)
		}
	}
}

// compact drops whitespace and trailing commas, so the formatter's line wrapping does not matter.
func compact(text string) string {
	return strings.ReplaceAll(strings.Join(strings.Fields(text), ""), ",]", "]")
}
