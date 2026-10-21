package typefunctions

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
)

func TestRootThrowHeadline_PerFamily(t *testing.T) {
	cases := []struct {
		code, kind, want string
	}{
		{diagnostics.CodePJNeverRoot, "Never", "Type `Never` can never be encoded to JSON — the generated function will always fail."},
		{diagnostics.CodeRJSymbolRoot, "Symbol", "Type `Symbol` can never be decoded from JSON — the generated function will always fail."},
		{diagnostics.CodeVLSymbolRoot, "Symbol", "Type `Symbol` can never be validated — the generated function will always fail."},
		// A code whose headline is written about its argument throws that headline as is.
		{diagnostics.CodeRUKSymbolKeyedMember, "property `[tag]`", "Symbol-keyed property `[tag]` cannot be copied: the generated code cannot name your symbol, so the function always throws."},
		{diagnostics.CodeRUKPrivateFields, "class `Counter`", "The class `Counter` has `#private` fields, which only its constructor can create: a copy would break its methods, so the function always throws."},
		{diagnostics.CodeRUKSharedRefused, "property `onClick`", "The value in property `onClick` can only be shared with the input and `sharedValues: 'refuse'` is set, so the function always throws."},
	}
	for _, c := range cases {
		if got := rootThrowHeadline(c.code, c.kind); got != c.want {
			t.Errorf("rootThrowHeadline(%q, %q) = %q, want %q", c.code, c.kind, got, c.want)
		}
	}
}

// TestRootThrowWording_CoversEveryAlwaysThrowCode pins completeness: every
// root-throw diag code (the only codes that become alwaysThrow runtime entries)
// must have throw wording, so no alwaysThrow falls back to the generic line.
func TestRootThrowWording_CoversEveryAlwaysThrowCode(t *testing.T) {
	for _, code := range []string{
		diagnostics.CodeVLNonSerializableRoot, diagnostics.CodeVLSymbolRoot,
		diagnostics.CodeVENonSerializableRoot, diagnostics.CodeVESymbolRoot,
		diagnostics.CodePJNeverRoot, diagnostics.CodePJNonSerializableRoot, diagnostics.CodePJFunctionRoot, diagnostics.CodePJSymbolRoot,
		diagnostics.CodePJSNeverRoot, diagnostics.CodePJSNonSerializableRoot, diagnostics.CodePJSFunctionRoot, diagnostics.CodePJSSymbolRoot,
		diagnostics.CodeRJNeverRoot, diagnostics.CodeRJNonSerializableRoot, diagnostics.CodeRJFunctionRoot, diagnostics.CodeRJSymbolRoot,
	} {
		if _, ok := rootThrowWording[code]; !ok {
			t.Errorf("root-throw code %q has no throw wording", code)
		}
	}
}

// The removeUnknownKeys refusals throw their own headline, never the generic "not supported here" fallback.
func TestRootThrowHeadline_RemoveUnknownKeysNeverFallsBack(t *testing.T) {
	for _, code := range []string{diagnostics.CodeRUKSymbolKeyedMember, diagnostics.CodeRUKPrivateFields, diagnostics.CodeRUKSharedRefused} {
		if headline := rootThrowHeadline(code, "x"); strings.Contains(headline, "is not supported here") {
			t.Errorf("%s fell back to the generic headline: %q", code, headline)
		}
	}
}

func TestBuildAlwaysThrowMessage_WithProvenance(t *testing.T) {
	msg := buildAlwaysThrowMessage(diagnostics.CodePJFunctionRoot, "Function", []diagnostics.Site{{FilePath: "src/a.ts", StartLine: 7, StartCol: 3}})
	if !strings.HasPrefix(msg, "[json-prepare-function-root] Type `Function` can never be encoded to JSON — the generated function will always fail.") {
		t.Errorf("unexpected message prefix: %q", msg)
	}
	if !strings.Contains(msg, "(at src/a.ts:7:3)") {
		t.Errorf("expected site suffix, got: %q", msg)
	}
}

func TestBuildAlwaysThrowMessage_CountsSharedCallSites(t *testing.T) {
	sites := []diagnostics.Site{{FilePath: "src/a.ts", StartLine: 1, StartCol: 1}, {FilePath: "src/b.ts", StartLine: 2, StartCol: 1}, {FilePath: "src/c.ts", StartLine: 3, StartCol: 1}}
	if msg := buildAlwaysThrowMessage(diagnostics.CodeVLSymbolRoot, "Symbol", sites); !strings.HasSuffix(msg, "(at src/a.ts:1:1, and 2 other call sites)") {
		t.Errorf("expected the first site plus the shared count, got: %q", msg)
	}
	if msg := buildAlwaysThrowMessage(diagnostics.CodeVLSymbolRoot, "Symbol", sites[:2]); !strings.HasSuffix(msg, "(at src/a.ts:1:1, and 1 other call site)") {
		t.Errorf("expected the singular form, got: %q", msg)
	}
}
