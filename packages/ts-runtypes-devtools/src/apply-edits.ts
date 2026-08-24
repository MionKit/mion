// apply-edits.ts — the FE half of 'edits'-mode transform. The Go resolver hands
// back a flat edit list (importBlock + point/span edits, see
// internal/compiler/sourcerewrite/edits.go); this applies it with the in-house
// EditBuffer and produces the {code, map} pair the bundler expects — the light
// path that keeps the whole rewritten file + dense source map OFF the wire.
//
// Byte-parity with 'go' mode is structural, not incidental: the resolver
// computes these edits from the SAME buildInsertion / buildImportBlock the Go
// Apply uses, and this applier calls prepend / appendLeft / update in the
// identical sequence Go's Apply does. The EditBuffer was validated byte-for-byte
// against magic-string's hires:'boundary' output when it replaced that
// dependency, and the Go EditBuffer is a byte-for-byte port of it — so both
// modes emit the same code and the same mappings.
//
// Offsets are UTF-16 CODE UNITS (Go converted its byte offsets via
// makeByteToChar before shipping), so a JS string can be indexed with them
// directly — the multibyte hazard the byte/char split exists to avoid lives
// entirely on the Go side.
import {EditBuffer, type SourceMap} from './edit-buffer.ts';
import type {Edit} from './protocol.ts';

// applyEdits weaves the edit list into `code` and returns the rewritten source
// plus its source map. `importBlock` is prepended verbatim (already relativized
// by the resolver in files-mode); the point/span edits land against ORIGINAL
// coordinates so their order is irrelevant. `file` names sources[0] in the map.
export function applyEdits(file: string, code: string, importBlock: string, edits: Edit[]): {code: string; map: SourceMap} {
  const buffer = new EditBuffer(code);
  for (const edit of edits) {
    if (edit.start === edit.end) buffer.appendLeft(edit.start, edit.text);
    else buffer.update(edit.start, edit.end, edit.text);
  }
  if (importBlock) buffer.prepend(importBlock);
  const map = buffer.generateMap({source: file, includeContent: true});
  return {code: buffer.toString(), map};
}

// sourceHash is the FE side of the 'edits'-mode consistency guard: FNV-1a/32
// over the UTF-8 bytes of `code`, hex-encoded to 8 digits. It MUST match the
// Go SourceHash byte-for-byte (same algorithm, same UTF-8 encoding, same
// fixed-width hex) so a matching hash proves the resolver's byte offsets index
// the same source the bundler handed us. Math.imul does the 32-bit multiply
// without BigInt; `>>> 0` reads it back as unsigned.
export function sourceHash(code: string): string {
  const bytes = Buffer.from(code, 'utf8');
  let hash = 0x811c9dc5; // FNV offset basis (2166136261)
  for (let i = 0; i < bytes.length; i++) {
    hash ^= bytes[i];
    hash = Math.imul(hash, 0x01000193); // FNV prime (16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
