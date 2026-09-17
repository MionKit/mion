/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The case that breaks quietly: a multi-byte character landing across a socket read. Decoding
// chunk by chunk turns one character into two replacement characters, and every other test in this
// package sends ASCII, so nothing else would notice.
//
// Tested here rather than over HTTP on purpose. A test that posts the body in slices cannot force
// where the reads land - node coalesces them - so it passes against a per-chunk decode and proves
// nothing. Verified: an HTTP version of these cases passed against a deliberately broken decode.

import {describe, it, expect} from 'vitest';
import {decodeBody} from './bodyDecode.ts';

/** The body cut into byte slices at the given offsets, ignoring character boundaries, which is
 *  exactly what a socket read does. */
function sliceAt(text: string, ...cuts: number[]): {chunks: Buffer[]; size: number} {
  const bytes = Buffer.from(text, 'utf8');
  const edges = [0, ...cuts, bytes.length];
  const chunks = edges.slice(0, -1).map((start, i) => bytes.subarray(start, edges[i + 1]));
  return {chunks, size: bytes.length};
}

describe('decodeBody', () => {
  it('a two-byte character cut in half by a chunk boundary still decodes whole', () => {
    const text = 'café';
    const at = Buffer.from(text, 'utf8').indexOf(0xc3); // the first byte of é
    const {chunks, size} = sliceAt(text, at + 1);
    expect(chunks.length).toBe(2);
    expect(decodeBody(chunks, size)).toBe(text);
  });

  it('a four-byte emoji cut at every one of its internal boundaries still decodes whole', () => {
    const text = 'a🌍b';
    const at = Buffer.from(text, 'utf8').indexOf(0xf0); // the first byte of the emoji
    for (const cut of [at + 1, at + 2, at + 3]) {
      const {chunks, size} = sliceAt(text, cut);
      expect(decodeBody(chunks, size)).toBe(text);
    }
  });

  it('a body cut at many boundaries at once decodes the same as the whole', () => {
    const text = JSON.stringify({echo: ['héllo wörld 🌍 café ünïcödé 🎉']});
    const bytes = Buffer.from(text, 'utf8');
    const cuts = Array.from({length: 12}, (_, i) => Math.floor((bytes.length / 13) * (i + 1)));
    const {chunks, size} = sliceAt(text, ...cuts);
    expect(decodeBody(chunks, size)).toBe(text);
  });

  it('answers the empty string for no chunks, and never touches a buffer', () => {
    expect(decodeBody([], 0)).toBe('');
  });

  it('decodes a single chunk without copying it', () => {
    const text = 'sole chunk 🌍';
    const {chunks, size} = sliceAt(text);
    expect(chunks.length).toBe(1);
    expect(decodeBody(chunks, size)).toBe(text);
  });

  it('releases the chunks, so the body is not held twice while it is decoded', () => {
    const {chunks, size} = sliceAt('some body worth releasing', 4, 9);
    decodeBody(chunks, size);
    expect(chunks.length).toBe(0);
  });
});
