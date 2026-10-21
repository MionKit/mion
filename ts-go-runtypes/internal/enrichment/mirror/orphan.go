package mirror

import (
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/mion/ts-go-runtypes/internal/enrichment"
)

// findCarcass returns the carcass whose preserved value a reappearing const restores, matched by VAR NAME.
// Matching on the name rather than the shared structural id keeps a different same-shape type from reviving it.
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

// orphanConsts wraps each no-longer-wanted OWNED const in an @rtOrphan block and returns those entries for the
// breadcrumb recompute. The rule is CONSERVATIVE: absent from the desired set AND no longer declared by the breadcrumb
// source, which is what tells a deleted type from one merely outside this invocation's closure.
// A per-locale translation file uses the SAME oracle, its breadcrumb pointing at the source .ts.
func orphanConsts(ops *[]spliceOp, index *Index, spec Spec, readSource func(string) (string, error), renamed map[*constEntry]bool) []*constEntry {
	var orphaned []*constEntry
	if spec.Out != "" {
		// With --out many source files land in one file whose breadcrumb resolves only ONE of them, which would
		// wrongly orphan a still-existing cross-file type.
		return orphaned
	}

	if index.breadcrumb == nil {
		return orphaned // no source link, so declaration cannot be judged safely
	}
	resolvedSource := ResolveBreadcrumb(spec.MirrorPath, index.breadcrumb.specifier)
	sourceText, err := readSource(resolvedSource)
	if err != nil {
		return orphaned // an unreadable source orphans nothing
	}

	desiredVars := desiredVarSet(spec)
	for _, entry := range index.consts {
		if desiredVars[entry.varName] || renamed[entry] {
			continue // still wanted by name, or carried by a const rename
		}
		typeName := entry.typeName
		if typeName == "" {
			continue // cannot judge without a type name
		}
		if SourceDeclaresType(sourceText, typeName) {
			continue // the type still exists, it is merely outside this closure
		}
		// The original text is preserved verbatim inside the block, for a later restore.
		*ops = append(*ops, orphanConstOp(index.raw, entry))
		orphaned = append(orphaned, entry)
	}
	return orphaned
}

// orphanConstOp builds the splice commenting a whole const out as a carcass, verbatim so it can be restored.
// It starts at the leading-trivia content, so a HAND-AUTHORED comment above the marker folds INTO the carcass and
// --prune removes it cleanly instead of leaving dangling cruft.
func orphanConstOp(raw []byte, entry *constEntry) spliceOp {
	// The marker block preserves the id, so prefer it over the keyword.
	start := entry.tokenStart
	if entry.markerStart != entry.markerEnd {
		start = entry.markerStart
	}
	// The first non-whitespace byte from fullStart folds a hand-authored leading comment in, but never advance PAST
	// the default start, guarding a fullStart that somehow lands inside the const.
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

// syncBreadcrumbClause replaces ONLY the breadcrumb's type-name clause, its `from '<src>'` specifier staying byte-identical.
// A name survives when an un-orphaned const carries it, a desired const declared in THIS source needs it, or it is still
// referenced outside the orphaned ranges, which is how a HAND-AUTHORED const keeps the type it annotates with.
// No-op when the recomputed clause equals the current one.
func syncBreadcrumbClause(ops *[]spliceOp, index *Index, spec Spec, orphanedEntries []*constEntry, renamed map[*constEntry]bool) {
	if index.breadcrumb == nil || index.breadcrumb.clauseStart == 0 {
		return
	}

	// A type name leaves when its const is orphaned or renamed, the rename's NEW name arriving with the desired set.
	// removedEntries also feeds the blanking, so an old name in a not-yet-spliced annotation is not read as a live use.
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
	// Existing consts' type names, minus the orphaned and renamed ones.
	for _, entry := range index.consts {
		if entry.typeName == "" || removedTypeNames[entry.typeName] {
			continue
		}
		names[entry.typeName] = true
	}
	// Every desired const whose type is declared in THIS source file: added, restored, renamed-to or merged in place.
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
	// A name still referenced outside the removed ranges MUST stay, or a hand-authored const's annotation breaks;
	// this step only ever ADDS. The import clause names them all, so blank its range too: only USES count as live.
	blanked := orphanRanges(removedEntries)
	blanked = append(blanked, [2]int{index.breadcrumb.tokenStart, index.breadcrumb.end})
	survivingText := textOutsideRanges(index.raw, blanked)
	for _, name := range index.breadcrumb.names {
		if name != "" && referencesIdentifier(survivingText, name) {
			names[name] = true
		}
	}

	if len(names) == 0 {
		return // an empty breadcrumb clause would break the import
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

// ensureCrossFileImports adds an import line for each referenced var homed in another mirror and not already imported,
// right after the existing import block; merged comes back unchanged when nothing is needed.
func ensureCrossFileImports(merged []byte, spec Spec, index *Index, body string) []byte {
	if spec.Out != "" {
		return merged // with --out every const lives in one file, so no imports
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
			continue // an intra-file or unknown var needs no import
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

// importBlockEnd is the offset just after the last import statement, where a new cross-file import goes; 0 when there is none.
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

// desiredVarSet collects the desired const set's var names, honoring the family flags.
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

// orphanRanges returns the span each @rtOrphan wrap will comment out, so a reference inside it stops counting as live.
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

// textOutsideRanges blanks each range, keeping newlines, to model the POST-splice file: a token inside a blanked span
// must NOT count as a live use of a type name.
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
				out[i] = ' ' // keep newlines for readability
			}
		}
	}
	return string(out)
}

// referencesIdentifier requires a word boundary on both sides, so `User` does not match inside `UserProfile`.
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

// isIdentByte reports whether b is a JS identifier byte, for referencesIdentifier's word-boundary check.
func isIdentByte(b byte) bool {
	return b == '_' || b == '$' ||
		(b >= 'a' && b <= 'z') || (b >= 'A' && b <= 'Z') || (b >= '0' && b <= '9')
}
