/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Throughput of the fetch-style body reader the bun / cloudflare / vercel adapters call per request,
// under node's Request (undici). `baseline` is the reader as it first shipped (a TextDecoder per
// request, a reader loop decoding chunk by chunk, a string join); the three strategies are the
// current reader. Only `stream` is chosen for a node-backed runtime; `text` and `buffered` run here
// for the comparison, their own numbers were taken on workerd and bun with a real server. Run with:
//   pnpm exec vitest bench --project router bodyReader

import {bench, describe} from 'vitest';
import {readRequestBody, requestPayloadTooLarge} from './bodyReader.ts';
import type {BodyReadStrategy} from './bodyReader.ts';

const STRATEGIES: BodyReadStrategy[] = ['stream', 'text', 'buffered'];

/** The first shipped reader, kept here as the comparison point. */
async function baseline(req: Request, maxBodySize: number): Promise<string | undefined> {
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

const LIMIT = 10_000_000;
const encode = (text: string) => new TextEncoder().encode(text);

/** A request as a server sees it: a string body with its content-length on the wire. */
function declared(body: string): Request {
  return new Request('http://localhost/x', {
    method: 'POST',
    body,
    headers: {'content-length': String(encode(body).byteLength), 'content-type': 'application/json'},
  });
}

/** A chunked body: no content-length, the bytes arrive in `parts` pieces. */
function chunked(body: string, parts: number): Request {
  const bytes = encode(body);
  const step = Math.ceil(bytes.byteLength / parts);
  let offset = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.byteLength) return controller.close();
      controller.enqueue(bytes.slice(offset, offset + step));
      offset += step;
    },
  });
  return new Request('http://localhost/x', {method: 'POST', body: stream, duplex: 'half'} as RequestInit);
}

const bodies = {
  '100 B': JSON.stringify({updateSimpleUser: [{name: 'John', surname: 'Smith', age: 42, email: 'j@example.com'}]}),
  '1 KB': JSON.stringify({updateUser: [{name: 'John', tags: Array.from({length: 60}, (_, i) => `tag-${i}`)}]}),
  '50 KB': JSON.stringify({updateUser: [{name: 'John', tags: Array.from({length: 4000}, (_, i) => `tag-${i}`)}]}),
};

for (const [label, body] of Object.entries(bodies)) {
  describe(`string body with content-length, ${label}`, () => {
    bench('baseline', async () => {
      await baseline(declared(body), LIMIT);
    });
    for (const strategy of STRATEGIES) {
      bench(strategy, async () => {
        await readRequestBody(declared(body), LIMIT, strategy);
      });
    }
  });
}

describe('chunked body, 1 KB in 4 pieces, no content-length', () => {
  bench('baseline', async () => {
    await baseline(chunked(bodies['1 KB'], 4), LIMIT);
  });
  for (const strategy of STRATEGIES) {
    bench(strategy, async () => {
      await readRequestBody(chunked(bodies['1 KB'], 4), LIMIT, strategy);
    });
  }
});

describe('no body (a GET)', () => {
  const get = () => new Request('http://localhost/x', {method: 'GET'});
  bench('baseline', async () => {
    await baseline(get(), LIMIT);
  });
  bench('stream', async () => {
    await readRequestBody(get(), LIMIT, 'stream');
  });
});
