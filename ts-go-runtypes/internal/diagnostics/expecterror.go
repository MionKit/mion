package diagnostics

import "strings"

// expecterror.go holds the SEMANTICS of the `@mion-expect-error` directive:
// which codes a directive may silence, which diagnostics it silences, and the
// EXP codes a wrong directive earns. Finding the comments and turning byte
// offsets into line numbers is the caller's job (the resolver holds the parse
// and the line map), so this package stays free of any compiler dependency.
//
// The contract follows TypeScript's `@ts-expect-error`: the directive sits on
// the line above a finding and REMOVES it, and a directive that silenced nothing
// is itself reported (EXP001). That reverse check is the reason the directive is
// safer than a config-level ignore list: a silencer cannot quietly outlive the
// problem it was added for. It is reported as a WARNING, unlike TypeScript's,
// which is an error: a comment that has gone stale says nothing about the
// emitted code, so it must not fail a build.

// DirectiveMarker is the word a suppression comment starts with. The comment
// must be the first thing on its own line; a trailing comment after code is
// deliberately not a directive, so there is never a question of whether it
// applies to the line it sits on or the next one.
const DirectiveMarker = "@mion-expect-error"

// Directive is one parsed `@mion-expect-error` comment.
type Directive struct {
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
// LevelError code. A directive cannot silence the check that keeps directives
// honest, or the two that report a malformed one.
var notSuppressible = map[string]bool{
	CodeExpectErrorUnused:          true,
	CodeExpectErrorNotSuppressible: true,
	CodeExpectErrorUnknownCode:     true,
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

// ApplyExpectErrors removes every diagnostic a directive silences and returns
// the survivors, followed by the EXP diagnostics the directives themselves
// earned. Order among survivors is preserved.
//
// A directive that named a bad code (EXP002 / EXP003) does NOT additionally
// report EXP001: the user has one problem to fix, not two.
//
// normalize puts both sides' file paths in one spelling before they are
// compared. Diagnostic sites echo the CALLER's spelling of a file while a
// directive is found through the program's resolved path, so without it a
// relative request would never match. Pass nil to compare paths verbatim.
//
// scope says what the calling pass could actually report, which is what keeps
// the EXP codes from firing on a question this pass cannot answer. See PassScope.
func ApplyExpectErrors(list []Diagnostic, directives []Directive, normalize func(string) string, scope PassScope) []Diagnostic {
	if len(directives) == 0 {
		return list
	}
	if normalize == nil {
		normalize = func(path string) string { return path }
	}
	// Index directives by the line they silence. Only the comment immediately
	// above a finding counts, so at most one directive claims a given line.
	byLine := make(map[directiveKey]int, len(directives))
	for index, directive := range directives {
		byLine[directiveKey{file: normalize(directive.Site.FilePath), line: directive.AppliesToLine}] = index
	}
	used := make([]bool, len(directives))

	survivors := make([]Diagnostic, 0, len(list))
	for _, diagnostic := range list {
		index, claimed := byLine[directiveKey{file: normalize(diagnostic.Site.FilePath), line: diagnostic.Site.StartLine}]
		if claimed && directives[index].covers(diagnostic.Code) {
			used[index] = true
			continue
		}
		survivors = append(survivors, diagnostic)
	}

	if !scope.Reports {
		return survivors
	}
	for index, directive := range directives {
		if !scope.sawFile(normalize(directive.Site.FilePath)) {
			continue
		}
		malformed := false
		for _, code := range directive.Codes {
			if Suppressible(code) {
				continue
			}
			malformed = true
			if _, registered := Definitions[code]; registered {
				survivors = append(survivors, New(CodeExpectErrorNotSuppressible, directive.Site, code))
			} else {
				survivors = append(survivors, New(CodeExpectErrorUnknownCode, directive.Site, code))
			}
		}
		if malformed || used[index] || !scope.canJudge(directive) {
			continue
		}
		survivors = append(survivors, New(CodeExpectErrorUnused, directive.Site, directive.named()))
	}
	return survivors
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
	// same function ApplyExpectErrors was given. nil means every file.
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

// covers reports whether this directive silences code. The bare form covers
// anything suppressible; a code list covers exactly what it names.
func (directive Directive) covers(code string) bool {
	if !Suppressible(code) {
		return false
	}
	if len(directive.Codes) == 0 {
		return true
	}
	for _, named := range directive.Codes {
		if named == code {
			return true
		}
	}
	return false
}

// named renders the directive's code list for the EXP001 message; the bare
// form reads as "any".
func (directive Directive) named() string {
	if len(directive.Codes) == 0 {
		return "any"
	}
	return strings.Join(directive.Codes, " ")
}
