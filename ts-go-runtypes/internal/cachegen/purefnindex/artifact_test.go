package purefnindex

import (
	"bytes"
	"reflect"
	"strings"
	"testing"
	"unicode/utf8"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/core"
	"github.com/microsoft/typescript-go/shim/parser"
	"github.com/microsoft/typescript-go/shim/scanner"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefunctions"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/entrymodules"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
)

// An artifact is what a build wrote: whatever a body holds (any text, any
// binding, any file path), the module the real renderer writes for it in each
// emit mode reads back to the same served row, the index round-trips, and two
// renders give the same bytes.
func FuzzArtifactRoundTrip(f *testing.F) {
	f.Add("slug00000000000", "slugify", "src/slug.ts", "return (s) => s.toLowerCase();", "utl", "@acme/text#pf_other000000000")
	f.Add("x", "", "", "", "", "")
	f.Add("h", "n", "src/a.ts", "return '</script>' + \"\\u2028\" + `\x00`;", "p", "")
	f.Add("h", "n", "src/ü.ts", "return 'é';", "ü", "@acme/text#pf_ß")
	f.Add("h", "n", "src/a.ts", "return function(){ return `}`; }", "p", "")
	// Two the fuzzer found: a param that is no identifier with a body that does
	// not parse, and a hash that is a dot (a legal file name, not a traversal).
	f.Add("0", "0", "0", "\"", "0", "0")
	f.Add(".", "0", "0", "0", "0", "")
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
			// package owns and the index parser must say so.
			id := "@acme/text" + constants.PureFnHashPrefix + hash
			if _, err := ParseArtifactIndex(RenderArtifactIndex("@acme/text", "/pkg", []purefunctions.Entry{{ID: id}})); err == nil && PackageOfID(id) != "@acme/text" {
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
		first := RenderArtifactIndex("@acme/text", "/pkg", []purefunctions.Entry{entry})
		if !bytes.Equal(first, RenderArtifactIndex("@acme/text", "/pkg", []purefunctions.Entry{entry})) {
			t.Fatal("two index renders differ")
		}
		if !bytes.HasSuffix(first, []byte("\n")) {
			t.Fatal("no trailing newline")
		}
		index, err := ParseArtifactIndex(first)
		if err != nil {
			t.Fatalf("parse: %v\n%s", err, first)
		}
		if len(index.PureFns) != 1 || index.PureFns[0].ID != entry.ID || index.PureFns[0].BindingName != binding {
			t.Fatalf("index = %+v", index)
		}
		if got, want := index.PureFns[0].File, relativeToRoot("/pkg", entry.FilePath); got != want {
			t.Fatalf("file = %q, want %q", got, want)
		}
		path := ModulePath(entry.ID)
		if !strings.HasSuffix(path, constants.EntryModuleSuffix) || strings.HasPrefix(path, constants.PureFnModuleDir+"/") {
			t.Fatalf("module path = %q", path)
		}
		for _, segment := range strings.Split(path, "/") {
			// A segment is never empty or a dot-only name, so the path stays
			// inside the artifact directory.
			if segment == "" || strings.Trim(segment, ".") == "" {
				t.Fatalf("module path %q escapes the directory", path)
			}
		}
		if got, want := constants.PureFnModuleDir+"/"+strings.TrimSuffix(path, constants.EntryModuleSuffix), entrymodules.ModuleName(entry.ID, entrymodules.KindPureFn); got != want {
			t.Fatalf("module path %q is not the cache module %q", path, want)
		}
		want := served(entry)
		want.BindingName = ""
		modes := []constants.EmitMode{constants.EmitCode}
		// A functions-mode module wraps the body in a live function literal,
		// which only a real body (an identifier per param, a block that
		// parses) survives; the extractor never hands the renderer anything
		// else, so the fuzzer does not either.
		if (param == "" || scanner.IsIdentifierText(param, core.LanguageVariantStandard)) && parsesAsBody(entry.ParamNames, code) {
			modes = append(modes, constants.EmitFunctions, constants.EmitBoth)
		}
		for _, mode := range modes {
			module := moduleFor(entry, mode)
			if module != moduleFor(entry, mode) {
				t.Fatalf("%s: two module renders differ", mode)
			}
			got, err := ReadModule(entry.ID, module)
			if err != nil {
				t.Fatalf("%s: read: %v\n%s", mode, err, module)
			}
			if !reflect.DeepEqual(got, want) {
				t.Fatalf("%s: round trip changed the row:\n got %+v\nwant %+v\n%s", mode, got, want, module)
			}
		}
	})
}

func parsesAsBody(paramNames []string, code string) bool {
	source := "(function(" + strings.Join(paramNames, ",") + "){" + code + "});\n"
	file := parser.ParseSourceFile(ast.SourceFileParseOptions{FileName: "/body.js", Path: "/body.js"}, source, core.ScriptKindJS)
	return file != nil && len(file.Diagnostics()) == 0
}

// Nothing to write means nothing: an app with no pure fn gets no directory.
func TestRenderArtifactIndex_EmptyIsNil(t *testing.T) {
	if got := RenderArtifactIndex("@acme/app", "/app", nil); got != nil {
		t.Errorf("expected nil, got %q", got)
	}
}
