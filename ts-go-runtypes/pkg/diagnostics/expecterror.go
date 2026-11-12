package diagnostics

import "strings"

// expecterror.go holds the semantics of the two source directives; finding the comments is the
// resolver's job, so this package stays free of any compiler dependency. The contract follows
// TypeScript's `@ts-expect-error`: a directive that did nothing is itself reported, so it cannot
// outlive its problem, but as a WARNING, since a stale comment says nothing about the emitted code.
// `@mion-expect-error` removes a finding; `@mion-downgrade-error` keeps it printing and only stops
// the halt, for a finding that is true and worth seeing. Either reaches one line or, at file scope,
// the whole file (see DirectiveScope).

// DirectiveMarker is the word a suppression comment starts with, and DowngradeDirectiveMarker its
// downgrading sibling. Either must be the first thing on its own line: a trailing comment after code
// is deliberately not a directive, so it is never in doubt which line it applies to.
const (
	DirectiveMarker          = "@mion-expect-error"
	DowngradeDirectiveMarker = "@mion-downgrade-error"
)

// DirectiveScope is picked from the comment's shape: a block comment before any code covers the file.
type DirectiveScope uint8

const (
	// DirectiveScopeLine covers the line below the comment.
	DirectiveScopeLine DirectiveScope = 1
	// DirectiveScopeFile covers every line of the file the comment opens.
	DirectiveScopeFile DirectiveScope = 2
)

// DirectiveKind says what a directive does to the findings it claims.
type DirectiveKind uint8

const (
	// DirectiveExpect removes the finding (`@mion-expect-error`).
	DirectiveExpect DirectiveKind = 1
	// DirectiveDowngrade keeps the finding and marks it downgraded
	// (`@mion-downgrade-error`).
	DirectiveDowngrade DirectiveKind = 2
)

// Marker is the comment word this kind is written with.
func (kind DirectiveKind) Marker() string {
	if kind == DirectiveDowngrade {
		return DowngradeDirectiveMarker
	}
	return DirectiveMarker
}

// Directive is one parsed directive comment.
type Directive struct {
	// Kind is what this comment does to the findings it claims.
	Kind DirectiveKind
	// Scope at DirectiveScopeFile ignores AppliesToLine.
	Scope DirectiveScope
	// AppliesToLine is the 1-based line the directive silences: the line after
	// the comment's own last line.
	AppliesToLine int
	// Codes are the diagnostic codes the directive names, in written order. An
	// empty slice is the BARE form (`// @mion-expect-error` with nothing after
	// it), which covers any suppressible code reported on that line.
	Codes []string
	// Site is the comment's own span, where the comment-expect-error-* codes anchor so the squiggle
	// lands on the comment the user must fix.
	Site Site
}

// notSuppressible lists the codes no directive may silence, on top of every
// LevelError code. A directive cannot silence the checks that keep directives
// honest, or the ones that report a malformed directive.
var notSuppressible = map[string]bool{
	CodeExpectErrorUnused:              true,
	CodeExpectErrorNotSuppressible:     true,
	CodeExpectErrorUnknownCode:         true,
	CodeDowngradeErrorUnused:           true,
	CodeDowngradeErrorNotDowngradeable: true,
	CodeDowngradeErrorUnknownCode:      true,
	CodeDowngradeErrorAlreadyWarning:   true,
}

// Downgradeable reports whether a directive may lower code to a warning: only a LevelRuntimeError has output to keep.
// The caller reports LevelError, Warning or Info, and unknown codes each as its own comment-downgrade-error-* code, because the fix differs.
func Downgradeable(code string) bool {
	definition, registered := Definitions[code]
	return registered && definition.Level == LevelRuntimeError
}

// Suppressible reports whether a directive may silence code. A LevelError never is: continuing would
// ship missing output rather than merely risky output, the same rule the bundler plugin halts on. A
// LevelRuntimeError is, since output exists and the author may have written the bad type on purpose.
// An unrecognised code is not either, but the caller reports that as comment-expect-error-unknown-name rather than comment-expect-error-not-allowed.
func Suppressible(code string) bool {
	definition, registered := Definitions[code]
	if !registered {
		return false
	}
	if definition.Level == LevelError {
		return false
	}
	return !notSuppressible[code]
}

// ApplyDirectives applies every directive and returns the survivors, in order, followed by the comment-expect-error-* /
// comment-downgrade-error-* diagnostics the directives themselves earned. A directive that named a bad code does NOT also
// report its unused code: the user has one problem to fix, not two.
//
// normalize puts both sides' paths in one spelling, since a diagnostic site echoes the CALLER's
// spelling while a directive is found through the program's resolved path; nil compares verbatim.
// scope keeps the comment-expect-error-* codes from firing on a question this pass cannot answer, see PassScope.
func ApplyDirectives(list []Diagnostic, directives []Directive, normalize func(string) string, scope PassScope) []Diagnostic {
	if len(directives) == 0 {
		return list
	}
	if normalize == nil {
		normalize = func(path string) string { return path }
	}
	// At most one line directive claims a line, but a file may carry several file directives.
	byLine := make(map[directiveKey]int, len(directives))
	byFile := map[string][]int{}
	for index, directive := range directives {
		file := normalize(directive.Site.FilePath)
		if directive.Scope == DirectiveScopeFile {
			byFile[file] = append(byFile[file], index)
			continue
		}
		byLine[directiveKey{file: file, line: directive.AppliesToLine}] = index
	}
	used := make([]bool, len(directives))

	survivors := make([]Diagnostic, 0, len(list))
	for _, diagnostic := range list {
		file := normalize(diagnostic.Site.FilePath)
		// Mark every claimer used, or a file comment would report every line comment it covers as stale.
		removed := false
		downgraded := false
		claim := func(index int) {
			used[index] = true
			if directives[index].Kind == DirectiveExpect {
				removed = true
				return
			}
			downgraded = true
		}
		if index, claimed := byLine[directiveKey{file: file, line: diagnostic.Site.StartLine}]; claimed && directives[index].covers(diagnostic.Code) {
			claim(index)
		}
		for _, index := range byFile[file] {
			if directives[index].covers(diagnostic.Code) {
				claim(index)
			}
		}
		// A finding cannot be both gone and printed.
		if removed {
			continue
		}
		if downgraded {
			diagnostic.Downgraded = true
		}
		survivors = append(survivors, diagnostic)
	}

	if !scope.Reports {
		return survivors
	}
	for index, directive := range directives {
		file := normalize(directive.Site.FilePath)
		if !scope.sawFile(file) {
			continue
		}
		malformed := false
		for _, code := range directive.Codes {
			if report := directive.malformedCode(code); report != "" {
				malformed = true
				survivors = append(survivors, New(report, directive.Site, code))
			}
		}
		if malformed || used[index] || !scope.canJudge(directive) {
			continue
		}
		survivors = append(survivors, New(directive.unusedCode(), directive.Site, directive.named()))
	}
	return survivors
}

// malformedCode reports the code this directive earns for naming `code`, or "" when naming it is fine.
// Downgrade cases stay apart, fixes differ: Error cannot lower, unknown is a typo, warning or info never halted.
func (directive Directive) malformedCode(code string) string {
	_, registered := Definitions[code]
	if directive.Kind == DirectiveDowngrade {
		switch {
		case Downgradeable(code):
			return ""
		case !registered:
			return CodeDowngradeErrorUnknownCode
		case LevelOf(code) == LevelWarning, LevelOf(code) == LevelInfo:
			return CodeDowngradeErrorAlreadyWarning
		default:
			return CodeDowngradeErrorNotDowngradeable
		}
	}
	switch {
	case Suppressible(code):
		return ""
	case registered:
		return CodeExpectErrorNotSuppressible
	default:
		return CodeExpectErrorUnknownCode
	}
}

// unusedCode is the code this directive earns when it acted on nothing.
func (directive Directive) unusedCode() string {
	if directive.Kind == DirectiveDowngrade {
		return CodeDowngradeErrorUnused
	}
	return CodeExpectErrorUnused
}

// PassScope says what a pass could report, so a directive is judged only where the answer is real: never in a
// file the pass did not read, a family it did not ask for (the build skips enrichment and mion-route, which the
// lint pass needs), or a code it cannot raise (Lacks). comment-expect-error-not-allowed / comment-expect-error-unknown-name need only Files; comment-expect-error-unused needs them all.
type PassScope struct {
	// Reports turns the comment-expect-error-* codes on. A pass that is only rewriting source
	// leaves it false and silences without judging.
	Reports bool
	// Files the pass examined, in the caller's own spelling normalized by the
	// same function ApplyDirectives was given. nil means every file.
	Files map[string]bool
	// Families the pass could raise. A directive is judged unused only when
	// every family it could cover is in here; the bare form covers all of them.
	Families map[Family]bool
	// Lacks is the conditions this pass does not meet; a code whose Raised needs one is never judged here.
	Lacks Raised
}

// sawFile reports whether the pass examined path.
func (scope PassScope) sawFile(path string) bool {
	return scope.Files == nil || scope.Files[path]
}

// canJudge reports whether this pass could have raised everything the directive
// covers, which is what makes "it silenced nothing" a fact rather than a guess.
func (scope PassScope) canJudge(directive Directive) bool {
	if len(directive.Codes) == 0 {
		// The bare form covers every code, so only a pass that can raise them all can call it unused.
		if scope.Lacks != 0 {
			return false
		}
		for _, family := range allFamilies {
			if !scope.Families[family] {
				return false
			}
		}
		return true
	}
	for _, code := range directive.Codes {
		definition := Definitions[code]
		if !scope.Families[definition.Family] || definition.Raised&scope.Lacks != 0 {
			return false
		}
	}
	return true
}

var allFamilies = []Family{FamilyPureFn, FamilyMarker, FamilyRunType, FamilyEnrich, FamilyMionRoute, FamilyDrizzle}

// directiveKey addresses one silenced line. Diagnostics and directives are
// matched on the file path as SPELLED in the site, which is the caller's own
// spelling on both sides.
type directiveKey struct {
	file string
	line int
}

// covers reports whether this directive acts on code. The bare form covers
// anything the kind may act on; a code list covers exactly what it names.
func (directive Directive) covers(code string) bool {
	if directive.Kind == DirectiveDowngrade {
		if !Downgradeable(code) {
			return false
		}
	} else if !Suppressible(code) {
		return false
	}
	return len(directive.Codes) == 0 || directive.namesCode(code)
}

// namesCode reports whether code appears in this directive's written list.
func (directive Directive) namesCode(code string) bool {
	for _, named := range directive.Codes {
		if named == code {
			return true
		}
	}
	return false
}

// named renders the directive's code list for the unused-directive message; the
// bare form reads as "any".
func (directive Directive) named() string {
	if len(directive.Codes) == 0 {
		return "any"
	}
	return strings.Join(directive.Codes, " ")
}
