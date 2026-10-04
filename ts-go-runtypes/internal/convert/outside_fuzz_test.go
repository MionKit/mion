package convert_test

import (
	"fmt"
	"math/rand"
	"os"
	"strconv"
	"strings"
	"testing"
)

// TestFuzz_OutsidePrint: random classes, enums, symbol brands, recursive interfaces and generic instantiations print
// through the outside printer to declarations with the original ids, and print the same text twice.
func TestFuzz_OutsidePrint(t *testing.T) {
	if testing.Short() {
		t.Skip("randomized sweep skipped under -short")
	}
	seed := entrySeed(t, "convert-outside")
	rng := rand.New(rand.NewSource(seed))
	iterations := 6
	if raw := os.Getenv("MION_FUZZ_ITER"); raw != "" {
		parsed, parseErr := strconv.Atoi(raw)
		if parseErr != nil {
			t.Fatalf("MION_FUZZ_ITER: %v", parseErr)
		}
		iterations = parsed
	}
	for iteration := 0; iteration < iterations; iteration++ {
		source := randomOutsideFile(rng)
		t.Logf("seed %d iteration %d:\n%s", seed, iteration, source)
		printed := assertOutsideIDsIn(t, fuzzSources(source), "Root")
		if again := printOutsideIn(t, fuzzSources(source), "Root"); again != printed {
			t.Errorf("printing is not deterministic:\n--- first ---\n%s\n--- second ---\n%s", printed, again)
		}
		if t.Failed() {
			t.Fatalf("stopping at first failing iteration (replay with MION_FUZZ_SEED=%d)", seed)
		}
	}
}

// randomOutsideFile declares a few classes, enums, a symbol brand, a recursive interface and a generic interface, and
// a Root alias reaching each from random positions.
func randomOutsideFile(rng *rand.Rand) string {
	atoms := []string{"string", "number", "boolean", "bigint", "null", "undefined", "unknown", "Date", "RegExp"}
	stringPool := []string{"ana", "with 'quote'", "ünïcode"}
	field := func() string { return randomTypeText(rng, atoms, stringPool, 1) }
	var out strings.Builder
	out.WriteString("import * as TF from '@mionjs/run-types/formats';\nimport * as TFT from '@mionjs/run-types/formats/temporal';\n")
	out.WriteString("declare const brand: unique symbol;\n")
	var reach []string
	for index := 0; index < 1+rng.Intn(3); index++ {
		name := fmt.Sprintf("Cls%d", index)
		var members []string
		if rng.Intn(2) == 0 {
			members = append(members, "#private;")
		}
		if rng.Intn(2) == 0 {
			members = append(members, "private hidden;")
		}
		if rng.Intn(2) == 0 {
			members = append(members, "private readonly sealed;")
		}
		members = append(members, fmt.Sprintf("value: %s;", field()))
		if rng.Intn(2) == 0 {
			members = append(members, fmt.Sprintf("readonly fixed: %s;", field()))
		}
		if rng.Intn(2) == 0 {
			members = append(members, fmt.Sprintf("optional?: %s;", field()))
		}
		if rng.Intn(2) == 0 {
			members = append(members, fmt.Sprintf("get computed(): %s;", field()))
		}
		if rng.Intn(2) == 0 {
			members = append(members, fmt.Sprintf("act(input: %s, extra?: number): %s;", field(), field()))
		}
		if rng.Intn(2) == 0 {
			members = append(members, "pick<T>(fn: (value: number) => T): T[];")
		}
		if rng.Intn(2) == 0 {
			members = append(members, fmt.Sprintf("onEvent: (event: %s) => void;", field()))
		}
		if rng.Intn(3) == 0 {
			members = append(members, fmt.Sprintf("self(): %s;", name))
		}
		fmt.Fprintf(&out, "export declare class %s {\n  %s\n}\n", name, strings.Join(members, "\n  "))
		reach = append(reach, name)
	}
	if rng.Intn(2) == 0 {
		out.WriteString("export enum Role { Admin = 'admin', User = 'user' }\nexport enum Level { Low, High = 5 }\n")
		reach = append(reach, "Role", "Level", "Role.Admin")
	}
	if rng.Intn(2) == 0 {
		fmt.Fprintf(&out, "export type Branded = %s & {[brand]: 'Branded'};\n", []string{"string", "number"}[rng.Intn(2)])
		reach = append(reach, "Branded")
	}
	if rng.Intn(2) == 0 {
		fmt.Fprintf(&out, "export interface Tree { value: %s; children: Tree[]; parent?: Tree }\n", field())
		reach = append(reach, "Tree")
	}
	if rng.Intn(2) == 0 {
		out.WriteString("export interface Page<T> { items: T[]; total: number; first(): T | undefined }\n")
		reach = append(reach, fmt.Sprintf("Page<%s>", reach[rng.Intn(len(reach))]), fmt.Sprintf("Page<%s>", field()))
	}
	var parts []string
	for index, target := range reach {
		wrapped := target
		switch rng.Intn(4) {
		case 0:
			wrapped = target + "[]"
		case 1:
			wrapped = target + " | null"
		case 2:
			wrapped = "{inner: " + target + "}"
		}
		parts = append(parts, fmt.Sprintf("p%d: %s", index, wrapped))
	}
	fmt.Fprintf(&out, "export type Root = {%s};\n", strings.Join(parts, "; "))
	return out.String()
}
