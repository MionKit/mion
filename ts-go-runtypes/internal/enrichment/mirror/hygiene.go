package mirror

import (
	"regexp"
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/scanner"

	"github.com/mionkit/mion/ts-go-runtypes/internal/enrichment"
	"github.com/mionkit/mion/ts-go-runtypes/internal/srcscan"
)

// hygiene.go detects the DIRTY tags this package's emitters write, the `@todo` flag and the orphan carcasses, so the lint
// lanes can require finished enrichment files. A clean file has neither; the reconcile markers are legitimate and never
// reported. Detection derives from the same tags.go constants the emitters use, so the two cannot drift.

// TagKind identifies which dirty tag a hygiene finding matched.
type TagKind int

const (
	// TagTodo is any @todo comment token, not only the generated line: a hand-parked todo does not belong here either.
	TagTodo TagKind = iota + 1
	// TagOrphan is a whole-const `/* @rtOrphan … */` carcass.
	TagOrphan
	// TagOrphanChild is a single-field `/* @rtOrphanChild … */` carcass.
	TagOrphanChild
	// TagBlankValue is an unfilled scaffold VALUE, as incomplete as a @todo since a blank label ships blank to the UI.
	// It is detected structurally rather than as a comment tag; see BlankValues.
	TagBlankValue
)

// TagFinding is one dirty-tag occurrence; Start/End bound the tag TOKEN, so an editor squiggle stays tight over a
// many-line carcass. BlockStart/BlockEnd bound the whole carcass, which the family attribution reads the annotation from.
type TagFinding struct {
	Kind       TagKind
	Start      int
	End        int
	BlockStart int
	BlockEnd   int
}

// MirrorFamily says which per-family mirror a file or a finding belongs to; Unknown means no signal at all.
type MirrorFamily int

const (
	FamilyUnknown MirrorFamily = iota
	FamilyFriendly
	FamilyMock
)

// IsEnrichmentFile is the scoping guard under the consumer's lint glob: a reconcile marker in its EMIT form, or a const
// annotated with the DSL types, which also covers a fresh const whose unresolved root got no marker.
// The annotation is matched with comments AND literal bodies masked, so neither the DSL package's own sources, a JSDoc
// example nor a template literal embedding a mirror-shaped line can make ordinary source read as a mirror.
func (scan *Scan) IsEnrichmentFile() bool {
	if scan.HasMarkerComment() {
		return true
	}
	return enrichConstAnnotationPattern.MatchString(scan.structureMaskedText())
}

// IsEnrichmentFile is the one-shot twin of Scan.IsEnrichmentFile; it parses text per call.
func IsEnrichmentFile(text string) bool {
	return NewScan(text).IsEnrichmentFile()
}

// HasMarkerComment requires a comment that STARTS with the marker prefix, not the prefix inside a string, which the
// generated diagnostic catalog embeds in its message text. It is THE "generated mirror" signal both guards key on.
func (scan *Scan) HasMarkerComment() bool {
	for _, span := range scan.spans {
		if strings.HasPrefix(scan.text[span.Start:], MarkerCommentPrefix) {
			return true
		}
	}
	return false
}

// HasMarkerComment is the one-shot twin of Scan.HasMarkerComment; it parses text per call.
func HasMarkerComment(text string) bool {
	return NewScan(text).HasMarkerComment()
}

// enrichConstAnnotationPattern matches a line-leading const annotated with a DSL wrapper, the shape ConstBlock emits.
// The `\s*` after the colon tolerates a formatter wrapping the annotation onto the next line.
var enrichConstAnnotationPattern = regexp.MustCompile(
	`(?m)^[ \t]*(?:export[ \t]+)?const[ \t]+[A-Za-z_$][A-Za-z0-9_$]*[ \t]*:\s*(?:` +
		dslWrapperAlternation + `)[ \t]*<`)

// CarcassMatches is the ONE definition of what a carcass is, shared by DirtyTags, PruneOrphanBlocks and
// indexOrphanCarcasses so they can never disagree: a pattern match that also STARTS a genuine block-comment span.
// That filters out the tag syntax inside a string, which the generated diagnostic catalog embeds, and a carcass-looking
// sequence inside a `//` line comment, whose match starts mid-line.
func (scan *Scan) CarcassMatches() [][2]int {
	var matches [][2]int
	for _, match := range orphanBlockPattern.FindAllStringIndex(scan.text, -1) {
		start, end := match[0], match[1]
		if !scan.commentStartsAt(start) {
			continue // pattern bytes inside a literal or another comment are not a carcass
		}
		matches = append(matches, [2]int{start, end})
	}
	return matches
}

// commentStartsAt reports whether a comment span starts exactly at offset.
func (scan *Scan) commentStartsAt(offset int) bool {
	for _, span := range scan.spans {
		if span.Start == offset {
			return true
		}
		if span.Start > offset {
			return false // spans are in text order
		}
	}
	return false
}

// DirtyTags returns every dirty-tag occurrence ordered by Start, from the SAME carcass set `enrich --prune` removes,
// so the rule reports exactly what prune would fix.
// `@todo` counts only as a comment token with an identifier boundary after it, so `@todos` never fires, and one INSIDE
// a carcass is preserved const text that prune removes with the block, so it is not reported separately.
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
		body := text[comment.Start:comment.End]
		from := 0
		for {
			idx := strings.Index(body[from:], TodoTag)
			if idx < 0 {
				break
			}
			offset := comment.Start + from + idx
			from += idx + len(TodoTag)
			after := offset + len(TodoTag)
			if after < len(text) && isIdentByte(text[after]) {
				continue // @todoSomething is not the tag
			}
			if insideRanges(carcasses, offset) {
				continue // preserved carcass text, which the carcass finding covers
			}
			findings = append(findings, TagFinding{Kind: TagTodo, Start: offset, End: after, BlockStart: offset, BlockEnd: after})
		}
	}

	sort.Slice(findings, func(left, right int) bool { return findings[left].Start < findings[right].Start })
	return findings
}

// ScanDirtyTags is the one-shot twin of Scan.DirtyTags; it parses text per call.
func ScanDirtyTags(text string) []TagFinding {
	return NewScan(text).DirtyTags()
}

// blankArrayPattern matches an empty array at a property-value position, a blank mock pool or items slot.
var blankArrayPattern = regexp.MustCompile(`:\s*(\[\s*\])`)

// BlankValues returns every empty string or array right after a `key:`; the completeness gate treats them like a @todo.
// A blank rt$label ships blank to the UI, and a `pool: []` mocks nothing unless a `min` / `max` sits beside it.
// Empty strings come from the literal-token oracle, never a grep, so an empty element in a filled pool is no slot.
func (scan *Scan) BlankValues() []TagFinding {
	var findings []TagFinding
	for _, literal := range scan.literals {
		start, end := literal[0], literal[1]
		if body := scan.text[start:end]; body != "''" && body != `""` {
			continue
		}
		if !precededByColon(scan.text, start) {
			continue // an empty string as an array element or argument is not a slot
		}
		findings = append(findings, TagFinding{Kind: TagBlankValue, Start: start, End: end, BlockStart: start, BlockEnd: end})
	}
	// The IMPORT mask keeps strings: blanked, a filled `['x']` reads as `[   ]`; a `[]` in a string is shielded by its quote.
	masked := scan.importMaskedText()
	rangedPools := rangedEmptyPools(scan.sourceFile)
	for _, match := range blankArrayPattern.FindAllStringSubmatchIndex(masked, -1) {
		start, end := match[2], match[3] // group 1: the `[]`
		if rangedPools[start] {
			continue // `pool: []` beside a min / max is how MockData spells a range-only field
		}
		findings = append(findings, TagFinding{Kind: TagBlankValue, Start: start, End: end, BlockStart: start, BlockEnd: end})
	}
	sort.Slice(findings, func(left, right int) bool { return findings[left].Start < findings[right].Start })
	return findings
}

// mockRangeKeys are the MockData knobs that make an empty pool a range: numbers and Dates take `min` / `max`.
var mockRangeKeys = map[string]bool{"min": true, "max": true}

// rangedEmptyPools returns the `[` offset of every `pool: []` whose own object literal also sets a range key.
func rangedEmptyPools(sourceFile *ast.SourceFile) map[int]bool {
	offsets := map[int]bool{}
	if sourceFile == nil {
		return offsets
	}
	var visit func(node *ast.Node) bool
	visit = func(node *ast.Node) bool {
		if node == nil {
			return false
		}
		if ast.IsObjectLiteralExpression(node) {
			var emptyPool *ast.Node
			hasRange := false
			for _, property := range node.AsObjectLiteralExpression().Properties.Nodes {
				if property == nil || !ast.IsPropertyAssignment(property) || property.Name() == nil {
					continue
				}
				key, value := property.Name().Text(), property.AsPropertyAssignment().Initializer
				switch {
				case mockRangeKeys[key]:
					hasRange = true
				case key == "pool" && isEmptyArrayLiteral(value):
					emptyPool = value
				}
			}
			if hasRange && emptyPool != nil {
				offsets[scanner.GetTokenPosOfNode(emptyPool, sourceFile, false)] = true
			}
		}
		node.ForEachChild(visit)
		return false
	}
	sourceFile.AsNode().ForEachChild(visit)
	return offsets
}

func isEmptyArrayLiteral(node *ast.Node) bool {
	if node == nil || !ast.IsArrayLiteralExpression(node) {
		return false
	}
	elements := node.AsArrayLiteralExpression().Elements
	return elements == nil || len(elements.Nodes) == 0
}

// precededByColon reports whether the token at offset is a property VALUE rather than an element or an argument.
func precededByColon(text string, offset int) bool {
	i := offset - 1
	for i >= 0 && (text[i] == ' ' || text[i] == '\t' || text[i] == '\n' || text[i] == '\r') {
		i--
	}
	return i >= 0 && text[i] == ':'
}

// ScanBlankValues is the one-shot twin of Scan.BlankValues; it parses text per call.
func ScanBlankValues(text string) []TagFinding {
	return NewScan(text).BlankValues()
}

// dslWrapperAlternation is shared by the annotation probes, so every one of them accepts a mirror authored before the rename.
var dslWrapperAlternation = strings.Join(append(append([]string{}, enrichment.FriendlyWrapperNames...), enrichment.MockDataName), `|`)

// annotationFamilyPattern is enrichConstAnnotationPattern with the DSL type name captured as group 1.
var annotationFamilyPattern = regexp.MustCompile(
	`(?m)^[ \t]*(?:export[ \t]+)?const[ \t]+[A-Za-z_$][A-Za-z0-9_$]*[ \t]*:\s*(` +
		dslWrapperAlternation + `)[ \t]*<`)

// carcassAnnotationPattern reads the annotation preserved INSIDE a carcass, comment text the anchored pattern cannot match.
var carcassAnnotationPattern = regexp.MustCompile(
	`const[ \t]+[A-Za-z_$][A-Za-z0-9_$]*[ \t]*:\s*(` + dslWrapperAlternation + `)[ \t]*<`)

// dslImportPattern captures the DSL import's clause body; a per-family mirror imports exactly its own type.
var dslImportPattern = regexp.MustCompile(`import[ \t]+type[ \t]*\{([^}]*)\}[ \t]*from[ \t]*['"]@mionjs/run-types['"]`)

// FamilyClassifier attributes findings in one mirror to a family, read off its const annotations or its DSL import.
// A generated mirror carries ONE family; per-finding attribution is what still classifies a pre-split COMBINED file.
type FamilyClassifier struct {
	text string
	// offsets and families pair every live, non-comment DSL const annotation with its family, in text order.
	offsets  []int
	families []MirrorFamily
	fallback MirrorFamily
}

// FamilyClassifier reads live annotations off the fully masked text, so a JSDoc example never counts, and the DSL-import
// fallback off the comments-only mask, which still shows the quoted module specifier.
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

// NewFamilyClassifier is the one-shot twin of Scan.FamilyClassifier; it parses text per call.
func NewFamilyClassifier(text string) *FamilyClassifier {
	return NewScan(text).FamilyClassifier()
}

// FamilyFor attributes a carcass by the annotation preserved inside it, and any other tag by the nearest live annotation
// at or AFTER it, since a `@todo` sits right above its const; then the nearest before it, the DSL import, else Unknown.
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

// FamilyAt attributes a position INSIDE a const, a blank value, by the nearest annotation AT OR BEFORE it, since a value
// sits below its annotation where a dirty tag sits above it; it falls back to the file's DSL import.
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

// dslImportFamily reads the file-level fallback off the DSL import clause; both families or neither means Unknown.
func dslImportFamily(text string) MirrorFamily {
	match := dslImportPattern.FindStringSubmatch(text)
	if match == nil {
		return FamilyUnknown
	}
	clause := match[1]
	hasFriendly := false
	for _, name := range enrichment.FriendlyWrapperNames { // FriendlyText, plus the legacy FriendlyType
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

// commentSpan is one comment's half-open byte range, delimiters included, from srcscan, THE shared comment lexer:
// a linear pass guided by the parse, so a tag inside string data never counts and one in a template interpolation does.
type commentSpan = srcscan.Span

// insideRanges reports whether offset falls inside any half-open range.
func insideRanges(ranges [][2]int, offset int) bool {
	for _, r := range ranges {
		if offset >= r[0] && offset < r[1] {
			return true
		}
	}
	return false
}

// LineIndex converts byte offsets to the 1-based line/column pairs diagnostics.Site uses, with no AST needed.
// Columns are BYTE columns, which is stable here because every emitted tag is ASCII and precedes any non-ASCII on its line.
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
	// Greatest line start at or before offset.
	line := sort.Search(len(index.starts), func(i int) bool { return index.starts[i] > offset }) - 1
	return line + 1, offset - index.starts[line] + 1
}
