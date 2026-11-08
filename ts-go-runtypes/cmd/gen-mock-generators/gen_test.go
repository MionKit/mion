package main

import (
	"os"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/testfixtures"
)

// TestMockGeneratorsFilesInSync fails when a committed TS mirror differs from the generator's output.
func TestMockGeneratorsFilesInSync(t *testing.T) {
	paths := []string{}
	for _, out := range outputs() {
		paths = append(paths, out.path)
	}
	if err := testfixtures.DeclareInputs(paths...); err != nil {
		t.Fatal(err)
	}
	for _, out := range outputs() {
		actual, err := os.ReadFile(out.path)
		if err != nil {
			t.Fatalf("read %s: %v", out.path, err)
		}
		if string(actual) != out.generate() {
			t.Errorf("%s is stale: regenerate via `pnpm miondevx core codegen mockgenerators`", out.path)
		}
	}
}
