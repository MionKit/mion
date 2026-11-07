package sourcerewrite

// edits.go: the 'edits'-mode twin of Apply, its edit list applied by packages/devtools/src/core/apply-edits.ts.
// Both share buildGroupInsertion / buildImportBlock / placeImportBlock / makeByteToChar and the appendLeft / update
// order, so code + map come out byte-identical. Edit offsets are UTF-16 code units, converted from bytes here.

import (
	"hash/fnv"
	"unicode/utf16"

	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// ComputeEdits returns Apply's rewrite as edits. importBlock goes in at importAt (UTF-16) before every other edit,
// still carrying rtmod: specifiers the caller relativizes for files-mode. ("", 0, nil) where Apply short-circuits.
func ComputeEdits(source string, prologueEnd int, sites []protocol.Site, replacements []protocol.Replacement) (string, int, []protocol.Edit) {
	if len(sites) == 0 && len(replacements) == 0 {
		return "", 0, nil
	}
	importByte, importBlock := placeImportBlock(source, prologueEnd, buildImportBlock(sites, replacements))

	units := utf16.Encode([]rune(source))
	byteOffsets := make([]int, 0, len(sites)+2*len(replacements)+1)
	byteOffsets = append(byteOffsets, importByte)
	for _, site := range sites {
		byteOffsets = append(byteOffsets, site.Pos)
	}
	for _, rep := range replacements {
		byteOffsets = append(byteOffsets, rep.Start, rep.End)
	}
	toChar := makeByteToChar(source, units, byteOffsets)

	// Apply's order, only to keep the modes comparable: edits use ORIGINAL coordinates, so order is not load-bearing.
	edits := make([]protocol.Edit, 0, len(sites)+len(replacements))
	for _, group := range groupSitesByPos(sites) {
		charPos := toChar(group[0].Pos)
		edits = append(edits, protocol.Edit{Start: charPos, End: charPos, Text: buildGroupInsertion(group)})
	}
	for _, rep := range replacements {
		edits = append(edits, protocol.Edit{Start: toChar(rep.Start), End: toChar(rep.End), Text: rep.Text})
	}

	return importBlock, toChar(importByte), edits
}

// SourceHash is the consistency guard for 'edits' mode: FNV-1a/32 over the EXACT source bytes the
// Edit offsets index. Non-cryptographic on purpose — the FE recomputes it over the bundler-supplied
// source and only needs to detect divergence, not resist attack — and 32-bit keeps the FE hasher on
// Math.imul with no BigInt. Hex-encoded so it survives the JSON wire untouched.
func SourceHash(source string) string {
	hasher := fnv.New32a()
	// The []byte view is the UTF-8 encoding, matching the FE's Buffer.from(code, 'utf8') so the two
	// hashes agree. Write never errors for a byte hash.
	_, _ = hasher.Write([]byte(source))
	return hex32(hasher.Sum32())
}

// hex32 renders a uint32 as 8 lowercase hex digits; the fixed width is what makes equal hashes
// compare as equal strings despite leading zeros.
func hex32(value uint32) string {
	const digits = "0123456789abcdef"
	out := make([]byte, 8)
	for i := 7; i >= 0; i-- {
		out[i] = digits[value&0xf]
		value >>= 4
	}
	return string(out)
}
