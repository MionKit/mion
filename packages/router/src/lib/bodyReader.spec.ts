import {describe, it, expect} from 'vitest';
import {readRequestBody as read, BodyReadStrategy} from './bodyReader.ts';

const STRATEGIES = Object.entries(BodyReadStrategy) as [string, BodyReadStrategy][];

/** A request whose body streams the given chunks, counting how many were pulled and whether the
 *  stream was cancelled. No content-length is set, so the reader takes the chunked path. */
function streamed(chunks: Uint8Array[]) {
  const state = {pulled: 0, cancelled: false};
  let i = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i >= chunks.length) return controller.close();
      state.pulled++;
      controller.enqueue(chunks[i++]);
    },
    cancel() {
      state.cancelled = true;
    },
  });
  const req = new Request('http://localhost/x', {method: 'POST', body, duplex: 'half'} as RequestInit);
  return {req, state};
}

const encode = (text: string) => new TextEncoder().encode(text);

/** A request as a server sees it: the wire carries a content-length for a string body (an in-memory
 *  Request never sets one itself). */
const declared = (body: string) =>
  new Request('http://localhost/x', {method: 'POST', body, headers: {'content-length': String(encode(body).byteLength)}});

describe.each(STRATEGIES)('readRequestBody, %s strategy', (_name, strategy) => {
  const readRequestBody = (req: Request, max: number) => read(req, max, strategy);

  it('resolves undefined for a request without a body', async () => {
    const req = new Request('http://localhost/x', {method: 'GET'});
    expect(await readRequestBody(req, 100)).toBeUndefined();
  });

  it('reads a body with a content-length through the native text path', async () => {
    const req = declared('{"a":1}');
    expect(req.headers.get('content-length')).toBe('7');
    expect(await readRequestBody(req, 100)).toBe('{"a":1}');
  });

  it('refuses a declared content-length past the limit before reading', async () => {
    const req = declared('{"a":1}');
    await expect(readRequestBody(req, 6)).rejects.toMatchObject({type: 'request-payload-too-large', statusCode: 413});
    // never consumed
    expect(req.bodyUsed).toBe(false);
  });

  it('a body exactly at the limit passes', async () => {
    const req = declared('{"a":1}');
    expect(await readRequestBody(req, 7)).toBe('{"a":1}');
  });

  it('reads a chunked body in one decode', async () => {
    const {req, state} = streamed([encode('{"a":'), encode('1}')]);
    expect(await readRequestBody(req, 100)).toBe('{"a":1}');
    expect(state.pulled).toBe(2);
    expect(state.cancelled).toBe(false);
  });

  it('a multi-byte character split across chunks decodes intact', async () => {
    const bytes = encode('{"s":"ñ€😀"}');
    const cut = 7; // inside the euro sign
    const {req} = streamed([bytes.slice(0, cut), bytes.slice(cut, cut + 1), bytes.slice(cut + 1)]);
    expect(await readRequestBody(req, 100)).toBe('{"s":"ñ€😀"}');
  });

  it('refuses a chunked body past the limit; the stream strategies stop pulling the moment it passes', async () => {
    const chunks = Array.from({length: 10}, () => encode('0123456789'));
    const {req, state} = streamed(chunks);
    await expect(readRequestBody(req, 25)).rejects.toMatchObject({type: 'request-payload-too-large'});
    if (strategy === BodyReadStrategy.buffered) return; // the bytes are taken whole (bun bounds them natively first)
    expect(state.cancelled).toBe(true);
    expect(state.pulled).toBe(3); // 10 + 10 + 10 > 25, the fourth is never pulled
  });

  it('a chunked body exactly at the limit passes', async () => {
    const {req} = streamed([encode('abc'), encode('de')]);
    expect(await readRequestBody(req, 5)).toBe('abcde');
  });

  it('a multi-byte body with a content-length is measured in bytes, not characters', async () => {
    const req = declared('{"s":"€"}'); // 9 characters, 11 bytes
    await expect(readRequestBody(req, 10)).rejects.toMatchObject({type: 'request-payload-too-large'});
    expect(await readRequestBody(declared('{"s":"€"}'), 11)).toBe('{"s":"€"}');
  });

  it('an empty chunked body reads as an empty string', async () => {
    const {req} = streamed([]);
    expect(await readRequestBody(req, 5)).toBe('');
  });
});
