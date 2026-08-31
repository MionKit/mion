package typefunctions

import (
	"strings"
	"testing"

	"github.com/mionkit/ts-runtypes/internal/constants"
	"github.com/mionkit/ts-runtypes/internal/protocol"
	"github.com/mionkit/ts-runtypes/internal/reflection"
)

// buildLiteralUnionFixture builds `{a: 'x'} | {b: number}` — the shape the
// union-vs-validate-variant defect reproduces on. Object members (not atomic
// leaves) keep the union arm as a real delegate: an all-leaf union is inlined
// into the dispatch and emits no `val_<id>` edge at all.
func buildLiteralUnionFixture() ([]*reflection.RunType, string) {
	litX := &reflection.RunType{ID: "lix", Kind: reflection.KindLiteral, Literal: "x"}
	num := &reflection.RunType{ID: "num", Kind: reflection.KindNumber}
	propA := &reflection.RunType{ID: "ppa", Kind: reflection.KindPropertySignature, Name: "a", IsSafeName: true, Child: makeRef("lix")}
	propB := &reflection.RunType{ID: "ppb", Kind: reflection.KindPropertySignature, Name: "b", IsSafeName: true, Child: makeRef("num")}
	objA := &reflection.RunType{ID: "oba", Kind: reflection.KindObjectLiteral, TypeName: "A", Children: []*reflection.RunType{makeRef("ppa")}}
	objB := &reflection.RunType{ID: "obb", Kind: reflection.KindObjectLiteral, TypeName: "B", Children: []*reflection.RunType{makeRef("ppb")}}
	union := &reflection.RunType{
		ID:                "uvv",
		Kind:              reflection.KindUnion,
		Children:          []*reflection.RunType{makeRef("oba"), makeRef("obb")},
		SafeUnionChildren: []*reflection.RunType{makeRef("oba"), makeRef("obb")},
	}
	return []*reflection.RunType{litX, num, propA, propB, objA, objB, union}, "uvv"
}

// TestUnionValidationErrors_ResolvesVariantValidate — the validationErrors union
// arm delegates its verdict to a validator, and under a ValidateOptions variant
// that delegate MUST be the variant's validate entry. Resolving the plain hash
// instead makes `createGetValidationErrorsFn<U>(v, opts)` report
// `{expected:'union'}` for values `createValidateFn<U>(v, opts)` accepts.
func TestUnionValidationErrors_ResolvesVariantValidate(t *testing.T) {
	runTypes, rootID := buildLiteralUnionFixture()
	refTable := buildRefTable(runTypes)
	settings := constants.CacheModules["validationErrors"]
	prefix := innerPrefix(settings)

	for _, tc := range []struct {
		name    string
		options []string
	}{
		{"plain", nil},
		{"noLiterals", []string{"noLiterals"}},
		{"numberTypeof", []string{"numberTypeof"}},
		{"noLiterals+numberNotNaN", []string{"noLiterals", "numberNotNaN"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			suffix := constants.ValidateVariantSuffix(tc.options)
			rendered := renderEntryWithDeps(refTable[rootID], settings, ValidationErrorsEmitter{}, prefix, refTable, RenderOpts{}, suffix, tc.options, false)
			if rendered.argsText == "" {
				t.Fatal("expected a non-empty validationErrors entry for the union root")
			}
			want := itVariantKey(tc.options, rootID)
			if !strings.Contains(rendered.argsText, want+".fn(") {
				t.Errorf("union arm must delegate to %q, got:\n%s", want, rendered.argsText)
			}
			if !containsStr(rendered.crossFamilyDeps, want) {
				t.Errorf("CrossFamilyDeps %v missing the variant validate edge %q", rendered.crossFamilyDeps, want)
			}
			// A variant must never fall back to the plain validator — that is the
			// defect itself.
			if plain := valKey(rootID); want != plain && strings.Contains(rendered.argsText, plain) {
				t.Errorf("variant %v must not reference the plain validate entry %q, got:\n%s", tc.options, plain, rendered.argsText)
			}
		})
	}
}

// TestUnionValidationErrors_VariantValidateEntryIsRendered — naming the variant
// validate entry is only half the fix: the entry has to EXIST. A site that only
// ever calls `createGetValidationErrorsFn<U>(v, opts)` never demands the matching
// validate variant itself, so the cross-family edge is what pulls it in.
func TestUnionValidationErrors_VariantValidateEntryIsRendered(t *testing.T) {
	runTypes, rootID := buildLiteralUnionFixture()
	options := []string{"noLiterals"}
	dump := protocol.Dump{
		RunTypes: runTypes,
		Sites: []protocol.Site{{
			File: "call.ts", Pos: 0, ID: rootID,
			Demand: []protocol.SiteDemand{{FamilyTag: "verr", VariantSuffix: constants.ValidateVariantSuffix(options), Options: options}},
		}},
	}
	verrGraph := FamilyByKey("validationErrors").Collect(dump, RenderOpts{EmitMode: "both"}, nil)
	want := itVariantKey(options, rootID)

	// The verr entry names the variant validate entry as a SOFT (cross-family)
	// dep — the edge the resolver's fixpoint follows.
	var found bool
	for _, entry := range verrGraph {
		for _, dep := range entry.SoftDeps {
			if dep == want {
				found = true
			}
		}
	}
	if !found {
		t.Fatalf("no validationErrors entry carries the cross-family edge %q", want)
	}

	// Following that edge the way the fixpoint does must produce the entry.
	valGraph := FamilyByKey("validate").Collect(
		protocol.Dump{RunTypes: runTypes},
		RenderOpts{EmitMode: "both"},
		[]ExtraRoot{{ID: rootID, VariantSuffix: constants.ValidateVariantSuffix(options), Options: options}},
	)
	if _, ok := valGraph[want]; !ok {
		keys := make([]string, 0, len(valGraph))
		for key := range valGraph {
			keys = append(keys, key)
		}
		t.Fatalf("cross-family fixpoint did not render the variant validate entry %q; got %v", want, keys)
	}
}
