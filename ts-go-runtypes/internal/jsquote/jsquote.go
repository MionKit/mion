// Package jsquote renders Go strings as JS string literals for the emitted cache modules.
// runtype/module.go keeps its own strconv.Quote-based quoteJS on purpose: the runTypes module bytes depend on that form.
// C0 controls (NUL included), DEL and U+2028 / U+2029 become `\uXXXX`, so no emitted .js carries a raw control byte or ends a line inside a literal.
package jsquote

import (
	"fmt"
	"strings"
)

// Single renders s as a single-quoted JS string literal; single quotes keep the escape budget small inside a serialized cache.
func Single(s string) string {
	return quote(s, '\'')
}

// Double renders s as a double-quoted JS string literal, for `new RegExp(...)` sources already dense with backslashes.
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
