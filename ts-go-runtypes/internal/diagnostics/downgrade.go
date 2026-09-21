package diagnostics

import "fmt"

// downgrade.go is the `downgradeErrors` rule: report a named RuntimeError code as a Warning, so one
// known finding stops halting a build while every other one still does. It DOWNGRADES and never
// hides, which is why it is preferred over an ignore list; `@mion-expect-error` removes a finding
// outright but is site-local and self-cleaning. What may be downgraded follows the LEVEL: a
// LevelRuntimeError can, a LevelError never can, having no output to carry on with. Severity on the
// wire stays whatever the catalog says, so the downgrade is applied by the consumers that decide
// whether to halt: the bundler plugin, and `mion compile` for its exit code.

// DowngradeAll reports every RuntimeError code as a Warning, and never reaches a LevelError. Kept
// for adoption: a project turning mion on cannot yet list the codes it has not met.
const DowngradeAll = "*"

// DowngradeSet is a resolved `downgradeErrors` value: either the wildcard or an
// explicit set of codes. The zero value downgrades nothing, which is the strict
// default.
type DowngradeSet struct {
	all   bool
	codes map[string]bool
}

// ResolveDowngrade validates a configured value and resolves it into a set. `["*"]` is the wildcard
// too, so the tsconfig and plugin spellings agree. An unknown code errors, since a typo would read
// as a working downgrade; a LevelError code errors, having no output to accept. A LevelWarning code
// is accepted and does nothing: a level may soften between releases and must not break a build.
func ResolveDowngrade(values []string) (DowngradeSet, error) {
	set := DowngradeSet{}
	for _, value := range values {
		if value == DowngradeAll {
			set.all = true
			continue
		}
		definition, registered := Definitions[value]
		if !registered {
			return DowngradeSet{}, fmt.Errorf("downgradeErrors: unknown diagnostic code %q", value)
		}
		if definition.Level == LevelError {
			return DowngradeSet{}, fmt.Errorf(
				"downgradeErrors: %q cannot be downgraded — it means the build cannot produce output, so carrying on would ship missing output", value)
		}
		if set.codes == nil {
			set.codes = map[string]bool{}
		}
		set.codes[value] = true
	}
	return set, nil
}

// Downgraded reports whether this diagnostic should be treated as a Warning. Only a
// LevelRuntimeError is ever downgraded: a LevelError has no output to accept, a LevelWarning is
// already one. The level is read off the WIRE, so a code this build's catalog does not know still
// answers correctly.
func (set DowngradeSet) Downgraded(diagnostic Diagnostic) bool {
	if diagnostic.Level != LevelRuntimeError {
		return false
	}
	return set.all || set.codes[diagnostic.Code]
}

// All reports whether the set is the wildcard, for a consumer gating on something that carries no
// code (the enrichment build gate also halts on stale mirror FILES).
func (set DowngradeSet) All() bool {
	return set.all
}

// Empty reports whether the set downgrades nothing.
func (set DowngradeSet) Empty() bool {
	return !set.all && len(set.codes) == 0
}

// DowngradedNote marks a finding `downgradeErrors` lowered, so it never reads as a warning that
// always was one. `mion compile` prints it after FormatDebug; the bundler plugin puts it after the
// message, where the `$tsc` problem matcher still parses the line.
const DowngradedNote = "(downgraded)"
