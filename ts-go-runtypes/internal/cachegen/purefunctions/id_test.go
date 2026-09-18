package purefunctions

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
)

// writePackage lays out a package.json (verbatim) plus one source file under
// dir, and returns the source file's path. An empty manifest writes no
// package.json at all.
func writePackage(t *testing.T, dir, manifest, relFile string) string {
	t.Helper()
	if manifest != "" {
		if err := os.WriteFile(filepath.Join(dir, "package.json"), []byte(manifest), 0o644); err != nil {
			t.Fatalf("write package.json: %v", err)
		}
	}
	file := filepath.Join(dir, relFile)
	if err := os.MkdirAll(filepath.Dir(file), 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.WriteFile(file, []byte("export {};\n"), 0o644); err != nil {
		t.Fatalf("write source: %v", err)
	}
	return file
}

// TestIDFor_PackageAndHash — the id a consumer sees: the package that owns the
// pure function, then a hash of the function itself.
func TestIDFor_PackageAndHash(t *testing.T) {
	dir := t.TempDir()
	file := writePackage(t, dir, `{"name": "@acme/text"}`, "src/slug.ts")

	id := IDFor(marker.Options{Cwd: dir}, file, "Kq3f_xN9pQ2wLd")
	if want := "@acme/text#Kq3f_xN9pQ2wLd"; id != want {
		t.Errorf("IDFor = %q, want %q", id, want)
	}
	owner, hash, ok := SplitID(id)
	if !ok || owner != "@acme/text" || hash != "Kq3f_xN9pQ2wLd" {
		t.Errorf("SplitID(%q) = (%q, %q, %v)", id, owner, hash, ok)
	}
}

// TestIDFor_MovingTheFileLeavesTheIdAlone — an id names the function, not where
// it sits. Moving or renaming a file inside its package is a refactor, and a
// refactor must not hand a pure function a new identity.
func TestIDFor_MovingTheFileLeavesTheIdAlone(t *testing.T) {
	dir := t.TempDir()
	before := writePackage(t, dir, `{"name": "@acme/text"}`, "src/slug.ts")
	after := filepath.Join(dir, "src/text/slugify.ts")

	opts := marker.Options{Cwd: dir}
	if IDFor(opts, after, "Kq3f_xN9pQ2wLd") != IDFor(opts, before, "Kq3f_xN9pQ2wLd") {
		t.Errorf("moving the file moved the id: %q then %q",
			IDFor(opts, before, "Kq3f_xN9pQ2wLd"), IDFor(opts, after, "Kq3f_xN9pQ2wLd"))
	}
}

// TestIDFor_DeclarationAgreesWithSource — a `.d.ts` and the `.ts` it was
// emitted from name ONE pure fn, which is what lets a consumer holding only
// declarations resolve an id the package's own build computed. With no path in
// the id there is no extension left to reconcile.
func TestIDFor_DeclarationAgreesWithSource(t *testing.T) {
	dir := t.TempDir()
	source := writePackage(t, dir, `{"name": "@acme/text"}`, "src/slug.ts")
	declaration := filepath.Join(dir, "src/slug.d.ts")

	opts := marker.Options{Cwd: dir}
	if IDFor(opts, declaration, "Kq3f_xN9pQ2wLd") != IDFor(opts, source, "Kq3f_xN9pQ2wLd") {
		t.Errorf("the .d.ts id %q differs from the source id %q",
			IDFor(opts, declaration, "Kq3f_xN9pQ2wLd"), IDFor(opts, source, "Kq3f_xN9pQ2wLd"))
	}
}

// TestIDFor_DifferentPackagesStayApart — ownership is what the package half is
// for: the same body vendored into two packages is two entries, so each one's
// delivery lane still knows which package owes it.
func TestIDFor_DifferentPackagesStayApart(t *testing.T) {
	base := t.TempDir()
	first := filepath.Join(base, "one")
	second := filepath.Join(base, "two")
	for _, dir := range []string{first, second} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatalf("mkdir: %v", err)
		}
	}
	fileA := writePackage(t, first, `{"name": "@acme/one"}`, "src/a.ts")
	fileB := writePackage(t, second, `{"name": "@acme/two"}`, "src/a.ts")

	if IDFor(marker.Options{Cwd: base}, fileA, "sameHash") == IDFor(marker.Options{Cwd: base}, fileB, "sameHash") {
		t.Error("two packages sharing a body must not share an id")
	}
}

// TestIDFor_NoNamedPackageKeepsTheHashAlone — an in-memory overlay or a scratch
// project has no package to name. The hash alone is still the same answer from
// any directory, which a path never was.
func TestIDFor_NoNamedPackageKeepsTheHashAlone(t *testing.T) {
	base := t.TempDir()
	client := filepath.Join(base, "client")
	if err := os.MkdirAll(client, 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	file := writePackage(t, client, `{"private": true}`, "src/a.ts")

	fromClient := IDFor(marker.Options{Cwd: client}, file, "Kq3f_xN9pQ2wLd")
	fromServer := IDFor(marker.Options{Cwd: filepath.Join(base, "server")}, file, "Kq3f_xN9pQ2wLd")
	if want := "#Kq3f_xN9pQ2wLd"; fromClient != want {
		t.Errorf("IDFor from the client = %q, want %q", fromClient, want)
	}
	if fromServer != fromClient {
		t.Errorf("IDFor depends on the build's cwd: %q vs %q", fromServer, fromClient)
	}
}

// TestSplitID_RejectsAStringThatIsNotAnId — anything without the separator is
// not an id this package produced, and a `#` in the hash half never splits
// early (the LAST separator wins).
func TestSplitID_RejectsAStringThatIsNotAnId(t *testing.T) {
	if _, _, ok := SplitID("plainName"); ok {
		t.Error("a string with no separator must not parse as an id")
	}
	owner, hash, ok := SplitID("@acme/text#outer#inner")
	if !ok || owner != "@acme/text#outer" || hash != "inner" {
		t.Errorf("SplitID split at the wrong separator: (%q, %q, %v)", owner, hash, ok)
	}
}
