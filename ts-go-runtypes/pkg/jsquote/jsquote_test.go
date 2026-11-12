package jsquote

import (
	"strings"
	"testing"
)

// Every emitted string literal in the cache modules goes through Single or
// Double, so the pair is the one place a type-derived name or literal could
// break out of its quotes. The table pins the characters that matter: the
// quote each form uses, the backslash, the line terminators (JS treats U+2028
// and U+2029 as line terminators too), the C0 controls (NUL included, so a
// committed .js never carries a raw control byte), DEL, and astral characters,
// which pass through untouched.
func TestSingle(t *testing.T) {
	cases := []struct{ in, want string }{
		{"", "''"},
		{"plain", "'plain'"},
		{"it's", "'it\\'s'"},
		{"say \"hi\"", "'say \"hi\"'"},
		{"back\\slash", "'back\\\\slash'"},
		{"ends with \\", "'ends with \\\\'"},
		{"line\nbreak", "'line\\nbreak'"},
		{"cr\rlf", "'cr\\rlf'"},
		{"tab\there", "'tab\\there'"},
		{"nul\x00byte", "'nul\\u0000byte'"},
		{"bell\x07", "'bell\\u0007'"},
		{"del\x7f", "'del\\u007f'"},
		{"ls\u2028ps\u2029", "'ls\\u2028ps\\u2029'"},
		{"caf\u00e9 \u4e2d \U0001F600", "'caf\u00e9 \u4e2d \U0001F600'"},
	}
	for _, c := range cases {
		if got := Single(c.in); got != c.want {
			t.Errorf("Single(%q) = %s, want %s", c.in, got, c.want)
		}
	}
}

func TestDouble(t *testing.T) {
	cases := []struct{ in, want string }{
		{"", "\"\""},
		{"say \"hi\"", "\"say \\\"hi\\\"\""},
		{"it's", "\"it's\""},
		{"^\\d+$", "\"^\\\\d+$\""},
		{"line\nbreak", "\"line\\nbreak\""},
		{"nul\x00byte", "\"nul\\u0000byte\""},
		{"ls\u2028ps\u2029", "\"ls\\u2028ps\\u2029\""},
	}
	for _, c := range cases {
		if got := Double(c.in); got != c.want {
			t.Errorf("Double(%q) = %s, want %s", c.in, got, c.want)
		}
	}
}

// The output never carries a raw line terminator or control byte: that is the
// property the generated-code corpus scan asserts over whole emitted modules.
func TestNoRawControlOrTerminator(t *testing.T) {
	var raw strings.Builder
	for r := rune(0); r < 0x20; r++ {
		raw.WriteRune(r)
	}
	raw.WriteRune(0x7f)
	raw.WriteString("\u2028\u2029'\"\\")
	for _, quoted := range []string{Single(raw.String()), Double(raw.String())} {
		for _, r := range quoted {
			if r < 0x20 || r == 0x7f || r == 0x2028 || r == 0x2029 {
				t.Fatalf("quoted output carries raw %U: %s", r, quoted)
			}
		}
	}
}
