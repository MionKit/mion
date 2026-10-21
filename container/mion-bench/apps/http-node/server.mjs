/* ########
 * 2026 mion · License: MIT
 * ######## */
// A bare node http server: no router, no framework. The theoretical ceiling the
// framework lanes are measured against - it still validates, so the comparison is
// like for like on work done, differing only in framework overhead.
import {createServer} from 'node:http';
import {z} from 'zod';
import {makeSchemas, updateSimpleUser, updateUser} from '../../shared/zod-schemas.mjs';

const {UserSchema, SimpleUserSchema} = makeSchemas(z);
const port = Number(process.env.MION_BENCH_PORT || 3000);
const JSON_HEADERS = {'content-type': 'application/json; charset=utf-8'};

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const send = (res, status, payload) => {
  res.writeHead(status, JSON_HEADERS);
  res.end(JSON.stringify(payload));
};

async function handle(req, res) {
  if (req.method === 'GET' && req.url === '/hello') return send(res, 200, {hello: 'world'});

  const schema = req.url === '/updateUser' ? UserSchema : req.url === '/updateSimpleUser' ? SimpleUserSchema : null;
  if (!schema || req.method !== 'POST') return send(res, 404, {error: 'not found'});

  const raw = await readBody(req);
  let parsed;
  try {
    parsed = schema.safeParse(JSON.parse(raw));
  } catch {
    return send(res, 400, {error: 'Invalid JSON'});
  }
  if (!parsed.success) return send(res, 400, {error: 'Validation failed'});
  send(res, 200, req.url === '/updateUser' ? updateUser(parsed.data) : updateSimpleUser(parsed.data));
}

createServer((req, res) => {
  // A client that goes away mid-body rejects the body read, and an async handler's
  // rejection escapes node's http server as an unhandled rejection, which KILLS the
  // process: the lane then reports zero and every later request is refused. Every
  // framework lane handles this internally; this one is the bare server, so it does
  // it here. Aborts are normal at the top of the payload sweep, where the largest
  // size caps concurrency and drops sockets.
  handle(req, res).catch(() => res.destroy());
}).listen(port);
