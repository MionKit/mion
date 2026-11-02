// Applies the resolver's edit list (internal/compiler/sourcerewrite/edits.go) in JS, so the rewritten file
// and its source map never cross the wire. Must call appendLeft / update in the same order as Go's Apply,
// or the two modes stop being byte-identical. Offsets are UTF-16 code units, already converted on the Go side.
import {EditBuffer, type SourceMap} from './edit-buffer.ts';
import type {Edit} from './protocol.ts';

// `importBlock` comes relativized; it goes in first so it precedes any other insertion at `importAt`.
// Edits use ORIGINAL coordinates, so their order is irrelevant. `file` names sources[0].
export function applyEdits(
  file: string,
  code: string,
  importBlock: string,
  importAt: number,
  edits: Edit[]
): {code: string; map: SourceMap} {
  const buffer = new EditBuffer(code);
  buffer.appendLeft(importAt, importBlock);
  for (const edit of edits) {
    if (edit.start === edit.end) buffer.appendLeft(edit.start, edit.text);
    else buffer.update(edit.start, edit.end, edit.text);
  }
  const map = buffer.generateMap({source: file, includeContent: true});
  return {code: buffer.toString(), map};
}

// sourceHash is the FE side of the 'edits'-mode consistency guard: FNV-1a/32 over the UTF-8 bytes of
// `code`, hex-encoded to 8 digits. It MUST match Go's SourceHash byte-for-byte, since a matching hash
// is what proves the resolver's offsets index the source the bundler handed us. Math.imul does the
// 32-bit multiply without BigInt; `>>> 0` reads it back as unsigned.
export function sourceHash(code: string): string {
  const bytes = Buffer.from(code, 'utf8');
  let hash = 0x811c9dc5; // FNV offset basis (2166136261)
  for (let i = 0; i < bytes.length; i++) {
    hash ^= bytes[i];
    hash = Math.imul(hash, 0x01000193); // FNV prime (16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
