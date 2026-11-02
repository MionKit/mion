package sourcerewrite

// edits.go — the 'edits'-mode counterpart to Apply: ComputeEdits returns the raw edit list for the
// FE to apply with its own EditBuffer (packages/devtools/src/core/apply-edits.ts) instead of
// rewriting here. Both modes share the SAME buildGroupInsertion / buildImportBlock / placeImportBlock / makeByteToChar,
// and the FE applier calls prepend / appendLeft / update in the identical sequence Apply does, so
// the code + map come out byte-identical by construction. Edit offsets are UTF-16 code units, what
// the JS string applier indexes, converted from the resolver's byte offsets here.

import (
	"hash/fnv"
	"unicode/utf16"

	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// ComputeEdits derives the same edits Apply would make and returns them for the FE. importBlock goes in
// at importAt (UTF-16; 0 = prepend), before every other edit, and still carries rtmod: specifiers,
// which the caller relativizes for files-mode; edits are flat point/span edits in UTF-16 offsets.
// ("", 0, nil) when there is nothing to rewrite, matching Apply's (source, nil) short-circuit.
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

	// Sites first, then replacements, the same order Apply appends them. The FE EditBuffer resolves
	// every edit against ORIGINAL coordinates, so order is not load-bearing; matching Apply only
	// keeps the two modes trivially comparable.
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
