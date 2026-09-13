/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// A request that failed on arrival is answered before its body has finished coming in, and uWS
// refreshes the socket's idle timeout only while a body-data callback is registered. Without the
// drain the adapter registers, an upload slower than that timeout is cut off mid-flight: measured
// at ~3.9 MB of 6 MB before the socket died at 12s. `fetch` cannot pace a body this slowly, so
// these ride a raw socket. Its own file: the router carries a throwing pathTransform, and a router
// is created once per module.

import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import {createMionRouter, resetRouter} from '@mionjs/router';
import type {CallContext} from '@mionjs/router';
import {StatusCodes} from '@mionjs/core';
import {resetUwsHttpOpts, setUwsHttpOpts, startUwsServer, type UwsServer} from './uwsHttp.ts';
import {connect} from 'net';

const port = 8293;
const uploadBytes = 3_000_000;
const chunkBytes = 20_000;
const chunkEveryMs = 100; // 200 KB/s: ~15s of upload, past uWS' 10s idle timeout

const mion = createMionRouter({
  contextDataFactory: () => ({user: null}),
  basePath: 'api/',
  pathTransform: (request, path: string): string => {
    if (path.includes('boom')) throw new Error('pathTransform exploded');
    return path;
  },
});

type SimpleUser = {name: string; surname: string};
const echo = mion.route((ctx: CallContext, user: SimpleUser): SimpleUser => user);

/** Trickles a body the server has already answered, and reports whether the server hung up on it. */
function trickleUpload(path: string) {
  return new Promise<{statusCode: number | null; sentBytes: number; serverHungUp: boolean}>((resolve, reject) => {
    const socket = connect(port, '127.0.0.1');
    const chunk = Buffer.alloc(chunkBytes, 0x78);
    let sentBytes = 0;
    let statusCode: number | null = null;
    let ticker: NodeJS.Timeout;
    socket.on('connect', () => {
      socket.write(`POST ${path} HTTP/1.1\r\nHost: x\r\nContent-Length: ${uploadBytes}\r\n\r\n`);
      ticker = setInterval(() => {
        if (socket.destroyed || sentBytes >= uploadBytes) return;
        socket.write(chunk.subarray(0, Math.min(chunkBytes, uploadBytes - sentBytes)));
        sentBytes = Math.min(sentBytes + chunkBytes, uploadBytes);
        if (sentBytes < uploadBytes) return;
        // every byte accepted: settle after a short grace rather than waiting for a close that
        // should never come
        clearInterval(ticker);
        setTimeout(() => {
          const serverHungUp = socket.destroyed;
          socket.destroy();
          resolve({statusCode, sentBytes, serverHungUp});
        }, 200);
      }, chunkEveryMs);
    });
    socket.on('data', (data) => {
      const status = /HTTP\/1\.1 (\d+)/.exec(data.toString('latin1'));
      if (status && statusCode === null) statusCode = Number(status[1]);
    });
    socket.on('close', () => {
      clearInterval(ticker);
      if (sentBytes < uploadBytes) resolve({statusCode, sentBytes, serverHungUp: true});
    });
    socket.on('error', (error) => {
      clearInterval(ticker);
      if (sentBytes < uploadBytes) resolve({statusCode, sentBytes, serverHungUp: true});
      else reject(error);
    });
  });
}

describe('uws adapter: a request answered before its body arrived still drains it', () => {
  let server: UwsServer;

  beforeAll(async () => {
    resetUwsHttpOpts();
    resetRouter();
    mion.initRoutes({echo});
    setUwsHttpOpts({port});
    server = await startUwsServer();
  });

  afterAll(() => server.close());

  it('accepts the whole slow upload for an unknown path and for a throwing pathTransform', async () => {
    // both uploads share the same ~15s of wall clock
    const [notFound, transformThrew] = await Promise.all([trickleUpload('/api/nope'), trickleUpload('/api/boom')]);

    expect(notFound.statusCode).toBe(StatusCodes.NOT_FOUND);
    expect(notFound.sentBytes).toBe(uploadBytes);
    expect(notFound.serverHungUp).toBe(false);

    expect(transformThrew.statusCode).toBe(StatusCodes.SERVER_ERROR);
    expect(transformThrew.sentBytes).toBe(uploadBytes);
    expect(transformThrew.serverHungUp).toBe(false);
  }, 40_000);
});
