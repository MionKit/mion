package convert_test

import (
	"strings"
	"testing"

	"github.com/mionkit/ts-runtypes/internal/convert"
)

// CNV008 — the unresolved-type-name refusal (set.go writtenTypeRefDiags), the
// convert twin of the resolver's MKR013 guard: a written type reference that
// resolved to the checker's ERROR type (`any` the author never wrote) refuses
// the declaration instead of cementing `any` / `RT.any()` into the rewritten
// source. A deliberate `any` is the true `any` intrinsic and converts freely.

func TestUnresolvedNameGuard_AllTargets(t *testing.T) {
	// `Missing` exists nowhere, so `{value: Missing}` checks as error-`any`.
	// The declaration must refuse under every rewriting target and survive
	// byte-identical; the sibling declaration keeps converting.
	typeFormSource := "export type Holder = {value: Missing};\nexport type Plain = {a: string};\n"
	builderFormSource := "import {type InferType, getRunType} from '@mionjs/run-types';\n" +
		"export const holderRT = getRunType<{value: Missing}>();\n" +
		"export type Holder = InferType<typeof holderRT>;\n"
	cases := []struct {
		target  convert.Target
		source  string
		keeping string
	}{
		{convert.TargetBuilders, typeFormSource, "export type Holder = {value: Missing};"},
		{convert.TargetType, builderFormSource, "export const holderRT = getRunType<{value: Missing}>();"},
	}
	for _, testCase := range cases {
		output, diags := convertOne(t, testCase.source, convert.Options{Target: testCase.target})
		foundGuard := false
		for _, diagnostic := range diags {
			if diagnostic.Code == convert.CodeUnresolvedTypeName {
				foundGuard = true
				if diagnostic.Severity != convert.SeverityError {
					t.Errorf("--to %s: CNV008 must be an error", testCase.target)
				}
				if !strings.Contains(diagnostic.Message, "Missing") {
					t.Errorf("--to %s: CNV008 should name the written reference; got %q", testCase.target, diagnostic.Message)
				}
			}
		}
		if !foundGuard {
			t.Fatalf("--to %s: expected CNV008 for the unresolved name, got %+v", testCase.target, diags)
		}
		if !strings.Contains(output, testCase.keeping) {
			t.Errorf("--to %s: the guarded declaration must stay untouched:\n%s", testCase.target, output)
		}
	}
}

// An ambient declaration IN the program converts faithfully — the whole point
// of rooting the config's file list: the reference resolves, so conversion
// preserves the structural id and the reflection graph instead of degrading
// to `RT.any()`. (In the CLI the ambient rides the config-roots union; here
// the harness roots the sources map directly, the same program shape.)
func TestUnresolvedNameGuard_AmbientResolvesFaithfully(t *testing.T) {
	sources := map[string]string{
		"main.ts":      "export type Holder = {value: Ambient};\n",
		"ambient.d.ts": "declare interface Ambient { a: string; b: number }\n",
	}
	output := convertAndCheckIDsIn(t, sources, convert.TargetBuilders)
	if strings.Contains(output, "RT.any()") {
		t.Errorf("ambient-typed member must not degrade to RT.any():\n%s", output)
	}
}

// A deliberately written `any` keeps converting: it is the real `any`
// intrinsic, not the error type, so CNV008 must stay silent and the builder
// form legitimately prints RT.any().
func TestUnresolvedNameGuard_DeliberateAnyStaysLegal(t *testing.T) {
	output, diags := convertOne(t, "export type Loose = {value: any};\n", convert.Options{Target: convert.TargetBuilders})
	for _, diagnostic := range diags {
		if diagnostic.Code == convert.CodeUnresolvedTypeName {
			t.Fatalf("written `any` must not trip CNV008: %+v", diagnostic)
		}
	}
	if !strings.Contains(output, "RT.any()") {
		t.Errorf("deliberate any should convert to RT.any():\n%s", output)
	}
}
