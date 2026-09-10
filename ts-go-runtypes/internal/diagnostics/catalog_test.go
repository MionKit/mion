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
// codes are completeness, and they are the reason the bit exists as something
// SEPARATE from the level. They are LevelWarning (a mirror with blank labels
// still runs), so `enrich --require-complete` and the bundler's production
// enrichment gate must read this bit, never the level. Flipping the bit, or
// arming it on a wrong/stale code, breaks the exit-code contract and this test.
func TestIsCompleteness(t *testing.T) {
	for _, code := range []string{CodeFriendlyTodo, CodeMockTodo, CodeFriendlyBlankValue, CodeMockBlankValue} {
		if !IsCompleteness(code) {
			t.Errorf("%s must be a completeness code", code)
		}
		if Definitions[code].Level != LevelWarning {
			t.Errorf("%s is a blank label, not broken output: it must be LevelWarning", code)
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

// TestIsTransient pins the one transient code and, just as importantly, that
// the other pattern verdicts are NOT: a syntax error or a sample mismatch is a
// property of the type and must keep replaying from the disk cache.
func TestIsTransient(t *testing.T) {
	if !IsTransient(CodeFMTPatternTimeout) {
		t.Errorf("%s must be transient, a timeout depends on host load", CodeFMTPatternTimeout)
	}
	if Definitions[CodeFMTPatternTimeout].Level != LevelRuntimeError {
		t.Errorf("%s must stay LevelRuntimeError (the entry ships, carrying the unverified pattern)", CodeFMTPatternTimeout)
	}
	for _, code := range []string{CodeFMTSampleMismatch, CodeFMTInvalidParams, CodeFMTSampleBounds, CodeFMTMissingJsRuntime, CodeFMTSampleGenFailed, CodeFMTSampleConflict} {
		if IsTransient(code) {
			t.Errorf("%s is a property of the type, it must stay cacheable", code)
		}
	}
	if IsTransient("ZZZZ999") {
		t.Error("an unregistered code is not transient")
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

// TestDefinitions_EveryCodeDeclaresScope is the first half of the depth gate:
// register already panics on a zero Scope, so this pins the values stay in
// range and that a ScopeGraph code carrying an Example also carries the
// NestedExample the resolver-side gate feeds through the scan. Without the
// nested twin a graph-wide rule can ship tested at the root only, which is
// how every nested-node bug so far got in.
func TestDefinitions_EveryCodeDeclaresScope(t *testing.T) {
	for code, def := range Definitions {
		switch def.Scope {
		case ScopeRoot, ScopeGraph, ScopeNotSource:
		default:
			t.Errorf("code %q: Scope %d is not ScopeRoot / ScopeGraph / ScopeNotSource", code, def.Scope)
		}
		if def.NestedExample != "" && def.Example == "" {
			t.Errorf("code %q: NestedExample without an Example", code)
		}
		if def.NestedExample != "" && def.Scope != ScopeGraph {
			t.Errorf("code %q: NestedExample on a %d-scoped code; only a ScopeGraph code has a deeper twin", code, def.Scope)
		}
		if def.Scope == ScopeGraph && def.Example != "" && def.NestedExample == "" {
			t.Errorf("code %q: ScopeGraph with an Example needs a NestedExample (the same trigger one object deeper) in prose.go", code)
		}
	}
}

func TestRegister_PanicsWithoutScope(t *testing.T) {
	defer func() {
		if r := recover(); r == nil {
			t.Fatal("expected panic on a Definition with no Scope")
		}
	}()
	register(Definition{Code: "ZZZ001", Family: FamilyRunType, Severity: SeverityError, Title: "no scope"})
}

// TestEveryCodeDeclaresALevel is the catalog-wide invariant: register panics
// without a Level, so a registered code always has one, and Severity is always
// the projection of it. A hand-written Severity would drift from the level the
// downgrade and suppression rules read; register refuses one, and this pins it.
func TestEveryCodeDeclaresALevel(t *testing.T) {
	for code, definition := range Definitions {
		switch definition.Level {
		case LevelError, LevelRuntimeError:
			if definition.Severity != SeverityError {
				t.Errorf("%s: level %d must project to SeverityError, got %d", code, definition.Level, definition.Severity)
			}
		case LevelWarning:
			if definition.Severity != SeverityWarning {
				t.Errorf("%s: LevelWarning must project to SeverityWarning, got %d", code, definition.Severity)
			}
		default:
			t.Errorf("%s declares no Level", code)
		}
		if LevelOf(code) != definition.Level {
			t.Errorf("%s: LevelOf disagrees with the definition", code)
		}
	}
	if LevelOf("ZZZZ999") != LevelError {
		t.Error("an unregistered code must read as fatal: nothing may downgrade or silence what the catalog cannot vouch for")
	}
}

// TestRegisterRejectsWrittenSeverity: Severity is derived, so writing one in a
// codes_*.go literal is a mistake that would silently disagree with the level.
func TestRegisterRejectsWrittenSeverity(t *testing.T) {
	defer func() {
		if recover() == nil {
			t.Fatal("register must refuse a hand-written Severity")
		}
	}()
	register(Definition{Code: "ZZZ001", Family: FamilyMarker, Level: LevelWarning, Severity: SeverityError, Scope: ScopeNotSource})
}

// TestRegisterRequiresLevel is the Scope rule's twin.
func TestRegisterRequiresLevel(t *testing.T) {
	defer func() {
		if recover() == nil {
			t.Fatal("register must refuse a code with no Level")
		}
	}()
	register(Definition{Code: "ZZZ002", Family: FamilyMarker, Scope: ScopeNotSource})
}

// TestLevelsThatMoved pins the codes whose level CHANGED in the three-level
// split, in both directions, with the mechanical fact behind each. Without this
// a later edit could quietly re-lump them.
func TestLevelsThatMoved(t *testing.T) {
	for code, want := range map[string]Level{
		// Down to Warning: the build emits, and what it emits is correct.
		CodeMarkerDuplicateFnKey:          LevelWarning, // the scan dedupes; output is sane
		CodeNonEnumerableRequiresOptional: LevelWarning, // an ineffective tag, the function is right
		CodeExpectErrorUnused:             LevelWarning, // only a comment is wrong
		CodeExpectErrorNotSuppressible:    LevelWarning,
		CodeExpectErrorUnknownCode:        LevelWarning,
		CodeFriendlyTodo:                  LevelWarning, // blank labels, the app runs
		CodeFriendlyUnknownField:          LevelWarning, // a dead map entry nothing reads
		// Up from Warning: the build emits something broken.
		CodeMarkerUntrustedPackage: LevelRuntimeError, // reflects `unknown`, accepts everything
		CodeBatchOwnBatchIgnored:   LevelRuntimeError, // an id no table row matches, every request 404s
		CodeBatchNoRouterInit:      LevelRuntimeError, // the table is written, nothing imports it
		// Error, and staying there: no code was produced for the thing.
		CodeMarkerFreeTypeParameter: LevelError,
		CodeTypeIdCollision:         LevelError,
		CodeBatchElementNotReadable: LevelError,
		CodeEmitOutsideRootDir:      LevelError,
	} {
		if got := Definitions[code].Level; got != want {
			t.Errorf("%s: level %d, want %d", code, got, want)
		}
	}
}

func TestLevelLabel(t *testing.T) {
	for level, want := range map[Level]string{
		LevelError:        "error",
		LevelRuntimeError: "runtimeError",
		LevelWarning:      "warning",
	} {
		if got := LevelLabel(level); got != want {
			t.Errorf("LevelLabel(%d) = %q, want %q", level, got, want)
		}
	}
}
