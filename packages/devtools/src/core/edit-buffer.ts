// EditBuffer — an in-house string editor + source-map generator, so the published package carries
// ZERO runtime dependencies: it replaced `magic-string`. It implements only what apply-edits.ts
// uses, and leans on three properties of the rewrite's edits a general-purpose editor can't assume:
// every edit is against ORIGINAL coordinates (so one left-to-right pass is exact and edit order is
// irrelevant); edits never overlap (asserted, not resolved); only the prepended import block adds
// newlines, so column shifts stay confined to each edited line.
//
// ───────────────────────── CREDIT / ATTRIBUTION ─────────────────────────
// The source-map segment math in `Mappings` (advance / addUnedited /
// addEdited and the /\w/ word-boundary rule) is ADAPTED FROM magic-string by
// Rich Harris, so the emitted `mappings` are identical to its
// `hires: 'boundary'` output and Vite's composite-map chain is unchanged. The
// editing model (flat left-insert map + sorted replacements + single-pass
// render) is original to this file — only the map math is ported. This is not
// a copy of the library; it reimplements the slice we need.
//
// magic-string is MIT licensed (https://github.com/Rich-Harris/magic-string):
//
//   Copyright 2018 Rich Harris
//
//   Permission is hereby granted, free of charge, to any person obtaining a
//   copy of this software and associated documentation files (the
//   "Software"), to deal in the Software without restriction, including
//   without limitation the rights to use, copy, modify, merge, publish,
//   distribute, sublicense, and/or sell copies of the Software, and to permit
//   persons to whom the Software is furnished to do so, subject to the
//   following conditions:
//
//   The above copyright notice and this permission notice shall be included
//   in all copies or substantial portions of the Software.
//
//   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
//   IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
//   FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
//   THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
//   LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
//   FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
//   DEALINGS IN THE SOFTWARE.
// ─────────────────────────────────────────────────────────────────────────

// SourceMap is the plain source-map v3 shape a bundler accepts back from a transform (no methods).
export interface SourceMap {
  version: number;
  sources: (string | null)[];
  sourcesContent: (string | null)[];
  names: string[];
  mappings: string;
}

// GenerateMapOptions is the subset of options the rewrite passes.
export interface GenerateMapOptions {
  source?: string;
  includeContent?: boolean;
}

interface Replacement {
  start: number;
  end: number;
  content: string;
}

// EditBuffer edits an immutable original: every index it is given is an ORIGINAL coordinate.
export class EditBuffer {
  private readonly original: string;
  private intro = '';
  // Repeated appendLeft at one index accumulate in call order.
  private readonly leftInserts = new Map<number, string>();
  private readonly replacements: Replacement[] = [];

  constructor(original: string) {
    this.original = original;
  }

  // prepend adds to the front of the output (the import block); the rewrite only ever calls it once.
  prepend(content: string): this {
    this.intro = content + this.intro;
    return this;
  }

  // appendLeft inserts to the left of an original index; later calls there land after earlier ones.
  appendLeft(index: number, content: string): this {
    if (!content) return this;
    this.leftInserts.set(index, (this.leftInserts.get(index) ?? '') + content);
    return this;
  }

  update(start: number, end: number, content: string): this {
    if (end < start) throw new Error(`EditBuffer.update: end ${end} < start ${start}`);
    this.replacements.push({start, end, content});
    return this;
  }

  toString(): string {
    let out = this.intro;
    this.eachChunk(
      (start, end) => (out += this.original.slice(start, end)),
      (text) => (out += text),
      (text) => (out += text)
    );
    return out;
  }

  // generateMap maps generated positions back to the original, with boundary-granular segments.
  generateMap(options: GenerateMapOptions = {}): SourceMap {
    const mappings = new Mappings(this.original, makeLocator(this.original));
    if (this.intro) mappings.advance(this.intro);
    this.eachChunk(
      (start, end) => mappings.addUnedited(start, end),
      (text) => mappings.advance(text),
      (text, start) => mappings.addEdited(start, text)
    );
    return {
      version: 3,
      sources: [options.source ?? null],
      sourcesContent: [options.includeContent ? this.original : null],
      names: [],
      mappings: mappings.encode(),
    };
  }

  // eachChunk walks left to right; a left-insert at an index fires before a replacement starting there.
  private eachChunk(
    onCopy: (start: number, end: number) => void,
    onInsert: (text: string) => void,
    onEdit: (text: string, start: number) => void
  ): void {
    const replacements = [...this.replacements].sort((a, b) => a.start - b.start);
    const insertPositions = [...this.leftInserts.keys()].sort((a, b) => a - b);
    this.assertDisjoint(replacements, insertPositions);

    const length = this.original.length;
    let cursor = 0;
    let nextInsert = 0;
    let nextReplacement = 0;
    while (cursor < length || nextInsert < insertPositions.length || nextReplacement < replacements.length) {
      const insertAt = nextInsert < insertPositions.length ? insertPositions[nextInsert] : Infinity;
      const replaceAt = nextReplacement < replacements.length ? replacements[nextReplacement].start : Infinity;
      const at = Math.min(insertAt, replaceAt);
      if (at === Infinity) {
        if (cursor < length) onCopy(cursor, length);
        break;
      }
      if (at > cursor) {
        onCopy(cursor, at);
        cursor = at;
      }
      if (insertAt === at) {
        onInsert(this.leftInserts.get(at)!);
        nextInsert++;
      }
      if (replaceAt === at) {
        const replacement = replacements[nextReplacement];
        onEdit(replacement.content, replacement.start);
        cursor = replacement.end;
        nextReplacement++;
      }
    }
  }

  // assertDisjoint guards the non-overlap invariant the single-pass render relies on.
  // Both cases are structurally impossible in the rewrite's edit set: a violation means a resolver bug.
  private assertDisjoint(replacements: Replacement[], insertPositions: number[]): void {
    for (let i = 1; i < replacements.length; i++) {
      if (replacements[i].start < replacements[i - 1].end) {
        throw new Error(`EditBuffer: overlapping replacements at ${replacements[i - 1].start} and ${replacements[i].start}`);
      }
    }
    for (const position of insertPositions) {
      for (const replacement of replacements) {
        if (position > replacement.start && position < replacement.end) {
          throw new Error(
            `EditBuffer: insertion at ${position} falls inside replacement [${replacement.start}, ${replacement.end})`
          );
        }
      }
    }
  }
}

// Mappings holds one row per generated line; a segment is [generatedColumn, source, origLine, origColumn].
// advance/addUnedited/addEdited mirror magic-string so the segmentation matches its output exactly.
class Mappings {
  private generatedLine = 0;
  private generatedColumn = 0;
  private readonly rows: number[][][] = [[]];

  constructor(
    private readonly original: string,
    private readonly locate: (index: number) => {line: number; column: number}
  ) {}

  // advance moves the cursor past unmapped text (intro, inserted runs) without recording a segment.
  advance(text: string): void {
    if (!text) return;
    const lines = text.split('\n');
    if (lines.length > 1) {
      for (let i = 0; i < lines.length - 1; i++) this.rows[++this.generatedLine] = [];
      this.generatedColumn = 0;
    }
    this.generatedColumn += lines[lines.length - 1].length;
  }

  // addUnedited maps a verbatim run, emitting a segment at each word/non-word boundary.
  // A newline gets no segment, it just opens the next line, matching magic-string's addUneditedChunk.
  addUnedited(start: number, end: number): void {
    const loc = this.locate(start);
    let originalLine = loc.line;
    let originalColumn = loc.column;
    let inWordRun = false;
    for (let index = start; index < end; index++) {
      const char = this.original[index];
      if (char === '\n') {
        originalLine++;
        originalColumn = 0;
        this.rows[++this.generatedLine] = [];
        this.generatedColumn = 0;
        inWordRun = false;
        continue;
      }
      if (isWordChar(char)) {
        if (!inWordRun) {
          this.rows[this.generatedLine].push([this.generatedColumn, 0, originalLine, originalColumn]);
          inWordRun = true;
        }
      } else {
        this.rows[this.generatedLine].push([this.generatedColumn, 0, originalLine, originalColumn]);
        inWordRun = false;
      }
      originalColumn++;
      this.generatedColumn++;
    }
  }

  // addEdited anchors replaced content at the original span start; that text is always single-line.
  addEdited(start: number, content: string): void {
    if (!content) return;
    if (content.includes('\n')) throw new Error('EditBuffer: multi-line replacement text is not supported');
    const loc = this.locate(start);
    this.rows[this.generatedLine].push([this.generatedColumn, 0, loc.line, loc.column]);
    this.generatedColumn += content.length;
  }

  encode(): string {
    let previousSource = 0;
    let previousOriginalLine = 0;
    let previousOriginalColumn = 0;
    return this.rows
      .map((row) => {
        let previousGeneratedColumn = 0;
        return row
          .map((segment) => {
            let encoded = encodeVlq(segment[0] - previousGeneratedColumn);
            previousGeneratedColumn = segment[0];
            encoded += encodeVlq(segment[1] - previousSource);
            previousSource = segment[1];
            encoded += encodeVlq(segment[2] - previousOriginalLine);
            previousOriginalLine = segment[2];
            encoded += encodeVlq(segment[3] - previousOriginalColumn);
            previousOriginalColumn = segment[3];
            return encoded;
          })
          .join(',');
      })
      .join(';');
  }
}

const VLQ_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

// encodeVlq base64-VLQ-encodes a signed integer (sign in the LSB); inverse of test/helpers/sourcemap.ts.
function encodeVlq(value: number): string {
  let vlq = value < 0 ? (-value << 1) | 1 : value << 1;
  let encoded = '';
  do {
    let digit = vlq & 31;
    vlq >>>= 5;
    if (vlq > 0) digit |= 32;
    encoded += VLQ_CHARS[digit];
  } while (vlq > 0);
  return encoded;
}

// isWordChar matches magic-string's boundary regex (/\w/).
function isWordChar(char: string): boolean {
  return /\w/.test(char);
}

// makeLocator resolves an original index to line/column in UTF-16 code units, what the rewrite passes in.
function makeLocator(source: string): (index: number) => {line: number; column: number} {
  const lineStarts = [0];
  for (let index = 0; index < source.length; index++) {
    if (source[index] === '\n') lineStarts.push(index + 1);
  }
  return (index: number) => {
    let low = 0;
    let high = lineStarts.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (lineStarts[mid] <= index) low = mid;
      else high = mid - 1;
    }
    return {line: low, column: index - lineStarts[low]};
  };
}
