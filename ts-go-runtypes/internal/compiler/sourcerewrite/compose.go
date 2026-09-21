package sourcerewrite

// compose.go — source-map composition for the tsc-style compile CLI. The compile path is two
// passes, our rewrite (map A: rewritten → original) and tsgo's emit (map B: js → rewritten), so a
// breakpoint in final.js only lands on the user's ORIGINAL line through map C = B ∘ A. tsgo's Emit
// has no custom-transformer hook, which is why the composition happens here and not in the emit
// pipeline. Every map has a single source, so every source index is 0.

import (
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// segment is one decoded source-map segment in ABSOLUTE coordinates; the wire form is delta-encoded.
// fields is how many of the five slots are present: 1 (generated column only, no origin), 4, or 5.
type segment struct {
	genCol  int
	srcIdx  int
	srcLine int
	srcCol  int
	nameIdx int
	fields  int
}

// ComposeMaps returns map C (final.js → original) from map A (rewriteMap) and map B (emitMap). C
// carries A's source + content and B's names, which describe generated js tokens. A B-segment with
// no source, or whose rewritten position has no origin in A (it points into our injected import
// block or binding text), is dropped: that js position legitimately maps to nothing.
func ComposeMaps(rewriteMap, emitMap *protocol.SourceMap) *protocol.SourceMap {
	if rewriteMap == nil {
		return emitMap
	}
	if emitMap == nil {
		return nil
	}
	aRows := decodeMappings(rewriteMap.Mappings)
	bRows := decodeMappings(emitMap.Mappings)

	outRows := make([][]segment, len(bRows))
	for genLine, bSegs := range bRows {
		for _, b := range bSegs {
			if b.fields < 4 {
				continue // generated-only js position — nothing to remap through
			}
			origin, ok := lookupOriginal(aRows, b.srcLine, b.srcCol)
			if !ok {
				continue // rewritten position is injected code with no original origin
			}
			out := segment{genCol: b.genCol, srcIdx: 0, srcLine: origin.srcLine, srcCol: origin.srcCol, fields: 4}
			if b.fields >= 5 {
				out.nameIdx = b.nameIdx // the name describes the js token, carried from B
				out.fields = 5
			}
			outRows[genLine] = append(outRows[genLine], out)
		}
	}

	return &protocol.SourceMap{
		Version:        3,
		Sources:        rewriteMap.Sources,
		SourcesContent: rewriteMap.SourcesContent,
		Names:          emitMap.Names,
		Mappings:       encodeMappings(outRows),
	}
}

// OriginalLines returns the originalLine of every source-bearing segment in a v3 `mappings` string,
// in encounter order. Introspection only: the compile CLI's tests assert with it that a composed map
// points at original lines rather than the import-shifted rewritten ones.
func OriginalLines(mappings string) []int {
	var lines []int
	for _, row := range decodeMappings(mappings) {
		for _, seg := range row {
			if seg.fields >= 4 {
				lines = append(lines, seg.srcLine)
			}
		}
	}
	return lines
}

// lookupOriginal finds the original position map A assigns to a rewritten (line, col): the segment
// with the largest genCol not exceeding col, because source maps snap to the previous segment.
// Segments on a row ascend by genCol, so a linear scan with an early break is exact.
func lookupOriginal(aRows [][]segment, line, col int) (segment, bool) {
	if line < 0 || line >= len(aRows) {
		return segment{}, false
	}
	best := -1
	for i, seg := range aRows[line] {
		if seg.genCol > col {
			break
		}
		if seg.fields >= 4 {
			best = i
		}
	}
	if best < 0 {
		return segment{}, false
	}
	return aRows[line][best], true
}

// decodeMappings parses a v3 `mappings` string into absolute per-line segments. The v3 delta
// convention: generated column resets each line, the other four are cumulative across the map.
func decodeMappings(mappings string) [][]segment {
	if mappings == "" {
		return nil
	}
	lines := strings.Split(mappings, ";")
	rows := make([][]segment, len(lines))
	srcIdx, srcLine, srcCol, nameIdx := 0, 0, 0, 0
	for lineIndex, line := range lines {
		genCol := 0
		var segs []segment
		for _, field := range strings.Split(line, ",") {
			if field == "" {
				continue
			}
			vals := decodeVlqField(field)
			seg := segment{fields: len(vals)}
			if len(vals) >= 1 {
				genCol += vals[0]
				seg.genCol = genCol
			}
			if len(vals) >= 4 {
				srcIdx += vals[1]
				srcLine += vals[2]
				srcCol += vals[3]
				seg.srcIdx = srcIdx
				seg.srcLine = srcLine
				seg.srcCol = srcCol
			}
			if len(vals) >= 5 {
				nameIdx += vals[4]
				seg.nameIdx = nameIdx
			}
			segs = append(segs, seg)
		}
		rows[lineIndex] = segs
	}
	return rows
}

// encodeMappings is the inverse of decodeMappings, reusing the EditBuffer's appendVlq.
func encodeMappings(rows [][]segment) string {
	var out []byte
	prevSrcIdx, prevSrcLine, prevSrcCol, prevNameIdx := 0, 0, 0, 0
	for lineIndex, segs := range rows {
		if lineIndex > 0 {
			out = append(out, ';')
		}
		prevGenCol := 0
		for segIndex, seg := range segs {
			if segIndex > 0 {
				out = append(out, ',')
			}
			out = appendVlq(out, seg.genCol-prevGenCol)
			prevGenCol = seg.genCol
			if seg.fields >= 4 {
				out = appendVlq(out, seg.srcIdx-prevSrcIdx)
				prevSrcIdx = seg.srcIdx
				out = appendVlq(out, seg.srcLine-prevSrcLine)
				prevSrcLine = seg.srcLine
				out = appendVlq(out, seg.srcCol-prevSrcCol)
				prevSrcCol = seg.srcCol
			}
			if seg.fields >= 5 {
				out = appendVlq(out, seg.nameIdx-prevNameIdx)
				prevNameIdx = seg.nameIdx
			}
		}
	}
	return string(out)
}

// decodeVlqField decodes every base64-VLQ number packed into one segment field.
func decodeVlqField(field string) []int {
	var vals []int
	pos := 0
	for pos < len(field) {
		value, ok := decodeVlq(field, &pos)
		if !ok {
			break
		}
		vals = append(vals, value)
	}
	return vals
}

// decodeVlq reads one base64-VLQ number at *pos, advancing it. The inverse of appendVlq: the
// continuation bit is 0x20, the sign is the LSB.
func decodeVlq(field string, pos *int) (int, bool) {
	result := 0
	shift := 0
	for {
		if *pos >= len(field) {
			return 0, false
		}
		digit := vlqDecodeChar(field[*pos])
		*pos++
		if digit < 0 {
			return 0, false
		}
		result += (digit & 31) << shift
		if digit&32 == 0 {
			break
		}
		shift += 5
	}
	value := result >> 1
	if result&1 != 0 {
		value = -value
	}
	return value, true
}

// vlqDecodeChar maps a base64 character to its 0-63 value, or -1 if invalid.
// Inverse of the vlqChars table used by appendVlq.
func vlqDecodeChar(char byte) int {
	switch {
	case char >= 'A' && char <= 'Z':
		return int(char - 'A')
	case char >= 'a' && char <= 'z':
		return int(char-'a') + 26
	case char >= '0' && char <= '9':
		return int(char-'0') + 52
	case char == '+':
		return 62
	case char == '/':
		return 63
	default:
		return -1
	}
}
