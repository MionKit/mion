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

// TestIDFor_NamedPackage — the id a consumer sees: the package name, the path
// from its root with the extension dropped, and the bound name.
func TestIDFor_NamedPackage(t *testing.T) {
	dir := t.TempDir()
	file := writePackage(t, dir, `{"name": "@acme/text"}`, "src/slug.ts")

	id := IDFor(marker.Options{Cwd: dir}, file, "slugify")
	if want := "@acme/text/src/slug#slugify"; id != want {
		t.Errorf("IDFor = %q, want %q", id, want)
	}
	location, name, ok := SplitID(id)
	if !ok || location != "@acme/text/src/slug" || name != "slugify" {
		t.Errorf("SplitID(%q) = (%q, %q, %v)", id, location, name, ok)
	}
}

// TestIDFor_DeclarationAgreesWithSource — a `.d.ts` and the `.ts` it was emitted
// from name ONE pure fn, which is what lets a consumer holding only declarations
// resolve an id the package's own build computed.
func TestIDFor_DeclarationAgreesWithSource(t *testing.T) {
	dir := t.TempDir()
	source := writePackage(t, dir, `{"name": "@acme/text"}`, "src/slug.ts")
	declaration := filepath.Join(dir, "src/slug.d.ts")

	if IDFor(marker.Options{Cwd: dir}, declaration, "slugify") != IDFor(marker.Options{Cwd: dir}, source, "slugify") {
		t.Errorf("the .d.ts id %q differs from the source id %q",
			IDFor(marker.Options{Cwd: dir}, declaration, "slugify"), IDFor(marker.Options{Cwd: dir}, source, "slugify"))
	}
}

// TestIDFor_UnnamedPackageAnchorsAtItsRoot — a private package.json with no
// name still anchors the path, so the id does not depend on the directory the
// build ran from (a server build reading a client project computes what the
// client's own build does).
func TestIDFor_UnnamedPackageAnchorsAtItsRoot(t *testing.T) {
	base := t.TempDir()
	client := filepath.Join(base, "client")
	if err := os.MkdirAll(client, 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	file := writePackage(t, client, `{"private": true}`, "src/a.ts")

	fromClient := IDFor(marker.Options{Cwd: client}, file, "toId")
	fromServer := IDFor(marker.Options{Cwd: filepath.Join(base, "server")}, file, "toId")
	if want := "src/a#toId"; fromClient != want {
		t.Errorf("IDFor from the client = %q, want %q", fromClient, want)
	}
	if fromServer != fromClient {
		t.Errorf("IDFor depends on the build's cwd: %q vs %q", fromServer, fromClient)
	}
}

// TestIDFor_NoPackageUsesTheProjectDir — with no package.json anywhere above it
// (an in-memory overlay, a scratch project) the project directory is the anchor.
func TestIDFor_NoPackageUsesTheProjectDir(t *testing.T) {
	dir := t.TempDir()
	file := writePackage(t, dir, "", "a.ts")

	if got, want := IDFor(marker.Options{Cwd: dir}, file, "double"), "a#double"; got != want {
		t.Errorf("IDFor = %q, want %q", got, want)
	}
}

// TestIDFor_NamelessRegistrationTakesTheBodyHash — a registration bound to no
// name is identified by its body, so two equal bodies in one file are one id and
// two different ones are not.
func TestIDFor_NamelessRegistrationTakesTheBodyHash(t *testing.T) {
	dir := t.TempDir()
	file := writePackage(t, dir, `{"name": "@acme/text"}`, "src/slug.ts")
	opts := marker.Options{Cwd: dir}

	same := IDFor(opts, file, CodeHash("return (s) => s.trim();"))
	again := IDFor(opts, file, CodeHash("return (s) => s.trim();"))
	other := IDFor(opts, file, CodeHash("return (s) => s.toUpperCase();"))
	if same != again {
		t.Errorf("equal bodies gave two ids: %q vs %q", same, again)
	}
	if same == other {
		t.Errorf("different bodies collapsed to one id: %q", same)
	}
	if location, _, ok := SplitID(same); !ok || location != "@acme/text/src/slug" {
		t.Errorf("a nameless id must still say where it lives, got %q", same)
	}
}

// TestSplitID_RejectsAStringThatIsNotAnId — anything without the separator is
// not an id this package produced, and a `#` in the name half never splits
// early (the LAST separator wins).
func TestSplitID_RejectsAStringThatIsNotAnId(t *testing.T) {
	if _, _, ok := SplitID("plainName"); ok {
		t.Error("a string with no separator must not parse as an id")
	}
	location, name, ok := SplitID("@acme/text/src/slug#outer#inner")
	if !ok || location != "@acme/text/src/slug#outer" || name != "inner" {
		t.Errorf("SplitID split at the wrong separator: (%q, %q, %v)", location, name, ok)
	}
}
