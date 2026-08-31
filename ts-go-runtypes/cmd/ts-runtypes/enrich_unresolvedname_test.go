package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-runtypes/internal/compiler/program"
	"github.com/mionkit/ts-runtypes/internal/enrichment/enrichgen"
)

// The enrich lane's half of docs/done/program-roots-lose-ambient-declarations.md:
// buildProgram unions the config's file list into the inferred Program's roots,
// so an ambient declaration nothing imports resolves exactly as tsc sees it and
// the scaffolded mirror covers its members — and a written type name that fails
// to resolve REFUSES the plan (enrichgen.Plan, the CLI/parity contract) instead
// of silently scaffolding a mirror computed from `any`.

func writeEnrichFixture(t *testing.T, modelsSource string, extraFiles map[string]string) (dir string, absSrc string, config enrichConfig) {
	t.Helper()
	dir = t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "tsconfig.json"),
		[]byte(`{"compilerOptions":{"plugins":[{"name":"mion","genDir":"gen"}]}}`), 0o644); err != nil {
		t.Fatal(err)
	}
	src := filepath.Join(dir, "models.ts")
	if err := os.WriteFile(src, []byte(modelsSource), 0o644); err != nil {
		t.Fatal(err)
	}
	for name, content := range extraFiles {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	absSrc = tspath.NormalizePath(src)

	tsconfigPath := resolveConfigPath(dir, "")
	parsed, err := program.ParseInferredConfig(dir, tsconfigPath)
	if err != nil {
		t.Fatalf("parse config: %v", err)
	}
	return dir, absSrc, resolveEnrichConfig(absSrc, "", tsconfigPath, parsed)
}

// An ambient interface in the include set — imported by nothing — resolves
// through the config-roots union, so the plan's closure reaches its members
// and emits the named const for it alongside the target's.
func TestEnrichPlan_AmbientDeclarationResolves(t *testing.T) {
	_, absSrc, config := writeEnrichFixture(t,
		"export interface Holder { value: AmbientMeta }\n",
		map[string]string{"ambient.d.ts": "declare interface AmbientMeta { tag: string; num: number }\n"})

	prog, res, err := buildProgram(absSrc, config.Parsed, config.HashLength)
	if err != nil {
		t.Fatalf("build program: %v", err)
	}
	defer res.Close()

	specs, _, planErr := enrichgen.Plan(prog, res.Checker(), res.Cache(), absSrc, "Holder", "", true, true, config)
	if planErr != nil {
		t.Fatalf("plan over a resolvable ambient must succeed, got: %v", planErr)
	}
	var typeNames []string
	for _, spec := range specs {
		for _, namedConst := range spec.Consts {
			typeNames = append(typeNames, namedConst.TypeName)
		}
	}
	joined := strings.Join(typeNames, " ")
	if !strings.Contains(joined, "Holder") || !strings.Contains(joined, "AmbientMeta") {
		t.Errorf("closure should cover the target AND the resolved ambient type; got consts for %v", typeNames)
	}
}

// A written name that resolves nowhere refuses the plan loudly — never a
// mirror scaffolded from the checker's error-`any`.
func TestEnrichPlan_UnresolvedNameRefuses(t *testing.T) {
	_, absSrc, config := writeEnrichFixture(t,
		"export interface Broken { value: MissingThing }\n", nil)

	prog, res, err := buildProgram(absSrc, config.Parsed, config.HashLength)
	if err != nil {
		t.Fatalf("build program: %v", err)
	}
	defer res.Close()

	_, _, planErr := enrichgen.Plan(prog, res.Checker(), res.Cache(), absSrc, "Broken", "", true, true, config)
	if planErr == nil {
		t.Fatalf("plan over an unresolved type name must refuse")
	}
	if !strings.Contains(planErr.Error(), "MissingThing") {
		t.Errorf("refusal should name the written reference; got %q", planErr.Error())
	}
}
