package convert_test

import (
	"math/rand"
	"os"
	"strconv"
	"testing"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-runtypes/internal/convert"
)

// parityPairsIn runs the SchemaParityProbe over a sources map's main.ts.
func parityPairsIn(t testing.TB, sources map[string]string) []convert.SchemaParityPair {
	t.Helper()
	prog, session, cwd := setupConvert(t, sources)
	defer session.Close()
	absPath := tspath.ResolvePath(cwd, "main.ts")
	pairs, probeErr := convert.SchemaParityProbe(prog, session.Checker(), session.Cache(), session.MarkerOptions(), absPath)
	if probeErr != nil {
		t.Fatalf("SchemaParityProbe: %v", probeErr)
	}
	return pairs
}

func expectParity(t *testing.T, pairs []convert.SchemaParityPair) {
	t.Helper()
	for _, pair := range pairs {
		if pair.Printer != pair.Renderer {
			t.Errorf("schema spelling drift on %s:\n--- printer ---\n%s\n--- renderer ---\n%s", pair.Decl, pair.Printer, pair.Renderer)
		}
	}
}

// The hand corpus: one declaration per shared-subset shape. Every declaration
// here must be spellable by BOTH backends, so the floor assertion pins that
// the probe is not silently skipping its way to vacuous success.
func TestSchemaDocParity_Corpus(t *testing.T) {
	source := "" +
		"import * as TF from '@ts-runtypes/core/formats';\n" +
		"import * as TFT from '@ts-runtypes/core/formats/temporal';\n" +
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
	pairs := parityPairsIn(t, fuzzSources(source))
	// Every declaration above is probe-comparable; a silent skip regression
	// would show up as a falling count.
	if len(pairs) < 30 {
		t.Fatalf("expected at least 30 comparable declarations, probe returned %d", len(pairs))
	}
	expectParity(t, pairs)
}

// The seeded fuzz leg: the same generated atom space the convert chain sweep
// uses, checked for printer/renderer parity instead of id preservation.
// Replay a reported seed with RT_FUZZ_SEED; widen with RT_FUZZ_ITER.
func TestFuzz_SchemaDocParity(t *testing.T) {
	if testing.Short() {
		t.Skip("randomized sweep skipped under -short")
	}
	seed := int64(20260817)
	if raw := os.Getenv("RT_FUZZ_SEED"); raw != "" {
		parsed, parseErr := strconv.ParseInt(raw, 10, 64)
		if parseErr != nil {
			t.Fatalf("RT_FUZZ_SEED: %v", parseErr)
		}
		seed = parsed
	}
	rng := rand.New(rand.NewSource(seed))
	iterations := 6
	if raw := os.Getenv("RT_FUZZ_ITER"); raw != "" {
		parsed, parseErr := strconv.Atoi(raw)
		if parseErr != nil {
			t.Fatalf("RT_FUZZ_ITER: %v", parseErr)
		}
		iterations = parsed
	}
	comparable := 0
	for iteration := 0; iteration < iterations; iteration++ {
		source := randomAtomFile(rng)
		t.Logf("seed %d iteration %d:\n%s", seed, iteration, source)
		pairs := parityPairsIn(t, fuzzSources(source))
		comparable += len(pairs)
		expectParity(t, pairs)
		if t.Failed() {
			t.Fatalf("stopping at first failing iteration (replay with RT_FUZZ_SEED=%d)", seed)
		}
	}
	if comparable == 0 {
		t.Errorf("no comparable declarations across %d iterations — the probe's skip rules have eaten the sweep", iterations)
	}
}
