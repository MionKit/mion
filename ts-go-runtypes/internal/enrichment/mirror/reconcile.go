package mirror

import (
	"errors"
	"regexp"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/enrichment"
)

// orphanBlockPattern matches both carcass forms, non-greedy up to the first ` */`.
// A carcass's own inner `*/` was sanitized to `* /` when written, so that first ` */` is its true terminator.
var orphanBlockPattern = regexp.MustCompile(`(?s)` + OrphanBlockPatternSource)

// friendlyReservedKeys / mockReservedKeys are the META keys a node carries beside its fields, never merged or renamed.
// Every `rt$` key is meta by construction, the prefix being reserved; the mock family also reserves pool, min and max.
var friendlyReservedKeys = map[string]bool{
	"rt$label": true, "rt$errors": true, "rt$items": true,
	"rt$slots": true, "rt$keys": true, "rt$values": true,
}

var mockReservedKeys = map[string]bool{
	"rt$items": true, "rt$length": true, "rt$optional": true,
	"rt$slots": true, "rt$keys": true, "rt$values": true, "rt$size": true,
	"pool": true, "min": true, "max": true,
}

// Reconcile matches the existing mirror against spec's desired const set and returns the new bytes plus whether they
// differ, false on an idempotent re-run. It NEVER writes to disk, and readSource is injected so the orphan judgement
// can read the breadcrumb source without this package touching the filesystem.
func Reconcile(spec Spec, existing []byte, readSource func(string) (string, error)) ([]byte, bool, error) {
	index, err := ParseMirror(spec.MirrorPath, existing)
	if err != nil {
		return nil, false, err
	}

	var ops []spliceOp
	var addedConsts []enrichment.NamedConst

	// A renamed type keeps its name-independent structural id but changes var and annotation, so its const is CARRIED
	// in place rather than orphaned and regenerated empty.
	// A renamed const is excluded from the passes below, which would double-process it into overlapping splices.
	renames := computeConstRenames(index, spec)
	renamedExisting := map[*constEntry]bool{}
	renamedDesiredVar := map[string]bool{}
	for _, rename := range renames {
		emitConstRename(&ops, index, rename)
		renamedExisting[rename.existing] = true
		renamedDesiredVar[renameDesiredVar(rename)] = true
	}

	// Merge, queue or restore each desired const not already handled as a rename.
	for _, named := range spec.Consts {
		if spec.WantFriendly && !renamedDesiredVar[named.FriendlyVar] {
			reconcileOneConst(&ops, &addedConsts, index, named, true)
		}
		if spec.WantMock && !renamedDesiredVar[named.MockVar] {
			reconcileOneConst(&ops, &addedConsts, index, named, false)
		}
	}

	// An owned const that is neither desired nor renamed, and whose type is no longer declared, is orphaned.
	orphanedEntries := orphanConsts(&ops, index, spec, readSource, renamedExisting)

	// The type-name list is recomputed from the surviving consts, keeping `from '<src>'` byte-identical.
	syncBreadcrumbClause(&ops, index, spec, orphanedEntries, renamedExisting)

	// A file authored before the friendly-text rename migrates lazily here, on its next `enrich --update`.
	migrateLegacyFriendlyWrapper(&ops, index, orphanedEntries)

	// The in-place splices go first, all indexing the ORIGINAL bytes, then the appended consts and their imports.
	merged, err := applySplices(index.raw, ops)
	if err != nil {
		return nil, false, err
	}

	// A sibling const may still REFERENCE a renamed var, since the body merge keeps a leaf present in both byte-identical.
	// The rewrite runs POST-splice over the merged bytes, so it can never overlap a splice, and it reaches a carcass's
	// preserved text too, so a later restore references the LIVE const.
	for _, rename := range renames {
		newVar := renameDesiredVar(rename)
		if rename.existing.varName != newVar {
			merged = replaceIdentifierAll(merged, rename.existing.varName, newVar)
		}
	}

	appended := appendNewConsts(merged, spec, index, addedConsts)

	if string(appended) == string(existing) {
		return appended, false, nil // idempotent no-op
	}
	return appended, true, nil
}

// RenameIdentifierAll is the reconcile's boundary-aware renamer, exported for the translate driver, which renames a
// body's sibling const references to their locale-prefixed twins.
func RenameIdentifierAll(text []byte, oldVar, newVar string) []byte {
	return replaceIdentifierAll(text, oldVar, newVar)
}

// replaceIdentifierAll requires a word boundary on both sides, so `friendlyUser` never matches inside `friendlyUserProfile`.
func replaceIdentifierAll(text []byte, oldVar, newVar string) []byte {
	source := string(text)
	var b strings.Builder
	from := 0
	for {
		idx := strings.Index(source[from:], oldVar)
		if idx < 0 {
			b.WriteString(source[from:])
			return []byte(b.String())
		}
		pos := from + idx
		afterPos := pos + len(oldVar)
		beforeOK := pos == 0 || !isIdentByte(source[pos-1])
		afterOK := afterPos >= len(source) || !isIdentByte(source[afterPos])
		if beforeOK && afterOK {
			b.WriteString(source[from:pos])
			b.WriteString(newVar)
			from = afterPos
			continue
		}
		b.WriteString(source[from : pos+1])
		from = pos + 1
	}
}

// reconcileOneConst property-merges ONE const against its existing match, or queues it for append when there is none;
// addedConsts dedups, so a friendly and mock pair queues its NamedConst once.
func reconcileOneConst(ops *[]spliceOp, addedConsts *[]enrichment.NamedConst, index *Index, named enrichment.NamedConst, friendly bool) {
	varName, body, metaKeys := formParts(named, friendly)

	existing := findExistingConst(index, varName)
	if existing == nil {
		// A carcass is un-commented rather than regenerated, its comment sanitization reversed.
		// Its marker is REFRESHED to the desired id, since a type orphaned while its shape churned reappears with a new
		// one: without that refresh a SECOND --update would correct it, so the reconcile would not converge in one pass.
		if carcass := findCarcass(index, named, friendly); carcass != nil {
			restored := refreshRestoredMarker(unsanitizeFromComment(carcass.inner), named)
			*ops = append(*ops, spliceOp{start: carcass.start, end: carcass.end, text: restored + "\n"})
			return
		}
		queueNewConst(addedConsts, named)
		return
	}
	if existing.body == nil {
		// An initializer that is not an object literal, hand-edited to a function say, is left untouched.
		return
	}

	// A drifted marker is refreshed, so the next reconcile matches by id again instead of the var-name fallback.
	refreshMarker(ops, index.raw, existing, named)

	mergeConstBody(ops, index, existing, body, metaKeys, named.ChildIDs, friendly)
}

// formParts returns one form's var name, body and reserved-key set, the selection both callers make before merging.
func formParts(named enrichment.NamedConst, friendly bool) (varName, body string, metaKeys map[string]bool) {
	if friendly {
		return named.FriendlyVar, named.Friendly, friendlyReservedKeys
	}
	return named.MockVar, named.Mock, mockReservedKeys
}

// mergeConstBody records one const's property-merge splices; it assumes existing.body is non-nil, which the caller guards,
// and no-ops when the desired body is not an object literal.
func mergeConstBody(ops *[]spliceOp, index *Index, existing *constEntry, body string, metaKeys map[string]bool, desiredChild map[string]string, friendly bool) {
	existingView := newObjectView(string(index.raw), index.sourceFile, existing.body)
	desiredView := parseDesiredObject(body)
	if desiredView == nil {
		return
	}
	mergeObject(ops, existingView, desiredView, mergeCtx{
		metaKeys:       metaKeys,
		existingChild:  existing.childIDs,
		desiredChild:   desiredChild,
		friendlyFamily: friendly,
	})
}

// refreshMarker splices the existing marker in line with the desired ids, or inserts one when a hand-authored const
// carries none; it no-ops when the marker already matches.
func refreshMarker(ops *[]spliceOp, raw []byte, existing *constEntry, named enrichment.NamedConst) {
	desired := MarkerComment(named)
	if desired == "" {
		return
	}
	if existing.markerStart != existing.markerEnd {
		// The marker range already includes its newline.
		current := string(raw[existing.markerStart:existing.markerEnd])
		if current == desired {
			return // identical, so no-op
		}
		*ops = append(*ops, spliceOp{start: existing.markerStart, end: existing.markerEnd, text: desired})
		return
	}
	// With no existing marker, insert one just before the `export` / `const` keyword.
	*ops = append(*ops, spliceOp{start: existing.tokenStart, end: existing.tokenStart, text: desired})
}

// refreshRestoredMarker is refreshMarker's in-string analogue, for a restore where the const is spliced whole and not
// yet indexed, so the offset-based path cannot run.
// The search is bounded to before the `export` / `const` keyword, so a body token cannot match.
func refreshRestoredMarker(inner string, named enrichment.NamedConst) string {
	desired := MarkerComment(named)
	if desired == "" {
		return inner
	}
	tokenStart := len(inner)
	if at := strings.Index(inner, "export const"); at >= 0 {
		tokenStart = at
	} else if at := strings.Index(inner, "const "); at >= 0 {
		tokenStart = at
	}
	start, end := markerBlockRange(inner, 0, tokenStart)
	if start == end {
		return inner // a hand-authored const has no marker to refresh
	}
	return inner[:start] + desired + inner[end:]
}

// findExistingConst matches BY NAME, the emission identity, so two same-shape types sharing a structural id stay distinct.
// An id match would conflate them, and would also match a renamed const that is simultaneously orphaned by name, whose
// splices then overlap. A const whose name CHANGED is paired separately by computeConstRenames.
func findExistingConst(index *Index, varName string) *constEntry {
	if entry, ok := index.byVar[varName]; ok {
		return entry
	}
	return nil
}

// constRename links an existing const to the desired const it was RENAMED into: same form, new type name.
type constRename struct {
	existing *constEntry
	desired  enrichment.NamedConst
	friendly bool
}

// renameDesiredVar is the var name the renamed const takes.
func renameDesiredVar(rename constRename) string {
	if rename.friendly {
		return rename.desired.FriendlyVar
	}
	return rename.desired.MockVar
}

// constMatchThreshold is the minimum graph-parity score for a rename pairing; below it the overlap is too weak to call
// a rename, so the const falls through to the safe orphan and scaffold path.
const constMatchThreshold = 0.5

// computeConstRenames pairs a DROPPED existing const with an ADDED desired one when they are the same logical type
// under a new name, so its authored tree carries.
// Matching is by GRAPH PARITY, not id alone: a rename that ALSO reshapes changes the id, and an id-only matcher would
// lose the carry. Only STRICT MUTUAL-BEST pairs above the threshold are taken, so two same-shape types renamed at once
// tie, have no unique best, and fall through rather than mis-attributing an authored value to the wrong type.
func computeConstRenames(index *Index, spec Spec) []constRename {
	refLinks := buildReferentialLinks(index, spec)
	var renames []constRename
	for _, friendly := range []bool{true, false} {
		if friendly && !spec.WantFriendly {
			continue
		}
		if !friendly && !spec.WantMock {
			continue
		}
		desiredVars := desiredVarsForForm(spec, friendly)
		existingVars := existingVarsForForm(index, friendly)

		var drops []*constEntry
		for _, entry := range index.consts {
			if entry.isFriendly != friendly || entry.typeID == "" || desiredVars[entry.varName] {
				continue
			}
			drops = append(drops, entry)
		}
		var adds []enrichment.NamedConst
		for _, named := range spec.Consts {
			if named.TypeID == "" {
				continue
			}
			varName := named.MockVar
			if friendly {
				varName = named.FriendlyVar
			}
			if existingVars[varName] {
				continue
			}
			adds = append(adds, named)
		}
		renames = append(renames, pairRenames(drops, adds, friendly, refLinks)...)
	}
	return renames
}

// buildReferentialLinks records, per field path present on both sides, that a parent REPOINTED one child id to another.
// That repointing is evidence the old child type became the new one, the only signal surviving a NOMINAL rename such as
// an enum's, whose id is name-dependent and whose const has no field graph to score.
// Keys carry the parent TYPE NAME, so a parent renamed itself has no stable anchor and records no link, which is safe.
func buildReferentialLinks(index *Index, spec Spec) map[string]map[string]bool {
	existingFieldChild := map[string]string{}
	for _, entry := range index.consts {
		if entry.typeName == "" {
			continue
		}
		for path, childID := range entry.childIDs {
			existingFieldChild[entry.typeName+"|"+path] = childID
		}
	}
	links := map[string]map[string]bool{}
	for _, named := range spec.Consts {
		if named.TypeName == "" {
			continue
		}
		for path, newID := range named.ChildIDs {
			oldID, ok := existingFieldChild[named.TypeName+"|"+path]
			if !ok || oldID == "" || newID == "" || oldID == newID {
				continue
			}
			if links[oldID] == nil {
				links[oldID] = map[string]bool{}
			}
			links[oldID][newID] = true
		}
	}
	return links
}

// pairRenames takes a pair only when each side is the other's unique best above the threshold; any tie at either
// maximum is ambiguous and leaves the pair unselected.
func pairRenames(drops []*constEntry, adds []enrichment.NamedConst, friendly bool, refLinks map[string]map[string]bool) []constRename {
	if len(drops) == 0 || len(adds) == 0 {
		return nil
	}
	score := make([][]float64, len(drops))
	for i, drop := range drops {
		score[i] = make([]float64, len(adds))
		for k, add := range adds {
			score[i][k] = constSimilarity(drop, add, refLinks)
		}
	}
	var renames []constRename
	for i := range drops {
		bestAdd, addUnique := strictArgmax(score[i])
		if bestAdd < 0 || !addUnique || score[i][bestAdd] < constMatchThreshold {
			continue
		}
		column := make([]float64, len(drops))
		for k := range drops {
			column[k] = score[k][bestAdd]
		}
		if bestDrop, dropUnique := strictArgmax(column); bestDrop != i || !dropUnique {
			continue
		}
		renames = append(renames, constRename{existing: drops[i], desired: adds[bestAdd], friendly: friendly})
	}
	return renames
}

// strictArgmax returns the greatest value's index and whether it is STRICT, no other index tying it.
func strictArgmax(values []float64) (int, bool) {
	if len(values) == 0 {
		return -1, false
	}
	best := 0
	for i := 1; i < len(values); i++ {
		if values[i] > values[best] {
			best = i
		}
	}
	for i := range values {
		if i != best && values[i] == values[best] {
			return best, false
		}
	}
	return best, true
}

// constSimilarity scores how likely a drop was RENAMED into an add. A shared whole-graph id is a 1.0 fast path, and so
// is a referential link, the only signal surviving a nominal rename.
// Otherwise it blends the overlap of top-level field NAMES, the skeleton that survives a reshape, with the overlap of
// name plus child-id PAIRS, which only counts a field whose child type also matches: that keeps a renamed-and-grown
// type above the threshold and a coincidental field-name collision below it.
// Even a 1.0 goes through pairRenames' strict mutual-best, so an ambiguous repoint ties and falls through.
func constSimilarity(existing *constEntry, desired enrichment.NamedConst, refLinks map[string]map[string]bool) float64 {
	if existing.typeID != "" && existing.typeID == desired.TypeID {
		return 1.0
	}
	if existing.typeID != "" && desired.TypeID != "" {
		if news := refLinks[existing.typeID]; news[desired.TypeID] {
			return 1.0
		}
	}
	names := diceOverlap(topLevelNames(existing.childIDs), topLevelNames(desired.ChildIDs))
	pairs := diceOverlap(topLevelPairs(existing.childIDs), topLevelPairs(desired.ChildIDs))
	return 0.5*names + 0.5*pairs
}

// topLevelNames excludes a dotted path: that is a parent field's sub-graph, not a top-level field.
func topLevelNames(childIDs map[string]string) map[string]bool {
	out := map[string]bool{}
	for path := range childIDs {
		if !strings.Contains(path, ".") {
			out[path] = true
		}
	}
	return out
}

// topLevelPairs identifies a top-level field by name AND child type id, so it matches only when both agree.
func topLevelPairs(childIDs map[string]string) map[string]bool {
	out := map[string]bool{}
	for path, id := range childIDs {
		if !strings.Contains(path, ".") {
			out[path+"#"+id] = true
		}
	}
	return out
}

// diceOverlap is the Sørensen-Dice coefficient, 0 when both sets are empty: an empty graph carries no identity to match on.
func diceOverlap(a, b map[string]bool) float64 {
	if len(a) == 0 && len(b) == 0 {
		return 0
	}
	intersection := 0
	for key := range a {
		if b[key] {
			intersection++
		}
	}
	return 2 * float64(intersection) / float64(len(a)+len(b))
}

// desiredVarsForForm collects the desired var names of one form.
func desiredVarsForForm(spec Spec, friendly bool) map[string]bool {
	out := map[string]bool{}
	for _, named := range spec.Consts {
		if friendly {
			out[named.FriendlyVar] = true
		} else {
			out[named.MockVar] = true
		}
	}
	return out
}

// existingVarsForForm collects the existing const var names of one form.
func existingVarsForForm(index *Index, friendly bool) map[string]bool {
	out := map[string]bool{}
	for _, entry := range index.consts {
		if entry.isFriendly == friendly {
			out[entry.varName] = true
		}
	}
	return out
}

// emitConstRename carries a renamed const, rewriting its var, annotation and marker, then merging the desired body in.
// A pure rename leaves the body byte-identical, with no carcass and no fresh empty twin.
// The emitted ops cover disjoint regions, marker, var, annotation and body fields, so they never overlap.
func emitConstRename(ops *[]spliceOp, index *Index, rename constRename) {
	existing := rename.existing
	named := rename.desired
	desiredVar, body, metaKeys := formParts(named, rename.friendly)

	if existing.varNameStart != existing.varNameEnd && existing.varName != desiredVar {
		*ops = append(*ops, spliceOp{start: existing.varNameStart, end: existing.varNameEnd, text: desiredVar})
	}
	if existing.annoNameStart != existing.annoNameEnd && named.TypeName != "" && existing.typeName != named.TypeName {
		*ops = append(*ops, spliceOp{start: existing.annoNameStart, end: existing.annoNameEnd, text: named.TypeName})
	}
	refreshMarker(ops, index.raw, existing, named)

	if existing.body != nil {
		mergeConstBody(ops, index, existing, body, metaKeys, named.ChildIDs, rename.friendly)
	}
}

// migrateLegacyFriendlyWrapper splices a legacy `FriendlyType` wrapper, and its DSL import name, to `FriendlyText`,
// so a file authored before the rename migrates in place on `enrich --update`.
// The splices are AST-anchored and disjoint from the rename, marker and body edits.
// An orphaned const is skipped, its whole-statement carcass splice would overlap; the import migrates only if a const did.
func migrateLegacyFriendlyWrapper(ops *[]spliceOp, index *Index, orphaned []*constEntry) {
	orphanedSet := map[*constEntry]bool{}
	for _, entry := range orphaned {
		orphanedSet[entry] = true
	}
	migrated := false
	for _, entry := range index.consts {
		if !entry.isFriendly || orphanedSet[entry] {
			continue
		}
		if entry.annoWrapper == enrichment.FriendlyTypeName && entry.annoWrapperStart != entry.annoWrapperEnd {
			*ops = append(*ops, spliceOp{start: entry.annoWrapperStart, end: entry.annoWrapperEnd, text: enrichment.FriendlyTextName})
			migrated = true
		}
	}
	if !migrated || index.dslImport == nil {
		return
	}
	for i, name := range index.dslImport.names {
		if name != enrichment.FriendlyTypeName || i >= len(index.dslImport.nameSpans) {
			continue
		}
		span := index.dslImport.nameSpans[i]
		if span[0] != span[1] {
			*ops = append(*ops, spliceOp{start: span[0], end: span[1], text: enrichment.FriendlyTextName})
		}
	}
}

// queueNewConst records a NamedConst for append exactly once, keyed on the var-name PAIR: one NamedConst is reconciled
// per form and must not queue twice, while two named types sharing a structural id are distinct and must BOTH append.
func queueNewConst(addedConsts *[]enrichment.NamedConst, named enrichment.NamedConst) {
	for _, existing := range *addedConsts {
		if existing.FriendlyVar == named.FriendlyVar && existing.MockVar == named.MockVar {
			return
		}
	}
	*addedConsts = append(*addedConsts, named)
}

// appendNewConsts appends a block per newly-desired const, each with its marker, and adds any cross-file import they
// reference; merged comes back unchanged when there is nothing to add.
func appendNewConsts(merged []byte, spec Spec, index *Index, addedConsts []enrichment.NamedConst) []byte {
	if len(addedConsts) == 0 {
		return merged
	}
	var blocks []string
	for _, named := range addedConsts {
		if spec.WantFriendly {
			blocks = append(blocks, ConstBlock(named.FriendlyVar, enrichment.FriendlyTextName, named, named.Friendly))
		}
		if spec.WantMock {
			blocks = append(blocks, ConstBlock(named.MockVar, "MockData", named, named.Mock))
		}
	}
	if len(blocks) == 0 {
		return merged
	}

	body := strings.Join(blocks, "\n")
	withImports := ensureCrossFileImports(merged, spec, index, body)

	var builder strings.Builder
	builder.Write(withImports)
	if len(withImports) > 0 && withImports[len(withImports)-1] != '\n' {
		builder.WriteString("\n")
	}
	builder.WriteString("\n")
	builder.WriteString(body)
	return []byte(builder.String())
}

// PruneOrphanBlocks removes every carcass block and returns the cleaned text, the count removed, and the malformed
// snippets it SKIPPED. A removed block takes its own trailing newline and its indentation, so no blank gap remains.
// A malformed carcass whose terminator spans a live statement is left in place, so prune never eats live code.
// Carcasses come from Scan.CarcassMatches, the same set lint reports, so prune removes EXACTLY what lint flags.
// Text that does not PARSE is refused: prune is destructive and never rewrites bytes it cannot confidently lex.
func PruneOrphanBlocks(text string) (string, int, []string, error) {
	scan := NewScan(text)
	if scan.parseFailed {
		return text, 0, nil, errors.New("mirror text has syntax errors; fix them before pruning")
	}
	matches := scan.CarcassMatches()
	if len(matches) == 0 {
		return text, 0, nil, nil
	}
	var builder strings.Builder
	var skipped []string
	cursor := 0
	removed := 0
	for _, match := range matches {
		start, end := match[0], match[1]
		// A hand-edited carcass with a missing ` */` makes the match span PAST its content into the next live const,
		// so skip it rather than eat a live statement; the caller reports it and the user fixes the carcass by hand.
		if carcassCrossesStatement(text[start:end]) {
			skipped = append(skipped, text[start:end])
			continue
		}
		// Reach back over the block's own indentation, so an indented orphan line goes cleanly.
		lineStart := start
		for lineStart > 0 && (text[lineStart-1] == ' ' || text[lineStart-1] == '\t') {
			lineStart--
		}
		beganLine := lineStart == 0 || text[lineStart-1] == '\n'
		switch {
		case beganLine && end < len(text) && text[end] == ' ' && end+1 < len(text) && text[end+1] != '\n':
			end++ // a replaced field carcass shares its line with the live field, so keep the field's indentation
		case beganLine:
			start = lineStart
			// Swallow a single trailing newline so the line disappears entirely.
			if end < len(text) && text[end] == '\n' {
				end++
			}
		case end < len(text) && text[end] == '\n':
			end++
		}
		builder.WriteString(text[cursor:start])
		cursor = end
		removed++
	}
	builder.WriteString(text[cursor:])
	return dropUnusedEnrichmentImports(builder.String()), removed, skipped, nil
}

// dropUnusedEnrichmentImports removes the friendly*/mock* value imports that only the pruned carcasses referenced.
// An import naming anything else, or aliased with `as`, is left alone; unparseable text comes back unchanged.
func dropUnusedEnrichmentImports(text string) string {
	index, err := ParseMirror(scanFileName, []byte(text))
	if err != nil || len(index.valueImports) == 0 {
		return text
	}
	var importRanges [][2]int
	for _, entry := range index.valueImports {
		importRanges = append(importRanges, [2]int{entry.tokenStart, entry.end})
	}
	rest := textOutsideRanges([]byte(text), importRanges)

	type edit struct {
		start, end int
		text       string
	}
	var edits []edit
	for _, entry := range index.valueImports {
		clause := text[entry.clauseStart:entry.clauseEnd]
		if len(entry.names) == 0 || strings.Contains(clause, " as ") {
			continue
		}
		var kept []string
		enrichmentOnly := true
		for _, name := range entry.names {
			if !isFriendlyVar(name) && !isMockVar(name) {
				enrichmentOnly = false
				break
			}
			if referencesIdentifier(rest, name) {
				kept = append(kept, name)
			}
		}
		if !enrichmentOnly || len(kept) == len(entry.names) {
			continue
		}
		if len(kept) > 0 {
			edits = append(edits, edit{start: entry.clauseStart, end: entry.clauseEnd, text: strings.Join(kept, ", ")})
			continue
		}
		end := entry.end
		if end < len(text) && text[end] == '\n' {
			end++
		}
		edits = append(edits, edit{start: entry.tokenStart, end: end})
	}
	if len(edits) == 0 {
		return text
	}
	var builder strings.Builder
	cursor := 0
	for _, change := range edits {
		builder.WriteString(text[cursor:change.start])
		builder.WriteString(change.text)
		cursor = change.end
	}
	builder.WriteString(text[cursor:])
	return builder.String()
}

// statementBoundaryPattern matches a newline-anchored `export` declaration, a top-level statement boundary.
var statementBoundaryPattern = regexp.MustCompile(`(?m)^\s*export\s+(const|type|interface|class|enum|function|namespace)\s`)

// carcassCrossesStatement reports a block spanning more live statements than it should: a whole-const carcass wraps
// exactly ONE declaration, its own, and a field carcass wraps none, so anything above that means its terminator ate code.
func carcassCrossesStatement(block string) bool {
	count := len(statementBoundaryPattern.FindAllStringIndex(block, -1))
	if strings.HasPrefix(block, "/* "+OrphanChildTag) {
		return count > 0
	}
	return count > 1
}
