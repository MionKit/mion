package apimeta

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func row(paramsId, returnId string) ManifestMethod {
	return ManifestMethod{
		Type:        1,
		ParamsId:    paramsId,
		ReturnId:    returnId,
		Families:    []string{"val", "verr", "huk", "uke", "fmt", "pj", "rj"},
		Options:     map[string]any{"encoder": map[string]any{"params": "clone", "return": "clone"}, "validateParams": true},
		MiddleFnIds: []string{"auth"},
	}
}

func TestManifest_CompareEqualRowsReportsNothing(t *testing.T) {
	server := &Manifest{Kind: ManifestKindServer, Methods: map[string]ManifestMethod{"users/getById": row("P1", "R1"), "sum": row("P2", "R2")}}
	client := &Manifest{Kind: ManifestKindClient, Mode: "bundled", Methods: map[string]ManifestMethod{"users/getById": row("P1", "R1")}}
	if mismatches := Compare(client, server); len(mismatches) != 0 {
		t.Fatalf("expected no mismatch, got %v", mismatches)
	}
}

func TestManifest_CompareNamesEveryDifferingField(t *testing.T) {
	server := &Manifest{Kind: ManifestKindServer, Methods: map[string]ManifestMethod{"sum": row("P1", "R1")}}
	changed := row("P9", "R1")
	changed.Families = []string{"val"}
	changed.Options = map[string]any{"validateParams": false}
	changed.MiddleFnIds = nil
	client := &Manifest{Kind: ManifestKindClient, Methods: map[string]ManifestMethod{"sum": changed}}
	mismatches := Compare(client, server)
	var fields []string
	for _, mismatch := range mismatches {
		fields = append(fields, mismatch.Field)
		if mismatch.Id != "sum" {
			t.Errorf("mismatch names %q, want sum", mismatch.Id)
		}
	}
	if got := strings.Join(fields, ","); got != "paramsId,families,options,middleFnIds" {
		t.Fatalf("fields reported: %s\n%v", got, mismatches)
	}
	if line := mismatches[0].String(); !strings.Contains(line, "client P9") || !strings.Contains(line, "server P1") {
		t.Errorf("mismatch line should show both values: %s", line)
	}
}

func TestManifest_CompareMissingAndAmbiguousIds(t *testing.T) {
	server := &Manifest{Kind: ManifestKindServer, Methods: map[string]ManifestMethod{"sum": row("P1", "R1")}, Ambiguous: []string{"sum"}}
	client := &Manifest{Kind: ManifestKindClient, Methods: map[string]ManifestMethod{"sum": row("P1", "R1"), "users/remove": row("P2", "R2")}}
	mismatches := Compare(client, server)
	if len(mismatches) != 2 {
		t.Fatalf("expected two mismatches, got %v", mismatches)
	}
	if mismatches[0].Id != "sum" || !strings.Contains(mismatches[0].Server, "more than once") {
		t.Errorf("ambiguous id not reported: %v", mismatches[0])
	}
	if mismatches[1].Id != "users/remove" || mismatches[1].Server != "not declared" {
		t.Errorf("missing id not reported: %v", mismatches[1])
	}
}

func TestManifest_RenderReadRoundTrip(t *testing.T) {
	manifest := &Manifest{Kind: ManifestKindClient, Mode: "mixed", ApiTsconfig: "../server/tsconfig.json", Methods: map[string]ManifestMethod{"sum": row("P1", "R1")}}
	path := filepath.Join(t.TempDir(), "manifest.json")
	if err := os.WriteFile(path, []byte(manifest.Render()), 0o644); err != nil {
		t.Fatal(err)
	}
	read, err := ReadManifest(path)
	if err != nil {
		t.Fatal(err)
	}
	if read.Kind != "client" || read.Mode != "mixed" || read.ApiTsconfig != manifest.ApiTsconfig {
		t.Errorf("header lost: %+v", read)
	}
	if mismatches := Compare(read, &Manifest{Kind: ManifestKindServer, Methods: manifest.Methods}); len(mismatches) != 0 {
		t.Errorf("a round-tripped row must compare equal: %v", mismatches)
	}
	if !strings.HasSuffix(manifest.Render(), "}\n") {
		t.Errorf("render ends with a newline")
	}
}

func TestManifest_ReadRejectsOtherFiles(t *testing.T) {
	dir := t.TempDir()
	notJSON := filepath.Join(dir, "a.json")
	_ = os.WriteFile(notJSON, []byte("nope"), 0o644)
	if _, err := ReadManifest(notJSON); err == nil {
		t.Error("garbage must not read as a manifest")
	}
	wrongKind := filepath.Join(dir, "b.json")
	_ = os.WriteFile(wrongKind, []byte(`{"kind":"other","methods":{}}`), 0o644)
	if _, err := ReadManifest(wrongKind); err == nil || !strings.Contains(err.Error(), "kind") {
		t.Errorf("an unknown kind must be refused, got %v", err)
	}
	if _, err := ReadManifest(filepath.Join(dir, "missing.json")); err == nil {
		t.Error("a missing file must error")
	}
}
