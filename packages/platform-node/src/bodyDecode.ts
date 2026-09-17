/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

/**
 * The request body as one string, holding as little of it at once as possible.
 *
 * The shape this replaced kept three copies live at the moment of dispatch: the chunk array, the
 * `Buffer.concat` copy, and the decoded string. At 4 MB, times the requests in flight, that is
 * most of what the server holds. Here the chunks are released as soon as they are joined, and a
 * single chunk (the common case) is decoded without a copy at all.
 *
 * It decodes ONCE over the whole body rather than chunk by chunk. That is not a detail: a socket
 * read can end in the middle of a multi-byte character, and decoding each chunk on its own turns
 * that one character into two replacement characters. Same reason `decodeOnce` exists in
 * @mionjs/router's bodyReader, which the fetch-style adapters use.
 *
 * Its own module so it can be tested directly: an HTTP test cannot force where the socket reads
 * land, so it would pass against a per-chunk decode and prove nothing.
 */
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
