/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {FatalError, RpcError} from './errors.ts';
import {StatusCodes} from './constants.ts';

/** The 413 a platform adapter answers when a body passes the route's limit while it arrives. */
export function requestPayloadTooLarge(): RpcError<'request-payload-too-large'> {
  return new FatalError({
    statusCode: StatusCodes.PAYLOAD_TOO_LARGE,
    publicMessage: 'Payload Too Large',
    type: 'request-payload-too-large',
  });
}

/**
 * Reads a fetch-style request body as text against the route's request limit, giving up the moment
 * the running size passes it: a declared `content-length` over the limit is refused before a byte is
 * read, and a streamed body is cancelled mid-flight so the rest is never pulled. Sizes are counted in
 * bytes, which is never less than the character count the router checks again before parsing, so the
 * byte-exact refusal here always fires first. Resolves undefined for a request without a body and
 * throws the same 413 the router would.
 */
export async function readBodyWithin(req: Request, maxBodySize: number): Promise<string | undefined> {
  if (!req.body) return undefined;
  const declaredLength = Number(req.headers.get('content-length'));
  if (declaredLength > maxBodySize) throw requestPayloadTooLarge();
  const reader = req.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let size = 0;
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBodySize) {
      await reader.cancel();
      throw requestPayloadTooLarge();
    }
    chunks.push(decoder.decode(value, {stream: true}));
  }
  chunks.push(decoder.decode());
  return chunks.join('');
}
