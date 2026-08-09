package convert_test

import (
	"fmt"
	"math/rand"
	"os"
	"strconv"
	"strings"
	"testing"

	"github.com/mionkit/ts-runtypes/internal/convert"
)

// The seeded randomized sweep over the atomic space — the compact Go-side
// precursor of the JS convert fuzz lane (which the completion todo widens to
// the full generated type space): C1 conversion is total, C2 ids preserved on
// every leg, C4 the full chain converges, C5 re-converting is a byte no-op.
// Replay a reported seed with RT_FUZZ_SEED.
func TestFuzz_AtomChain(t *testing.T) {
	if testing.Short() {
		t.Skip("randomized sweep skipped under -short")
	}
	seed := int64(20260808)
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
	for iteration := 0; iteration < iterations; iteration++ {
		source := randomAtomFile(rng)
		t.Logf("seed %d iteration %d:\n%s", seed, iteration, source)
		builderForm := convertAndCheckIDs(t, source, convert.TargetBuilders)
		schemaForm := convertAndCheckIDs(t, builderForm, convert.TargetJSONSchema)
		typeForm := convertAndCheckIDs(t, schemaForm, convert.TargetType)
		again, diags := convertOne(t, typeForm, convert.Options{Target: convert.TargetType})
		expectNoDiags(t, diags)
		if again != typeForm {
			t.Errorf("type-form output not stable under re-conversion:\n--- first ---\n%s\n--- second ---\n%s", typeForm, again)
		}
		if t.Failed() {
			t.Fatalf("stopping at first failing iteration (replay with RT_FUZZ_SEED=%d)", seed)
		}
	}
}

// randomAtomFile renders 3–8 named declarations drawn from the atomic space
// (plain atoms plus string/number/boolean/bigint/null literals, with awkward
// string contents on purpose), then sprinkles the relational arms: a
// self-cycle, a cross-declaration reference, and a mutual-cycle pair.
func randomAtomFile(rng *rand.Rand) string {
	atoms := []string{"string", "number", "boolean", "bigint", "symbol", "null", "undefined", "any", "unknown", "never", "void"}
	stringPool := []string{"ana", "with 'quote'", `back\slash`, "new\nline", "tab\there", "ünïcode", ""}
	var out strings.Builder
	out.WriteString("import * as TF from '@ts-runtypes/core/formats';\n")
	declCount := 3 + rng.Intn(6)
	var names []string
	for index := 0; index < declCount; index++ {
		exportPrefix := ""
		if rng.Intn(2) == 0 {
			exportPrefix = "export "
		}
		name := fmt.Sprintf("Fz%c%d", 'A'+rune(index), rng.Intn(100))
		names = append(names, name)
		typeText := randomTypeText(rng, atoms, stringPool, 2)
		fmt.Fprintf(&out, "%stype %s = %s;\n", exportPrefix, name, typeText)
	}
	if rng.Intn(2) == 0 {
		cycleName := fmt.Sprintf("FzCycle%d", rng.Intn(100))
		fmt.Fprintf(&out, "export type %s = {value: %s; next?: %s; kids: %s[]};\n",
			cycleName, randomTypeText(rng, atoms, stringPool, 0), cycleName, cycleName)
	}
	if rng.Intn(2) == 0 {
		target := names[rng.Intn(len(names))]
		fmt.Fprintf(&out, "type FzRef%d = {ref?: %s; list: %s[]};\n", rng.Intn(100), target, target)
	}
	if rng.Intn(3) == 0 {
		fmt.Fprintf(&out, "export type FzMutualA = {partner?: FzMutualB; tag: %s};\ntype FzMutualB = {back: FzMutualA[]};\n",
			randomTypeText(rng, atoms, stringPool, 0))
	}
	return out.String()
}

// randomTypeText draws a type expression: leaves at depth 0, arrays and
// tuples above it.
func randomTypeText(rng *rand.Rand, atoms, stringPool []string, depth int) string {
	if depth > 0 {
		switch rng.Intn(8) {
		case 6:
			if rng.Intn(2) == 0 {
				return fmt.Sprintf("Record<string, %s>", randomTypeText(rng, atoms, stringPool, depth-1))
			}
			return fmt.Sprintf("Map<%s, %s>", randomTypeText(rng, atoms, stringPool, 0), randomTypeText(rng, atoms, stringPool, depth-1))
		case 7:
			switch rng.Intn(3) {
			case 0:
				return "Date"
			case 1:
				return fmt.Sprintf("Set<%s>", randomTypeText(rng, atoms, stringPool, depth-1))
			default:
				return fmt.Sprintf("Promise<%s>", randomTypeText(rng, atoms, stringPool, depth-1))
			}
		case 0:
			return randomTypeText(rng, atoms, stringPool, depth-1) + "[]"
		case 3:
			armCount := 2 + rng.Intn(3)
			var arms []string
			for range armCount {
				arms = append(arms, randomTypeText(rng, atoms, stringPool, depth-1))
			}
			return "(" + strings.Join(arms, " | ") + ")"
		case 4:
			switch rng.Intn(3) {
			case 0:
				return fmt.Sprintf("TF.FormattedArray<%s[], {uniqueItems: true, maxItems: %d}>", randomTypeText(rng, atoms, stringPool, 0), 1+rng.Intn(9))
			case 1:
				return fmt.Sprintf("TF.FormattedArray<%s[], {minItems: %d}>", randomTypeText(rng, atoms, stringPool, 0), rng.Intn(4))
			default:
				return fmt.Sprintf("TF.FormattedObject<Record<string, %s>, {minProperties: %d}>", randomTypeText(rng, atoms, stringPool, 0), rng.Intn(3))
			}
		case 2:
			memberCount := 1 + rng.Intn(4)
			var parts []string
			for memberIndex := range memberCount {
				optionalMark := ""
				if rng.Intn(3) == 0 {
					optionalMark = "?"
				}
				parts = append(parts, fmt.Sprintf("k%d%s: %s", memberIndex, optionalMark, randomTypeText(rng, atoms, stringPool, depth-1)))
			}
			return "{" + strings.Join(parts, "; ") + "}"
		case 1:
			requiredCount := rng.Intn(3)
			optionalCount := rng.Intn(3)
			if requiredCount+optionalCount == 0 {
				requiredCount = 1
			}
			var parts []string
			for range requiredCount {
				parts = append(parts, randomTypeText(rng, atoms, stringPool, depth-1))
			}
			for range optionalCount {
				parts = append(parts, randomTypeText(rng, atoms, stringPool, depth-1)+"?")
			}
			if rng.Intn(3) == 0 {
				parts = append(parts, "..."+randomTypeText(rng, atoms, stringPool, 0)+"[]")
			}
			return "[" + strings.Join(parts, ", ") + "]"
		}
	}
	switch rng.Intn(6) {
	case 0:
		return quoteTS(stringPool[rng.Intn(len(stringPool))])
	case 1:
		return strconv.FormatFloat(randomNumber(rng), 'g', -1, 64)
	case 2:
		return strconv.FormatBool(rng.Intn(2) == 0)
	case 3:
		return strconv.FormatInt(rng.Int63n(1<<62)-(1<<61), 10) + "n"
	case 4:
		return randomFormatLeaf(rng)
	default:
		return atoms[rng.Intn(len(atoms))]
	}
}

// randomFormatLeaf draws a generic-family format brand with random params.
func randomFormatLeaf(rng *rand.Rand) string {
	switch rng.Intn(3) {
	case 0:
		switch rng.Intn(3) {
		case 0:
			return fmt.Sprintf("TF.String<{minLength: %d}>", rng.Intn(20))
		case 1:
			return fmt.Sprintf("TF.String<{maxLength: %d}>", 1+rng.Intn(200))
		default:
			minLength := rng.Intn(10)
			return fmt.Sprintf("TF.String<{minLength: %d; maxLength: %d}>", minLength, minLength+1+rng.Intn(50))
		}
	case 1:
		switch rng.Intn(3) {
		case 0:
			return fmt.Sprintf("TF.Number<{min: %d; max: %d}>", rng.Intn(100)-50, 100+rng.Intn(1000))
		case 1:
			return "TF.Number<{integer: true}>"
		default:
			return fmt.Sprintf("TF.Number<{multipleOf: %d}>", 1+rng.Intn(9))
		}
	default:
		return fmt.Sprintf("TF.BigInt<{min: %dn}>", rng.Intn(1000))
	}
}

// randomNumber draws integers, decimals, negatives and large magnitudes.
func randomNumber(rng *rand.Rand) float64 {
	switch rng.Intn(4) {
	case 0:
		return float64(rng.Intn(2000) - 1000)
	case 1:
		return rng.Float64()*2e6 - 1e6
	case 2:
		return float64(rng.Intn(10)) * 1e15
	default:
		return -0.5 + rng.Float64()
	}
}

// quoteTS single-quotes a string literal the same way the printers do.
func quoteTS(value string) string {
	replacer := strings.NewReplacer(`\`, `\\`, `'`, `\'`, "\n", `\n`, "\r", `\r`, "\t", `\t`)
	return "'" + replacer.Replace(value) + "'"
}
