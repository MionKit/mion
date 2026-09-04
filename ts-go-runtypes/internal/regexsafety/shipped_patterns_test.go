package regexsafety

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// The patterns the framework itself ships are the check's real
// acceptance bar: they are dense, they nest quantifiers, and they are
// fine. A check that fails any of them is too blunt to turn on.
func TestShippedFormatPatternsPass(t *testing.T) {
	root := filepath.Join("..", "..", "..", "packages", "run-types", "src", "formats")
	if _, err := os.Stat(root); err != nil {
		t.Skipf("format sources not available: %v", err)
	}
	var files []string
	err := filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if !info.IsDir() && strings.HasSuffix(path, ".ts") {
			files = append(files, path)
		}
		return nil
	})
	if err != nil {
		t.Fatalf("walking %s: %v", root, err)
	}
	checked := 0
	for _, file := range files {
		content, err := os.ReadFile(file)
		if err != nil {
			t.Fatalf("reading %s: %v", file, err)
		}
		for _, pattern := range registeredPatterns(string(content)) {
			checked++
			finding, found := Check(pattern.source, pattern.flags)
			if found {
				t.Errorf("%s: shipped pattern /%s/%s reported as unsafe: %s (%s)",
					filepath.Base(file), pattern.source, pattern.flags, finding.Reason, finding.Excerpt)
			}
		}
	}
	if checked == 0 {
		t.Fatal("no shipped patterns found: the extraction below stopped matching the sources")
	}
	t.Logf("checked %d shipped patterns", checked)
}

type shippedPattern struct {
	source string
	flags  string
}

// registeredPatterns pulls the `source:` (and any following `flags:`)
// string literals out of a formats source file. The registrations spell
// both as plain literals on purpose, so that the Go scanner can recover
// them from a published .d.ts, which is what makes this extraction
// possible here too.
func registeredPatterns(content string) []shippedPattern {
	var out []shippedPattern
	rest := content
	for {
		index := strings.Index(rest, "source:")
		if index < 0 {
			return out
		}
		rest = rest[index+len("source:"):]
		literal, remainder, ok := cutStringLiteral(rest)
		if !ok {
			continue
		}
		rest = remainder
		pattern := shippedPattern{source: unescapeJS(literal)}
		// `flags` rides the entry it belongs to, between this `source`
		// and the next one.
		tail := rest
		if next := strings.Index(tail, "source:"); next >= 0 {
			tail = tail[:next]
		}
		if flagIndex := strings.Index(tail, "flags:"); flagIndex >= 0 {
			if flagLiteral, _, okFlags := cutStringLiteral(tail[flagIndex+len("flags:"):]); okFlags {
				pattern.flags = unescapeJS(flagLiteral)
			}
		}
		out = append(out, pattern)
	}
}

// cutStringLiteral skips the whitespace after a property name and
// returns the body of the string literal that follows, single or double
// quoted (the sources use both, since a few patterns contain a quote).
func cutStringLiteral(text string) (literal, rest string, ok bool) {
	start := 0
	for start < len(text) && (text[start] == ' ' || text[start] == '\n' || text[start] == '\t' || text[start] == '\r') {
		start++
	}
	if start >= len(text) || (text[start] != '\'' && text[start] != '"') {
		return "", "", false
	}
	quote := text[start]
	body := text[start+1:]
	for index := 0; index < len(body); index++ {
		switch body[index] {
		case '\\':
			index++
		case quote:
			return body[:index], body[index+1:], true
		case '\n':
			return "", "", false
		}
	}
	return "", "", false
}

func unescapeJS(literal string) string {
	var out strings.Builder
	for index := 0; index < len(literal); index++ {
		if literal[index] != '\\' || index+1 >= len(literal) {
			out.WriteByte(literal[index])
			continue
		}
		index++
		switch literal[index] {
		case 'n':
			out.WriteByte('\n')
		case 'r':
			out.WriteByte('\r')
		case 't':
			out.WriteByte('\t')
		default:
			out.WriteByte(literal[index])
		}
	}
	return out.String()
}
