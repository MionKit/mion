package diagnostics

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestDefinitions_AllRegisteredCodesHaveFamilyAndSeverity(t *testing.T) {
	if len(Definitions) == 0 {
		t.Fatal("expected at least one registered Definition")
	}
	for code, def := range Definitions {
		if def.Code != code {
			t.Errorf("code %q: Definition.Code mismatch (%q)", code, def.Code)
		}
		if def.Family == 0 {
			t.Errorf("code %q: Family unset", code)
		}
		if def.Severity == 0 {
			t.Errorf("code %q: Severity unset", code)
		}
		if def.Title == "" {
			t.Errorf("code %q: Title empty", code)
		}
	}
}

// TestEveryCodeHasHeadline pins the messages.go contract: the FE catalog is
// GENERATED from this package, so a registered code with no Headline would
// reach users as a bare code with no wording.
func TestEveryCodeHasHeadline(t *testing.T) {
	for code, def := range Definitions {
		if def.Headline == "" {
			t.Errorf("code %q: no Headline, add it to messagesByCode in messages.go", code)
		}
	}
}

func TestNew_PopulatesFamilyAndSeverityFromCatalog(t *testing.T) {
	d := New(CodeMarkerFunctionCallArg, Site{FilePath: "/a/b.ts", StartLine: 1, StartCol: 2}, "makeUser")
	if d.Code != CodeMarkerFunctionCallArg {
		t.Errorf("Code: got %q want %q", d.Code, CodeMarkerFunctionCallArg)
	}
	if d.Family != FamilyMarker {
		t.Errorf("Family: got %d want %d", d.Family, FamilyMarker)
	}
	if d.Severity != SeverityWarning {
		t.Errorf("Severity: got %d want %d", d.Severity, SeverityWarning)
	}
	if len(d.Args) != 1 || d.Args[0] != "makeUser" {
		t.Errorf("Args: got %v want [\"makeUser\"]", d.Args)
	}
}

func TestNew_PanicsOnUnknownCode(t *testing.T) {
	defer func() {
		if r := recover(); r == nil {
			t.Fatal("expected panic on unknown code")
		}
	}()
	New("ZZZZ999", Site{})
}

func TestDiagnostic_MarshalJSON_NumericSeverityAndFamily(t *testing.T) {
	d := New(CodeMarkerFunctionCallArg, Site{FilePath: "/a/b.ts", StartLine: 3, StartCol: 4}, "fn")
	out, err := json.Marshal(d)
	if err != nil {
		t.Fatal(err)
	}
	s := string(out)
	if !strings.Contains(s, `"severity":2`) {
		t.Errorf("expected numeric severity (warning=2) in JSON: %s", s)
	}
	if !strings.Contains(s, `"family":2`) {
		t.Errorf("expected numeric family (marker=2) in JSON: %s", s)
	}
	if strings.Contains(s, `"severity":"warning"`) {
		t.Errorf("severity must be numeric, not string: %s", s)
	}
	// Args present, message absent: wire shape sanity.
	if !strings.Contains(s, `"args":["fn"]`) {
		t.Errorf("expected args array in JSON: %s", s)
	}
	if strings.Contains(s, `"message"`) {
		t.Errorf("message field must not appear in wire: %s", s)
	}
}

func TestDiagnostic_MarshalJSON_OmitsEmptyArgs(t *testing.T) {
	d := New(CodeCompTimeArgsNonLiteral, Site{FilePath: "/a.ts", StartLine: 1, StartCol: 1})
	out, err := json.Marshal(d)
	if err != nil {
		t.Fatal(err)
	}
	s := string(out)
	if strings.Contains(s, `"args"`) {
		t.Errorf("empty args should be omitted: %s", s)
	}
}

func TestFormatDebug_RendersCodeAndArgs(t *testing.T) {
	d := New(CodeMarkerFunctionCallArg, Site{FilePath: "/a/b.ts", StartLine: 5, StartCol: 7}, "makeUser")
	line := FormatDebug(d)
	if !strings.Contains(line, "/a/b.ts(5,7): warning MKR001(makeUser)") {
		t.Errorf("unexpected debug line: %q", line)
	}
}

func TestFormatDebug_AppendsRelatedLines(t *testing.T) {
	d := NewWithRelated(CodeBodyHashCollision,
		Site{FilePath: "/a.ts", StartLine: 1, StartCol: 1},
		[]string{"ns::fn"},
		Related{Site: Site{FilePath: "/b.ts", StartLine: 9, StartCol: 9}, Message: "first here"},
	)
	line := FormatDebug(d)
	if !strings.Contains(line, "\n  Related: /b.ts(9,9): first here") {
		t.Errorf("missing related line in: %q", line)
	}
}

// TestIsCompleteness pins the completeness tier: only the unfilled-@todo scaffold
// codes are completeness (they fail solely under the CLI completeness gate); every
// wrong/stale code (malformed content, orphan carcasses) is not, so it fails
// every check lane. Flipping FT020/MD020's Completeness bit, or arming it on a
// wrong/stale code, breaks the exit-code contract and this test.
func TestIsCompleteness(t *testing.T) {
	for _, code := range []string{CodeFriendlyTodo, CodeMockTodo, CodeFriendlyBlankValue, CodeMockBlankValue} {
		if !IsCompleteness(code) {
			t.Errorf("%s must be a completeness code", code)
		}
		if Definitions[code].Severity != SeverityError {
			t.Errorf("%s must stay Error severity (editor still flags it)", code)
		}
	}
	for _, code := range []string{
		CodeFriendlyUnknownField, CodeFriendlyOrphanConst, CodeFriendlyOrphanField,
		CodeMockUnknownField, CodeMockOrphanConst, CodeMarkerFunctionCallArg,
	} {
		if IsCompleteness(code) {
			t.Errorf("%s is wrong/stale, not completeness, it must fail every check lane", code)
		}
	}
	if IsCompleteness("ZZZZ999") {
		t.Error("an unregistered code is not a completeness code")
	}
}

func TestSeverityLabel(t *testing.T) {
	if SeverityLabel(SeverityError) != "error" {
		t.Errorf("error label")
	}
	if SeverityLabel(SeverityWarning) != "warning" {
		t.Errorf("warning label")
	}
	if SeverityLabel(SeverityInfo) != "info" {
		t.Errorf("info label")
	}
}
