package enrichment

// countBearingConstraints picks where a scaffold emits a plural object; elsewhere only the `other` arm would ever render.
// Read by emit.go and validate.go alike; a scaffold default only, the runtime renders a string at any constraint.
var countBearingConstraints = map[string]bool{
	"minLength": true,
	"maxLength": true,
	"min":       true,
	"max":       true,
	"lt":        true,
	"gt":        true,
}

// CountBearing reports whether a constraint's violated bound is a count, so its error template scaffolds as a plural object.
func CountBearing(constraint string) bool {
	return countBearingConstraints[constraint]
}
