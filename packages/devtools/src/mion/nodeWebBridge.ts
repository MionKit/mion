/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {IncomingMessage, ServerResponse} from 'node:http';

// ############# node <-> web request bridge (dev server only) #############
// Vite's dev-server middleware layer is connect, i.e. node (req, res), in EVERY runtime — running
// vite under bun works because bun implements node:http, and mounting vite's middlewares inside
// Bun.serve is the direction that does not (oven-sh/bun#12212). So a fetch-style mion adapter
// (platform-bun, vercel, cloudflare…) is served in dev exactly the way the ecosystem does it —
// @hono/vite-dev-server bridges the same way through @hono/node-server's getRequestListener.
//
// Dev-only code: it buffers the request body rather than streaming it, which keeps the conversion
// small and is what the equivalent runtime adapter already does
// (packages/platform-vercel/src/devServer.ts).

/** Builds a web Request from node's IncomingMessage. */
export async function nodeRequestToWeb(req: IncomingMessage, isSecure = false): Promise<Request> {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((v) => headers.append(key, v));
    else headers.set(key, value);
  }
  const host = req.headers.host || 'localhost';
  const url = `${isSecure ? 'https' : 'http'}://${host}${req.url || '/'}`;
  const method = req.method || 'GET';
  // GET/HEAD must carry no body — passing one to Request() throws.
  const body = method === 'GET' || method === 'HEAD' ? undefined : await readBody(req);
  return new Request(url, {method, headers, body});
}

/** Writes a web Response back to node's ServerResponse. */
export async function writeWebResponseToNode(webResponse: Response, res: ServerResponse): Promise<void> {
  res.statusCode = webResponse.status;
  // set-cookie is the one header that legitimately repeats; Headers merges it into one comma
  // joined value, which browsers then read as a single malformed cookie.
  const setCookie = webResponse.headers.getSetCookie?.() ?? [];
  if (setCookie.length) res.setHeader('set-cookie', setCookie);
  webResponse.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'set-cookie') return;
    res.setHeader(key, value);
  });
  if (!webResponse.body) {
    res.end();
    return;
  }
  res.end(Buffer.from(await webResponse.arrayBuffer()));
}

/** Serves one node request through a fetch-style handler. */
export async function serveFetchHandler(
  handler: (req: Request) => Response | Promise<Response>,
  req: IncomingMessage,
  res: ServerResponse,
  isSecure?: boolean
): Promise<void> {
  const webResponse = await handler(await nodeRequestToWeb(req, isSecure));
  await writeWebResponseToNode(webResponse, res);
}

/** Collects the request body (dev-only: buffered, not streamed). Copied into a Uint8Array backed by
 *  a plain ArrayBuffer: node's Buffer (and any ArrayBufferLike-backed view) is not accepted as a
 *  BodyInit under DOM lib settings, which the consuming project's tsconfig may well be on. */
function readBody(req: IncomingMessage): Promise<Uint8Array<ArrayBuffer> | undefined> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk) => {
      chunks.push(chunk as Buffer);
      size += (chunk as Buffer).byteLength;
    });
    req.on('error', reject);
    req.on('end', () => {
      if (!size) return resolve(undefined);
      const body = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.byteLength;
      }
      resolve(body);
    });
  });
}
