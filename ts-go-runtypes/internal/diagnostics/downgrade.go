package diagnostics

import "fmt"

// downgrade.go is the `downgradeErrors` rule: report a named Error code as a
// Warning instead, so one known finding stops halting a build while every
// other Error still does.
//
// It DOWNGRADES, it never hides. The finding is still printed on every build,
// which is the difference between "unblock me" and "make this problem
// invisible", and the reason it is preferred over an ignore list. Compare
// `@mion-expect-error`, which removes a finding outright but is site-local and
// self-cleaning.
//
// Severity on the wire stays whatever the catalog says. Severity is
// informational (see the Severity doc) and what acts on it is the consumer, so
// the downgrade is applied by the consumers that decide whether to halt: the
// bundler plugin, and `mion compile` for its exit code.

// DowngradeAll is the wildcard shape of `downgradeErrors`: every Error code is
// reported as a Warning. It is the blunt instrument, kept for adoption, where a
// project turning mion on cannot yet list the codes it has not met. Naming
// codes is what a project should reach for once it knows them.
const DowngradeAll = "*"

// DowngradeSet is a resolved `downgradeErrors` value: either the wildcard or an
// explicit set of codes. The zero value downgrades nothing, which is the strict
// default.
type DowngradeSet struct {
	all   bool
	codes map[string]bool
}

// ResolveDowngrade validates a configured value and resolves it into a set.
//
// `["*"]` is accepted as the wildcard too, so the tsconfig spelling and the
// plugin spelling agree. An unknown code is an error, because a typo would
// otherwise read as a working downgrade that protects nothing. A pure-fn code
// is an error, because those halt regardless (see Suppressible). A Warning or
// Info code is accepted and simply does nothing: a code's severity may soften
// between releases, and that must never break a consumer's build.
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
		if definition.Family == FamilyPureFn {
			return DowngradeSet{}, fmt.Errorf(
				"downgradeErrors: %q cannot be downgraded — a pure-function error means generation failed, so the build would ship missing output", value)
		}
		if set.codes == nil {
			set.codes = map[string]bool{}
		}
		set.codes[value] = true
	}
	return set, nil
}

// Downgraded reports whether this diagnostic should be treated as a Warning.
// Only Error severity is ever downgraded, and never the pure-fn family, so the
// wildcard reproduces exactly what the old `failOnError: false` did.
func (set DowngradeSet) Downgraded(diagnostic Diagnostic) bool {
	if diagnostic.Severity != SeverityError || diagnostic.Family == FamilyPureFn {
		return false
	}
	return set.all || set.codes[diagnostic.Code]
}

// All reports whether the set is the wildcard. Consumers that gate on
// something other than a diagnostic — the enrichment build gate also halts on
// stale mirror FILES, which carry no code — read this.
func (set DowngradeSet) All() bool {
	return set.all
}

// Empty reports whether the set downgrades nothing.
func (set DowngradeSet) Empty() bool {
	return !set.all && len(set.codes) == 0
}

// DowngradedNote marks a finding that a `downgradeErrors` setting lowered, so
// it never reads as a warning that was always a warning. Both consumers print
// it: `mion compile` after FormatDebug, the bundler plugin inside the tsc-shaped
// line (after the message, so the `$tsc` problem matcher still parses it).
const DowngradedNote = "(downgraded)"
