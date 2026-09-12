/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The node adapter resolves the route before the body but builds the context only once the body is
// in hand. A context built first survives the whole read, is promoted to the old heap, and takes
// the body string assigned into it along: the 4 MB payload lane pays about 10% throughput and 50 MB
// for it. The shared-data factory runs inside the context build, so counting it pins the order.

import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import {createConnection} from 'net';
import type {Server} from 'http';
import {createMionRouter, resetRouter} from '@mionjs/router';
import type {CallContext} from '@mionjs/router';
import {resetNodeHttpOpts, setNodeHttpOpts, startNodeServer} from './mionHttp.ts';

let contextsBuilt = 0;
const mion = createMionRouter({
  contextDataFactory: () => {
    contextsBuilt++;
    return {user: null};
  },
});

type SimpleUser = {name: string; surname: string};

const port = 8279;
const echo = mion.route((ctx: CallContext, user: SimpleUser): SimpleUser => user);

/** Sends the head, then the body in two pieces with `gapMs` between them, and calls `whileOpen`
 *  while the server still waits for the rest. */
function splitBody(body: string, gapMs: number, whileOpen: () => void): Promise<number> {
  const head =
    `POST /echo HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\n` +
    `Content-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n`;
  const half = Math.floor(body.length / 2);
  return new Promise((resolve, reject) => {
    const socket = createConnection({host: '127.0.0.1', port}, () => {
      socket.write(head + body.slice(0, half));
      setTimeout(() => {
        whileOpen();
        socket.write(body.slice(half));
      }, gapMs);
    });
    let data = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk) => (data += chunk));
    socket.on('error', reject);
    socket.on('close', () => resolve(Number(/^HTTP\/1\.1 (\d{3})/.exec(data)?.[1] ?? 0)));
    setTimeout(() => socket.destroy(), 3000);
  });
}

describe('node adapter builds the context after the body', () => {
  let server: Server;

  beforeAll(async () => {
    resetNodeHttpOpts();
    resetRouter();
    mion.initRoutes({echo});
    setNodeHttpOpts({port});
    server = await startNodeServer();
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('does not build a context while the body is still arriving', async () => {
    contextsBuilt = 0;
    let duringRead = -1;
    const status = await splitBody(JSON.stringify({echo: [{name: 'John', surname: 'Smith'}]}), 150, () => {
      duringRead = contextsBuilt;
    });
    expect(status).toEqual(200);
    // the server had the head and half the body for 150 ms and built nothing
    expect(duringRead).toEqual(0);
    expect(contextsBuilt).toEqual(1);
  });
});
