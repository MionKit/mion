package convert_test

import (
	"fmt"
	"math/rand"
	"os"
	"strconv"
	"strings"
	"testing"

	"github.com/mionkit/ts-runtypes/internal/convert"
	"github.com/mionkit/ts-runtypes/internal/testfixtures"
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
	seed := entrySeed(t, "convert")
	rng := rand.New(rand.NewSource(seed))
	iterations := 6
	if raw := os.Getenv("RT_FUZZ_ITER"); raw != "" {
		parsed, parseErr := strconv.Atoi(raw)
		if parseErr != nil {
			t.Fatalf("RT_FUZZ_ITER: %v", parseErr)
		}
		iterations = parsed
	}
	designedRefusals := 0
	for iteration := 0; iteration < iterations; iteration++ {
		source := randomAtomFile(rng)
		t.Logf("seed %d iteration %d:\n%s", seed, iteration, source)
		// The generated space can reach the documented circular refusals (a
		// branded Temporal or a variadic labeled tuple inside a recursive type
		// — see circularLossyPayload). Those are designed loud lanes, not
		// conversion failures: skip the draw and count it, so the allowance
		// can never quietly swallow the sweep.
		if _, diags := convertOneIn(t, fuzzSources(source), convert.Options{Target: convert.TargetBuilders}); len(diags) > 0 && allCircularRefusals(diags) {
			designedRefusals++
			continue
		}
		builderForm := convertAndCheckIDsIn(t, fuzzSources(source), convert.TargetBuilders)
		typeForm := convertAndCheckIDsIn(t, fuzzSources(builderForm), convert.TargetType)
		again, diags := convertOneIn(t, fuzzSources(typeForm), convert.Options{Target: convert.TargetType})
		expectNoDiags(t, diags)
		if again != typeForm {
			t.Errorf("type-form output not stable under re-conversion:\n--- first ---\n%s\n--- second ---\n%s", typeForm, again)
		}
		if t.Failed() {
			t.Fatalf("stopping at first failing iteration (replay with RT_FUZZ_SEED=%d)", seed)
		}
	}
	if designedRefusals > 0 {
		t.Logf("%d/%d draws skipped on a documented circular refusal", designedRefusals, iterations)
	}
	if designedRefusals*2 > iterations {
		t.Errorf("%d of %d draws hit a designed refusal — the convertible space has shrunk, not the sweep", designedRefusals, iterations)
	}
}

// allCircularRefusals reports whether every diagnostic is one of the
// documented RT.circular payload refusals (the shapes TypeScript cannot
// separate from their sentinel intersection). Anything else fails the sweep.
func allCircularRefusals(diags []convert.Diagnostic) bool {
	for _, diagnostic := range diags {
		if diagnostic.Code != convert.CodeUnsupportedKind || !strings.Contains(diagnostic.Message, "inside a recursive type") {
			return false
		}
	}
	return true
}

// randomAtomFile renders 3–8 named declarations drawn from the atomic space
// (plain atoms plus string/number/boolean/bigint/null literals, with awkward
// string contents on purpose), then sprinkles the relational arms: a
// self-cycle, a cross-declaration reference, and a mutual-cycle pair.
func randomAtomFile(rng *rand.Rand) string {
	// `RegExp` and `object` are atoms here because each is a jsType ROW of its
	// own (`{type: 'string', jsType: 'RegExp'}` and
	// `{type: ['object', 'array'], jsType: 'object'}`) that nothing else in the
	// generated space reaches.
	atoms := []string{"string", "number", "boolean", "bigint", "symbol", "null", "undefined", "any", "unknown", "never", "void", "RegExp", "object"}
	stringPool := []string{"ana", "with 'quote'", `back\slash`, "new\nline", "tab\there", "ünïcode", ""}
	var out strings.Builder
	out.WriteString("import * as TF from '@mionjs/run-types/formats';\n")
	out.WriteString("import * as TFT from '@mionjs/run-types/formats/temporal';\n")
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
		if rng.Intn(2) == 0 {
			// The required-member form keeps the back-edge inside a UNION
			// (`X | null`), the shape that once overflowed the C6 sorter.
			fmt.Fprintf(&out, "export type %s = {value: %s; next: %s | null; kids: %s[]};\n",
				cycleName, randomTypeText(rng, atoms, stringPool, 0), cycleName, cycleName)
		} else {
			fmt.Fprintf(&out, "export type %s = {value: %s; next?: %s; kids: %s[]};\n",
				cycleName, randomTypeText(rng, atoms, stringPool, 0), cycleName, cycleName)
		}
	}
	if rng.Intn(2) == 0 {
		target := names[rng.Intn(len(names))]
		fmt.Fprintf(&out, "type FzRef%d = {ref?: %s; list: %s[]};\n", rng.Intn(100), target, target)
	}
	if rng.Intn(3) == 0 {
		fmt.Fprintf(&out, "export type FzMutualA = {partner?: FzMutualB; tag: %s};\ntype FzMutualB = {back: FzMutualA[]};\n",
			randomTypeText(rng, atoms, stringPool, 0))
	}
	if rng.Intn(3) == 0 {
		fmt.Fprintf(&out, "enum FzMode {On, Off, Auto}\nexport type FzModeRef%d = {mode: FzMode; fallback?: FzMode};\n", rng.Intn(100))
	}
	if rng.Intn(3) == 0 {
		// The Temporal ambient rides every fuzz program (fuzzSources).
		fmt.Fprintf(&out, "export type FzWhen%d = {at: Temporal.Instant; day?: Temporal.PlainDate; span: Temporal.Duration};\n", rng.Intn(100))
	}
	return out.String()
}

// fuzzSources pairs a generated main.ts with the Temporal ambient so the
// temporal arm resolves (harmless for iterations without it).
func fuzzSources(source string) map[string]string {
	return map[string]string{"main.ts": source, "temporal.d.ts": testfixtures.TemporalDTS}
}

// randomTypeText draws a type expression: leaves at depth 0, arrays and
// tuples above it.
func randomTypeText(rng *rand.Rand, atoms, stringPool []string, depth int) string {
	if depth > 0 {
		switch rng.Intn(12) {
		case 10:
			// A union of PURE literals collapses to `enum` rather than `anyOf`.
			// The ordinary union arm can draw one by chance, but only when every
			// arm happens to be a literal, which is rare enough to leave the
			// keyword effectively untested.
			armCount := 2 + rng.Intn(3)
			var arms []string
			for range armCount {
				arms = append(arms, randomLiteralText(rng, stringPool))
			}
			return "(" + strings.Join(arms, " | ") + ")"
		case 11:
			// Index signatures whose key is not a plain string: the `tsIndexes`
			// keyword plus the wire half that constrains the key
			// (`propertyNames` for a numeric key, a nested `tsTemplate` for a
			// pattern key). `Record<string, T>` is the ordinary
			// `additionalProperties` and lives on the arm below.
			if rng.Intn(2) == 0 {
				return fmt.Sprintf("{[key: number]: %s}", randomTypeText(rng, atoms, stringPool, depth-1))
			}
			return fmt.Sprintf("{[key: `api/${string}`]: %s}", randomTypeText(rng, atoms, stringPool, depth-1))
		case 8:
			if rng.Intn(2) == 0 {
				// All-required named params — the slot-form lane
				// (RT.func({params: [RT.slot…], ret})).
				return fmt.Sprintf("((input: %s, other: %s) => %s)",
					randomTypeText(rng, atoms, stringPool, 0), randomTypeText(rng, atoms, stringPool, 0), randomTypeText(rng, atoms, stringPool, depth-1))
			}
			// Optional param — the getRunType-escape lane.
			return fmt.Sprintf("((input: %s, extra?: %s) => %s)",
				randomTypeText(rng, atoms, stringPool, 0), randomTypeText(rng, atoms, stringPool, 0), randomTypeText(rng, atoms, stringPool, depth-1))
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
			// The structural params, which ride the STANDARD keywords rather
			// than the dialect: minItems/maxItems/uniqueItems/contains(+bounds)
			// on the array side, minProperties/maxProperties/patternProperties/
			// propertyNames on the object side. `contains` and the two object
			// schema-valued params each print a keyword nothing else reaches.
			switch rng.Intn(6) {
			case 0:
				return fmt.Sprintf("TF.FormattedArray<%s[], {uniqueItems: true, maxItems: %d}>", randomTypeText(rng, atoms, stringPool, 0), 1+rng.Intn(9))
			case 1:
				return fmt.Sprintf("TF.FormattedArray<%s[], {minItems: %d}>", randomTypeText(rng, atoms, stringPool, 0), rng.Intn(4))
			case 2:
				// `minContains: 1` is the 2020-12 default and is not printed, so
				// the bounded draw uses 2 and up to reach the keywords.
				if rng.Intn(2) == 0 {
					return fmt.Sprintf("TF.FormattedArray<%s[], {contains: %s}>",
						randomTypeText(rng, atoms, stringPool, 0), randomTypeText(rng, atoms, stringPool, 0))
				}
				minContains := 2 + rng.Intn(3)
				return fmt.Sprintf("TF.FormattedArray<%s[], {contains: %s; minContains: %d; maxContains: %d}>",
					randomTypeText(rng, atoms, stringPool, 0), randomTypeText(rng, atoms, stringPool, 0), minContains, minContains+rng.Intn(4))
			case 3:
				return fmt.Sprintf("TF.FormattedObject<Record<string, %s>, {patternProperties: {'^%c': %s}}>",
					randomTypeText(rng, atoms, stringPool, 0), 'a'+rune(rng.Intn(26)), randomTypeText(rng, atoms, stringPool, 0))
			case 4:
				return fmt.Sprintf("TF.FormattedObject<Record<string, %s>, {propertyNames: %s}>",
					randomTypeText(rng, atoms, stringPool, 0), randomStringFormatLeaf(rng))
			default:
				if rng.Intn(2) == 0 {
					return fmt.Sprintf("TF.FormattedObject<Record<string, %s>, {maxProperties: %d}>", randomTypeText(rng, atoms, stringPool, 0), 1+rng.Intn(6))
				}
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
				readonlyMark := ""
				if rng.Intn(4) == 0 {
					readonlyMark = "readonly "
				}
				parts = append(parts, fmt.Sprintf("%sk%d%s: %s", readonlyMark, memberIndex, optionalMark, randomTypeText(rng, atoms, stringPool, depth-1)))
			}
			return "{" + strings.Join(parts, "; ") + "}"
		case 1:
			requiredCount := rng.Intn(3)
			optionalCount := rng.Intn(3)
			if requiredCount+optionalCount == 0 {
				requiredCount = 1
			}
			// Labeled tuples label EVERY slot (TS grammar) — the slot-form
			// conversion lane, where each group element is wrapped in
			// `RT.slot(…)`; unlabeled tuples print bare elements in the same
			// groups. A labeled optional slot puts the `?` on the label
			// (`k1?: T`), an unlabeled one on the type (`T?`).
			labeled := rng.Intn(3) == 0
			var parts []string
			for range requiredCount {
				slotType := randomTypeText(rng, atoms, stringPool, depth-1)
				if labeled {
					slotType = fmt.Sprintf("k%d: %s", len(parts), slotType)
				}
				parts = append(parts, slotType)
			}
			for range optionalCount {
				slotType := randomTypeText(rng, atoms, stringPool, depth-1)
				if labeled {
					slotType = fmt.Sprintf("k%d?: %s", len(parts), slotType)
				} else {
					slotType += "?"
				}
				parts = append(parts, slotType)
			}
			if rng.Intn(3) == 0 {
				if labeled {
					parts = append(parts, fmt.Sprintf("...rest%d: %s[]", rng.Intn(10), randomTypeText(rng, atoms, stringPool, 0)))
				} else {
					parts = append(parts, "..."+randomTypeText(rng, atoms, stringPool, 0)+"[]")
				}
			}
			return "[" + strings.Join(parts, ", ") + "]"
		}
	}
	switch rng.Intn(9) {
	case 6:
		return fmt.Sprintf("`route/${string}/%d-${number}`", rng.Intn(50))
	case 7:
		return fmt.Sprintf("(string & {readonly __brand: %s})", quoteTS(stringPool[rng.Intn(len(stringPool))]))
	case 8:
		return temporalLeaf(rng)
	case 0, 1, 2, 3:
		return randomLiteralText(rng, stringPool)
	case 4:
		return randomFormatLeaf(rng)
	default:
		return atoms[rng.Intn(len(atoms))]
	}
}

// randomLiteralText draws a string / number / boolean / bigint literal. Shared
// by the leaf switch and the enum arm: a union of these collapses to `enum`,
// so the two have to draw from one pool or the arm could produce a shape the
// leaves never do.
func randomLiteralText(rng *rand.Rand, stringPool []string) string {
	switch rng.Intn(4) {
	case 0:
		return quoteTS(stringPool[rng.Intn(len(stringPool))])
	case 1:
		return strconv.FormatFloat(randomNumber(rng), 'g', -1, 64)
	case 2:
		return strconv.FormatBool(rng.Intn(2) == 0)
	default:
		return strconv.FormatInt(rng.Int63n(1<<62)-(1<<61), 10) + "n"
	}
}

// temporalLeaf draws a Temporal member: one of the 8 unbranded
// `Temporal.<Name>` spellings, or a branded TFT form over the 6 orderable
// families. Bound params come from a known-valid pool — relative `now±P…`
// bounds are grammar-checked at build time per family (date-only components
// for the date-like families, time-only for PlainTime), absolute literals at
// runtime — because the sweep exercises the CONVERSION of branded temporal
// nodes, not the bound validator.
func temporalLeaf(rng *rand.Rand) string {
	unbranded := []string{
		"Temporal.Instant", "Temporal.ZonedDateTime", "Temporal.PlainDate", "Temporal.PlainTime",
		"Temporal.PlainDateTime", "Temporal.PlainYearMonth", "Temporal.PlainMonthDay", "Temporal.Duration",
	}
	branded := []string{
		"TFT.Instant<{min: 'now', max: 'now+P1Y'}>",
		"TFT.ZonedDateTime<{min: 'now-P1D'}>",
		"TFT.PlainDate<{min: '2020-01-01'}>",
		"TFT.PlainTime<{min: 'now-PT1H'}>",
		"TFT.PlainDateTime<{max: 'now+P1DT2H'}>",
		"TFT.PlainYearMonth<{min: '2020-01'}>",
	}
	if rng.Intn(3) == 0 {
		return branded[rng.Intn(len(branded))]
	}
	return unbranded[rng.Intn(len(unbranded))]
}

// randomFormatLeaf draws a generic-family format brand with random params.
func randomFormatLeaf(rng *rand.Rand) string {
	// Half the draws take a NAMED family. The generic String/Number/BigInt
	// brands were the only formats here, and those carry no `format` keyword
	// at all — so the whole registered-format half of RT-FORMAT-STANDARD
	// (email, uuid, uri, hostname, date, time, date-time) went undrawn, along
	// with every preset whose params the pretty spelling cannot prove
	// identical (the `exact` constructor lane).
	if rng.Intn(2) == 0 {
		return randomStringFormatLeaf(rng)
	}
	return randomGenericFormatLeaf(rng)
}

// randomStringFormatLeaf draws a NAMED string family. The first seven map onto
// a registered 2020-12 `format` (email / uuid / uri / hostname / date / time /
// date-time), `ip` deliberately has none (2020-12 splits it into ipv4 and ipv6,
// and this family spans both), and the presets ride `rtFormat` + a params bag
// carrying a pattern object.
func randomStringFormatLeaf(rng *rand.Rand) string {
	named := []string{
		"TF.Email", "TF.UUID", "TF.UUIDv4", "TF.UUIDv7", "TF.Url", "TF.Domain",
		"TF.IP", "TF.IPv4", "TF.StringDateTime", "TF.StringDate", "TF.StringTime",
		"TF.Alpha", "TF.AlphaNumeric", "TF.Numeric", "TF.Base64", "TF.Base32", "TF.Base16",
		"TF.Lowercase", "TF.Uppercase", "TF.Capitalize",
	}
	if rng.Intn(5) == 0 {
		// An INLINE pattern bag — the params-carrying spelling, distinct from a
		// preset's baked-in one. A bare string is not a `PatternParam`, so the
		// object form is the only legal one.
		if rng.Intn(2) == 0 {
			return fmt.Sprintf("TF.String<{pattern: {source: '^[a-%c]+$'}}>", 'b'+rune(rng.Intn(25)))
		}
		return fmt.Sprintf("TF.String<{pattern: {source: '^[a-%c]+$'; flags: 'i'}}>", 'b'+rune(rng.Intn(25)))
	}
	return named[rng.Intn(len(named))]
}

// randomGenericFormatLeaf draws a generic string / number / bigint family
// brand with random params.
func randomGenericFormatLeaf(rng *rand.Rand) string {
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
		switch rng.Intn(4) {
		case 0:
			return fmt.Sprintf("TF.Number<{min: %d; max: %d}>", rng.Intn(100)-50, 100+rng.Intn(1000))
		case 1:
			return "TF.Number<{integer: true}>"
		case 2:
			// gt / lt mirror onto `exclusiveMinimum` / `exclusiveMaximum`; only
			// min / max were drawn before, so the exclusive pair of
			// RT-FORMAT-STANDARD's keyword table went untested.
			return fmt.Sprintf("TF.Number<{gt: %d; lt: %d}>", rng.Intn(100)-50, 100+rng.Intn(1000))
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
