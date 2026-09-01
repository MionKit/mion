package mirror

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/enrichment"
)

// TestScanDirtyTags_ScaffoldRoundTrip pins the emitter↔detector loop for the
// @todo flag: the EXACT block ConstBlock stamps on a new const is detected as
// exactly one TagTodo (the @rtType/@rtIds marker never fires), and deleting
// the @todo line — what the user does after filling the data — makes the
// block clean.
func TestScanDirtyTags_ScaffoldRoundTrip(t *testing.T) {
	named := enrichment.NamedConst{
		TypeName:    "User",
		TypeID:      "abc123",
		ChildIDs:    map[string]string{"name": "n1"},
		FriendlyVar: "friendlyUser",
	}
	block := ConstBlock("friendlyUser", enrichment.FriendlyTypeName, named, "{\n  name: {},\n}")

	findings := ScanDirtyTags(block)
	if len(findings) != 1 {
		t.Fatalf("scaffolded const should carry exactly one dirty tag; got %d: %+v", len(findings), findings)
	}
	if findings[0].Kind != TagTodo {
		t.Errorf("kind = %v, want TagTodo", findings[0].Kind)
	}
	if got := block[findings[0].Start:findings[0].End]; got != TodoTag {
		t.Errorf("finding span = %q, want %q", got, TodoTag)
	}

	cleaned := strings.Replace(block, TodoLine+"\n", "", 1)
	if !strings.Contains(cleaned, RtTypeTag) || !strings.Contains(cleaned, RtIdsTag) {
		t.Fatalf("precondition: cleaned block must keep its reconcile marker:\n%s", cleaned)
	}
	if got := ScanDirtyTags(cleaned); len(got) != 0 {
		t.Errorf("a filled const (marker only) must be clean; got %+v", got)
	}
}

// TestBlankValues pins the value-completeness scan: an empty string (`”`) or
// empty array (`[]`) at a property VALUE position is a blank scaffold slot (as
// incomplete as a @todo), while a filled value, a `”` that is an array ELEMENT,
// and a `”`/`[]` inside a comment or a bigger string are all left alone.
func TestBlankValues(t *testing.T) {
	text := "export const friendlyUser: FriendlyText<User> = {\n" +
		"  rt$label: '',\n" + // blank string value → hit
		"  title: 'Filled',\n" + // filled → no hit
		"  tags: {pool: []},\n" + // blank array value → hit
		"  names: {pool: ['', 'Ada']},\n" + // '' is an array element, NOT a value → no hit
		"  note: 'contains : \\'\\' inside',\n" + // '' inside a bigger string → no hit
		"  // rt$label: '' in a comment does not count\n" + // comment → no hit
		"};\n"

	findings := ScanBlankValues(text)
	if len(findings) != 2 {
		t.Fatalf("want exactly 2 blank values (rt$label:'' and pool:[]); got %d: %+v", len(findings), spans(text, findings))
	}
	for _, finding := range findings {
		if finding.Kind != TagBlankValue {
			t.Errorf("kind = %v, want TagBlankValue", finding.Kind)
		}
	}
	got := spans(text, findings)
	if got[0] != "''" || got[1] != "[]" {
		t.Errorf("blank spans = %q, want [\"''\" \"[]\"]", got)
	}

	// A fully-authored mirror (no blank sentinels) is clean.
	filled := "export const friendlyUser: FriendlyText<User> = {\n  rt$label: 'Name',\n  tags: {pool: ['a', 'b']},\n};\n"
	if got := ScanBlankValues(filled); len(got) != 0 {
		t.Errorf("a filled mirror must have no blank values; got %+v", spans(filled, got))
	}
}

// spans renders each finding's covered text for readable assertion failures.
func spans(text string, findings []TagFinding) []string {
	out := make([]string, len(findings))
	for i, finding := range findings {
		out[i] = text[finding.Start:finding.End]
	}
	return out
}

// TestScanDirtyTags_OrphanCarcasses pins the carcass loop: both orphan forms
// are detected (tight spans on the tag token), a @todo PRESERVED INSIDE a
// carcass is not double-reported, and PruneOrphanBlocks — the fix the rule
// points at — leaves the text clean.
func TestScanDirtyTags_OrphanCarcasses(t *testing.T) {
	// Build the const carcass exactly like orphanConstOp: the preserved text
	// (marker + @todo + const) is comment-sanitized so its inner `*/` becomes
	// `* /` and the FIRST ` */` is the carcass terminator.
	preserved := "/** " + RtTypeTag + " Gone#dead */\n" + TodoLine + "\nexport const friendlyGone = {};"
	text := "/* " + OrphanTag + " " + sanitizeForComment(preserved) + " */\n" +
		"export const live = {\n" +
		"  /* " + OrphanChildTag + " old: {}, */ fresh: {},\n" +
		"};\n"

	findings := ScanDirtyTags(text)
	if len(findings) != 2 {
		t.Fatalf("want exactly the two carcass findings (inner @todo folded in); got %d: %+v", len(findings), findings)
	}
	if findings[0].Kind != TagOrphan || text[findings[0].Start:findings[0].End] != OrphanTag {
		t.Errorf("first finding = %+v (%q), want TagOrphan on %q", findings[0], text[findings[0].Start:findings[0].End], OrphanTag)
	}
	if findings[1].Kind != TagOrphanChild || text[findings[1].Start:findings[1].End] != OrphanChildTag {
		t.Errorf("second finding = %+v (%q), want TagOrphanChild on %q", findings[1], text[findings[1].Start:findings[1].End], OrphanChildTag)
	}

	pruned, removed, skipped, pruneErr := PruneOrphanBlocks(text)
	if pruneErr != nil {
		t.Fatalf("prune errored: %v", pruneErr)
	}
	if removed != 2 || len(skipped) != 0 {
		t.Fatalf("prune removed %d (skipped %d), want 2 removed", removed, len(skipped))
	}
	if got := ScanDirtyTags(pruned); len(got) != 0 {
		t.Errorf("pruned text must be clean; got %+v", got)
	}
}

// TestScanDirtyTags_CommentTokenOnly: @todo counts only as a comment token —
// string-literal data never fires, and an identifier tail (@todos) is not the
// tag.
func TestScanDirtyTags_CommentTokenOnly(t *testing.T) {
	text := "export const mockUser = {\n" +
		"  bio: {pool: ['has " + TodoTag + " inside', \"and " + TodoTag + "\", `tpl " + TodoTag + "`]},\n" +
		"};\n" +
		"// " + TodoTag + "s is not the tag\n" +
		"/* neither is " + TodoTag + "X */\n" +
		"// but " + TodoTag + ": this one is\n" +
		"/* and " + TodoTag + " in a block */\n"

	findings := ScanDirtyTags(text)
	if len(findings) != 2 {
		t.Fatalf("want the two real comment tokens only; got %d: %+v", len(findings), findings)
	}
	for _, finding := range findings {
		if finding.Kind != TagTodo {
			t.Errorf("kind = %v, want TagTodo", finding.Kind)
		}
		if got := text[finding.Start:finding.End]; got != TodoTag {
			t.Errorf("span = %q, want %q", got, TodoTag)
		}
	}
}

// TestIsEnrichmentFile pins the scoping guard: marker or DSL annotation →
// enrichment file; plain source (even with a @todo comment) → not.
func TestIsEnrichmentFile(t *testing.T) {
	cases := []struct {
		name string
		text string
		want bool
	}{
		{"marker", MarkerCommentPrefix + "User#a1 */\nexport const friendlyUser = {};", true},
		{"bare tag in a string literal", "export const RT_TYPE_TAG = '" + RtTypeTag + "';\nexport const T = '" + RtIdsTag + "';", false},
		{"friendly annotation", "import type {" + enrichment.FriendlyTypeName + "} from '@mionjs/run-types';\nexport const f: " + enrichment.FriendlyTypeName + "<User> = {};", true},
		{"mock annotation", "export const m: " + enrichment.MockDataName + "<User> = {};", true},
		{"annotation with newline after colon", "export const f:\n  " + enrichment.FriendlyTypeName + "<User> = {};", true},
		{"plain source with todo", "// " + TodoTag + ": refactor this\nexport const a = 1;", false},
		// The DSL package's own sources DECLARE and document the bare names
		// (and may carry @todo in prose) — never enrichment files.
		{"dsl declaration file", "// the `" + TodoTag + "`/diagnostic layer enforces this\nexport type " + enrichment.FriendlyTypeName + "<T> = {[K in keyof T]?: unknown};\ntype Use = " + enrichment.FriendlyTypeName + "<{a: 1}>;", false},
		// A runtime that TAKES a map parameter (createFriendlyText's own signature)
		// is not a mirror — only the const-declaration shape scaffolds emit is.
		{"parameter annotation", "// blank '' (an unfilled " + TodoTag + ") counts as absent\nexport function createFriendlyText<T>(map: " + enrichment.FriendlyTypeName + "<T>) {\n  return map;\n}", false},
		// A JSDoc CODE EXAMPLE showing the const shape lives inside a comment —
		// masked out, so docs-heavy sources with @todo prose never read as mirrors.
		{"jsdoc code example", "/**\n * Example:\n *   export const friendlyUser: " + enrichment.FriendlyTypeName + "<User> = {};\n * then fill the " + TodoTag + " blanks.\n */\nexport function helper() {}", false},
		// A multiline TEMPLATE embedding a mirror-shaped line is string data —
		// the structural mask blanks literal bodies, so it never reads as a
		// mirror (the docs site's own example snippets ship exactly this).
		{"template-embedded annotation", "export const doc = `\nexport const friendlyUser: " + enrichment.FriendlyTypeName + "<User> = {};\n`;\n", false},
		{"empty", "", false},
	}
	for _, testCase := range cases {
		if got := IsEnrichmentFile(testCase.text); got != testCase.want {
			t.Errorf("%s: IsEnrichmentFile = %v, want %v", testCase.name, got, testCase.want)
		}
	}
}

// TestLineIndex_At pins the 1-based line/col conversion (and clamping).
func TestLineIndex_At(t *testing.T) {
	index := NewLineIndex("ab\ncde\n\nf")
	cases := []struct {
		offset, line, col int
	}{
		{0, 1, 1}, {1, 1, 2}, {2, 1, 3}, // "ab" + the newline itself
		{3, 2, 1}, {5, 2, 3}, // "cde"
		{7, 3, 1},  // empty line
		{8, 4, 1},  // "f"
		{99, 4, 2}, // clamped past the end
		{-1, 1, 1}, // clamped before the start
	}
	for _, testCase := range cases {
		line, col := index.At(testCase.offset)
		if line != testCase.line || col != testCase.col {
			t.Errorf("At(%d) = (%d,%d), want (%d,%d)", testCase.offset, line, col, testCase.line, testCase.col)
		}
	}
}

// TestOrphanBlockPatternSource_JSCompatible guards the Go↔JS pattern contract:
// the exported source carries no Go-only inline flags (the JS side compiles
// the SAME string with the `s` flag), and the derived Go pattern still
// matches both emit forms.
func TestOrphanBlockPatternSource_JSCompatible(t *testing.T) {
	if strings.Contains(OrphanBlockPatternSource, "(?s)") {
		t.Fatalf("OrphanBlockPatternSource must stay (?s)-free for JS reuse: %q", OrphanBlockPatternSource)
	}
	if !orphanBlockPattern.MatchString("/* " + OrphanTag + " x */") {
		t.Errorf("derived pattern must match a const carcass")
	}
	if !orphanBlockPattern.MatchString("/* " + OrphanChildTag + " y, */") {
		t.Errorf("derived pattern must match a field carcass")
	}
}

// TestFamilyClassifier_Attribution pins every attribution path FamilyFor
// walks, in precedence order: carcass-interior annotation, nearest live
// annotation at/after the tag, nearest one before it, the DSL import, Unknown.
func TestFamilyClassifier_Attribution(t *testing.T) {
	dsl := "import type { FriendlyType, MockData } from '@mionjs/run-types';\n"
	friendlyConst := "export const friendlyUser: " + enrichment.FriendlyTypeName + "<User> = {};\n"
	mockConst := "export const mockUser: " + enrichment.MockDataName + "<User> = {};\n"

	cases := []struct {
		name string
		text string
		want []MirrorFamily // per ScanDirtyTags finding, in Start order
	}{
		{
			name: "carcass interior annotation wins over surrounding consts",
			text: dsl + friendlyConst + "/* " + OrphanTag + " export const gone: " + enrichment.MockDataName + "<User> = {}; */\n" + friendlyConst,
			want: []MirrorFamily{FamilyMock},
		},
		{
			name: "todo attributes to the nearest annotation after it",
			text: dsl + TodoLine + "\n" + mockConst,
			want: []MirrorFamily{FamilyMock},
		},
		{
			name: "trailing annotation-less carcass falls back to nearest-before",
			text: dsl + mockConst + "/* " + OrphanTag + " export const gone = {}; */\n",
			want: []MirrorFamily{FamilyMock},
		},
		{
			name: "no consts at all: single-family DSL import decides",
			text: "import type { " + enrichment.FriendlyTypeName + " } from '@mionjs/run-types';\n" + TodoLine + "\n",
			want: []MirrorFamily{FamilyFriendly},
		},
		{
			name: "no consts, both families imported: Unknown",
			text: dsl + TodoLine + "\n",
			want: []MirrorFamily{FamilyUnknown},
		},
		{
			name: "annotation inside an ordinary comment never counts",
			text: dsl + "// example: const x: " + enrichment.FriendlyTypeName + "<T> = {}\n" + TodoLine + "\n" + mockConst,
			want: []MirrorFamily{FamilyMock},
		},
	}
	for _, testCase := range cases {
		classifier := NewFamilyClassifier(testCase.text)
		findings := ScanDirtyTags(testCase.text)
		if len(findings) != len(testCase.want) {
			t.Errorf("%s: got %d findings, want %d", testCase.name, len(findings), len(testCase.want))
			continue
		}
		for i, finding := range findings {
			if got := classifier.FamilyFor(finding); got != testCase.want[i] {
				t.Errorf("%s: finding %d (%v) attributed to %v, want %v", testCase.name, i, finding.Kind, got, testCase.want[i])
			}
		}
	}
}

// TestScanDirtyTags_StringLiteralsNeverFire pins the comment-anchoring of the
// hygiene scan: tag patterns embedded in STRING data — exactly what the
// generated diagnostic catalog ships, since its messages describe the tags —
// are not carcasses, and the marker emit form inside a string does not make
// the file an enrichment mirror.
func TestScanDirtyTags_StringLiteralsNeverFire(t *testing.T) {
	catalogLike := "export const DIAG = {\n" +
		"  FT021: {detail: 'example:\\n/* " + OrphanTag + " export const gone = {}; */\\nrun gen --prune'},\n" +
		"  FT022: {detail: \"a /* " + OrphanChildTag + " old: 1, */ example\"},\n" +
		"  FT020: {detail: `fresh scaffold:\n" + MarkerCommentPrefix + "User#a1 */\n" + TodoLine + "`},\n" +
		"};\n"
	if findings := ScanDirtyTags(catalogLike); len(findings) != 0 {
		t.Errorf("tag patterns inside string literals must not fire; got %+v", findings)
	}
	if IsEnrichmentFile(catalogLike) {
		t.Errorf("marker prefix inside a string literal must not mark the file as a mirror")
	}
	if HasMarkerComment(catalogLike) {
		t.Errorf("HasMarkerComment must require a real comment start")
	}

	// The same emit forms as REAL comments still fire / still gate.
	realMirror := MarkerCommentPrefix + "User#a1 */\n" +
		"export const friendlyUser: " + enrichment.FriendlyTypeName + "<User> = {};\n" +
		"/* " + OrphanTag + " export const gone = {}; */\n"
	if !HasMarkerComment(realMirror) {
		t.Errorf("real marker comment must be recognised")
	}
	findings := ScanDirtyTags(realMirror)
	if len(findings) != 1 || findings[0].Kind != TagOrphan {
		t.Errorf("real carcass must still fire exactly once; got %+v", findings)
	}

	// Orphan pattern nested INSIDE JSDoc prose is not a carcass either (the
	// outer comment ends at the first */, so the match starts mid-comment).
	jsdocExample := "/** example:\n * /* " + OrphanTag + " export const gone = {}; */\n" +
		"export const a = 1;\n"
	if findings := ScanDirtyTags(jsdocExample); len(findings) != 0 {
		t.Errorf("orphan pattern nested in JSDoc prose must not fire; got %+v", findings)
	}
}

// TestScan_TemplateInterpolationComments pins the parse-oracle upgrade of the
// comment scan: a template `${…}` interpolation is CODE between two
// template-literal tokens, so a comment inside one is a real comment — both
// detected by the scan and removed by prune (the old text-only lexer treated
// the whole template as string data and missed it). The template's literal
// parts stay opaque: tag bytes there still never fire.
func TestScan_TemplateInterpolationComments(t *testing.T) {
	text := "export const mockUser = {\n" +
		"  greeting: {pool: [`hi ${/* " + OrphanChildTag + " old: {}, */ name} — not a " + TodoTag + " here`]},\n" +
		"  farewell: {pool: [`bye ${/* " + TodoTag + ": pick a pool */ word}`]},\n" +
		"};\n"

	findings := ScanDirtyTags(text)
	if len(findings) != 2 {
		t.Fatalf("want the carcass + @todo inside the interpolations (and nothing from the literal parts); got %d: %+v", len(findings), findings)
	}
	if findings[0].Kind != TagOrphanChild || text[findings[0].Start:findings[0].End] != OrphanChildTag {
		t.Errorf("first finding = %+v (%q), want TagOrphanChild", findings[0], text[findings[0].Start:findings[0].End])
	}
	if findings[1].Kind != TagTodo {
		t.Errorf("second finding = %+v, want TagTodo inside the interpolation", findings[1])
	}

	// Prune agrees (lint/prune symmetry): the interpolation carcass is removed,
	// the template stays otherwise intact and valid.
	pruned, removed, skipped, pruneErr := PruneOrphanBlocks(text)
	if pruneErr != nil || removed != 1 || len(skipped) != 0 {
		t.Fatalf("prune must remove exactly the interpolation carcass; removed=%d skipped=%d err=%v", removed, len(skipped), pruneErr)
	}
	if !strings.Contains(pruned, "`hi ${ name}") {
		t.Errorf("interpolation must survive with the carcass gone:\n%s", pruned)
	}
	if strings.Contains(pruned, OrphanChildTag) {
		t.Errorf("carcass must be gone:\n%s", pruned)
	}
}

// TestScan_RegexLiteralNeverPhantomComment pins the other oracle fix: `/*`
// bytes INSIDE a regex literal are not a comment start. The old text-only
// lexer opened a phantom comment there; with a later real comment supplying
// the ` */` terminator, the raw pattern then "matched" a carcass spanning the
// live code between them — which lint reported and prune DELETED (the
// malformed-carcass guard only counts `export` statements, and a plain const
// slipped under it). The parse knows the regex is one opaque token.
func TestScan_RegexLiteralNeverPhantomComment(t *testing.T) {
	text := "export const mockData = { pattern: /a\\/* " + OrphanTag + " x/ };\n" +
		"export const keep = 1; /* tail */\n"

	if findings := ScanDirtyTags(text); len(findings) != 0 {
		t.Fatalf("tag bytes inside a regex literal must not fire; got %+v", findings)
	}
	pruned, removed, skipped, pruneErr := PruneOrphanBlocks(text)
	if pruneErr != nil {
		t.Fatalf("prune errored: %v", pruneErr)
	}
	if pruned != text || removed != 0 || len(skipped) != 0 {
		t.Errorf("prune must leave the regex + live code byte-identical; removed=%d skipped=%d\n%s", removed, len(skipped), pruned)
	}
}
