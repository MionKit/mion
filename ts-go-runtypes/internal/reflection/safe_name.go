package reflection

// IsSafeName reports whether a property name is dot-access safe in emitted
// JS: ASCII letters, digits and underscore, not starting with a digit.
// Deliberately narrower than the JS identifier grammar (no `$`, no unicode):
// a name outside the set is simply quoted, which is always valid. One
// predicate for the projection (`IsSafeName` on the wire) and the enrichment
// mirror writers, so a key can never be emitted bare by one and quoted by
// the other. Hand-rolled byte loop: it runs once per projected property and
// the regexp engine was measurable churn.
func IsSafeName(name string) bool {
	if name == "" {
		return false
	}
	for i := 0; i < len(name); i++ {
		c := name[i]
		switch {
		case c >= 'a' && c <= 'z', c >= 'A' && c <= 'Z', c == '_':
		case c >= '0' && c <= '9':
			if i == 0 {
				return false
			}
		default:
			return false
		}
	}
	return true
}
