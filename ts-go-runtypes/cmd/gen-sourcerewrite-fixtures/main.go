// gen-sourcerewrite-fixtures regenerates the rewrite + source-map fixtures the
// internal/compiler/sourcerewrite tests pin against:
//
//   - testdata/<name>.json      — one object per primary case (TestApply_Fixtures,
//     TestComputeEdits_MatchesApply)
//   - testdata/extra/cases.json — one array of named cases (TestApply_ExtraDiff)
//
// It replaces the deleted testdata/gen_golden.mjs + testdata/extra/diff_extra.mjs,
// whose JS rewrite() oracle was removed in 7031676c (Go owns the transform). The
// wire OpTransform is NOT a usable oracle for these fixtures: an OpTransform
// request carries only file paths and the resolver computes sites/replacements
// itself from a real type-check scan, so it cannot accept the SYNTHETIC sites the
// fixtures pin (fabricated typeIds, multi-fn binding arrays, hand-authored pure-fn
// replacements). Those synthetic inputs feed the lower-level entry point
// sourcerewrite.Apply(file, source, sites, replacements) directly — the same
// function the tests exercise — so this generator calls Apply directly. No binary,
// no JS, no type-checking.
//
// With the independent JS oracle gone, TestApply_Fixtures is a SNAPSHOT/regression
// test: the committed JSON is the reviewed baseline, and any change to Apply /
// EditBuffer / the VLQ source-map math fails it until the fixtures are regenerated
// and the diff re-reviewed. The surviving differential is internal —
// TestComputeEdits_MatchesApply pins the 'edits' wire path (ComputeEdits +
// applyComputed) byte-identical to Apply over this same corpus.
//
// Byte offsets are native in Go: strings.Index returns a UTF-8 byte offset, which
// is exactly what protocol.Site.Pos / Replacement.Start/End carry — no
// Buffer.byteLength dance (the JS original had to convert char indices to bytes).
//
// Run (from anywhere in the module; the testdata dir is anchored to this source
// file, so CWD does not matter):
//
//	go -C ts-go-runtypes run ./cmd/gen-sourcerewrite-fixtures
package main

import (
	"bytes"
	"encoding/json"
	"log"
	"os"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/sourcerewrite"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// fixture is the JSON shape each fixture file (or array element) carries. It
// mirrors fixtureCase in transform_test.go, plus the optional Name the extra/
// array form stamps (the primary per-file form omits it — the filename is the
// name). Field order matches the committed files so a regen stays a clean diff.
type fixture struct {
	Name         string                 `json:"name,omitempty"`
	File         string                 `json:"file"`
	Code         string                 `json:"code"`
	Sites        []protocol.Site        `json:"sites"`
	Replacements []protocol.Replacement `json:"replacements"`
	ExpectedCode string                 `json:"expectedCode"`
	ExpectedMap  *protocol.SourceMap    `json:"expectedMap"`
}

// fixtureCase is one corpus entry: a name, the source, and a builder that computes
// its synthetic sites/replacements from the source text (so offsets recompute
// whenever the source is perturbed — never hand-pinned).
type fixtureCase struct {
	name  string
	file  string
	code  string
	build func(code string) ([]protocol.Site, []protocol.Replacement)
}

// byteIndexOf returns the UTF-8 byte offset of the first `needle` at or after byte
// offset `from`. Panics if absent — a corpus authoring bug, never a runtime input.
func byteIndexOf(code, needle string, from int) int {
	rel := strings.Index(code[from:], needle)
	if rel < 0 {
		log.Fatalf("gen-sourcerewrite-fixtures: needle %q not found in %q (from %d)", needle, code, from)
	}
	return from + rel
}

// site is a terse protocol.Site constructor for the corpus below.
func site(pos int, id string) protocol.Site {
	return protocol.Site{File: "a.ts", Pos: pos, ID: id, ParamIndex: 1}
}

// primaryCases mirror the old gen_golden.mjs corpus. The createX callees now use
// the real API names (createValidateFn); reflection (getRunTypeId) and the
// illustrative callees (createStandardSchema multi-fn demo, marker,
// registerPureFnFactory) keep their original identifiers — the callee text is
// immaterial to the byte-offset / source-map mechanics under test.
var primaryCases = []fixtureCase{
	// 1. static getRunTypeId<T>() — id only, paramIndex 1, argsCount 0.
	{"static_get", "a.ts", "const id = getRunTypeId<string>();\n", func(code string) ([]protocol.Site, []protocol.Replacement) {
		return []protocol.Site{site(byteIndexOf(code, ")", 0), "Abc1234")}, nil
	}},
	// 2. reflect getRunTypeId(value) — argsCount 1, binding lands as 2nd arg.
	{"reflect_value", "a.ts", "const s = 'hello';\nconst id = getRunTypeId(s);\n", func(code string) ([]protocol.Site, []protocol.Replacement) {
		pos := byteIndexOf(code, ")", strings.Index(code, "getRunTypeId"))
		s := site(pos, "Abc1234")
		s.ArgsCount = 1
		return []protocol.Site{s}, nil
	}},
	// 3. multi-fn array — fnIds:[val,verr], paramIndex 2, argsCount 0.
	{"multi_fn", "a.ts", "const schema = createStandardSchema<User>();\n", func(code string) ([]protocol.Site, []protocol.Replacement) {
		s := site(byteIndexOf(code, ")", 0), "Usr9999")
		s.ParamIndex = 2
		s.FnId = "val"
		s.FnIds = []string{"val", "verr"}
		return []protocol.Site{s}, nil
	}},
	// 4. trailing-comma — trailingComma:true; argsCount 1 but list already ends
	//    with a comma, so no leading comma is injected.
	{"trailing_comma", "a.ts", "const v = createValidateFn<Foo>({\n  noLiterals: true,\n},);\n", func(code string) ([]protocol.Site, []protocol.Replacement) {
		s := site(byteIndexOf(code, ")", 0), "Foo5678")
		s.ArgsCount = 1
		s.FnId = "val"
		s.TrailingComma = true
		return []protocol.Site{s}, nil
	}},
	// 5. pure-fn Replacement — start<end span edit with importFrom.
	{"pure_fn_replace", "a.ts", "registerPureFnFactory('rt::foo', () => 1);\n", func(code string) ([]protocol.Site, []protocol.Replacement) {
		start := byteIndexOf(code, "() => 1", 0)
		return nil, []protocol.Replacement{{File: "a.ts", Start: start, End: start + len("() => 1"), Text: "__rt_pf_rt_foo", ImportFrom: "rtmod:/pf/rt/foo.js"}}
	}},
	// 6. zero-width Replacement — start==end (appendLeft of text, no importFrom).
	{"zero_width_replace", "a.ts", "const x = marker(1, 2);\n", func(code string) ([]protocol.Site, []protocol.Replacement) {
		at := byteIndexOf(code, ")", 0)
		return nil, []protocol.Replacement{{File: "a.ts", Start: at, End: at, Text: ", extra"}}
	}},
	// 7. multiple sites in one file — two reflection sites on one line.
	{"multi_site", "a.ts", "const a = getRunTypeId<string>(); const b = getRunTypeId<number>();\nconst c = 3;\n", func(code string) ([]protocol.Site, []protocol.Replacement) {
		first := byteIndexOf(code, ")", 0)
		second := byteIndexOf(code, ")", strings.Index(code, ")")+1)
		return []protocol.Site{site(first, "Str1111"), site(second, "Num2222")}, nil
	}},
	// 8. multi-line code — site on a later line, leading comma (argsCount 1).
	{"multi_line", "a.ts", "// header comment\nimport {createValidateFn} from 'mion';\n\nconst v = createValidateFn<Bar>(opts);\nexport {v};\n", func(code string) ([]protocol.Site, []protocol.Replacement) {
		pos := byteIndexOf(code, ")", strings.Index(code, "createValidateFn<Bar>"))
		s := site(pos, "Bar3333")
		s.ArgsCount = 1
		s.FnId = "val"
		return []protocol.Site{s}, nil
	}},
	// 9. MULTIBYTE — em-dash (3 bytes) + 🦄 emoji (4 bytes) BEFORE the site.
	{"multibyte", "a.ts", "// note — about unicorns 🦄 here\nconst id = getRunTypeId<string>();\n", func(code string) ([]protocol.Site, []protocol.Replacement) {
		return []protocol.Site{site(byteIndexOf(code, ")", strings.Index(code, "getRunTypeId")), "Uni4444")}, nil
	}},
	// 10. MULTIBYTE inline — em-dash + emoji on the SAME line, before the call.
	{"multibyte_inline", "a.ts", "const x = '🦄 — y'; const id = getRunTypeId<string>();\n", func(code string) ([]protocol.Site, []protocol.Replacement) {
		return []protocol.Site{site(byteIndexOf(code, ")", strings.Index(code, "getRunTypeId")), "Inl5555")}, nil
	}},
	// 11. mixed sites + replacement in one file (both edit kinds + import dedupe).
	{"mixed", "a.ts", "registerPureFnFactory('rt::foo', () => 1);\nconst v = createValidateFn<Baz>();\n", func(code string) ([]protocol.Site, []protocol.Replacement) {
		start := byteIndexOf(code, "() => 1", 0)
		s := site(byteIndexOf(code, ")", strings.Index(code, "createValidateFn<Baz>")), "Baz6666")
		s.FnId = "val"
		reps := []protocol.Replacement{{File: "a.ts", Start: start, End: start + len("() => 1"), Text: "__rt_pf_rt_foo", ImportFrom: "rtmod:/pf/rt/foo.js"}}
		return []protocol.Site{s}, reps
	}},
	// 12. padding — paramIndex 2 with argsCount 0 → one `undefined` placeholder.
	{"padding", "a.ts", "const v = createValidateFn<Pad>();\n", func(code string) ([]protocol.Site, []protocol.Replacement) {
		s := site(byteIndexOf(code, ")", 0), "Pad7777")
		s.ParamIndex = 2
		s.FnId = "val"
		return []protocol.Site{s}, nil
	}},
	// 13. empty (no sites, no replacements) — Apply returns {code, nil map}.
	{"empty", "a.ts", "const noop = 1;\n", func(code string) ([]protocol.Site, []protocol.Replacement) {
		return nil, nil
	}},
}

// extraCases mirror the old diff_extra.mjs corpus — harder multibyte / boundary
// permutations, emitted as the single testdata/extra/cases.json array.
var extraCases = []fixtureCase{
	// CRLF line endings — the \r is an ordinary non-word char; split is on \n.
	{"crlf", "a.ts", "const a = 1;\r\nconst id = getRunTypeId<string>();\r\n", func(code string) ([]protocol.Site, []protocol.Replacement) {
		return []protocol.Site{site(byteIndexOf(code, ")", strings.Index(code, "getRunTypeId")), "Crlf001")}, nil
	}},
	// Tabs + leading whitespace before the call.
	{"tabs", "a.ts", "\t\tconst id = getRunTypeId<string>();\n", func(code string) ([]protocol.Site, []protocol.Replacement) {
		return []protocol.Site{site(byteIndexOf(code, ")", 0), "Tab0001")}, nil
	}},
	// Two emoji + two em-dashes scattered, multiple sites across lines.
	{"heavy_multibyte", "a.ts", "// 🦄 — 🚀 — header\nconst a = getRunTypeId<string>();\n// más\nconst b = getRunTypeId<number>();\n", func(code string) ([]protocol.Site, []protocol.Replacement) {
		p1 := byteIndexOf(code, ")", strings.Index(code, "getRunTypeId"))
		p2 := byteIndexOf(code, ")", strings.Index(code, ")")+1)
		return []protocol.Site{site(p1, "Mb00001"), site(p2, "Mb00002")}, nil
	}},
	// Replacement whose span contains multibyte chars (em-dash inside the text).
	{"replace_over_multibyte", "a.ts", "registerPureFnFactory('ns::f', (x) => x /* — */);\n", func(code string) ([]protocol.Site, []protocol.Replacement) {
		const inner = "(x) => x /* — */"
		start := byteIndexOf(code, inner, 0)
		return nil, []protocol.Replacement{{File: "a.ts", Start: start, End: start + len(inner), Text: "__rt_pf_ns_f", ImportFrom: "rtmod:/pf/ns/f.js"}}
	}},
	// paramIndex 3, argsCount 1 → two `undefined` pads + leading comma.
	{"big_padding", "a.ts", "const v = createGetValidationErrorsFn<T>(opts);\n", func(code string) ([]protocol.Site, []protocol.Replacement) {
		s := site(byteIndexOf(code, ")", 0), "Big0001")
		s.ParamIndex = 3
		s.ArgsCount = 1
		s.FnId = "verr"
		return []protocol.Site{s}, nil
	}},
	// site.module set (allSingle bundle mode) — specifier uses the bundle basename.
	{"bundle_module", "a.ts", "const v = createValidateFn<T>();\n", func(code string) ([]protocol.Site, []protocol.Replacement) {
		s := site(byteIndexOf(code, ")", 0), "Bun0001")
		s.FnId = "val"
		s.Module = "fns/val"
		return []protocol.Site{s}, nil
	}},
	// A MULTI-FUNCTION site under allSingle: its fnIds span three families, each
	// its OWN bundle, so site.Modules addresses them positionally and the block
	// must carry one import per bundle. The single scalar site.Module cannot
	// express this — it used to send every binding to FnIds[0]'s bundle.
	{"bundle_module_multi_fn", "a.ts", "const schema = createStandardSchema<T>();\n", func(code string) ([]protocol.Site, []protocol.Replacement) {
		s := site(byteIndexOf(code, ")", 0), "BunMul1")
		s.ParamIndex = 2
		s.FnId = "val"
		s.FnIds = []string{"val", "verr", "jsonSchema"}
		s.Module = "fns/val"
		s.Modules = []string{"fns/val", "fns/verr", "fns/jsonSchema"}
		return []protocol.Site{s}, nil
	}},
	// Two replacements importing from the SAME specifier — clause dedupe.
	{"dup_specifier", "a.ts", "regA('x', AAA); regB('y', BBB);\n", func(code string) ([]protocol.Site, []protocol.Replacement) {
		s1 := byteIndexOf(code, "AAA", 0)
		s2 := byteIndexOf(code, "BBB", 0)
		return nil, []protocol.Replacement{
			{File: "a.ts", Start: s1, End: s1 + 3, Text: "__rt_shared_a", ImportFrom: "rtmod:/shared.js"},
			{File: "a.ts", Start: s2, End: s2 + 3, Text: "__rt_shared_b", ImportFrom: "rtmod:/shared.js"},
		}
	}},
	// Site at end-of-file with NO trailing newline.
	{"no_trailing_newline", "a.ts", "const id = getRunTypeId<string>()", func(code string) ([]protocol.Site, []protocol.Replacement) {
		return []protocol.Site{site(byteIndexOf(code, ")", 0), "Eof0001")}, nil
	}},
	// Astral chars in a string + a word run right after the multibyte char.
	{"word_after_astral", "a.ts", "const w = \"𝕏abc\"; const id = getRunTypeId<string>();\n", func(code string) ([]protocol.Site, []protocol.Replacement) {
		return []protocol.Site{site(byteIndexOf(code, ")", strings.Index(code, "getRunTypeId")), "Ast0001")}, nil
	}},
}

// buildFixture runs a case's builder, applies Apply, and returns the fixture. The
// name is stamped only for the array (extra) form; pass "" for the per-file form.
func buildFixture(name string, gc fixtureCase) fixture {
	sites, replacements := gc.build(gc.code)
	if sites == nil {
		sites = []protocol.Site{}
	}
	if replacements == nil {
		replacements = []protocol.Replacement{}
	}
	code, sourceMap := sourcerewrite.Apply(gc.file, gc.code, sites, replacements)
	return fixture{
		Name:         name,
		File:         gc.file,
		Code:         gc.code,
		Sites:        sites,
		Replacements: replacements,
		ExpectedCode: code,
		ExpectedMap:  sourceMap,
	}
}

// marshalPretty matches the old JS JSON.stringify(x, null, 2) + '\n' output:
// 2-space indent, a trailing newline (Encoder.Encode appends it), and literal
// `<`/`>`/`&` (SetEscapeHTML(false)) so the TS source in `code` stays readable.
func marshalPretty(value any) []byte {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", "  ")
	if err := enc.Encode(value); err != nil {
		log.Fatalf("gen-sourcerewrite-fixtures: marshal: %v", err)
	}
	return buf.Bytes()
}

// testdataDir anchors the output directory to THIS source file (via runtime.Caller)
// so the generator works from any CWD: cmd/gen-sourcerewrite-fixtures → the package's
// testdata dir is ../../internal/compiler/sourcerewrite/testdata.
func testdataDir() string {
	_, thisFile, _, ok := runtime.Caller(0)
	if !ok {
		log.Fatal("gen-sourcerewrite-fixtures: runtime.Caller failed")
	}
	return filepath.Join(filepath.Dir(thisFile), "..", "..", "internal", "compiler", "sourcerewrite", "testdata")
}

func main() {
	dir := testdataDir()

	for _, gc := range primaryCases {
		out := marshalPretty(buildFixture("", gc))
		path := filepath.Join(dir, gc.name+".json")
		if err := os.WriteFile(path, out, 0o644); err != nil {
			log.Fatalf("gen-sourcerewrite-fixtures: write %s: %v", path, err)
		}
	}
	log.Printf("wrote %d primary fixtures to testdata/", len(primaryCases))

	extra := make([]fixture, 0, len(extraCases))
	for _, gc := range extraCases {
		extra = append(extra, buildFixture(gc.name, gc))
	}
	extraPath := filepath.Join(dir, "extra", "cases.json")
	if err := os.WriteFile(extraPath, marshalPretty(extra), 0o644); err != nil {
		log.Fatalf("gen-sourcerewrite-fixtures: write %s: %v", extraPath, err)
	}
	log.Printf("wrote %d extra cases to testdata/extra/cases.json", len(extraCases))
}
