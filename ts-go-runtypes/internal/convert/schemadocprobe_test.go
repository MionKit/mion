package convert_test

import (
	"fmt"
	"math/rand"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/mion/ts-go-runtypes/internal/convert"
)

// docPairsIn runs the SchemaDocProbe over a sources map's main.ts.
func docPairsIn(t testing.TB, sources map[string]string) []convert.SchemaDocPair {
	t.Helper()
	prog, session, cwd := setupConvert(t, sources)
	defer session.Close()
	absPath := tspath.ResolvePath(cwd, "main.ts")
	pairs, probeErr := convert.SchemaDocProbe(prog, session.Checker(), session.Cache(), session.MarkerOptions(), absPath)
	if probeErr != nil {
		t.Fatalf("SchemaDocProbe: %v", probeErr)
	}
	return pairs
}

// The hand corpus: one declaration per shared-subset shape. The renderer's
// spelling for each is pinned as a golden document — regenerate with
// MION_UPDATE_GOLDEN=1 after an INTENTIONAL spelling change.
func TestSchemaDoc_Corpus(t *testing.T) {
	source := "" +
		"import * as TF from '@mionjs/run-types/formats';\n" +
		"import * as TFT from '@mionjs/run-types/formats/temporal';\n" +
		"type Atom = string;\n" +
		"type Num = number;\n" +
		"type Flag = boolean;\n" +
		"type Nil = null;\n" +
		"type Missing = undefined;\n" +
		"type Big = bigint;\n" +
		"type BigLit = 485n;\n" +
		"type Lit = 'ana';\n" +
		"type NumLit = 42;\n" +
		"type LitUnion = 'a' | 'b' | null;\n" +
		"type MixedUnion = string | number | boolean;\n" +
		"type Branded = TF.Email;\n" +
		"type Bounded = TF.String<{minLength: 2, maxLength: 8}>;\n" +
		"type BoundedNum = TF.Number<{min: 0, max: 100}>;\n" +
		"type When = Date;\n" +
		"type Pattern = RegExp;\n" +
		"type Instant = TFT.Instant;\n" +
		"type Lookup = Map<string, number>;\n" +
		"type Tags = Set<string>;\n" +
		"type Items = string[];\n" +
		"type Pair = [string, number];\n" +
		"type OptPair = [string, number?];\n" +
		"type WithRest = [string, ...number[]];\n" +
		"type Template = `v${number}`;\n" +
		"interface Person {\n" +
		"  readonly id: string;\n" +
		"  name: string;\n" +
		"  age?: number;\n" +
		"}\n" +
		"type Nested = {person: Person; scores: number[]};\n" +
		"type Dict = Record<string, number>;\n" +
		"type Deferred = Promise<string>;\n" +
		"type UniqueTags = TF.FormattedArray<string[], {uniqueItems: true, minItems: 1}>;\n" +
		"type BoundedBag = TF.FormattedObject<{a: string}, {minProperties: 1}>;\n"
	pairs := docPairsIn(t, fuzzSources(source))
	// Every declaration above must render; a silent skip regression would show
	// up as a falling count.
	if len(pairs) < 30 {
		t.Fatalf("expected at least 30 rendered declarations, probe returned %d", len(pairs))
	}
	var rendered strings.Builder
	for _, pair := range pairs {
		fmt.Fprintf(&rendered, "=== %s\n%s\n", pair.Decl, pair.Renderer)
	}
	goldenPath := filepath.Join("testdata", "schemadoc_corpus.golden")
	if os.Getenv("MION_UPDATE_GOLDEN") == "1" {
		if mkErr := os.MkdirAll(filepath.Dir(goldenPath), 0o755); mkErr != nil {
			t.Fatalf("mkdir testdata: %v", mkErr)
		}
		if writeErr := os.WriteFile(goldenPath, []byte(rendered.String()), 0o644); writeErr != nil {
			t.Fatalf("write golden: %v", writeErr)
		}
		return
	}
	golden, readErr := os.ReadFile(goldenPath)
	if readErr != nil {
		t.Fatalf("read golden (regenerate with MION_UPDATE_GOLDEN=1): %v", readErr)
	}
	if rendered.String() != string(golden) {
		t.Errorf("schema document spelling drifted from the golden corpus (regenerate with MION_UPDATE_GOLDEN=1 if intentional):\n--- got ---\n%s\n--- want ---\n%s", rendered.String(), string(golden))
	}
}

// The seeded fuzz leg: the same generated atom space the convert chain sweep
// uses, checked for renderer determinism (same source renders byte-identical
// documents across two independent probe runs). Replay a reported seed with
// MION_FUZZ_SEED; widen with MION_FUZZ_ITER.
func TestFuzz_SchemaDocDeterminism(t *testing.T) {
	if testing.Short() {
		t.Skip("randomized sweep skipped under -short")
	}
	seed := entrySeed(t, "schemadoc")
	rng := rand.New(rand.NewSource(seed))
	iterations := 6
	if raw := os.Getenv("MION_FUZZ_ITER"); raw != "" {
		parsed, parseErr := strconv.Atoi(raw)
		if parseErr != nil {
			t.Fatalf("MION_FUZZ_ITER: %v", parseErr)
		}
		iterations = parsed
	}
	rendered := 0
	for iteration := 0; iteration < iterations; iteration++ {
		source := randomAtomFile(rng)
		t.Logf("seed %d iteration %d:\n%s", seed, iteration, source)
		first := docPairsIn(t, fuzzSources(source))
		second := docPairsIn(t, fuzzSources(source))
		if len(first) != len(second) {
			t.Fatalf("probe count drifted between runs: %d vs %d (replay with MION_FUZZ_SEED=%d)", len(first), len(second), seed)
		}
		for i := range first {
			if first[i].Renderer != second[i].Renderer {
				t.Errorf("non-deterministic document for %s:\n--- first ---\n%s\n--- second ---\n%s", first[i].Decl, first[i].Renderer, second[i].Renderer)
			}
		}
		rendered += len(first)
		if t.Failed() {
			t.Fatalf("stopping at first failing iteration (replay with MION_FUZZ_SEED=%d)", seed)
		}
	}
	if rendered == 0 {
		t.Errorf("no rendered declarations across %d iterations — the probe's skip rules have eaten the sweep", iterations)
	}
}
