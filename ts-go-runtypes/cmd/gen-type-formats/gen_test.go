package main

import (
	"os"
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/typefunctions/formats"
)

// TestTypeFormatsFileInSync asserts the committed typeFormats.generated.ts
// carries every format the registry currently produces — a fast,
// format-agnostic drift guard: add, rename, or re-kind a format emitter without
// regenerating and this fails.
//
// It is a CONTAINMENT check, not a raw byte compare: oxfmt reflows the emitted
// TS in ways the generator doesn't replicate, so a literal `Generate() ==
// committed` would false-fail on formatting. The exact byte-for-byte guard
// (after formatting) is `pnpm miondevx core codegen typeformats --check`, which CI
// runs; this test is the cheap Go-level companion that needs no node/oxfmt and
// pins the names + kinds themselves. The blank import of formats/all lives in
// gen.go, so the registry is populated in this test binary too.
func TestTypeFormatsFileInSync(t *testing.T) {
	committed, err := os.ReadFile(typeFormatsOutputPath())
	if err != nil {
		t.Fatalf("read %s: %v", typeFormatsOutputPath(), err)
	}
	src := string(committed)
	// One family may register under several base kinds (formattedObject:
	// objectLiteral + object); the name-keyed table carries the first
	// (kind, name)-sorted row, so the kind check accepts any of the name's
	// registered kinds.
	kindsByName := map[string][]string{}
	for _, emitter := range formats.Registered() {
		name := emitter.Name()
		kindsByName[name] = append(kindsByName[name], kindJsName(emitter.Kind()))
	}
	for name, kinds := range kindsByName {
		if !strings.Contains(src, name+":") {
			t.Errorf("format %q missing its key from %s — regenerate via `pnpm miondevx core codegen typeformats`",
				name, typeFormatsOutputPath())
		}
		if !strings.Contains(src, jsStr(name)) {
			t.Errorf("format name %s missing its value from the committed table — regenerate via `pnpm miondevx core codegen typeformats`",
				jsStr(name))
		}
		row := name + ": {name: " + jsStr(name) + ", kind: RunTypeKind."
		anyKind := false
		for _, kind := range kinds {
			if strings.Contains(src, row+kind+"}") {
				anyKind = true
				break
			}
		}
		if !anyKind {
			t.Errorf("format %q row with any of its registered kinds %v missing from the committed table — regenerate via `pnpm miondevx core codegen typeformats`",
				name, kinds)
		}
	}
}

// TestRegisteredNonEmpty guards against a registry-walk regression that silently
// produces an empty table (a valid-but-useless file). Mirrors gen-fn-hashes'
// TestCollectEntriesNonEmpty and gen-run-type-kind's TestParseConstsFoundEntries.
func TestRegisteredNonEmpty(t *testing.T) {
	if got := len(formats.Registered()); got < 12 {
		t.Errorf("formats.Registered() returned %d emitters, expected the full format set (>=12)", got)
	}
}
