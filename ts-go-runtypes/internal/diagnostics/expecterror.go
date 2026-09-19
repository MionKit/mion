package diagnostics

import "strings"

// expecterror.go holds the SEMANTICS of the two source-level directives: which
// codes each may act on, which diagnostics it acts on, and the EXP / DWN codes a
// wrong directive earns. Finding the comments and turning byte offsets into line
// numbers is the caller's job (the resolver holds the parse and the line map), so
// this package stays free of any compiler dependency.
//
// The contract follows TypeScript's `@ts-expect-error`: the directive sits on
// the line above a finding, and one that did nothing is itself reported. That
// reverse check is the reason a directive is safer than a config-level list: it
// cannot quietly outlive the problem it was added for. It is reported as a
// WARNING, unlike TypeScript's, which is an error: a comment that has gone stale
// says nothing about the emitted code, so it must not fail a build.
//
// The two differ only in what they do to the finding:
//
//   - `@mion-expect-error` REMOVES it. Use it when the finding is noise at that
//     site.
//   - `@mion-downgrade-error` KEEPS it and marks it downgraded, so it still
//     prints and no longer halts. Use it when the finding is TRUE and worth
//     seeing, and only the halt is unwanted — a suite pinning what a broken type
//     does at runtime. Removing such a finding would hide a correct statement
//     about the code.
//
// Either word reaches one line or a whole file (see DirectiveScope). A file whose
// every call site raises the same finding says it once at the top instead of
// carrying the identical comment forty times.

// DirectiveMarker is the word a suppression comment starts with, and
// DowngradeDirectiveMarker its downgrading sibling. Either comment must be the
// first thing on its own line; a trailing comment after code is deliberately not
// a directive, so there is never a question of whether it applies to the line it
// sits on or the next one.
const (
	DirectiveMarker          = "@mion-expect-error"
	DowngradeDirectiveMarker = "@mion-downgrade-error"
)

// DirectiveScope says how far a directive reaches. The two words are the same at
// either scope; the comment's SHAPE picks between them, which is how ESLint
// tells its file-wide `/* eslint-disable */` from its `// eslint-disable-next-line`.
// A block comment before any code covers the file, everything else covers the
// next line. The caller works that out; this package only acts on the answer.
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
	// Scope is how far it reaches. DirectiveScopeFile ignores AppliesToLine.
	Scope DirectiveScope
	// AppliesToLine is the 1-based line the directive silences: the line after
	// the comment's own last line.
	AppliesToLine int
	// Codes are the diagnostic codes the directive names, in written order. An
	// empty slice is the BARE form (`// @mion-expect-error` with nothing after
	// it), which covers any suppressible code reported on that line.
	Codes []string
	// Site is the comment's own span, where the EXP codes anchor so the squiggle
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

// Downgradeable reports whether a directive is allowed to lower code to a
// warning. Only a LevelRuntimeError is: output exists, so printing it and
// carrying on is a legitimate choice.
//
// A LevelError never is, the same rule `downgradeErrors` applies — the build
// produced no code for the thing, so not halting would only ship a call that
// throws anyway. A LevelWarning is already a warning, so the directive would do
// nothing. An unrecognised code is not downgradeable either. The caller reports
// each of those three as its own DWN code, because the fix differs.
func Downgradeable(code string) bool {
	definition, registered := Definitions[code]
	return registered && definition.Level == LevelRuntimeError
}

// Suppressible reports whether a directive is allowed to silence code.
//
// A LevelError code never is: it means the build cannot produce output at all,
// so continuing would ship missing output rather than merely risky output. That
// is the same rule the bundler plugin applies when it halts on LevelError
// regardless of how findings are otherwise configured. A LevelRuntimeError IS
// suppressible: output exists, and the author may have written the bad type on
// purpose (a test suite that checks what a broken validator does at runtime).
//
// An unrecognised code is not suppressible either, but the caller reports that
// as EXP003 (a typo) rather than EXP002.
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

// ApplyDirectives applies every directive and returns the survivors, followed by
// the EXP / DWN diagnostics the directives themselves earned. An expect
// directive removes the finding it claims; a downgrade directive keeps it and
// marks it Downgraded. Order among survivors is preserved.
//
// A directive that named a bad code does NOT additionally report its unused
// code: the user has one problem to fix, not two.
//
// normalize puts both sides' file paths in one spelling before they are
// compared. Diagnostic sites echo the CALLER's spelling of a file while a
// directive is found through the program's resolved path, so without it a
// relative request would never match. Pass nil to compare paths verbatim.
//
// scope says what the calling pass could actually report, which is what keeps
// the EXP codes from firing on a question this pass cannot answer. See PassScope.
func ApplyDirectives(list []Diagnostic, directives []Directive, normalize func(string) string, scope PassScope) []Diagnostic {
	if len(directives) == 0 {
		return list
	}
	if normalize == nil {
		normalize = func(path string) string { return path }
	}
	// Index directives by the line they silence. Only the comment immediately
	// above a finding counts, so at most one directive claims a given line. File
	// directives are indexed by file instead, and a file may carry several (one
	// per kind, or several naming different codes).
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
		// Every claimer counts as used, not just the one whose action won. That
		// is what keeps a file comment from turning the line comments it covers
		// into forty "this silenced nothing" reports: each still claims its own
		// finding. A line comment on a line that raises nothing was already
		// stale before the file comment arrived, and is still reported.
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
		// Removing wins over lowering: a finding cannot be both gone and printed.
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

// malformedCode reports the code this directive earns for naming `code`, or ""
// when naming it is fine. The three downgrade cases are kept apart because the
// fix differs: a LevelError cannot be lowered at all, an unknown code is a typo,
// and an already-warning code means the halt the author expected never existed.
func (directive Directive) malformedCode(code string) string {
	_, registered := Definitions[code]
	if directive.Kind == DirectiveDowngrade {
		switch {
		case Downgradeable(code):
			return ""
		case !registered:
			return CodeDowngradeErrorUnknownCode
		case LevelOf(code) == LevelWarning:
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

// PassScope says what the pass that produced a diagnostic list could report, so
// a check only runs where its answer is real.
//
// Two things vary per pass and both used to be assumed:
//
//   - WHICH FILES it looked at. A per-file lint pass holds one file's findings,
//     so a directive in some other file has not been given a chance to silence
//     anything and must not be judged.
//   - WHICH FAMILIES it could raise. The enrichment and mion-route families are
//     opt-in per request, and the whole-program build pass never asks for them.
//     Judging a `@mion-expect-error MRT002` there reported it unused while the
//     editor's lint pass silenced it correctly, so the build demanded the
//     deletion of a comment the editor needed.
//
// The malformed-directive checks (EXP002 / EXP003) read the comment text alone,
// so they need only Files. EXP001 additionally needs Families, because "this
// silenced nothing" is only true if the pass could have raised the thing it
// names.
type PassScope struct {
	// Reports turns the EXP codes on. A pass that is only rewriting source
	// leaves it false and silences without judging.
	Reports bool
	// Files the pass examined, in the caller's own spelling normalized by the
	// same function ApplyDirectives was given. nil means every file.
	Files map[string]bool
	// Families the pass could raise. A directive is judged unused only when
	// every family it could cover is in here; the bare form covers all of them.
	Families map[Family]bool
}

// sawFile reports whether the pass examined path.
func (scope PassScope) sawFile(path string) bool {
	return scope.Files == nil || scope.Files[path]
}

// canJudge reports whether this pass could have raised everything the directive
// covers, which is what makes "it silenced nothing" a fact rather than a guess.
func (scope PassScope) canJudge(directive Directive) bool {
	if len(directive.Codes) == 0 {
		// The bare form covers every family, so only a pass that raised them all
		// can call it unused.
		for _, family := range allFamilies {
			if !scope.Families[family] {
				return false
			}
		}
		return true
	}
	for _, code := range directive.Codes {
		if !scope.Families[Definitions[code].Family] {
			return false
		}
	}
	return true
}

// allFamilies is every family a directive could ever silence.
var allFamilies = []Family{FamilyPureFn, FamilyMarker, FamilyRunType, FamilyEnrich, FamilyMionRoute}

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
