package main

import (
	"os"
	"testing"
)

// TestPluginKeysFileInSync asserts the committed TS mirror matches what the
// generator produces from the current tsRuntypesPlugin struct. Adding a json key
// to the struct without regenerating fails here (and in
// `pnpm rtx core codegen pluginkeys --check` on CI).
func TestPluginKeysFileInSync(t *testing.T) {
	expected, err := Generate()
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	actual, err := os.ReadFile(outputPath())
	if err != nil {
		t.Fatalf("read %s: %v", outputPath(), err)
	}
	if string(actual) != expected {
		t.Errorf("%s is stale — regenerate via `pnpm rtx core codegen pluginkeys` "+
			"(or `go run ./cmd/gen-plugin-keys`)", outputPath())
	}
}

// TestParsePluginKeysNonEmpty guards against the AST walker silently regressing to
// zero keys, which would make the JS parity test vacuously pass.
func TestParsePluginKeysNonEmpty(t *testing.T) {
	keys, err := parsePluginKeys()
	if err != nil {
		t.Fatalf("parsePluginKeys: %v", err)
	}
	if len(keys) < 10 {
		t.Errorf("parsed %d plugin keys, expected at least 10 — did parsePluginKeys miss the struct?", len(keys))
	}
}
