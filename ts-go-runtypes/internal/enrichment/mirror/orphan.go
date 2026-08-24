package mirror

import (
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-runtypes/internal/enrichment"
)

// findCarcass returns the @rtOrphan carcass for a reappearing desired const,
// matched by VAR NAME — the SAME named type (friendly<Name> / mock<Name>) came
// back, so its preserved value is restored. Matching by var name (not the shared
// structural id) keeps a DIFFERENT same-shape type from reviving this carcass's
// old-named const, and stops two same-shape desired consts from both restoring it.
func findCarcass(index *Index, named enrichment.NamedConst, friendly bool) *carcassEntry {
	varName := named.MockVar
	if friendly {
		varName = named.FriendlyVar
	}
	if varName == "" {
		return nil
	}
	return index.orphanCarcasses[varName]
}

// orphanConsts wraps each existing OWNED const that is no longer wanted in an
// `/* @rtOrphan … */` block, and returns the orphaned const entries (for the
// breadcrumb-clause recompute, which needs both their type names and byte
// ranges). The rule is CONSERVATIVE: a const is orphaned only when it is BOTH
// (a) absent from the desired set AND (b) its source type is no longer declared
// by the resolved breadcrumb source. Condition (b) is what distinguishes a
// genuinely-deleted type from one simply not in this gen invocation's closure
// (another type in the same mirror file) — the latter is left untouched.
// Per-locale translation files use the SAME oracle: a translation const's type
// name comes from its @rtType/annotation exactly like a source const's, and its
// breadcrumb import points at the src .ts.
func orphanConsts(ops *[]spliceOp, index *Index, spec Spec, readSource func(string) (string, error), renamed map[*constEntry]bool) []*constEntry {
	var orphaned []*constEntry
	if spec.Out != "" {
		// Single-file --out: every const across MANY source files lands here, but the
		// breadcrumb resolves only ONE source — judging declaration against it would
		// wrongly orphan a still-existing cross-file type. Skip the orphan judgement.
		return orphaned
	}

	if index.breadcrumb == nil {
		return orphaned // no source link → can't safely judge declaration
	}
	resolvedSource := ResolveBreadcrumb(spec.MirrorPath, index.breadcrumb.specifier)
	sourceText, err := readSource(resolvedSource)
	if err != nil {
		return orphaned // source unreadable → be conservative, orphan nothing
	}

	desiredVars := desiredVarSet(spec)
	for _, entry := range index.consts {
		if desiredVars[entry.varName] || renamed[entry] {
			continue // still wanted by name, or carried by a const rename
		}
		typeName := entry.typeName
		if typeName == "" {
			continue // can't judge without a type name
		}
		if SourceDeclaresType(sourceText, typeName) {
			continue // the type still exists — not an orphan (just not in this closure)
		}
		// Orphan it: wrap the whole const (from its marker/keyword start to End) in
		// an @rtOrphan block, preserving the original text verbatim for restore.
		*ops = append(*ops, orphanConstOp(index.raw, entry))
		orphaned = append(orphaned, entry)
	}
	return orphaned
}

// orphanConstOp builds the splice that comments out a whole const as an
// @rtOrphan carcass. The range starts at the const's leading-trivia content (its
// first non-whitespace byte from fullStart) — so a HAND-AUTHORED leading comment
// above the marker is folded INTO the carcass and --prune removes it cleanly
// instead of leaving dangling cruft — and runs to the statement End (plus a
// trailing newline). The marker + the const + any leading comment are preserved
// verbatim for a later restore.
func orphanConstOp(raw []byte, entry *constEntry) spliceOp {
	// Default to the marker block (preserves the id) or the keyword.
	start := entry.tokenStart
	if entry.markerStart != entry.markerEnd {
		start = entry.markerStart
	}
	// Prefer the first non-whitespace byte from fullStart: this folds a
	// hand-authored leading comment (which sits before the marker) into the
	// carcass. Never advance PAST the default start (guard against a fullStart that
	// somehow lands inside the const).
	if entry.fullStart >= 0 && entry.fullStart < start {
		cursor := entry.fullStart
		for cursor < start && isSpaceByte(raw[cursor]) {
			cursor++
		}
		start = cursor
	}
	end := entry.end
	original := strings.TrimRight(string(raw[start:end]), "\n")
	replacement := "/* " + OrphanTag + " " + sanitizeForComment(original) + " */"
	// Swallow a trailing newline so the carcass occupies the const's line cleanly.
	if end < len(raw) && raw[end] == '\n' {
		end++
		replacement += "\n"
	}
	return spliceOp{start: start, end: end, text: replacement}
}

// syncBreadcrumbClause recomputes the source breadcrumb's `{ … }` type-name
// clause from the surviving consts and replaces ONLY the clause (the
// `from '<src>'` specifier stays byte-identical). Surviving names = existing
// const type names (minus orphaned) ∪ DESIRED const type names that are declared
// in THIS mirror's source file (covers added AND restored consts) ∪ any CURRENT
// breadcrumb name still textually referenced in the post-splice file outside the
// orphaned ranges (covers a name a HAND-AUTHORED const still uses — never drop
// it, or that const's type breaks). No-op when the recomputed clause equals the
// current one (idempotent).
func syncBreadcrumbClause(ops *[]spliceOp, index *Index, spec Spec, orphanedEntries []*constEntry, renamed map[*constEntry]bool) {
	if index.breadcrumb == nil || index.breadcrumb.clauseStart == 0 {
		return
	}

	// A const's type name leaves the breadcrumb when the const is orphaned OR
	// renamed (a rename's NEW name arrives via the desired set below). removedEntries
	// also feeds the ADD-only blanking so the old name in a renamed const's
	// not-yet-spliced annotation/marker is not mistaken for a live use.
	removedTypeNames := map[string]bool{}
	removedEntries := append([]*constEntry{}, orphanedEntries...)
	for _, entry := range orphanedEntries {
		if entry.typeName != "" {
			removedTypeNames[entry.typeName] = true
		}
	}
	for entry := range renamed {
		if entry.typeName != "" {
			removedTypeNames[entry.typeName] = true
		}
		removedEntries = append(removedEntries, entry)
	}

	names := map[string]bool{}
	// Existing consts' type names, minus orphaned/renamed ones.
	for _, entry := range index.consts {
		if entry.typeName == "" || removedTypeNames[entry.typeName] {
			continue
		}
		names[entry.typeName] = true
	}
	// Every desired const whose type is declared in THIS source file — added,
	// restored, renamed-to, or property-merged in place.
	thisSource := tspath.NormalizePath(spec.SourceFile)
	for _, named := range spec.Consts {
		declFile := named.DeclFile
		if declFile == "" {
			declFile = spec.SourceFile
		}
		if tspath.NormalizePath(declFile) == thisSource && named.TypeName != "" {
			names[named.TypeName] = true
		}
	}
	// ADD-only safety: a current breadcrumb name still textually referenced
	// OUTSIDE the orphaned/renamed const ranges (e.g. in a hand-authored `const x:
	// SomeType = …` the enrichment owns no entry for) MUST stay — dropping it
	// breaks that const's type annotation. We only ever ADD here, never remove.
	// The breadcrumb import statement itself references every name (the `import
	// type { … }` clause), so blank ITS range too — only USES outside the import
	// count as live.
	blanked := orphanRanges(removedEntries)
	blanked = append(blanked, [2]int{index.breadcrumb.tokenStart, index.breadcrumb.end})
	survivingText := textOutsideRanges(index.raw, blanked)
	for _, name := range index.breadcrumb.names {
		if name != "" && referencesIdentifier(survivingText, name) {
			names[name] = true
		}
	}

	if len(names) == 0 {
		return // never empty the breadcrumb clause (would break the import)
	}
	sortedNames := make([]string, 0, len(names))
	for name := range names {
		sortedNames = append(sortedNames, name)
	}
	sort.Strings(sortedNames)
	newClause := strings.Join(sortedNames, ", ")

	current := string(index.raw[index.breadcrumb.clauseStart:index.breadcrumb.clauseEnd])
	if current == newClause {
		return // unchanged
	}
	*ops = append(*ops, spliceOp{start: index.breadcrumb.clauseStart, end: index.breadcrumb.clauseEnd, text: newClause})
}

// ensureCrossFileImports adds an `import { friendly*/mock* } from '<rel>'` line
// for each cross-file var the new const bodies reference whose home mirror file
// differs from this one AND which is not already imported. The new lines are
// inserted right after the existing import block (after the DSL import, or the
// breadcrumb). Returns merged unchanged when nothing is needed.
func ensureCrossFileImports(merged []byte, spec Spec, index *Index, body string) []byte {
	if spec.Out != "" {
		return merged // single-file --out: every const lives in one file, no imports
	}
	alreadyImported := map[string]bool{}
	for _, valueImport := range index.valueImports {
		for _, name := range valueImport.names {
			alreadyImported[name] = true
		}
	}

	thisSource := tspath.NormalizePath(spec.SourceFile)
	importsByMirror := map[string]map[string]bool{}
	for _, varName := range ReferencedVars(body) {
		if alreadyImported[varName] {
			continue
		}
		declFile, ok := spec.VarDeclFile[varName]
		if !ok || tspath.NormalizePath(declFile) == thisSource {
			continue // intra-file or unknown — no import
		}
		targetMirror := spec.MirrorPathFor(declFile)
		if importsByMirror[targetMirror] == nil {
			importsByMirror[targetMirror] = map[string]bool{}
		}
		importsByMirror[targetMirror][varName] = true
	}
	if len(importsByMirror) == 0 {
		return merged
	}

	var newLines strings.Builder
	for _, line := range CrossFileImportLines(spec.MirrorPath, importsByMirror) {
		newLines.WriteString(line)
	}

	insertAt := importBlockEnd(index)
	return []byte(string(merged[:insertAt]) + newLines.String() + string(merged[insertAt:]))
}

// importBlockEnd returns the byte offset just after the last import statement
// (DSL import, breadcrumb, or value imports — whichever ends latest), where new
// cross-file imports are inserted. Falls back to 0 when there are no imports.
func importBlockEnd(index *Index) int {
	end := 0
	for _, entry := range []*importEntry{index.breadcrumb, index.dslImport} {
		if entry != nil && entry.end > end {
			end = entry.end
		}
	}
	for _, entry := range index.valueImports {
		if entry.end > end {
			end = entry.end
		}
	}
	// Advance past the import statement's trailing newline.
	if end > 0 && end < len(index.raw) && index.raw[end] == '\n' {
		end++
	}
	return end
}

// desiredVarSet collects the friendly + mock var names of the desired const set,
// honoring the WantFriendly / WantMock flags.
func desiredVarSet(spec Spec) map[string]bool {
	out := map[string]bool{}
	for _, named := range spec.Consts {
		if spec.WantFriendly {
			out[named.FriendlyVar] = true
		}
		if spec.WantMock {
			out[named.MockVar] = true
		}
	}
	return out
}

// orphanRanges returns each orphaned const's orphan-op byte range — [markerStart
// or tokenStart, end) — the span that will be commented out by the @rtOrphan
// wrap, so references inside it no longer count as live.
func orphanRanges(orphaned []*constEntry) [][2]int {
	ranges := make([][2]int, 0, len(orphaned))
	for _, entry := range orphaned {
		start := entry.tokenStart
		if entry.markerStart != entry.markerEnd {
			start = entry.markerStart
		}
		ranges = append(ranges, [2]int{start, entry.end})
	}
	return ranges
}

// textOutsideRanges returns raw with each given byte range blanked (replaced by
// spaces, newlines preserved). It models the POST-splice file: the blanked spans
// (orphaned consts + the breadcrumb import itself) are content whose token
// references must NOT count as a live use of a type name.
func textOutsideRanges(raw []byte, ranges [][2]int) string {
	if len(ranges) == 0 {
		return string(raw)
	}
	out := make([]byte, len(raw))
	copy(out, raw)
	for _, r := range ranges {
		start, end := r[0], r[1]
		if start < 0 {
			start = 0
		}
		if end > len(out) {
			end = len(out)
		}
		for i := start; i < end; i++ {
			if out[i] != '\n' {
				out[i] = ' ' // blank the range but keep newlines for readability
			}
		}
	}
	return string(out)
}

// referencesIdentifier reports whether text contains name as a standalone
// identifier token (word-boundary on both sides — a letter/digit/`_`/`$`
// neighbour disqualifies it, so `User` does not match inside `UserProfile`).
func referencesIdentifier(text, name string) bool {
	if name == "" {
		return false
	}
	from := 0
	for {
		idx := strings.Index(text[from:], name)
		if idx < 0 {
			return false
		}
		pos := from + idx
		beforeOK := pos == 0 || !isIdentByte(text[pos-1])
		afterPos := pos + len(name)
		afterOK := afterPos >= len(text) || !isIdentByte(text[afterPos])
		if beforeOK && afterOK {
			return true
		}
		from = pos + 1
	}
}

// isIdentByte reports whether b is a JS identifier byte (letter, digit, `_`,
// or `$`) — used for the word-boundary check in referencesIdentifier.
func isIdentByte(b byte) bool {
	return b == '_' || b == '$' ||
		(b >= 'a' && b <= 'z') || (b >= 'A' && b <= 'Z') || (b >= '0' && b <= '9')
}
