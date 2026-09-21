// editbuffer.go — Go port of packages/devtools/src/core/edit-buffer.ts:
// the in-house string editor + source-map generator (EditBuffer + Mappings +
// VLQ encoder + makeLocator + isWordChar). It operates on []uint16 (UTF-16 code
// units) so columns and slicing match the JS string the original indexed; see
// the package doc in transform.go for the byte/UTF-16 rationale.
//
// ───────────────────────── CREDIT / ATTRIBUTION ─────────────────────────
// The source-map segment math in `mappings` (advance / addUnedited /
// addEdited and the /\w/ word-boundary rule) is ADAPTED FROM magic-string by
// Rich Harris, so the emitted `mappings` are identical to its
// `hires: 'boundary'` output and Vite's composite-map chain is unchanged. The
// editing model (flat left-insert map + sorted replacements + single-pass
// render) is original to this file — only the map math is ported. This is not
// a copy of the library; it reimplements the slice we need.
//
// magic-string is MIT licensed (https://github.com/Rich-Harris/magic-string):
//
//	Copyright 2018 Rich Harris
//
//	Permission is hereby granted, free of charge, to any person obtaining a
//	copy of this software and associated documentation files (the
//	"Software"), to deal in the Software without restriction, including
//	without limitation the rights to use, copy, modify, merge, publish,
//	distribute, sublicense, and/or sell copies of the Software, and to permit
//	persons to whom the Software is furnished to do so, subject to the
//	following conditions:
//
//	The above copyright notice and this permission notice shall be included
//	in all copies or substantial portions of the Software.
//
//	THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
//	IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
//	FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
//	THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
//	LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
//	FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
//	DEALINGS IN THE SOFTWARE.
// ─────────────────────────────────────────────────────────────────────────

package sourcerewrite

import (
	"fmt"
	"sort"
	"unicode/utf16"

	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// asciiUnits widens injected text to UTF-16 units. It is always ASCII, so this is 1:1, but it goes
// through utf16.Encode to stay correct if a caller ever feeds non-ASCII replacement text.
func asciiUnits(text string) []uint16 {
	return utf16.Encode([]rune(text))
}

// replacement is a span edit on the original (UTF-16 coordinates).
type replacement struct {
	start   int
	end     int
	content []uint16
}

// editBuffer accumulates point insertions and span replacements against an immutable original (in
// UTF-16 units), plus an optional prepended intro, then renders the patched units and a source map.
type editBuffer struct {
	original []uint16
	intro    []uint16
	// leftInserts maps an original index to the text inserted immediately to its left; repeated
	// appendLeft calls at one index accumulate in call order.
	leftInserts map[int][]uint16
	// Append order does not matter: eachChunk sorts a copy by start before walking it.
	replacements []replacement
}

func newEditBuffer(original []uint16) *editBuffer {
	return &editBuffer{original: original, leftInserts: make(map[int][]uint16)}
}

// prepend stitches content onto the very front of the output; the rewrite calls it once.
func (eb *editBuffer) prepend(content string) {
	eb.intro = append(asciiUnits(content), eb.intro...)
}

// appendLeft inserts content immediately to the left of the original index;
// later calls at the same index land after earlier ones.
func (eb *editBuffer) appendLeft(index int, content string) {
	if content == "" {
		return
	}
	eb.leftInserts[index] = append(eb.leftInserts[index], asciiUnits(content)...)
}

// update replaces the original span [start, end) with content.
func (eb *editBuffer) update(start, end int, content string) {
	if end < start {
		panic(fmt.Sprintf("editBuffer.update: end %d < start %d", end, start))
	}
	eb.replacements = append(eb.replacements, replacement{start: start, end: end, content: asciiUnits(content)})
}

// string renders the patched source as UTF-8: the intro, then the original woven with its edits.
func (eb *editBuffer) string() string {
	out := make([]uint16, 0, len(eb.original)+len(eb.intro))
	out = append(out, eb.intro...)
	eb.eachChunk(
		func(start, end int) { out = append(out, eb.original[start:end]...) },
		func(text []uint16) { out = append(out, text...) },
		func(text []uint16, _ int) { out = append(out, text...) },
	)
	return string(utf16.Decode(out))
}

// generateMap produces a v3 source map back to the original, with boundary-granular segments.
func (eb *editBuffer) generateMap(source, originalUTF8 string) *protocol.SourceMap {
	m := newMappings(eb.original)
	if len(eb.intro) > 0 {
		m.advance(eb.intro)
	}
	eb.eachChunk(
		func(start, end int) { m.addUnedited(start, end) },
		func(text []uint16) { m.advance(text) },
		func(text []uint16, start int) { m.addEdited(start, text) },
	)
	content := originalUTF8
	return &protocol.SourceMap{
		Version:        3,
		Sources:        []string{source},
		SourcesContent: []*string{&content},
		Names:          []string{},
		Mappings:       m.encode(),
	}
}

// eachChunk walks the document left to right, emitting verbatim copies (onCopy), inserted text with
// no source origin (onInsert) and replaced spans (onEdit). A left-insert at an index fires after the
// chunk ending there and before any replacement starting at the same index.
func (eb *editBuffer) eachChunk(
	onCopy func(start, end int),
	onInsert func(text []uint16),
	onEdit func(text []uint16, start int),
) {
	reps := make([]replacement, len(eb.replacements))
	copy(reps, eb.replacements)
	sort.SliceStable(reps, func(i, j int) bool { return reps[i].start < reps[j].start })

	insertPositions := make([]int, 0, len(eb.leftInserts))
	for index := range eb.leftInserts {
		insertPositions = append(insertPositions, index)
	}
	sort.Ints(insertPositions)
	eb.assertDisjoint(reps, insertPositions)

	length := len(eb.original)
	cursor := 0
	nextInsert := 0
	nextReplacement := 0
	const inf = int(^uint(0) >> 1) // math.MaxInt, Infinity sentinel
	for cursor < length || nextInsert < len(insertPositions) || nextReplacement < len(reps) {
		insertAt := inf
		if nextInsert < len(insertPositions) {
			insertAt = insertPositions[nextInsert]
		}
		replaceAt := inf
		if nextReplacement < len(reps) {
			replaceAt = reps[nextReplacement].start
		}
		at := insertAt
		if replaceAt < at {
			at = replaceAt
		}
		if at == inf {
			if cursor < length {
				onCopy(cursor, length)
			}
			break
		}
		if at > cursor {
			onCopy(cursor, at)
			cursor = at
		}
		if insertAt == at {
			onInsert(eb.leftInserts[at])
			nextInsert++
		}
		if replaceAt == at {
			rep := reps[nextReplacement]
			onEdit(rep.content, rep.start)
			cursor = rep.end
			nextReplacement++
		}
	}
}

// assertDisjoint guards the invariant the single-pass render relies on: replacements may not
// overlap and no insertion may fall strictly inside a replaced span. Both are structural
// impossibilities in the rewrite's edit set.
func (eb *editBuffer) assertDisjoint(reps []replacement, insertPositions []int) {
	for i := 1; i < len(reps); i++ {
		if reps[i].start < reps[i-1].end {
			panic(fmt.Sprintf("editBuffer: overlapping replacements at %d and %d", reps[i-1].start, reps[i].start))
		}
	}
	for _, position := range insertPositions {
		for _, rep := range reps {
			if position > rep.start && position < rep.end {
				panic(fmt.Sprintf("editBuffer: insertion at %d falls inside replacement [%d, %d)", position, rep.start, rep.end))
			}
		}
	}
}

// mappings builds the decoded segment grid, one row per generated line, and VLQ-encodes it.
// advance / addUnedited / addEdited mirror magic-string, so the boundary segmentation and
// edited-chunk anchoring match its output exactly.
type mappings struct {
	original      []uint16
	lineStarts    []int
	generatedLine int
	generatedCol  int
	rows          [][][4]int
}

func newMappings(original []uint16) *mappings {
	return &mappings{
		original:   original,
		lineStarts: buildLineStarts(original),
		rows:       [][][4]int{{}},
	}
}

// advance bumps the generated cursor past emitted-but-unmapped text (the intro
// and inserted runs) without recording any segment.
func (m *mappings) advance(text []uint16) {
	if len(text) == 0 {
		return
	}
	lines := splitLines(text)
	if len(lines) > 1 {
		for i := 0; i < len(lines)-1; i++ {
			m.generatedLine++
			m.rows = append(m.rows, [][4]int{})
		}
		m.generatedCol = 0
	}
	m.generatedCol += len(lines[len(lines)-1])
}

// addUnedited maps a verbatim run [start, end), emitting a segment at each word/non-word boundary.
// A newline gets no segment, it just opens the next line, matching magic-string's addUneditedChunk.
func (m *mappings) addUnedited(start, end int) {
	line, column := m.locate(start)
	originalLine := line
	originalColumn := column
	inWordRun := false
	for index := start; index < end; index++ {
		char := m.original[index]
		if char == '\n' {
			originalLine++
			originalColumn = 0
			m.generatedLine++
			m.rows = append(m.rows, [][4]int{})
			m.generatedCol = 0
			inWordRun = false
			continue
		}
		if isWordChar(char) {
			// One segment for the whole word run, at its start.
			if !inWordRun {
				m.pushSegment(originalLine, originalColumn)
				inWordRun = true
			}
		} else {
			// Every non-word char is its own boundary.
			m.pushSegment(originalLine, originalColumn)
			inWordRun = false
		}
		originalColumn++
		m.generatedCol++
	}
}

// addEdited maps replaced content with one segment at its start, pointing at the original start of
// the replaced span. The rewrite's replacement text is always single-line.
func (m *mappings) addEdited(start int, content []uint16) {
	if len(content) == 0 {
		return
	}
	if containsNewline(content) {
		panic("editBuffer: multi-line replacement text is not supported")
	}
	line, column := m.locate(start)
	m.pushSegment(line, column)
	m.generatedCol += len(content)
}

// pushSegment appends a [generatedColumn, sourceIndex=0, originalLine,
// originalColumn] segment to the current generated row.
func (m *mappings) pushSegment(originalLine, originalColumn int) {
	row := &m.rows[m.generatedLine]
	*row = append(*row, [4]int{m.generatedCol, 0, originalLine, originalColumn})
}

// encode delta-VLQ-encodes the segment grid into the `mappings` string.
func (m *mappings) encode() string {
	previousSource := 0
	previousOriginalLine := 0
	previousOriginalColumn := 0
	rowStrings := make([]string, len(m.rows))
	for r, row := range m.rows {
		previousGeneratedColumn := 0
		var sb []byte
		for s, segment := range row {
			if s > 0 {
				sb = append(sb, ',')
			}
			sb = appendVlq(sb, segment[0]-previousGeneratedColumn)
			previousGeneratedColumn = segment[0]
			sb = appendVlq(sb, segment[1]-previousSource)
			previousSource = segment[1]
			sb = appendVlq(sb, segment[2]-previousOriginalLine)
			previousOriginalLine = segment[2]
			sb = appendVlq(sb, segment[3]-previousOriginalColumn)
			previousOriginalColumn = segment[3]
		}
		rowStrings[r] = string(sb)
	}
	out := make([]byte, 0)
	for r, rs := range rowStrings {
		if r > 0 {
			out = append(out, ';')
		}
		out = append(out, rs...)
	}
	return string(out)
}

const vlqChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

// appendVlq base64-VLQ-encodes one signed integer (sign in the LSB) onto dst. Mirrors
// edit-buffer.ts encodeVlq, whose `>>> 5` is a logical shift over a value non-negative here.
func appendVlq(dst []byte, value int) []byte {
	var vlq int
	if value < 0 {
		vlq = ((-value) << 1) | 1
	} else {
		vlq = value << 1
	}
	for {
		digit := vlq & 31
		vlq >>= 5
		if vlq > 0 {
			digit |= 32
		}
		dst = append(dst, vlqChars[digit])
		if vlq <= 0 {
			break
		}
	}
	return dst
}

// isWordChar matches magic-string's boundary regex (/\w/) on one UTF-16 code unit.
func isWordChar(char uint16) bool {
	return (char >= 'A' && char <= 'Z') ||
		(char >= 'a' && char <= 'z') ||
		(char >= '0' && char <= '9') ||
		char == '_'
}

// buildLineStarts precomputes line-start indices (UTF-16) for the locator.
func buildLineStarts(source []uint16) []int {
	lineStarts := []int{0}
	for index := 0; index < len(source); index++ {
		if source[index] == '\n' {
			lineStarts = append(lineStarts, index+1)
		}
	}
	return lineStarts
}

// locate returns the 0-based line and column of a UTF-16 index (port of makeLocator); the column is
// in UTF-16 code units.
func (m *mappings) locate(index int) (int, int) {
	low := 0
	high := len(m.lineStarts) - 1
	for low < high {
		mid := (low + high + 1) >> 1
		if m.lineStarts[mid] <= index {
			low = mid
		} else {
			high = mid - 1
		}
	}
	return low, index - m.lineStarts[low]
}

// splitLines splits UTF-16 units on 0x0A, mirroring JS split('\n'): n+1 pieces for n newlines, the
// empty trailing piece included.
func splitLines(text []uint16) [][]uint16 {
	lines := make([][]uint16, 0, 1)
	start := 0
	for i := 0; i < len(text); i++ {
		if text[i] == '\n' {
			lines = append(lines, text[start:i])
			start = i + 1
		}
	}
	lines = append(lines, text[start:])
	return lines
}

// containsNewline reports whether the UTF-16 run holds a 0x0A.
func containsNewline(text []uint16) bool {
	for _, u := range text {
		if u == '\n' {
			return true
		}
	}
	return false
}
