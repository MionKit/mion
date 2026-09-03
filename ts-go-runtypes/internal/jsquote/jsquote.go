// Package jsquote renders Go strings as JS string literals for the
// emitted cache modules — one canonical implementation, formerly
// copy-pasted into typefns, purefns and formats/string. NOTE:
// runtype/module.go keeps its own strconv.Quote-based quoteJS on
// purpose: it escapes non-printables/unicode differently and the
// runTypes module bytes depend on that form.
//
// Beyond the quote and the backslash, the C0 control bytes (NUL included), DEL
// and the two Unicode line terminators (U+2028 / U+2029) are written as `\uXXXX`
// escapes: a committed .js never carries a raw control byte, and a
// type-derived name or literal can never end a line inside its literal.
package jsquote

import (
	"fmt"
	"strings"
)

// Single renders s as a single-quoted JS string literal, escaping the
// characters single-quote JS evaluation cares about. Single quotes
// keep the surrounding JSON envelope's escape budget small when the
// output is embedded in a serialized cache.
func Single(s string) string {
	return quote(s, '\'')
}

// Double renders s as a double-quoted JS string literal — used for
// regex sources passed to `new RegExp(...)`, which are dense with
// backslashes already (single-quoting them produces escaping noise).
func Double(s string) string {
	return quote(s, '"')
}

func quote(s string, delimiter rune) string {
	var b strings.Builder
	b.Grow(len(s) + 2)
	b.WriteRune(delimiter)
	for _, r := range s {
		switch {
		case r == '\\':
			b.WriteString(`\\`)
		case r == delimiter:
			b.WriteByte('\\')
			b.WriteRune(delimiter)
		case r == '\n':
			b.WriteString(`\n`)
		case r == '\r':
			b.WriteString(`\r`)
		case r == '\t':
			b.WriteString(`\t`)
		case r < 0x20 || r == 0x7f || r == 0x2028 || r == 0x2029:
			fmt.Fprintf(&b, `\u%04x`, r)
		default:
			b.WriteRune(r)
		}
	}
	b.WriteRune(delimiter)
	return b.String()
}
