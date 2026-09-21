// apply-edits.ts — the FE half of 'edits'-mode transform: it applies the resolver's edit list
// (computed by internal/compiler/sourcerewrite/edits.go) in JS, so the rewritten file and its dense
// source map never cross the wire. It must call prepend / appendLeft / update in the same sequence as
// Go's Apply, or the two modes stop being byte-identical. Offsets are UTF-16 CODE UNITS, converted
// from bytes on the Go side, so a JS string indexes with them directly.
import {EditBuffer, type SourceMap} from './edit-buffer.ts';
import type {Edit} from './protocol.ts';

// applyEdits prepends `importBlock` verbatim (the resolver already relativized it for files-mode) and
// lands the edits against ORIGINAL coordinates, so their order is irrelevant. `file` names sources[0].
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
