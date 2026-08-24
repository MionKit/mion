package enrichment

// Count-bearing constraint classification — the single shared table behind
// generator-owned plurals (friendly-type i18n, §4). A constraint
// whose violated bound is a COUNT can pluralize its message, so the scaffold
// emits a plural OBJECT there (arms per the file-locale's CLDR categories) and
// a plain STRING everywhere else (an object would have dead arms — only
// `other` ever renders). Both the emitter (emit.go) and the checker
// (validate.go) read this table so they can never disagree.
//
// The kind is a SCAFFOLD default, not a straitjacket: the runtime renders a
// string at any constraint (an author may simplify a plural to a string), and
// the i18n reconcile mirrors the SOURCE's actual leaf kind — the table only
// shapes what fresh scaffolds look like and lets the checker flag dead-arm
// plural objects on non-count-bearing constraints.
var countBearingConstraints = map[string]bool{
	"minLength": true,
	"maxLength": true,
	"min":       true,
	"max":       true,
	"lt":        true,
	"gt":        true,
}

// CountBearing reports whether a constraint key's violated bound is a count —
// i.e. whether its error template scaffolds as a plural object.
func CountBearing(constraint string) bool {
	return countBearingConstraints[constraint]
}
