package diagnostics

import (
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"slices"
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

// The FE catalog is GENERATED from this package, so a code with no Headline would reach users as a bare code.
func TestEveryCodeHasHeadline(t *testing.T) {
	for code, def := range Definitions {
		if def.Headline == "" {
			t.Errorf("code %q: no Headline, add it to the code's row", code)
		}
	}
}

// TestHeadlineSlotsAreNamed: the grouped log prints slot names, so a numbered `{0}` would reach the reader.
func TestHeadlineSlotsAreNamed(t *testing.T) {
	numbered := regexp.MustCompile(`\{\d+\}`)
	for code, def := range Definitions {
		if numbered.MatchString(def.Headline) {
			t.Errorf("code %q: Headline has a numbered slot, name it: %q", code, def.Headline)
		}
	}
}

// TestHeadlineSlotOrder: a rewording that moves a slot swaps args at every call site; testdata/slots.json shows it.
func TestHeadlineSlotOrder(t *testing.T) {
	goldenPath := filepath.Join("testdata", "slots.json")
	current := map[string][]string{}
	for code, def := range Definitions {
		if len(def.Slots) > 0 {
			current[code] = def.Slots
		}
	}
	if os.Getenv("MION_UPDATE_GOLDEN") == "1" {
		data, err := json.MarshalIndent(current, "", "  ")
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(goldenPath, append(data, '\n'), 0o644); err != nil {
			t.Fatal(err)
		}
		return
	}
	data, err := os.ReadFile(goldenPath)
	if err != nil {
		t.Fatal(err)
	}
	var golden map[string][]string
	if err := json.Unmarshal(data, &golden); err != nil {
		t.Fatal(err)
	}
	for code, slots := range current {
		if !slices.Equal(slots, golden[code]) {
			t.Errorf("code %q: slots %q, testdata/slots.json has %q; reorder the call sites' args, then rerun with MION_UPDATE_GOLDEN=1", code, slots, golden[code])
		}
	}
	for code := range golden {
		if _, ok := current[code]; !ok {
			t.Errorf("code %q: in testdata/slots.json but has no slots now; rerun with MION_UPDATE_GOLDEN=1", code)
		}
	}
}

func TestFillSlots(t *testing.T) {
	cases := []struct {
		headline, want string
		args           []string
	}{
		{"Make `{property}` optional (`{property}?`)", "Make `id` optional (`id?`)", []string{"id"}},
		{"`{route}` at {index}", "`users/get` at 2", []string{"users/get", "2"}},
		{"`{route}` at {index}", "`users/get` at ", []string{"users/get"}},
		{"no slots", "no slots", []string{"ignored"}},
	}
	for _, testCase := range cases {
		if got := fillSlots(testCase.headline, headlineSlots(testCase.headline), testCase.args); got != testCase.want {
			t.Errorf("fillSlots(%q) = %q, want %q", testCase.headline, got, testCase.want)
		}
	}
}

// TestHeadlinesNameNoInternalJsonFamily: users call createPrepareForJsonFn or createJsonEncoderFn, never a cache family.
func TestHeadlinesNameNoInternalJsonFamily(t *testing.T) {
	for code, def := range Definitions {
		for _, internal := range []string{"prepareForJson", "restoreFromJson", "compactForJson", "compactFromJson"} {
			if strings.Contains(def.Headline, internal) {
				t.Errorf("code %q: Headline names the internal %q; say \"the JSON encoder\" or \"the JSON decoder\"", code, internal)
			}
		}
	}
}

// TestEveryCodeHasSummary: the All Diagnostics page renders each Summary as one plain paragraph.
func TestEveryCodeHasSummary(t *testing.T) {
	for code, def := range Definitions {
		if def.Summary == "" {
			t.Errorf("code %q: no Summary, add it to the code's row", code)
			continue
		}
		if strings.Contains(def.Summary, "\n") {
			t.Errorf("code %q: Summary spans several lines; the page renders it as one paragraph", code)
		}
		for _, dash := range []string{"\u2014", "\u2013", " -- ", " - "} {
			if strings.Contains(def.Summary, dash) {
				t.Errorf("code %q: Summary uses %q as punctuation; use a comma, a period or parentheses", code, dash)
			}
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
	New("internal-test-unregistered", Site{})
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
	if !strings.Contains(line, "/a/b.ts(5,7): warning marker-calls-function-for-type(makeUser)") {
		t.Errorf("unexpected debug line: %q", line)
	}
}

func TestFormatDebug_AppendsRelatedLines(t *testing.T) {
	d := NewWithRelated(CodeMissingPureFnDep,
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
	if IsCompleteness("internal-test-unregistered") {
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
	if IsTransient("internal-test-unregistered") {
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

// First half of the depth gate: a ScopeGraph code with an Example must carry the NestedExample the resolver-side
// gate scans, or a graph-wide rule ships tested at the root only (how every nested-node bug so far got in).
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
			t.Errorf("code %q: ScopeGraph with an Example needs a NestedExample (the same trigger one object deeper) in the code's row", code)
		}
	}
}

func TestRegister_PanicsWithoutScope(t *testing.T) {
	defer func() {
		if r := recover(); r == nil {
			t.Fatal("expected panic on a Definition with no Scope")
		}
	}()
	Register(Definition{Code: "internal-test-no-scope", Family: FamilyRunType, Severity: SeverityError, Title: "no scope"})
}

// A hand-written Severity would drift from the Level the downgrade and suppression rules read; this pins the refusal.
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
		case LevelInfo:
			if definition.Severity != SeverityInfo {
				t.Errorf("%s: LevelInfo must project to SeverityInfo, got %d", code, definition.Severity)
			}
		default:
			t.Errorf("%s declares no Level", code)
		}
		if LevelOf(code) != definition.Level {
			t.Errorf("%s: LevelOf disagrees with the definition", code)
		}
	}
	if LevelOf("internal-test-unregistered") != LevelError {
		t.Error("an unregistered code must read as fatal: nothing may downgrade or silence what the catalog cannot vouch for")
	}
}

// TestRegisterRejectsWrittenSeverity: Severity is derived, so writing one in a
// codes_*.go literal is a mistake that would silently disagree with the level.
func TestRegisterRejectsWrittenSeverity(t *testing.T) {
	defer func() {
		if recover() == nil {
			t.Fatal("Register must refuse a hand-written Severity")
		}
	}()
	Register(Definition{Code: "internal-test-written-severity", Family: FamilyMarker, Level: LevelWarning, Severity: SeverityError, Scope: ScopeNotSource})
}

// TestRegisterRequiresLevel is the Scope rule's twin.
func TestRegisterRequiresLevel(t *testing.T) {
	defer func() {
		if recover() == nil {
			t.Fatal("Register must refuse a code with no Level")
		}
	}()
	Register(Definition{Code: "internal-test-no-level", Family: FamilyMarker, Scope: ScopeNotSource})
}

// TestLevelsThatMoved pins the codes the level splits moved, with the reason for each, so no edit quietly re-lumps them.
func TestLevelsThatMoved(t *testing.T) {
	for code, want := range map[string]Level{
		// Down to Warning: the build emits, and what it emits is correct.
		CodeNonEnumerableRequiresOptional: LevelWarning, // an ineffective tag, the function is right
		CodeExpectErrorUnused:             LevelWarning, // only a comment is wrong
		CodeExpectErrorNotSuppressible:    LevelWarning,
		CodeExpectErrorUnknownCode:        LevelWarning,
		CodeFriendlyTodo:                  LevelWarning, // blank labels, the app runs
		CodeFriendlyUnknownField:          LevelWarning, // a dead map entry nothing reads
		// Up from Warning: the build emits something broken.
		CodeMarkerUntrustedPackage: LevelRuntimeError, // reflects `unknown`, accepts everything
		CodeBatchNoRouterInit:      LevelRuntimeError, // the table is written, nothing imports it
		// Down to Info: what ships is the documented behaviour, or the finding is advice.
		CodeMarkerDuplicateFnKey:         LevelInfo, // the scan dedupes; output is sane
		CodeVLMethodDropped:              LevelInfo, // a method is never data
		CodePJFunctionPropDropped:        LevelInfo,
		CodeRJNonSerializablePropDrop:    LevelInfo, // a Promise property included
		CodeVESymbolKeyedDropped:         LevelInfo,
		CodePJSUnionMemberDropped:        LevelInfo,
		CodeVLRootAnyUnknown:             LevelInfo, // the author wrote `any`
		CodeVERootAnyUnknown:             LevelInfo,
		CodeRUKMethodDropped:             LevelInfo, // lives on the prototype
		CodeRUKStaticDropped:             LevelInfo,
		CodeRUKSharedAsAsked:             LevelInfo, // the caller asked to share
		CodeOverrideValidateCrossFamily:  LevelInfo,
		CodeApiMetaRouteWidenedFetched:   LevelInfo, // the call still works
		CodeDowngradeErrorAlreadyWarning: LevelInfo,
		CodeFriendlyPluralNoCount:        LevelInfo,
		// Staying Warning: the output surprises, it is not the documented drop.
		CodeRUKFunctionPropDropped:     LevelWarning, // the clone SHARES the value with the original
		CodeRUKNonSerializablePropDrop: LevelWarning,
		CodeUnsafePropertyName:         LevelWarning,
		// The copy would break its own type, so the function throws instead.
		CodeRUKSymbolKeyedMember: LevelRuntimeError,
		CodeRUKPrivateFields:     LevelRuntimeError,
		CodeRUKSharedRefused:     LevelRuntimeError,
		// Error, and staying there: no code was produced for the thing.
		CodeMarkerFreeTypeParameter: LevelError,
		CodeTypeIdCollision:         LevelError,
		CodeEmitOutsideRootDir:      LevelError,
		// A dropped batch still compiles: `batch()` runs and throws `batch-missing-id`.
		CodeBatchElementNotReadable:     LevelRuntimeError,
		CodeBatchSourceNotInBatch:       LevelRuntimeError,
		CodeBatchMapperNotReadable:      LevelRuntimeError,
		CodeBatchDuplicateRoute:         LevelRuntimeError,
		CodeBatchMappingParamOutOfRange: LevelRuntimeError,
		CodeBatchTooManyCombinations:    LevelRuntimeError,
	} {
		if got := Definitions[code].Level; got != want {
			t.Errorf("%s: level %d, want %d", code, got, want)
		}
	}
	// Every member and union drop of the data families (the `-dropped` codes) is Info; validation-errors has no union-member drop.
	for _, prefix := range []string{"validate-", "validation-errors-", "json-prepare-", "json-prepare-clone-", "json-restore-"} {
		for _, suffix := range []string{"function-property-dropped", "method-dropped", "static-dropped", "symbol-key-dropped", "union-member-dropped", "non-data-property-dropped"} {
			code := prefix + suffix
			if code == "validation-errors-union-member-dropped" {
				continue
			}
			if got := Definitions[code].Level; got != LevelInfo {
				t.Errorf("%s: level %d, want Info", code, got)
			}
		}
	}
}

func TestLevelLabel(t *testing.T) {
	for level, want := range map[Level]string{
		LevelError:        "error",
		LevelRuntimeError: "runtimeError",
		LevelWarning:      "warning",
		LevelInfo:         "info",
	} {
		if got := LevelLabel(level); got != want {
			t.Errorf("LevelLabel(%d) = %q, want %q", level, got, want)
		}
	}
}

func TestFormat_PrintsTheHeadline(t *testing.T) {
	diagnostic := New(CodeVLSymbolRoot, Site{FilePath: "src/a.ts", StartLine: 3, StartCol: 7}, "Symbol")
	want := "src/a.ts(3,7): error validate-symbol-root: " + renderHeadline(CodeVLSymbolRoot, []string{"Symbol"})
	if got := Format(diagnostic, false); got != want {
		t.Fatalf("Format = %q, want %q", got, want)
	}
	if got := Format(diagnostic, true); got != "src/a.ts(3,7): warning validate-symbol-root: "+renderHeadline(CodeVLSymbolRoot, []string{"Symbol"})+" "+DowngradedNote {
		t.Fatalf("downgraded Format = %q", got)
	}
	if headline := renderHeadline(CodeVLSymbolRoot, []string{"Symbol"}); strings.Contains(headline, "{type}") || !strings.Contains(headline, "Symbol") {
		t.Fatalf("renderHeadline must fill {type}, got %q", headline)
	}
}

func TestRegister_PanicsOnABadName(t *testing.T) {
	for _, code := range []string{"", "Validate-symbol-root", "validate_symbol_root", "validate-", "validate", "nosuchprefix-name"} {
		t.Run(code, func(t *testing.T) {
			defer func() {
				recovered := recover()
				if message, _ := recovered.(string); !strings.Contains(message, "is not a kebab-case name with an area prefix") {
					t.Errorf("Register(%q) panic = %v, want the bad-name panic", code, recovered)
				}
			}()
			Register(Definition{Code: code, Family: FamilyMarker, Level: LevelWarning, Scope: ScopeNotSource})
		})
	}
}

// registerTemporarily registers definition and removes it when the test ends.
func registerTemporarily(t *testing.T, definition Definition) {
	t.Helper()
	previous, existed := Definitions[definition.Code]
	Register(definition)
	t.Cleanup(func() {
		if existed {
			Definitions[definition.Code] = previous
		} else {
			delete(Definitions, definition.Code)
		}
	})
}

// expectPanic fails unless call panics with a message containing want.
func expectPanic(t *testing.T, want string, call func()) {
	t.Helper()
	defer func() {
		message, _ := recover().(string)
		if !strings.Contains(message, want) {
			t.Errorf("panic = %q, want one containing %q", message, want)
		}
	}()
	call()
}

func extensionDefinition(code string) Definition {
	return Definition{Code: code, Family: FamilyMarker, Level: LevelWarning, Scope: ScopeNotSource, Title: "t",
		Headline: "Value `{value}` of `{name}` is wrong, `{value}` again.", Summary: "s", Owner: "ext"}
}

// An extension row carries its own text: Register derives Slots and Severity, and the duplicate / Replace rules hold.
func TestRegister_ExtensionRow(t *testing.T) {
	registerTemporarily(t, extensionDefinition("internal-test-extension-row"))
	got := Definitions["internal-test-extension-row"]
	if !slices.Equal(got.Slots, []string{"value", "name"}) || got.Severity != SeverityWarning || got.Owner != "ext" || got.Replace {
		t.Fatalf("registered row = %+v", got)
	}
	expectPanic(t, "duplicate registration of code", func() { Register(extensionDefinition("internal-test-extension-row")) })

	replaced := extensionDefinition("internal-test-extension-row")
	replaced.Headline, replaced.Replace = "Replaced `{other}`.", true
	Register(replaced)
	if got := Definitions["internal-test-extension-row"]; got.Headline != "Replaced `{other}`." || !slices.Equal(got.Slots, []string{"other"}) {
		t.Fatalf("Replace did not swap the row: %+v", got)
	}
	absent := extensionDefinition("internal-test-never-registered")
	absent.Replace = true
	expectPanic(t, "nothing to replace", func() { Register(absent) })
}

func TestRegister_RequiresText(t *testing.T) {
	noHeadline := extensionDefinition("internal-test-no-headline")
	noHeadline.Headline = ""
	expectPanic(t, "has no Headline", func() { Register(noHeadline) })
	noSummary := extensionDefinition("internal-test-no-summary")
	noSummary.Summary = ""
	expectPanic(t, "has no Summary", func() { Register(noSummary) })
}

func TestRegisterArea(t *testing.T) {
	saved, savedRE := slices.Clone(areas), slugRE
	t.Cleanup(func() { areas, slugRE = saved, savedRE })
	expectPanic(t, "is not a kebab-case name", func() { Register(extensionDefinition("extarea-thing")) })
	RegisterArea("extarea", false)
	registerTemporarily(t, extensionDefinition("extarea-thing"))
	expectPanic(t, "duplicate registration of area", func() { RegisterArea("extarea", false) })
	RegisterArea("extarea", true)
	expectPanic(t, "nothing to replace", func() { RegisterArea("otherarea", true) })
}

func TestRegisterFamily(t *testing.T) {
	savedOrder := slices.Clone(familyOrder)
	t.Cleanup(func() {
		familyOrder = savedOrder
		delete(familyLabels, Family(200))
		familyLabels[FamilyMarker] = "marker"
	})
	RegisterFamily(Family(200), "extfamily", false)
	if FamilyLabel(Family(200)) != "extfamily" || !slices.Contains(allFamilies(), Family(200)) {
		t.Fatalf("an extension family must be labelled and join allFamilies: %v", allFamilies())
	}
	expectPanic(t, "duplicate registration of family", func() { RegisterFamily(Family(200), "again", false) })
	RegisterFamily(FamilyMarker, "markers", true)
	if FamilyLabel(FamilyMarker) != "markers" {
		t.Fatal("Replace must swap the label")
	}
	expectPanic(t, "nothing to replace", func() { RegisterFamily(Family(201), "x", true) })
	if FamilyLabel(Family(202)) != "unknown" {
		t.Fatal("an unregistered family reads as unknown")
	}
}

// The generated catalog lists mion's codes only, so a registered extension code leaves it unchanged.
func TestCatalog_OwnerFilter(t *testing.T) {
	mionOnly := func(definition Definition) bool { return definition.Owner == "" }
	before := Catalog(mionOnly)
	registerTemporarily(t, extensionDefinition("internal-test-owned-code"))
	if after := Catalog(mionOnly); !slices.EqualFunc(before, after, func(a, b CatalogEntry) bool { return a.Code == b.Code }) {
		t.Fatal("an extension code must not reach mion's generated catalog")
	}
	owned := Catalog(func(definition Definition) bool { return definition.Owner != "" })
	if len(owned) != 1 || owned[0].Code != "internal-test-owned-code" || owned[0].Family != "marker" || owned[0].Level != "warning" {
		t.Fatalf("owned catalog = %+v", owned)
	}
}
