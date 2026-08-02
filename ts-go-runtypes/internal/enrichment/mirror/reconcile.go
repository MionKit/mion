package mirror

import (
	"errors"
	"regexp"
	"strings"

	"github.com/mionkit/ts-runtypes/internal/enrichment"
)

// orphanBlockPattern matches both `/* @rtOrphan … */` (whole-const carcass) and
// `/* @rtOrphanChild … */` (a single dropped field) block comments. The body is
// non-greedy up to the first ` */`; the carcass's own inner `*/` was
// comment-sanitized to `* /` when it was written, so the first ` */` is its true
// terminator.
var orphanBlockPattern = regexp.MustCompile(`(?s)` + OrphanBlockPatternSource)

// friendlyReservedKeys / mockReservedKeys are the META keys each family's nodes
// carry alongside their field children — never treated as renamable/mergeable
// fields. Any `rt$`-prefixed key is meta by construction (the prefix is
// RESERVED — an rt$ property in a source type is refused by gen and flagged
// FT011/MD011; a plain `$` key is an ordinary field); the mock family
// additionally reserves the bare leaf keys pool/min/max.
var friendlyReservedKeys = map[string]bool{
	"rt$label": true, "rt$errors": true, "rt$items": true,
	"rt$slots": true, "rt$keys": true, "rt$values": true,
}

var mockReservedKeys = map[string]bool{
	"rt$items": true, "rt$length": true, "rt$optional": true,
	"rt$slots": true, "rt$keys": true, "rt$values": true, "rt$size": true,
	"pool": true, "min": true, "max": true,
}

// Reconcile parses + indexes the existing mirror bytes (error on syntax error),
// reconciles them against spec's desired const set (property merge per matched
// const + append new consts + orphan-const handling + breadcrumb-clause sync),
// then applies the edits via the descending splicer. It NEVER writes to disk:
// it returns the new bytes, whether they differ from existing (false on a
// byte-identical no-op / idempotent re-run), and any error.
//
// readSource is injected so the orphan judgement can read the breadcrumb source
// without the pure package touching the filesystem.
func Reconcile(spec Spec, existing []byte, readSource func(string) (string, error)) ([]byte, bool, error) {
	index, err := ParseMirror(spec.MirrorPath, existing)
	if err != nil {
		return nil, false, err
	}

	var ops []spliceOp
	var addedConsts []enrichment.NamedConst

	// Const-rename pre-pass: a whole type renamed (User → Account) keeps its
	// structural id (the id is name-independent) but changes its var name +
	// annotation. Pair each such existing const with the renamed desired const by
	// their UNIQUE shared id+form and CARRY it — rewrite var/annotation/marker in
	// place and merge the body — instead of orphaning the old const and
	// regenerating an empty new one. Renamed consts are excluded from the merge /
	// append / orphan passes below (which would otherwise double-process them into
	// overlapping splices).
	renames := computeConstRenames(index, spec)
	renamedExisting := map[*constEntry]bool{}
	renamedDesiredVar := map[string]bool{}
	for _, rename := range renames {
		emitConstRename(&ops, index, rename)
		renamedExisting[rename.existing] = true
		renamedDesiredVar[renameDesiredVar(rename)] = true
	}

	// Property-merge (or queue-as-new / restore-from-carcass) each desired const
	// not already handled as a rename.
	for _, named := range spec.Consts {
		if spec.WantFriendly && !renamedDesiredVar[named.FriendlyVar] {
			reconcileOneConst(&ops, &addedConsts, index, named, true)
		}
		if spec.WantMock && !renamedDesiredVar[named.MockVar] {
			reconcileOneConst(&ops, &addedConsts, index, named, false)
		}
	}

	// Orphan-const: an existing owned const NOT in the desired set (by name) and
	// NOT renamed, whose source type is no longer declared → @rtOrphan it
	// (conservatively; see orphanConsts).
	orphanedEntries := orphanConsts(&ops, index, spec, readSource, renamedExisting)

	// Breadcrumb clause sync: recompute the type-name list from the surviving
	// consts (existing minus orphaned/renamed, plus added/renamed-to) declared in
	// THIS source file, replacing only the `{ … }` clause and keeping
	// `from '<src>'` byte-identical.
	syncBreadcrumbClause(&ops, index, spec, orphanedEntries, renamedExisting)

	// Lazy annotation migration: rewrite a legacy `FriendlyType` wrapper (both the
	// const annotation + the ts-runtypes DSL import) to the current `FriendlyText`
	// spelling, so files authored before the friendly-text rename migrate on the
	// next `gen --update`. Skips orphaned consts (about to be commented out).
	migrateLegacyFriendlyWrapper(&ops, index, orphanedEntries)

	// Apply the in-place splices first (all index the ORIGINAL bytes), then append
	// new consts + any cross-file imports they introduce.
	merged, err := applySplices(index.raw, ops)
	if err != nil {
		return nil, false, err
	}

	// REFERENCE FIXUP: a renamed const's declaration was spliced above, but
	// sibling consts may still REFERENCE the old var (`home: friendlyAddress`
	// after Address→Location) — the body merge deliberately keeps leaf-in-both
	// fields byte-identical, so the stale identifier survives the splice pass.
	// Rewrite it boundary-aware over the merged bytes (post-splice, so it can
	// never overlap a splice). A carcass's preserved text is rewritten too — a
	// later restore then references the LIVE const.
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

// RenameIdentifierAll rewrites every standalone-identifier occurrence of
// oldVar in text to newVar — the boundary-aware renamer the reconcile uses for
// its own rename fixups, exported for the translate driver (which renames
// sibling const references in an emitted body to their locale-prefixed twins).
func RenameIdentifierAll(text []byte, oldVar, newVar string) []byte {
	return replaceIdentifierAll(text, oldVar, newVar)
}

// replaceIdentifierAll rewrites every standalone-identifier occurrence of
// oldVar in text to newVar (word-boundary on both sides, so `friendlyUser`
// never matches inside `friendlyUserProfile`).
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

// reconcileOneConst reconciles ONE friendly-or-mock const: it finds the matching
// existing const by @rtType id (fallback var name), and either property-merges
// it (recording splice ops) or, when there is no match, queues it for append.
// addedConsts dedups so a friendly+mock pair queues a single NamedConst once.
func reconcileOneConst(ops *[]spliceOp, addedConsts *[]enrichment.NamedConst, index *Index, named enrichment.NamedConst, friendly bool) {
	varName, body, metaKeys := formParts(named, friendly)

	existing := findExistingConst(index, varName)
	if existing == nil {
		// Restore-on-reappear: if an @rtOrphan carcass exists for this (id, form),
		// un-comment it (restoring its preserved value) instead of regenerating. The
		// inner text was comment-sanitized when orphaned (`*/`→`* /`); reverse it, then
		// REFRESH its @rtType/@rtIds marker to the desired id — a type orphaned while
		// its shape (or a child's) churned reappears with a NEW structural id, so the
		// marker the carcass carried is stale; refreshing it on restore keeps the
		// reconcile a single-pass fixed point (an unrefreshed marker would otherwise be
		// corrected by a SECOND --update — an R6 non-convergence). A same-id reappear
		// leaves the marker unchanged, so the restore stays byte-identical.
		if carcass := findCarcass(index, named, friendly); carcass != nil {
			restored := refreshRestoredMarker(unsanitizeFromComment(carcass.inner), named)
			*ops = append(*ops, spliceOp{start: carcass.start, end: carcass.end, text: restored + "\n"})
			return
		}
		queueNewConst(addedConsts, named)
		return
	}
	if existing.body == nil {
		// The existing const's initializer is not an object literal (a function
		// form, or hand-edited to something exotic) — leave it untouched.
		return
	}

	// Refresh the @rtType / @rtIds marker when it drifted (a structural-id change
	// after a field add/remove regenerates the id), so the next reconcile matches
	// by id again instead of the var-name fallback.
	refreshMarker(ops, index.raw, existing, named)

	mergeConstBody(ops, index, existing, body, metaKeys, named.ChildIDs, friendly)
}

// formParts returns the var name, body text, and reserved-key set for one form
// (friendly or mock) of a desired const — the per-form selection both
// reconcileOneConst and emitConstRename make before merging.
func formParts(named enrichment.NamedConst, friendly bool) (varName, body string, metaKeys map[string]bool) {
	if friendly {
		return named.FriendlyVar, named.Friendly, friendlyReservedKeys
	}
	return named.MockVar, named.Mock, mockReservedKeys
}

// mergeConstBody records the property-merge splices for one const: it builds the
// existing + desired object views and merges them under the given reserved-key
// set + child-id maps. No-op when the desired body is not an object literal.
// Assumes existing.body is non-nil (the caller guards it). `friendly` selects
// the family's merge semantics (see mergeCtx.friendlyFamily).
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

// refreshMarker emits a splice to bring the existing const's @rtType/@rtIds
// marker in line with the desired type id + child-id map, when they differ.
// When the existing const has a marker block, it is replaced; when it has none
// (a hand-authored file), a fresh marker is inserted before the const keyword.
// No op when the marker already matches (idempotent).
func refreshMarker(ops *[]spliceOp, raw []byte, existing *constEntry, named enrichment.NamedConst) {
	desired := MarkerComment(named)
	if desired == "" {
		return
	}
	if existing.markerStart != existing.markerEnd {
		// Replace the existing marker block (range already includes its newline).
		current := string(raw[existing.markerStart:existing.markerEnd])
		if current == desired {
			return // identical — no-op
		}
		*ops = append(*ops, spliceOp{start: existing.markerStart, end: existing.markerEnd, text: desired})
		return
	}
	// No existing marker — insert one just before the `export`/`const` keyword.
	*ops = append(*ops, spliceOp{start: existing.tokenStart, end: existing.tokenStart, text: desired})
}

// refreshRestoredMarker rewrites the leading @rtType/@rtIds marker of a carcass's
// restored const text to the desired (id, child-id map) — the in-string analogue
// of refreshMarker, used on restore where the const is spliced whole (not yet
// indexed) so refreshMarker's offset-based path cannot run. The marker block is
// located by markerBlockRange over the leading trivia (bounded to before the
// `export`/`const` keyword so a body token can't match). A marker-free const, or a
// desired with no structural id, is returned unchanged.
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
		return inner // no @rtType marker to refresh (hand-authored, marker-free)
	}
	return inner[:start] + desired + inner[end:]
}

// findExistingConst returns the existing const with the given var name, or nil.
// Matching is BY NAME — the emission identity: `friendly<Name>` / `mock<Name>`
// mirror the source's NAMED types, so two same-shape types A and B (which share a
// structural id) stay distinct consts. The id is deliberately NOT used to match
// here (an id match would conflate A and B, and would also match a renamed const
// that is simultaneously orphaned-by-name → overlapping splices). A const whose
// name CHANGED (a whole-type rename) is paired separately by computeConstRenames,
// which uses the shared id purely as the change-detection signal.
func findExistingConst(index *Index, varName string) *constEntry {
	if entry, ok := index.byVar[varName]; ok {
		return entry
	}
	return nil
}

// constRename links an existing const to the desired const it was RENAMED into:
// same structural id + form, but a new type name (so a new var + annotation).
type constRename struct {
	existing *constEntry
	desired  enrichment.NamedConst
	friendly bool
}

// renameDesiredVar is the var name the renamed const takes (friendly or mock form).
func renameDesiredVar(rename constRename) string {
	if rename.friendly {
		return rename.desired.FriendlyVar
	}
	return rename.desired.MockVar
}

// constMatchThreshold is the minimum graph-parity score for a rename pairing. A
// shared whole-graph TypeID (the graph is identical, only the name moved) scores
// 1.0; below this floor the field-graph overlap is too weak to confidently call
// it a rename, so the const falls through to the safe orphan + scaffold path.
const constMatchThreshold = 0.5

// computeConstRenames pairs a DROPPED existing const (its var name no longer in
// the desired set) with an ADDED desired const (its var name not present in the
// mirror) when they are the same logical type under a NEW name — so its authored
// tree carries instead of orphaning.
//
// Matching is by GRAPH PARITY, not by whole-graph id alone. A whole type rename
// keeps its name-independent id, so a pure rename pairs at score 1.0 — but a
// rename that ALSO reshapes (a field added/dropped/retyped) changes the id, so an
// id-only matcher would miss it and lose the carry. Instead each (drop, add) pair
// is scored by how much of its FIELD GRAPH overlaps (constSimilarity), and only
// STRICT MUTUAL-BEST pairs above the threshold are carried: the add must be the
// drop's unique best AND the drop the add's unique best. An exact tie at the top
// (two same-shape types renamed at once — genuinely ambiguous) has no unique best
// and falls through to the safe orphan + scaffold path: we never GUESS a carry
// that could mis-attribute an authored value to the wrong renamed type. Consts
// with no id never pair (no graph to score).
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

// buildReferentialLinks maps an old child-type id to the set of new child-type ids
// a parent field REPOINTED to: for every field path present in both an existing
// const and its desired counterpart (keyed by the form-independent parent TYPE
// NAME so a non-renamed parent matches across the pass), when the recorded child id
// CHANGED, record old→new. That repointing is concrete evidence the old child type
// became the new one — the only signal that survives a NOMINAL rename (an enum,
// whose id is name-dependent and whose const carries no field graph to score). A
// parent that is ITSELF renamed has a different type name on each side, so its key
// never matches and the link is not recorded (safe: no stable anchor → fall
// through). Same-id fields (a structural rename keeps its id) are skipped — those
// already pair via the whole-graph-id fast path.
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

// pairRenames selects the strict mutual-best (drop, add) pairs above the match
// threshold. A pair is a rename iff `add` is the unique highest-scoring add for
// `drop` AND `drop` is the unique highest-scoring drop for `add` — any tie at
// either maximum leaves the pair unselected (ambiguous → safe fall-through).
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

// strictArgmax returns the index of the single greatest value and whether it is a
// STRICT maximum (no other index ties it). Returns (-1, false) for an empty slice.
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

// constSimilarity scores how likely a dropped existing const was RENAMED into an
// added desired const, by GRAPH PARITY rather than whole-graph id alone. A shared
// whole-graph TypeID (the graph is identical, only the name moved) is a perfect
// 1.0 fast path. A REFERENTIAL link — a parent field that repointed from this
// drop's id to this add's id (refLinks) — is also a 1.0: it is the only signal
// that survives a NOMINAL rename (an enum, whose id changes with its name and
// whose const has no field graph to score). Otherwise the score blends two
// overlaps of the consts' top-level fields: their NAMES (the human-stable skeleton
// that survives a reshape) and their name+child-id pairs (precision: a field
// counts as "the same" only when its child type also matches). The blend keeps a
// renamed-and-grown type (fields kept, some added) well above the threshold while
// a coincidental field-name collision between unrelated types (no id agreement)
// stays below it. Every 1.0 still passes through pairRenames' strict mutual-best,
// so an ambiguous repoint (the same drop linked to two adds) ties and falls
// through rather than guessing.
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

// topLevelNames is the set of top-level (non-dotted) field names from a child-id
// map. Nested-inline paths (e.g. "profile.email") are a parent field's sub-graph,
// not a top-level field, so they are excluded.
func topLevelNames(childIDs map[string]string) map[string]bool {
	out := map[string]bool{}
	for path := range childIDs {
		if !strings.Contains(path, ".") {
			out[path] = true
		}
	}
	return out
}

// topLevelPairs is the set of "name#childId" identities for top-level fields — a
// field matches only when both its name and its child type id agree.
func topLevelPairs(childIDs map[string]string) map[string]bool {
	out := map[string]bool{}
	for path, id := range childIDs {
		if !strings.Contains(path, ".") {
			out[path+"#"+id] = true
		}
	}
	return out
}

// diceOverlap is the Sørensen–Dice coefficient over two sets: 2|A∩B| / (|A|+|B|),
// and 0 when both are empty (an empty graph carries no identity to match on).
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

// desiredVarsForForm collects the desired var names of one form (friendly/mock).
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

// emitConstRename carries a renamed const: it rewrites the var identifier, the
// `Wrapper<Name>` annotation type name and the @rtType marker (name + id), then
// merges the desired body INTO the existing one. A pure rename leaves the body
// byte-identical (authored values preserved verbatim); a rename that also changed
// a field merges that field too. No orphan carcass, no fresh empty twin. The
// emitted ops cover disjoint regions (marker / var / annotation / body fields), so
// they never overlap.
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

// migrateLegacyFriendlyWrapper splices a committed mirror's legacy `FriendlyType`
// annotation wrapper (and the matching `import type { FriendlyText }` DSL import)
// to the current `FriendlyText` spelling, so a `gen --update` migrates files
// authored before the friendly-text rename in place. The splices are AST-anchored
// and disjoint from the rename / marker / body edits (wrapper name vs `<T>` arg vs
// var name vs import clause never overlap). Orphaned consts are skipped — their
// whole-statement carcass splice would otherwise overlap the wrapper splice, and
// a commented-out const's wrapper name is moot. The DSL import is migrated only
// when at least one surviving const was, so an all-orphaned file leaves its
// (now unused, already legacy) import untouched.
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

// queueNewConst records a NamedConst for append exactly once. Identity is the
// var-name PAIR (friendly + mock): the same NamedConst is reconciled separately for
// its friendly and mock forms and must not queue twice, but two DIFFERENT named
// types that happen to share a structural id (TypeID) are distinct consts and must
// BOTH append — so the dedup keys on the names, never on the shared id.
func queueNewConst(addedConsts *[]enrichment.NamedConst, named enrichment.NamedConst) {
	for _, existing := range *addedConsts {
		if existing.FriendlyVar == named.FriendlyVar && existing.MockVar == named.MockVar {
			return
		}
	}
	*addedConsts = append(*addedConsts, named)
}

// appendNewConsts appends the const blocks for newly-desired consts (no existing
// match, no restorable carcass) to the merged bytes, each carrying its
// @rtType/@rtIds marker, and ensures any cross-file value imports those consts
// reference are present (added after the existing import block). Returns merged
// unchanged when there is nothing to add.
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

// PruneOrphanBlocks removes every `@rtOrphan` / `@rtOrphanChild` block comment
// from text and returns the cleaned text, the count removed, and the malformed
// carcass snippets it SKIPPED. A removed block takes its OWN trailing newline
// with it; a leading-whitespace-only line left dangling (the block sat on its
// own line, indented) is also cleaned so no blank gap remains. A malformed
// carcass whose terminator spans a live statement boundary is collected into
// skipped (left in place) so prune never eats live code — the caller warns.
// Returns (text, 0, nil, nil) when there is nothing to prune.
//
// Carcasses come from Scan.CarcassMatches — the same comment-anchored set the
// lint scan reports — so prune removes EXACTLY what lint flags: a pattern
// embedded in an authored string value (an rt$errors template documenting the
// syntax), in a regex literal, or in a `//` line comment is neither reported
// nor pruned. On generated mirrors this is identical to the raw pattern (a
// real carcass always starts a block comment). Text that does not PARSE is
// refused with an error (nothing removed) — prune is destructive and never
// rewrites bytes it cannot confidently lex, the same stance ParseMirror takes
// for the reconcile.
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
		// Malformed-carcass guard: a hand-edited carcass whose ` */` terminator is
		// missing/misplaced makes the non-greedy match span PAST its own content into
		// the next live const, swallowing it. Reject (skip) such a block so prune
		// never eats a live statement; the caller surfaces it and the user fixes the
		// carcass by hand.
		if carcassCrossesStatement(text[start:end]) {
			skipped = append(skipped, text[start:end])
			continue
		}
		// Extend start back over leading spaces/tabs on the block's own line so an
		// indented orphan line is removed cleanly (no orphaned indentation).
		lineStart := start
		for lineStart > 0 && (text[lineStart-1] == ' ' || text[lineStart-1] == '\t') {
			lineStart--
		}
		if lineStart == 0 || text[lineStart-1] == '\n' {
			start = lineStart // the block began the line — drop the indentation too
		}
		// Swallow a single trailing newline so the line disappears entirely.
		if end < len(text) && text[end] == '\n' {
			end++
		}
		builder.WriteString(text[cursor:start])
		cursor = end
		removed++
	}
	builder.WriteString(text[cursor:])
	return builder.String(), removed, skipped, nil
}

// statementBoundaryPattern matches a newline-anchored `export const`/`export
// type`/`export interface`/`export class`/`export enum`/`export function`
// declaration — a top-level statement boundary.
var statementBoundaryPattern = regexp.MustCompile(`(?m)^\s*export\s+(const|type|interface|class|enum|function|namespace)\s`)

// carcassCrossesStatement reports whether a matched orphan block body spans MORE
// live statements than it legitimately should: an `@rtOrphan` (whole-const)
// carcass wraps exactly ONE `export …` declaration (its own preserved const), so
// >1 means its terminator ate the next live const; an `@rtOrphanChild` (field)
// carcass wraps NO statement, so any `export …` declaration means it spilled
// past the field. block is the full `/* @rtOrphan… */` match.
func carcassCrossesStatement(block string) bool {
	count := len(statementBoundaryPattern.FindAllStringIndex(block, -1))
	if strings.HasPrefix(block, "/* "+OrphanChildTag) {
		return count > 0
	}
	return count > 1
}
