package mirror

import (
	"regexp"
	"sort"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/enrichment"
)

// hygiene.go detects the DIRTY enrichment tags this package's emitters write —
// the `@todo` scaffold flag and the `@rtOrphan` / `@rtOrphanChild` carcasses —
// so lint surfaces (the resolver's checkEnrich pass, `mion check`, and
// the @mionjs/devtools OXlint plugin behind them) can enforce clean, finished
// enrichment files on every commit. A clean file has NEITHER; the `@rtType` /
// `@rtIds` reconcile markers are legitimate on every generated const and are
// never reported. Detection derives from the same tags.go constants the
// emitters use, so emitter and detector cannot drift.

// TagKind identifies which dirty tag a hygiene finding matched.
type TagKind int

const (
	// TagTodo is an unfilled `@todo` scaffold flag (any @todo comment token,
	// not just the exact generated line — enrichment files are generated
	// artifacts; hand-parked todos don't belong there either).
	TagTodo TagKind = iota + 1
	// TagOrphan is a whole-const `/* @rtOrphan … */` carcass.
	TagOrphan
	// TagOrphanChild is a single-field `/* @rtOrphanChild … */` carcass.
	TagOrphanChild
	// TagBlankValue is an unfilled scaffold VALUE — an empty string (`''`/`""`)
	// or empty array (`[]`) sitting at a property-value position. It is as
	// incomplete as a `@todo` marker (a blank label ships blank to the UI), and is
	// detected structurally rather than as a comment tag; see BlankValues.
	TagBlankValue
)

// TagFinding is one dirty-tag occurrence. Start/End are byte offsets of the
// tag TOKEN itself (never the whole carcass block) so editor squiggles stay
// tight even when a carcass spans many lines. BlockStart/BlockEnd bound the
// whole carcass for the orphan kinds (equal to Start/End for a @todo) — the
// family attribution reads the preserved const's annotation out of it.
type TagFinding struct {
	Kind       TagKind
	Start      int
	End        int
	BlockStart int
	BlockEnd   int
}

// MirrorFamily says which per-family mirror a file (or one finding in it)
// belongs to since the friendly/mock file split. Unknown means no signal —
// consumers fall back to the friendly-family code and the file path tells
// the user the rest.
type MirrorFamily int

const (
	FamilyUnknown MirrorFamily = iota
	FamilyFriendly
	FamilyMock
)

// IsEnrichmentFile is the scoping guard (defense in depth under the consumer's
// lint glob): hygiene only applies to files that look like enrichment mirrors —
// a reconcile marker in its EMIT form (`/** @rtType …`), or a CONST
// declaration annotated with the DSL types (`export const x: FriendlyText<…>`,
// the shape every scaffold emits — covering a freshly-scaffolded const whose
// unresolved root got no marker). The const annotation is matched with
// comments AND literal bodies masked out, so neither the DSL package's own
// sources (declarations, `(map: FriendlyText<T>)` parameter annotations,
// prose with `@todo`), a JSDoc code example, nor a template literal embedding
// a mirror-shaped line can make ordinary source read as a mirror.
func (scan *Scan) IsEnrichmentFile() bool {
	if scan.HasMarkerComment() {
		return true
	}
	return enrichConstAnnotationPattern.MatchString(scan.structureMaskedText())
}

// IsEnrichmentFile is the one-shot twin of Scan.IsEnrichmentFile (parses text
// per call — build a Scan to share the parse across probes).
func IsEnrichmentFile(text string) bool {
	return NewScan(text).IsEnrichmentFile()
}

// HasMarkerComment reports whether the text carries a reconcile marker in its
// EMIT form — a comment that actually STARTS with `/** @rtType ` — as opposed
// to the prefix merely appearing inside a string literal (the generated
// diagnostic catalog embeds it in message text) or mid-comment prose. This is
// the guard signal for "generated mirror": IsEnrichmentFile's first branch
// and the resolver's breadcrumb-drift gate both key on it.
func (scan *Scan) HasMarkerComment() bool {
	for _, span := range scan.spans {
		if strings.HasPrefix(scan.text[span.start:], MarkerCommentPrefix) {
			return true
		}
	}
	return false
}

// HasMarkerComment is the one-shot twin of Scan.HasMarkerComment (parses text
// per call — build a Scan to share the parse across probes).
func HasMarkerComment(text string) bool {
	return NewScan(text).HasMarkerComment()
}

// enrichConstAnnotationPattern matches a (possibly exported) const declaration
// annotated `: FriendlyText<` / `: FriendlyType<` (legacy) / `: MockData<` at
// the start of a line — the exact shape ConstBlock emits. `\s*` after the colon
// tolerates a formatter wrapping the annotation onto the next line.
var enrichConstAnnotationPattern = regexp.MustCompile(
	`(?m)^[ \t]*(?:export[ \t]+)?const[ \t]+[A-Za-z_$][A-Za-z0-9_$]*[ \t]*:\s*(?:` +
		dslWrapperAlternation + `)[ \t]*<`)

// CarcassMatches returns the byte ranges of every REAL orphan carcass in the
// text: `orphanBlockPattern` matches (the raw pattern `gen --prune` removes)
// restricted to those that START a genuine block-comment span. This is the
// single definition of "what a carcass IS", shared by the lint scan
// (DirtyTags), the destructive prune (PruneOrphanBlocks) and the
// restore-on-reappear index (indexOrphanCarcasses) so they can never disagree
// — the same single-source principle tags.go applies to the tag literals. Two
// match classes are filtered out identically for every consumer:
//   - the pattern bytes appearing inside a STRING / template / regex literal
//     (the generated diagnostic catalog embeds the tag syntax in its message
//     text) or nested in JSDoc prose — the match does not begin a comment
//     span; and
//   - a carcass-looking sequence inside a `//` LINE comment — the match starts
//     mid-line, not at the `//`, so it never begins a block-comment span.
//
// Ranges are half-open [start, end) byte offsets, in text order.
func (scan *Scan) CarcassMatches() [][2]int {
	var matches [][2]int
	for _, match := range orphanBlockPattern.FindAllStringIndex(scan.text, -1) {
		start, end := match[0], match[1]
		if !scan.commentStartsAt(start) {
			continue // pattern bytes inside a literal / another comment — not a carcass
		}
		matches = append(matches, [2]int{start, end})
	}
	return matches
}

// commentStartsAt reports whether a comment span starts exactly at offset.
func (scan *Scan) commentStartsAt(offset int) bool {
	for _, span := range scan.spans {
		if span.start == offset {
			return true
		}
		if span.start > offset {
			return false // spans are in text order
		}
	}
	return false
}

// DirtyTags returns every dirty-tag occurrence in the text, ordered by Start.
//
//   - Orphan carcasses come from CarcassMatches — the SAME comment-anchored
//     set `gen --prune` removes, so the rule reports exactly what prune would
//     fix (a pattern inside a string literal or nested in JSDoc prose never
//     fires, and neither is pruned).
//   - `@todo` is matched as a comment token (line or block comment; string
//     literals don't count) with an identifier boundary after it, so `@todos`
//     or a pool string containing "@todo" never fire.
//   - A `@todo` INSIDE an orphan carcass is part of the preserved const text —
//     prune removes it with the block — so it is not reported separately.
func (scan *Scan) DirtyTags() []TagFinding {
	text := scan.text
	var findings []TagFinding
	carcasses := scan.CarcassMatches()
	for _, carcass := range carcasses {
		start, end := carcass[0], carcass[1]
		kind, tag := TagOrphan, OrphanTag
		if strings.HasPrefix(text[start:], "/* "+OrphanChildTag) {
			kind, tag = TagOrphanChild, OrphanChildTag
		}
		tagStart := start + len("/* ")
		findings = append(findings, TagFinding{Kind: kind, Start: tagStart, End: tagStart + len(tag), BlockStart: start, BlockEnd: end})
	}

	for _, comment := range scan.spans {
		body := text[comment.start:comment.end]
		from := 0
		for {
			idx := strings.Index(body[from:], TodoTag)
			if idx < 0 {
				break
			}
			offset := comment.start + from + idx
			from += idx + len(TodoTag)
			after := offset + len(TodoTag)
			if after < len(text) && isIdentByte(text[after]) {
				continue // @todoSomething — not the tag
			}
			if insideRanges(carcasses, offset) {
				continue // preserved carcass text — the carcass finding covers it
			}
			findings = append(findings, TagFinding{Kind: TagTodo, Start: offset, End: after, BlockStart: offset, BlockEnd: after})
		}
	}

	sort.Slice(findings, func(left, right int) bool { return findings[left].Start < findings[right].Start })
	return findings
}

// ScanDirtyTags is the one-shot twin of Scan.DirtyTags (parses text per call —
// build a Scan to share the parse across probes).
func ScanDirtyTags(text string) []TagFinding {
	return NewScan(text).DirtyTags()
}

// blankArrayPattern matches an empty-array value `: []` — a blank mock pool /
// items slot — at a property-value position. Run over structureMaskedText so a
// `[]` inside a string or comment can never match.
var blankArrayPattern = regexp.MustCompile(`:\s*(\[\s*\])`)

// BlankValues returns every UNFILLED scaffold value in the text: an empty string
// literal (`”` / `""`) or an empty array (`[]`) sitting right after a `key:`.
// These are exactly as incomplete as a `@todo` marker — a blank `rt$label` ships
// blank to the UI, a `pool: []` mocks nothing — so the completeness gate treats
// them the same. Kind is TagBlankValue; Start/End bound the sentinel token.
//
// Detection is parse-guided, never a raw text grep: empty strings come from the
// literal-token oracle (so a `”` inside a bigger string or a comment never
// counts) and are kept only when the nearest non-space byte before them is a `:`
// (so a `”` element inside a `pool: [”, 'x']` is NOT a blank slot); empty arrays
// are matched on the structure-masked text (comment + string bodies blanked), so
// a `[]` inside data or prose never counts.
func (scan *Scan) BlankValues() []TagFinding {
	var findings []TagFinding
	for _, literal := range scan.literals {
		start, end := literal[0], literal[1]
		if body := scan.text[start:end]; body != "''" && body != `""` {
			continue
		}
		if !precededByColon(scan.text, start) {
			continue // an empty string as an array element / argument, not a filled slot
		}
		findings = append(findings, TagFinding{Kind: TagBlankValue, Start: start, End: end, BlockStart: start, BlockEnd: end})
	}
	// Empty arrays on the IMPORT-masked text: comments blanked, but string LITERALS
	// kept intact. Masking literal bodies (structureMaskedText) would turn a filled
	// `['x']` into `[   ]` and read as empty; keeping them means `['x']` never
	// matches `[\s*]`, while a `[]` inside a string is still shielded by its quotes
	// (the `:` is followed by `'`, not `[`).
	masked := scan.importMaskedText()
	for _, match := range blankArrayPattern.FindAllStringSubmatchIndex(masked, -1) {
		start, end := match[2], match[3] // group 1: the `[]`
		findings = append(findings, TagFinding{Kind: TagBlankValue, Start: start, End: end, BlockStart: start, BlockEnd: end})
	}
	sort.Slice(findings, func(left, right int) bool { return findings[left].Start < findings[right].Start })
	return findings
}

// precededByColon reports whether the nearest non-whitespace byte before offset
// is a `:` — i.e. the token at offset is a property VALUE, not an array element or
// call argument.
func precededByColon(text string, offset int) bool {
	i := offset - 1
	for i >= 0 && (text[i] == ' ' || text[i] == '\t' || text[i] == '\n' || text[i] == '\r') {
		i--
	}
	return i >= 0 && text[i] == ':'
}

// ScanBlankValues is the one-shot twin of Scan.BlankValues (parses text per call —
// build a Scan to share the parse across probes).
func ScanBlankValues(text string) []TagFinding {
	return NewScan(text).BlankValues()
}

// dslWrapperAlternation is the regex alternation of every recognized DSL
// wrapper type name — the current `FriendlyText` + legacy `FriendlyType` +
// `MockData` — shared by the annotation-structure probes so all of them accept
// mirrors authored before the friendly-text rename.
var dslWrapperAlternation = strings.Join(append(append([]string{}, enrichment.FriendlyWrapperNames...), enrichment.MockDataName), `|`)

// annotationFamilyPattern is the family-capturing twin of
// enrichConstAnnotationPattern; group 1 is the DSL type name.
var annotationFamilyPattern = regexp.MustCompile(
	`(?m)^[ \t]*(?:export[ \t]+)?const[ \t]+[A-Za-z_$][A-Za-z0-9_$]*[ \t]*:\s*(` +
		dslWrapperAlternation + `)[ \t]*<`)

// carcassAnnotationPattern reads the preserved const's annotation INSIDE an
// orphan carcass (comment text, so the anchored pattern cannot apply).
var carcassAnnotationPattern = regexp.MustCompile(
	`const[ \t]+[A-Za-z_$][A-Za-z0-9_$]*[ \t]*:\s*(` + dslWrapperAlternation + `)[ \t]*<`)

// dslImportPattern captures the `import type { … } from '@mionjs/run-types'` clause
// body — a per-family mirror imports exactly its own DSL type.
var dslImportPattern = regexp.MustCompile(`import[ \t]+type[ \t]*\{([^}]*)\}[ \t]*from[ \t]*['"]@mionjs/run-types['"]`)

// FamilyClassifier attributes findings in one mirror text to a MirrorFamily.
// Since the per-family split a generated mirror carries ONE family, read off
// its const annotations or its DSL import; per-finding attribution (nearest
// annotation, carcass-preserved annotation) keeps a transitional pre-split
// COMBINED file honest too.
type FamilyClassifier struct {
	text string
	// annotations are (offset, family) pairs of every live (non-comment)
	// DSL const annotation, in text order.
	offsets  []int
	families []MirrorFamily
	fallback MirrorFamily
}

// FamilyClassifier builds the classifier off the scan's masked probe texts:
// live const annotations are read with comments AND literals masked (a JSDoc
// example or template-embedded annotation never counts), while the DSL-import
// fallback reads the comments-only mask (it must see the quoted 'mion'
// specifier — a string literal the structural mask blanks).
func (scan *Scan) FamilyClassifier() *FamilyClassifier {
	classifier := &FamilyClassifier{text: scan.text}
	masked := scan.structureMaskedText()
	for _, match := range annotationFamilyPattern.FindAllStringSubmatchIndex(masked, -1) {
		classifier.offsets = append(classifier.offsets, match[0])
		classifier.families = append(classifier.families, familyForName(masked[match[2]:match[3]]))
	}
	classifier.fallback = dslImportFamily(scan.importMaskedText())
	return classifier
}

// NewFamilyClassifier is the one-shot twin of Scan.FamilyClassifier (parses
// text per call — build a Scan to share the parse across probes).
func NewFamilyClassifier(text string) *FamilyClassifier {
	return NewScan(text).FamilyClassifier()
}

// FamilyFor attributes one dirty-tag finding: an orphan carcass by the
// annotation preserved INSIDE it, otherwise the nearest live annotation at or
// after the tag (a `@todo` sits right above its const), else the nearest one
// before it, else the file's DSL import, else Unknown.
func (classifier *FamilyClassifier) FamilyFor(finding TagFinding) MirrorFamily {
	if finding.Kind == TagOrphan || finding.Kind == TagOrphanChild {
		block := classifier.text[finding.BlockStart:min(finding.BlockEnd, len(classifier.text))]
		if match := carcassAnnotationPattern.FindStringSubmatch(block); match != nil {
			return familyForName(match[1])
		}
	}
	for i, offset := range classifier.offsets {
		if offset >= finding.Start {
			return classifier.families[i]
		}
	}
	if n := len(classifier.offsets); n > 0 {
		return classifier.families[n-1]
	}
	return classifier.fallback
}

// FamilyAt attributes a position INSIDE a const — a blank VALUE — to the family
// of the nearest annotation AT OR BEFORE it (the const the value belongs to),
// falling back to the file's DSL import. FamilyFor uses at-or-AFTER instead
// because a dirty TAG like `@todo` sits ABOVE its const, whereas a value sits
// below the annotation.
func (classifier *FamilyClassifier) FamilyAt(offset int) MirrorFamily {
	family := classifier.fallback
	for i, annotationOffset := range classifier.offsets {
		if annotationOffset > offset {
			break
		}
		family = classifier.families[i]
	}
	return family
}

// familyForName maps a DSL type name to its family.
func familyForName(name string) MirrorFamily {
	if name == enrichment.MockDataName {
		return FamilyMock
	}
	return FamilyFriendly
}

// dslImportFamily reads the file-level fallback signal off the mion
// DSL import clause: exactly one family's type imported → that family; both
// or neither → Unknown.
func dslImportFamily(text string) MirrorFamily {
	match := dslImportPattern.FindStringSubmatch(text)
	if match == nil {
		return FamilyUnknown
	}
	clause := match[1]
	hasFriendly := false
	for _, name := range enrichment.FriendlyWrapperNames { // FriendlyText (+ legacy FriendlyType)
		if strings.Contains(clause, name) {
			hasFriendly = true
			break
		}
	}
	hasMock := strings.Contains(clause, enrichment.MockDataName)
	switch {
	case hasFriendly && !hasMock:
		return FamilyFriendly
	case hasMock && !hasFriendly:
		return FamilyMock
	default:
		return FamilyUnknown
	}
}

// commentSpan is a half-open [start, end) byte range covering one `//` line
// comment (through end of line) or one `/* … */` block comment (including its
// delimiters). Spans are produced by scanComments (scanTags.go) — a linear pass
// guided by the parse's literal-token oracle, so a tag inside string data
// never counts as a comment and a comment inside a template interpolation
// does.
type commentSpan struct {
	start, end int
}

// insideRanges reports whether offset falls inside any half-open range.
func insideRanges(ranges [][2]int, offset int) bool {
	for _, r := range ranges {
		if offset >= r[0] && offset < r[1] {
			return true
		}
	}
	return false
}

// LineIndex converts byte offsets in a raw text (no AST required) to 1-based
// line/column pairs — the convention diagnostics.Site and textpos share. Columns are
// byte columns; every tag this package emits is pure ASCII and sits before any
// non-ASCII text on its line, so tag columns are stable across encodings.
type LineIndex struct {
	starts  []int
	textLen int
}

// NewLineIndex builds the line-start table for text in one pass.
func NewLineIndex(text string) *LineIndex {
	starts := []int{0}
	for i := 0; i < len(text); i++ {
		if text[i] == '\n' {
			starts = append(starts, i+1)
		}
	}
	return &LineIndex{starts: starts, textLen: len(text)}
}

// At returns the 1-based (line, column) for a byte offset, clamped to the text.
func (index *LineIndex) At(offset int) (int, int) {
	if offset < 0 {
		offset = 0
	}
	if offset > index.textLen {
		offset = index.textLen
	}
	// Greatest line start <= offset.
	line := sort.Search(len(index.starts), func(i int) bool { return index.starts[i] > offset }) - 1
	return line + 1, offset - index.starts[line] + 1
}
