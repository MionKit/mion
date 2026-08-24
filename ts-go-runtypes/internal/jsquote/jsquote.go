// Package jsquote renders Go strings as JS string literals for the
// emitted cache modules — one canonical implementation, formerly
// copy-pasted into typefns, purefns and formats/string. NOTE:
// runtype/module.go keeps its own strconv.Quote-based quoteJS on
// purpose: it escapes non-printables/unicode differently and the
// runTypes module bytes depend on that form.
package jsquote

import "strings"

// Single renders s as a single-quoted JS string literal, escaping the
// characters single-quote JS evaluation cares about. Single quotes
// keep the surrounding JSON envelope's escape budget small when the
// output is embedded in a serialized cache.
func Single(s string) string {
	var b strings.Builder
	b.Grow(len(s) + 2)
	b.WriteByte('\'')
	for _, r := range s {
		switch r {
		case '\\':
			b.WriteString(`\\`)
		case '\'':
			b.WriteString(`\'`)
		case '\n':
			b.WriteString(`\n`)
		case '\r':
			b.WriteString(`\r`)
		case '\t':
			b.WriteString(`\t`)
		default:
			b.WriteRune(r)
		}
	}
	b.WriteByte('\'')
	return b.String()
}

// Double renders s as a double-quoted JS string literal — used for
// regex sources passed to `new RegExp(...)`, which are dense with
// backslashes already (single-quoting them produces escaping noise).
func Double(s string) string {
	var b strings.Builder
	b.Grow(len(s) + 2)
	b.WriteByte('"')
	for _, r := range s {
		switch r {
		case '\\':
			b.WriteString(`\\`)
		case '"':
			b.WriteString(`\"`)
		case '\n':
			b.WriteString(`\n`)
		case '\r':
			b.WriteString(`\r`)
		case '\t':
			b.WriteString(`\t`)
		default:
			b.WriteRune(r)
		}
	}
	b.WriteByte('"')
	return b.String()
}
