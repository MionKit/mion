// edits.go — the 'edits'-mode counterpart to Apply. Instead of applying the
// rewrite and generating a source map in Go, ComputeEdits returns the raw edit
// list (import block + point/span edits) for the FE to apply with its own
// EditBuffer (packages/ts-runtypes-devtools/src/edit-buffer.ts). Both modes share
// the SAME buildInsertion / buildImportBlock / makeByteToChar, so the two
// cannot drift: the FE applier calls prepend/appendLeft/update in the identical
// sequence Apply does, producing byte-identical code + map by construction.
//
// See the transform.go package doc for the UTF-8 byte vs UTF-16 code-unit
// rationale — Edit offsets are UTF-16 code units (what the JS string applier
// indexes), converted here from the resolver's byte offsets via makeByteToChar.
package sourcerewrite

import (
	"hash/fnv"
	"unicode/utf16"

	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// ComputeEdits derives the same edits Apply would make, but returns them for
// the FE to apply rather than applying them here. importBlock is the deduped
// import statement block prepended at offset 0 (still carrying rtmod:
// specifiers — the caller relativizes it for files-mode); edits are the flat
// point/span edits in UTF-16 code-unit offsets. Returns ("", nil) when there is
// nothing to rewrite — matching Apply's (source, nil) short-circuit.
func ComputeEdits(source string, sites []protocol.Site, replacements []protocol.Replacement) (string, []protocol.Edit) {
	if len(sites) == 0 && len(replacements) == 0 {
		return "", nil
	}

	units := utf16.Encode([]rune(source))
	byteOffsets := make([]int, 0, len(sites)+2*len(replacements))
	for _, site := range sites {
		byteOffsets = append(byteOffsets, site.Pos)
	}
	for _, rep := range replacements {
		byteOffsets = append(byteOffsets, rep.Start, rep.End)
	}
	toChar := makeByteToChar(source, units, byteOffsets)

	// Sites first, then replacements — the same order Apply appends them. The
	// FE EditBuffer resolves every edit against ORIGINAL coordinates, so order
	// is not load-bearing, but keeping it identical to Apply keeps the two
	// modes trivially comparable.
	edits := make([]protocol.Edit, 0, len(sites)+len(replacements))
	for _, group := range groupSitesByPos(sites) {
		charPos := toChar(group[0].Pos)
		edits = append(edits, protocol.Edit{Start: charPos, End: charPos, Text: buildGroupInsertion(group)})
	}
	for _, rep := range replacements {
		edits = append(edits, protocol.Edit{Start: toChar(rep.Start), End: toChar(rep.End), Text: rep.Text})
	}

	return buildImportBlock(sites, replacements), edits
}

// SourceHash is the consistency guard for 'edits' mode: FNV-1a/32 over the
// EXACT source bytes the Edit offsets index. Non-cryptographic on purpose — the
// FE recomputes it over the bundler-supplied source and only needs to detect
// divergence, not resist attack. 32-bit keeps the FE hasher branchless
// (Math.imul, no BigInt); collision risk is irrelevant for a consistency check
// whose false-match cost is bounded by the edit set landing on near-identical
// source. Hex-encoded so it survives the JSON wire untouched.
func SourceHash(source string) string {
	hasher := fnv.New32a()
	// Write never errors for a byte hash; the []byte view is the UTF-8 encoding,
	// matching the FE's Buffer.from(code, 'utf8') so the two hashes agree.
	_, _ = hasher.Write([]byte(source))
	return hex32(hasher.Sum32())
}

// hex32 renders a uint32 as 8 lowercase hex digits (fixed width so equal hashes
// compare as equal strings regardless of leading zeros).
func hex32(value uint32) string {
	const digits = "0123456789abcdef"
	out := make([]byte, 8)
	for i := 7; i >= 0; i-- {
		out[i] = digits[value&0xf]
		value >>= 4
	}
	return string(out)
}
