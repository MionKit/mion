/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

/** Decodes the whole body ONCE: a socket read can end mid-character, and a per-chunk decode turns that character into two
 *  replacement characters (same reason as `decodeOnce` in @mionjs/router's bodyReader). Chunks are released as they are
 *  joined, so no more of the body is held than needed. Its own module because an HTTP test cannot force where reads land. */
export function decodeBody(chunks: Buffer[], size: number): string {
  if (chunks.length === 0) return '';
  if (chunks.length === 1) {
    const only = chunks[0];
    chunks.length = 0;
    return only.toString('utf8');
  }
  const joined = Buffer.concat(chunks, size);
  // the chunks are dead the moment they are copied: drop them before the decode doubles the peak
  chunks.length = 0;
  return joined.toString('utf8');
}
