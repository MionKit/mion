package reflection

// IsSafeName reports whether name is dot-access safe in emitted JS: ASCII letters, digits, underscore, no leading digit.
// Narrower than JS identifiers on purpose (quoting is always valid); one predicate so writers never disagree on a key.
// Hand-rolled byte loop: it runs once per projected property and regexp was measurable churn.
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
