package purefnindex

import (
	"bytes"
	"reflect"
	"strings"
	"testing"
	"unicode/utf8"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefunctions"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
)

// An artifact is data: whatever a body holds (any text, any binding, any file
// path), rendering it and reading it back gives the same served row, and two
// renders give the same bytes.
func FuzzArtifactRoundTrip(f *testing.F) {
	f.Add("slug00000000000", "slugify", "src/slug.ts", "return (s) => s.toLowerCase();", "utl", "@acme/text#pf_other000000000")
	f.Add("x", "", "", "", "", "")
	f.Add("h", "n", "src/a.ts", "return '</script>' + \"\\u2028\" + `\x00`;", "p", "")
	f.Add("h", "n", "src/ü.ts", "return 'é';", "ü", "@acme/text#pf_ß")
	f.Fuzz(func(t *testing.T, hash, binding, file, code, param, dep string) {
		for _, text := range []string{hash, binding, file, code, param, dep} {
			// Every field comes out of parsed TypeScript, which is valid UTF-8;
			// JSON cannot carry anything else.
			if !utf8.ValidString(text) {
				t.Skip()
			}
		}
		if strings.Contains(hash, "#") {
			// A hash never holds the separator; such an id is not one this
			// package owns and the parser must say so.
			id := "@acme/text" + constants.PureFnHashPrefix + hash
			if _, err := ParseArtifact(RenderArtifact("@acme/text", "/pkg", []purefunctions.Entry{{ID: id}})); err == nil && PackageOfID(id) != "@acme/text" {
				t.Fatalf("an id owned by another package was accepted: %q", id)
			}
			return
		}
		entry := purefunctions.Entry{
			ID:                 "@acme/text" + constants.PureFnHashPrefix + hash,
			BindingName:        binding,
			ParamNames:         []string{param},
			Code:               code,
			PureFnDependencies: []string{dep},
			FilePath:           "/pkg/" + file,
			FactoryArgStart:    7,
			IDInjectText:       ", 'x'",
		}
		if dep == "" {
			entry.PureFnDependencies = nil
		}
		if param == "" {
			entry.ParamNames = nil
		}
		first := RenderArtifact("@acme/text", "/pkg", []purefunctions.Entry{entry})
		second := RenderArtifact("@acme/text", "/pkg", []purefunctions.Entry{entry})
		if !bytes.Equal(first, second) {
			t.Fatal("two renders differ")
		}
		if !bytes.HasSuffix(first, []byte("\n")) {
			t.Fatal("no trailing newline")
		}
		parsed, err := ParseArtifact(first)
		if err != nil {
			t.Fatalf("parse: %v\n%s", err, first)
		}
		if len(parsed.PureFns) != 1 {
			t.Fatalf("rows = %d", len(parsed.PureFns))
		}
		want := served(entry)
		if got := parsed.PureFns[0].Entry(); !reflect.DeepEqual(got, want) {
			t.Fatalf("round trip changed the row:\n got %+v\nwant %+v", got, want)
		}
		if got, want := parsed.PureFns[0].File, relativeToRoot("/pkg", entry.FilePath); got != want {
			t.Fatalf("file = %q, want %q", got, want)
		}
	})
}

// Nothing to write means nothing: an app with no pure fn gets no file.
func TestRenderArtifact_EmptyIsNil(t *testing.T) {
	if got := RenderArtifact("@acme/app", "/app", nil); got != nil {
		t.Errorf("expected nil, got %q", got)
	}
}
