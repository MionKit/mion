/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {FatalError, RpcError, StatusCodes} from '@mionjs/core';

/** The 413 a platform adapter answers when a body passes the route's limit while it arrives. */
export function requestPayloadTooLarge(): RpcError<'request-payload-too-large'> {
  return new FatalError({
    statusCode: StatusCodes.PAYLOAD_TOO_LARGE,
    publicMessage: 'Payload Too Large',
    type: 'request-payload-too-large',
  });
}

// One decoder for every request: a non-streaming `decode` call keeps no state between calls, so
// sharing it is safe. A streaming decode (`{stream: true}`) would not be, which is why the chunked
// path below collects bytes and decodes ONCE instead of decoding chunk by chunk.
const utf8 = new TextDecoder();

/**
 * Reads a fetch-style request body as text against the route's request limit.
 *
 * A body with a `content-length` is the common case (every fetch client sends one for a string
 * body): the number is checked and the body read with `req.text()`, the runtime's own native
 * decode, which on bun is the buffered fast path and everywhere else one decode of the whole body.
 * The runtime guarantees the body is exactly that many bytes. A body without one (chunked) is
 * pulled in chunks with the running size counted, cancelled the moment it passes the limit so the
 * rest is never pulled, and decoded once at the end.
 *
 * Sizes are counted in bytes, never less than the character count the router checks again before
 * parsing, so the byte-exact refusal here always fires first. Resolves undefined for a request
 * without a body and throws the same 413 the router would.
 */
export async function readRequestBody(req: Request, maxBodySize: number): Promise<string | undefined> {
  if (!req.body) return undefined;
  const declared = req.headers.get('content-length');
  if (declared !== null) {
    if (Number(declared) > maxBodySize) throw requestPayloadTooLarge();
    return req.text();
  }
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBodySize) {
      await reader.cancel();
      throw requestPayloadTooLarge();
    }
    chunks.push(value);
  }
  return decodeOnce(chunks, size);
}

/** One UTF-8 decode over the whole body: a single chunk decodes in place, several are joined into
 *  one buffer first so a character split across chunks is never decoded in halves. */
function decodeOnce(chunks: Uint8Array[], size: number): string {
  if (chunks.length === 0) return '';
  if (chunks.length === 1) return utf8.decode(chunks[0]);
  const joined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return utf8.decode(joined);
}
