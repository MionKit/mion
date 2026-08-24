package mirror

import (
	"regexp"
	"strings"
	"testing"
)

// breadcrumbNames extracts the type names from a mirror file's first
// `import type { … } from '<non-ts-runtypes>'` source breadcrumb (skipping the
// ts-runtypes DSL import). It is the in-package test echo of the CLI's
// parseBreadcrumb, so the syncBreadcrumbClause assertions stay self-contained.
func breadcrumbNames(text string) ([]string, bool) {
	pattern := regexp.MustCompile(`(?m)^import\s+type\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]`)
	for _, match := range pattern.FindAllStringSubmatch(text, -1) {
		if strings.TrimSpace(match[2]) == "@ts-runtypes/core" {
			continue
		}
		var names []string
		for _, part := range strings.Split(match[1], ",") {
			name := strings.TrimSpace(part)
			if idx := strings.Index(name, " as "); idx >= 0 {
				name = strings.TrimSpace(name[:idx])
			}
			if name != "" {
				names = append(names, name)
			}
		}
		if len(names) > 0 {
			return names, true
		}
	}
	return nil, false
}

// TestIndexOrphanCarcasses recovers an @rtOrphan carcass's preserved inner text
// and indexes it by VAR NAME so the same named const reappearing can restore it.
func TestIndexOrphanCarcasses(t *testing.T) {
	src := "import type { A } from './a';\n" +
		"import type { FriendlyType, MockData } from '@ts-runtypes/core';\n" +
		"\n" +
		"/* @rtOrphan /** @rtType B#bID @rtIds {y: yid} *\\/\n" +
		"export const friendlyB: FriendlyType<B> = {\n" +
		"  rt$label: '',\n" +
		"  y: {rt$label: 'Year'},\n" +
		"}; */\n"

	index := mustParse(t, "/rt/gen/a.ts", src)
	carcass, ok := index.orphanCarcasses["friendlyB"]
	if !ok {
		t.Fatalf("friendly carcass not indexed; have %d carcasses", len(index.orphanCarcasses))
	}
	if !strings.Contains(carcass.inner, "export const friendlyB") {
		t.Errorf("carcass inner missing the const: %q", carcass.inner)
	}
	if !strings.Contains(carcass.inner, "y: {rt$label: 'Year'}") {
		t.Errorf("carcass inner should preserve the authored value: %q", carcass.inner)
	}
	// The restore reverses the comment-sanitization (`*\/` → `*/`).
	restored := unsanitizeFromComment(carcass.inner)
	if !strings.Contains(restored, "@rtType B#bID @rtIds {y: yid} */") {
		t.Errorf("restored marker should end in `*/`: %q", restored)
	}
}

// TestOrphanConstOp wraps a whole const (with its marker) in an @rtOrphan block,
// preserving the original verbatim and swallowing the trailing newline.
func TestOrphanConstOp(t *testing.T) {
	src := "/** @rtType B#bID @rtIds {y: yid} */\n" +
		"export const friendlyB: FriendlyType<B> = {\n" +
		"  rt$label: '',\n" +
		"  y: {rt$label: 'Year'},\n" +
		"};\n"
	index := mustParse(t, "/rt/gen/a.ts", src)
	entry := index.byTypeForm[typeFormKey("bID", true)]
	if entry == nil {
		t.Fatalf("friendlyB not indexed")
	}
	op := orphanConstOp(index.raw, entry)
	if !strings.HasPrefix(op.text, "/* @rtOrphan ") {
		t.Errorf("orphan op text should open with the tag: %q", op.text)
	}
	if !strings.Contains(op.text, "export const friendlyB") {
		t.Errorf("orphan op should preserve the const: %q", op.text)
	}
	// The marker's own `*/` must be sanitized so the outer block stays well-formed.
	if strings.Count(op.text, "*/") != 1 {
		t.Errorf("orphan op must have exactly one `*/` (its own terminator): %q", op.text)
	}
}

// TestOrphanConstOp_FoldsLeadingComment is the C3 guard: a hand-authored leading
// comment ABOVE the const's marker is folded INTO the carcass (start extends to
// the leading-trivia content), so --prune removes it cleanly instead of leaving
// it dangling. The carcass start must precede the marker block.
func TestOrphanConstOp_FoldsLeadingComment(t *testing.T) {
	src := "import type { B } from './b';\n" +
		"\n" +
		"// hand-authored note about friendlyB\n" +
		"/** @rtType B#bID */\n" +
		"export const friendlyB: FriendlyType<B> = { rt$label: '' };\n"
	index := mustParse(t, "/rt/gen/a.ts", src)
	entry := index.byTypeForm[typeFormKey("bID", true)]
	if entry == nil {
		t.Fatalf("friendlyB not indexed")
	}
	op := orphanConstOp(index.raw, entry)
	// The carcass must start at the hand-authored comment, not the marker.
	if op.start >= entry.markerStart {
		t.Errorf("carcass start %d should precede markerStart %d (fold the leading comment)", op.start, entry.markerStart)
	}
	if !strings.Contains(op.text, "hand-authored note") {
		t.Errorf("the leading comment should be folded into the carcass:\n%q", op.text)
	}
	// Applying the op and pruning leaves NO trace of the hand-authored comment.
	merged := mustSplice(t, index.raw, []spliceOp{op})
	pruned, _, _, _ := PruneOrphanBlocks(merged)
	if strings.Contains(pruned, "hand-authored note") {
		t.Errorf("--prune should remove the folded leading comment:\n%s", pruned)
	}
	if !strings.Contains(pruned, "import type { B }") {
		t.Errorf("the live import must survive prune:\n%s", pruned)
	}
}

// TestSyncBreadcrumbClause_KeepsHandAuthoredName: the breadcrumb sync must NOT
// drop a type name still referenced by a HAND-AUTHORED (non-enrichment) const in
// the same file, even when the enrichment const for the orphaned type goes away.
// This is the A3 regression: the clause was recomputed from enrichment consts
// only, dropping `KeepMe` and breaking the hand-authored `const widget`.
func TestSyncBreadcrumbClause_KeepsHandAuthoredName(t *testing.T) {
	src := "import type { DropMe, KeepMe } from '../../src/models';\n" +
		"import type { FriendlyType, MockData } from '@ts-runtypes/core';\n" +
		"\n" +
		"/** @rtType DropMe#dropID */\n" +
		"export const friendlyDropMe: FriendlyType<DropMe> = { rt$label: '' };\n" +
		"\n" +
		"// hand-authored, not enrichment-owned — still uses KeepMe\n" +
		"export const widget: KeepMe = { kind: 'k' };\n"

	index := mustParse(t, "/rt/gen/models.ts", src)

	// Orphan the enrichment const friendlyDropMe (simulate its source type gone).
	orphanedEntry := index.byTypeForm[typeFormKey("dropID", true)]
	if orphanedEntry == nil {
		t.Fatalf("friendlyDropMe not indexed")
	}

	var ops []spliceOp
	spec := Spec{SourceFile: "/src/models.ts", Consts: nil, WantFriendly: true}
	syncBreadcrumbClause(&ops, index, spec, []*constEntry{orphanedEntry}, nil)

	merged := mustSplice(t, index.raw, ops)
	// KeepMe must survive in the breadcrumb (the hand-authored const still uses it).
	names, ok := breadcrumbNames(merged)
	if !ok {
		t.Fatalf("breadcrumb missing after sync:\n%s", merged)
	}
	hasKeep := false
	for _, name := range names {
		if name == "KeepMe" {
			hasKeep = true
		}
	}
	if !hasKeep {
		t.Errorf("KeepMe was dropped from breadcrumb despite hand-authored use; got %v:\n%s", names, merged)
	}
}

// TestSyncBreadcrumbClause_DropsUnusedName: the complement — a breadcrumb name
// with NO surviving use (only the orphaned enrichment const referenced it) IS
// dropped. Confirms the ADD-only safety is a guard, not a blanket keep-all.
func TestSyncBreadcrumbClause_DropsUnusedName(t *testing.T) {
	src := "import type { DropMe, KeepMe } from '../../src/models';\n" +
		"import type { FriendlyType, MockData } from '@ts-runtypes/core';\n" +
		"\n" +
		"/** @rtType DropMe#dropID */\n" +
		"export const friendlyDropMe: FriendlyType<DropMe> = { rt$label: '' };\n" +
		"\n" +
		"/** @rtType KeepMe#keepID */\n" +
		"export const friendlyKeepMe: FriendlyType<KeepMe> = { rt$label: '' };\n"

	index := mustParse(t, "/rt/gen/models.ts", src)
	dropEntry := index.byTypeForm[typeFormKey("dropID", true)]
	if dropEntry == nil {
		t.Fatalf("friendlyDropMe not indexed")
	}

	var ops []spliceOp
	// KeepMe survives because friendlyKeepMe (an enrichment const, NOT orphaned)
	// is still in index.consts; DropMe should drop (its only const is orphaned).
	spec := Spec{SourceFile: "/src/models.ts", Consts: nil, WantFriendly: true}
	syncBreadcrumbClause(&ops, index, spec, []*constEntry{dropEntry}, nil)

	merged := mustSplice(t, index.raw, ops)
	names, _ := breadcrumbNames(merged)
	hasDrop, hasKeep := false, false
	for _, name := range names {
		if name == "DropMe" {
			hasDrop = true
		}
		if name == "KeepMe" {
			hasKeep = true
		}
	}
	if hasDrop {
		t.Errorf("DropMe should be dropped (no surviving use); got %v:\n%s", names, merged)
	}
	if !hasKeep {
		t.Errorf("KeepMe should survive (live enrichment const); got %v:\n%s", names, merged)
	}
}

// TestOrphanConsts_OutModeSkipsJudgement: in single-file --out mode the
// source-declaration orphan judgement is SKIPPED — every const across many
// source files lands in one mirror, but the breadcrumb resolves only one source,
// so judging against it would wrongly orphan a still-existing cross-file type.
// This is the C1 guard.
func TestOrphanConsts_OutModeSkipsJudgement(t *testing.T) {
	// A mirror with a breadcrumb to a source that does NOT declare the const's type
	// — normally orphanConsts would orphan friendlyGone (source missing → no-op),
	// but in --out mode it must skip entirely regardless.
	src := "import type { Local } from './local';\n" +
		"import type { FriendlyType, MockData } from '@ts-runtypes/core';\n" +
		"\n" +
		"/** @rtType Gone#goneID */\n" +
		"export const friendlyGone: FriendlyType<Gone> = { rt$label: '' };\n"

	index := mustParse(t, "/rt/gen/out.ts", src)
	var ops []spliceOp
	// out != "" → judgement skipped; desired set empty so friendlyGone is unwanted.
	spec := Spec{MirrorPath: "/rt/gen/out.ts", Out: "/rt/gen/out.ts", Consts: nil, WantFriendly: true}
	// readSource must never be reached in --out mode (the early return precedes it).
	readSource := func(string) (string, error) {
		t.Fatalf("--out mode must not read the breadcrumb source")
		return "", nil
	}
	orphaned := orphanConsts(&ops, index, spec, readSource, nil)
	if len(orphaned) != 0 || len(ops) != 0 {
		t.Errorf("--out mode must skip the orphan judgement; got %d orphaned, %d ops", len(orphaned), len(ops))
	}
}

// TestPruneOrphanBlocks strips both orphan-child (inline) and orphan-const
// (whole block) carcasses, leaving the live content intact.
func TestPruneOrphanBlocks(t *testing.T) {
	src := "export const friendlyA = {\n" +
		"  x: {rt$label: ''},\n" +
		"  /* @rtOrphanChild old: {rt$label: 'Old'}, */\n" +
		"};\n" +
		"\n" +
		"/* @rtOrphan /** @rtType B#bID *\\/\n" +
		"export const friendlyB = { y: {rt$label: ''} }; */\n" +
		"\n" +
		"export const friendlyC = { z: {rt$label: ''} };\n"

	pruned, removed, _, pruneErr := PruneOrphanBlocks(src)
	if pruneErr != nil {
		t.Fatalf("prune errored: %v", pruneErr)
	}
	if removed != 2 {
		t.Fatalf("removed = %d, want 2", removed)
	}
	if strings.Contains(pruned, "@rtOrphan") {
		t.Errorf("orphan tags should be gone:\n%s", pruned)
	}
	if !strings.Contains(pruned, "x: {rt$label: ''}") || !strings.Contains(pruned, "friendlyC") {
		t.Errorf("live content must survive:\n%s", pruned)
	}
	// The inline orphan-child line is removed cleanly — no leftover blank gap with
	// a dangling indent.
	if strings.Contains(pruned, "  \n") {
		t.Errorf("dangling indented blank line left behind:\n%q", pruned)
	}

	// No orphans → unchanged, zero removed.
	clean := "export const x = 1;\n"
	out, n, _, cleanErr := PruneOrphanBlocks(clean)
	if cleanErr != nil || n != 0 || out != clean {
		t.Errorf("clean text should be untouched; n=%d err=%v out=%q", n, cleanErr, out)
	}
}

// TestPruneOrphanBlocks_MalformedCarcassSkipped is the C2 guard: a hand-edited
// whole-const carcass whose terminator is misplaced so the non-greedy match
// spans into the NEXT live const must be SKIPPED (not removed) so prune never
// eats live code. Here the first carcass's own ` */` was deleted, so the regex
// match runs to the SECOND carcass's terminator, swallowing the live
// friendlyLive const between them.
func TestPruneOrphanBlocks_MalformedCarcassSkipped(t *testing.T) {
	src := "/* @rtOrphan /** @rtType A#aID *\\/\n" +
		"export const friendlyA = { a: {rt$label: ''} };\n" + // terminator removed here
		"export const friendlyLive = { live: {rt$label: ''} };\n" +
		"/* @rtOrphan /** @rtType B#bID *\\/\n" +
		"export const friendlyB = { b: {rt$label: ''} }; */\n"

	pruned, removed, skipped, pruneErr := PruneOrphanBlocks(src)
	if pruneErr != nil {
		t.Fatalf("prune errored (the malformed carcass must be SKIPPED, not refused): %v", pruneErr)
	}
	// The malformed first match (which spans friendlyLive) is skipped → 0 removed,
	// and the live const survives intact.
	if !strings.Contains(pruned, "friendlyLive") {
		t.Errorf("malformed carcass prune ate the live const:\n%s", pruned)
	}
	if removed != 0 {
		t.Errorf("a carcass spanning a live statement must be skipped; removed=%d", removed)
	}
	// The pure prune returns the skipped malformed carcass for the caller to warn on.
	if len(skipped) == 0 {
		t.Errorf("a malformed carcass spanning a live statement must be reported as skipped")
	}
}

// TestPruneOrphanBlocks_StringLiteralsNeverPruned closes the prune half of the
// lint/prune asymmetry (docs/todos → docs/done: prune-carcass-string-literal-
// anchoring): since PruneOrphanBlocks now shares CarcassMatches with the lint
// scan, prune removes EXACTLY what lint reports. A carcass byte sequence
// embedded in an AUTHORED string value (an rt$label / rt$errors template that
// documents the tag syntax) or inside a `//` line comment is neither reported
// nor pruned — it comes out byte-identical. The destructive twin of
// TestScanDirtyTags_StringLiteralsNeverFire.
func TestPruneOrphanBlocks_StringLiteralsNeverPruned(t *testing.T) {
	authored := "import type { FriendlyType } from '@ts-runtypes/core';\n" +
		"export const friendlyDocs: FriendlyType<Docs> = {\n" +
		"  snippet: {rt$label: 'Example: /* " + OrphanTag + " export const gone = {}; */'},\n" +
		"  note: {rt$errors: {required: \"use /* " + OrphanChildTag + " old: 1, */ to mark it\"}},\n" +
		"  // a /* " + OrphanTag + " export const alsoGone = {}; */ inside a line comment\n" +
		"};\n"

	pruned, removed, skipped, pruneErr := PruneOrphanBlocks(authored)
	if pruneErr != nil {
		t.Fatalf("prune errored on a valid authored mirror: %v", pruneErr)
	}
	if pruned != authored || removed != 0 || len(skipped) != 0 {
		t.Fatalf("authored strings / line comments must survive prune byte-identical; removed=%d skipped=%d\n%s", removed, len(skipped), pruned)
	}
	// Lint agrees: it reports nothing on the same text.
	if findings := ScanDirtyTags(authored); len(findings) != 0 {
		t.Errorf("lint must agree with prune (report nothing); got %+v", findings)
	}

	// A REAL carcass in the same file is still removed, and the authored
	// strings documenting the tag survive alongside it.
	withReal := authored + "/* " + OrphanTag + " export const friendlyGone = {}; */\n"
	prunedReal, removedReal, skippedReal, realErr := PruneOrphanBlocks(withReal)
	if realErr != nil {
		t.Fatalf("prune errored: %v", realErr)
	}
	if removedReal != 1 || len(skippedReal) != 0 {
		t.Fatalf("the real carcass must be removed; removed=%d skipped=%d\n%s", removedReal, len(skippedReal), prunedReal)
	}
	if !strings.Contains(prunedReal, "rt$label: 'Example: /* "+OrphanTag) {
		t.Errorf("authored string documenting the tag must survive a real prune:\n%s", prunedReal)
	}
	if strings.Contains(prunedReal, "friendlyGone") {
		t.Errorf("real carcass const must be gone:\n%s", prunedReal)
	}
}

// TestPruneOrphanBlocks_ParseErrorRefused: prune is destructive, so text that
// does not PARSE is refused whole (error, nothing removed, bytes untouched) —
// the same stance ParseMirror takes for gen --update. The CLI warns and skips
// the file; the user fixes the syntax and re-runs.
func TestPruneOrphanBlocks_ParseErrorRefused(t *testing.T) {
	broken := "export const = {{{;\n/* " + OrphanTag + " export const gone = {}; */\n"
	pruned, removed, skipped, pruneErr := PruneOrphanBlocks(broken)
	if pruneErr == nil {
		t.Fatalf("unparseable text must be refused; got removed=%d skipped=%d", removed, len(skipped))
	}
	if pruned != broken || removed != 0 {
		t.Errorf("refused text must come back byte-identical with nothing removed; removed=%d\n%s", removed, pruned)
	}
}

// TestIndexOrphanCarcasses_StringEmbeddedNeverIndexed closes the restore side
// of the string-literal anchoring: an authored mirror VALUE embedding the
// carcass syntax (an rt$label documenting it) must not register as a
// restorable carcass — a restore-on-reappear keyed off string bytes would
// splice the string's interior back in as live code.
func TestIndexOrphanCarcasses_StringEmbeddedNeverIndexed(t *testing.T) {
	src := "import type { FriendlyType } from '@ts-runtypes/core';\n" +
		"\n" +
		"/** @rtType Docs#docsID */\n" +
		"export const friendlyDocs: FriendlyType<Docs> = {\n" +
		"  snippet: {rt$label: 'x /* @rtOrphan export const friendlyGone = {}; */'},\n" +
		"};\n"
	index := mustParse(t, "/rt/gen/a.ts", src)
	if len(index.orphanCarcasses) != 0 {
		t.Errorf("string-embedded carcass bytes must not index as restorable; got %d", len(index.orphanCarcasses))
	}

	// A REAL carcass in the same file still indexes.
	withReal := src + "\n/* @rtOrphan /** @rtType Gone#goneID *\\/\nexport const friendlyGone: FriendlyType<Gone> = { rt$label: '' }; */\n"
	indexReal := mustParse(t, "/rt/gen/a.ts", withReal)
	if _, ok := indexReal.orphanCarcasses["friendlyGone"]; !ok {
		t.Errorf("the real carcass must still index; have %d carcasses", len(indexReal.orphanCarcasses))
	}
}

// TestCarcassCrossesStatement covers the per-tag thresholds directly.
func TestCarcassCrossesStatement(t *testing.T) {
	// A well-formed whole-const carcass wraps exactly one declaration → fine.
	if carcassCrossesStatement("/* @rtOrphan\nexport const friendlyA = {}; */") {
		t.Errorf("a single-const @rtOrphan carcass must not be flagged")
	}
	// Two declarations in a whole-const carcass → ate the next one.
	if !carcassCrossesStatement("/* @rtOrphan\nexport const a = {};\nexport const b = {}; */") {
		t.Errorf("a two-const @rtOrphan carcass must be flagged")
	}
	// A field carcass should wrap NO declaration; one means it spilled.
	if !carcassCrossesStatement("/* @rtOrphanChild old: {},\nexport const leak = {}; */") {
		t.Errorf("an @rtOrphanChild carcass containing a declaration must be flagged")
	}
	if carcassCrossesStatement("/* @rtOrphanChild old: {rt$label: 'Old'}, */") {
		t.Errorf("a clean @rtOrphanChild field carcass must not be flagged")
	}
}
