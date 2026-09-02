package main

import (
	"os"
	"strconv"
	"strings"
	"testing"
)

// TestRunTypeKindFileInSync is the source-of-truth check that BOTH committed TS
// mirrors match what the generator produces from the current protocol consts:
//
//   - packages/run-types/src/go-generated/runTypeKind.generated.ts — the marker package's
//     RunTypeKind / RunTypeSubKind const objects (Generate).
//   - packages/devtools/src/core/go-generated/reflectionKind.generated.ts — the Vite
//     plugin's ReflectionKind enum + KIND_REF sentinel (GenerateDevtools).
//
// If someone adds a Kind*/SubKind* in internal/reflection/ but forgets to
// regenerate, this fails with a hint to run the codegen. It also implicitly
// covers: the AST walker found every const (a silent miss would manifest as a
// content diff), the JS-side names match the override map, and each file's
// header / exports are present. The generator emits oxfmt-stable output, so the
// raw string compare here is exact — no formatting step needed (the two mirrors
// are also re-checked, post-format, by `pnpm miondevx core codegen kind --check`).
func TestRunTypeKindFileInSync(t *testing.T) {
	cases := []struct {
		label    string
		generate func() (string, error)
		path     string
	}{
		{"marker RunTypeKind", Generate, runTypeKindOutputPath()},
		{"devtools ReflectionKind", GenerateDevtools, reflectionKindOutputPath()},
	}
	for _, tc := range cases {
		expected, err := tc.generate()
		if err != nil {
			t.Fatalf("%s: generate: %v", tc.label, err)
		}
		actual, err := os.ReadFile(tc.path)
		if err != nil {
			t.Fatalf("%s: read %s: %v", tc.label, tc.path, err)
		}
		if string(actual) != expected {
			t.Errorf("%s: %s is stale — regenerate via `pnpm miondevx core codegen kind` "+
				"(or `go run ./cmd/gen-run-type-kind`)", tc.label, tc.path)
		}
	}
}

// TestParseConstsFoundEntries is a sanity check that the AST walker
// returned a non-empty list for both files. Guards against a future
// refactor of `parseConsts` silently regressing to "found 0 consts"
// (which would still produce a syntactically-valid but useless TS
// file with empty objects).
func TestParseConstsFoundEntries(t *testing.T) {
	cases := []struct {
		label              string
		file, typeName     string
		prefix             string
		minimumExpectedLen int
	}{
		{
			label:              "ReflectionKind",
			file:               moduleRoot() + "/internal/reflection/runtype.go",
			typeName:           "ReflectionKind",
			prefix:             "Kind",
			minimumExpectedLen: 30,
		},
		{
			label:              "ReflectionSubKind",
			file:               moduleRoot() + "/internal/reflection/subkind.go",
			typeName:           "ReflectionSubKind",
			prefix:             "SubKind",
			minimumExpectedLen: 5,
		},
	}
	for _, tc := range cases {
		entries, err := parseConsts(tc.file, tc.typeName, tc.prefix)
		if err != nil {
			t.Errorf("%s: parse %s: %v", tc.label, tc.file, err)
			continue
		}
		if len(entries) < tc.minimumExpectedLen {
			t.Errorf("%s: parsed %d entries from %s, expected at least %d — did parseConsts miss a const block?",
				tc.label, len(entries), tc.file, tc.minimumExpectedLen)
		}
	}
}

// TestGenerateDevtoolsMatchesRunTypeKind pins the cross-mirror invariant: every
// non-negative ReflectionKind enum member the devtools mirror emits has the SAME
// numeric value as the marker mirror's RunTypeKind entry, KIND_REF equals
// RunTypeKind.ref, and every REFLECTION_SUB_KIND entry matches RunTypeSubKind
// (the FULL set, Temporal included — the omission this fix closes). This catches a
// divergence introduced in the generator itself (e.g. a filtering bug) that a
// per-file sync check would miss.
func TestGenerateDevtoolsMatchesRunTypeKind(t *testing.T) {
	kinds, err := parseConsts(moduleRoot()+"/internal/reflection/runtype.go", "ReflectionKind", "Kind")
	if err != nil {
		t.Fatalf("parse protocol.go: %v", err)
	}
	subKinds, err := parseConsts(moduleRoot()+"/internal/reflection/subkind.go", "ReflectionSubKind", "SubKind")
	if err != nil {
		t.Fatalf("parse subkind.go: %v", err)
	}
	devtools, err := GenerateDevtools()
	if err != nil {
		t.Fatalf("GenerateDevtools: %v", err)
	}
	for _, entry := range kinds {
		if entry.Value < 0 {
			// The negative sentinel rides as KIND_REF, not an enum member.
			want := "export const KIND_REF = " + strconv.Itoa(entry.Value) + ";"
			if entry.JsName == "ref" && !strings.Contains(devtools, want) {
				t.Errorf("devtools mirror missing %q", want)
			}
			continue
		}
		want := entry.JsName + " = " + strconv.Itoa(entry.Value) + ","
		if !strings.Contains(devtools, want) {
			t.Errorf("devtools ReflectionKind missing enum member %q (value drift vs RunTypeKind?)", want)
		}
	}
	for _, entry := range subKinds {
		want := entry.JsName + ": " + strconv.Itoa(entry.Value) + ","
		if !strings.Contains(devtools, want) {
			t.Errorf("devtools REFLECTION_SUB_KIND missing %q (a partial/drifted sub-kind mirror?)", want)
		}
	}
}
