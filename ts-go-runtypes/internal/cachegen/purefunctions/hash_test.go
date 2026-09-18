package purefunctions

import "testing"

const testID = "@acme/text/src/slug#slugify"

func TestBodyHash_Deterministic(t *testing.T) {
	got1 := BodyHash(testID, "return JSON.stringify;")
	got2 := BodyHash(testID, "return JSON.stringify;")
	if got1 != got2 {
		t.Fatalf("expected stable hash, got %q vs %q", got1, got2)
	}
}

func TestBodyHash_Length14(t *testing.T) {
	got := BodyHash(testID, "return JSON.stringify;")
	if len(got) != bodyHashLength {
		t.Fatalf("expected %d chars, got %d (%q)", bodyHashLength, len(got), got)
	}
}

func TestBodyHash_IDAffectsHash(t *testing.T) {
	a := BodyHash("@acme/text/src/slug#slugify", "return 1;")
	b := BodyHash("@acme/text/src/other#slugify", "return 1;")
	if a == b {
		t.Fatalf("the file half of the id must change the hash, both got %q", a)
	}
	c := BodyHash("@acme/text/src/slug#titleOf", "return 1;")
	if a == c {
		t.Fatalf("the name half of the id must change the hash, both got %q", a)
	}
}

func TestBodyHash_NormalizesHorizontalWhitespace(t *testing.T) {
	// We collapse runs of spaces/tabs to single spaces, then trim.
	// Newlines are preserved.
	tight := BodyHash(testID, "return 1;")
	loose := BodyHash(testID, "  return    1;   ")
	if tight != loose {
		t.Fatalf("normalized variants must hash identically: tight=%q loose=%q", tight, loose)
	}
}

func TestBodyHash_PreservesNewlines(t *testing.T) {
	// The regex /[ \t]+/g doesn't touch newlines — they stay significant.
	noLines := BodyHash(testID, "const a = 1; const b = 2;")
	withLines := BodyHash(testID, "const a = 1;\nconst b = 2;")
	if noLines == withLines {
		t.Fatalf("newline-vs-space difference must change hash, both got %q", noLines)
	}
}

func TestBodyHash_Base64URLSafe(t *testing.T) {
	// base64url uses [A-Za-z0-9_-] — no `+`, `/`, or `=`.
	got := BodyHash(testID, "code with special chars: \"\\\n\t")
	for _, r := range got {
		ok := (r >= 'A' && r <= 'Z') || (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '_' || r == '-'
		if !ok {
			t.Fatalf("non-base64url char %q in %q", r, got)
		}
	}
}
