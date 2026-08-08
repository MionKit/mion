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
	for iteration := 0; iteration < 6; iteration++ {
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

// randomAtomFile renders 3–8 named declarations drawn from the atomic space:
// plain atoms plus string/number/boolean/bigint/null literals, with awkward
// string contents on purpose.
func randomAtomFile(rng *rand.Rand) string {
	atoms := []string{"string", "number", "boolean", "bigint", "symbol", "null", "undefined", "any", "unknown", "never", "void"}
	stringPool := []string{"ana", "with 'quote'", `back\slash`, "new\nline", "tab\there", "ünïcode", ""}
	var out strings.Builder
	out.WriteString("import * as TF from '@ts-runtypes/core/formats';\n")
	declCount := 3 + rng.Intn(6)
	for index := 0; index < declCount; index++ {
		exportPrefix := ""
		if rng.Intn(2) == 0 {
			exportPrefix = "export "
		}
		name := fmt.Sprintf("Fz%c%d", 'A'+rune(index), rng.Intn(100))
		var typeText string
		switch rng.Intn(7) {
		case 0:
			typeText = atoms[rng.Intn(len(atoms))]
		case 1:
			typeText = quoteTS(stringPool[rng.Intn(len(stringPool))])
		case 2:
			typeText = strconv.FormatFloat(randomNumber(rng), 'g', -1, 64)
		case 3:
			typeText = strconv.FormatBool(rng.Intn(2) == 0)
		case 4:
			typeText = strconv.FormatInt(rng.Int63n(1<<62)-(1<<61), 10) + "n"
		case 5:
			typeText = randomFormatLeaf(rng)
		default:
			typeText = atoms[rng.Intn(len(atoms))]
		}
		fmt.Fprintf(&out, "%stype %s = %s;\n", exportPrefix, name, typeText)
	}
	return out.String()
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
