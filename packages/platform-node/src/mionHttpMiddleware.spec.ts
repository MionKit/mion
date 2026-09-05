/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import {createServer, type Server} from 'http';
import {createMionRouter, resetRouter, getPlatformConfig} from '@mionjs/router';
import {setNodeHttpOpts, resetNodeHttpOpts, startNodeServer, httpRequestHandler} from './mionHttp.ts';
import type {CallContext, Route} from '@mionjs/router';

// `asMiddleware` is what makes in-process/middleware hosting possible at all: the HOST owns the
// socket (a vite dev server, an express app), so the adapter must register everything and hand back
// its handler WITHOUT listening — and without the SIGINT/SIGTERM handlers, which call
// process.exit(0) and would take the host down with them.

describe('startNodeServer({asMiddleware: true})', () => {
  type SimpleUser = {name: string; surname: string};
  const getSharedData = () => ({auth: {me: null as any}});
  const mion = createMionRouter({contextDataFactory: getSharedData, basePath: 'api/'});
  const changeUserName: Route = mion.route(
    (context: CallContext<ReturnType<typeof getSharedData>>, user: SimpleUser): SimpleUser => {
      return {name: 'NewName', surname: user.surname};
    }
  );

  let host: Server | undefined;

  beforeEach(async () => {
    resetNodeHttpOpts();
    resetRouter();
    await mion.initRoutes({changeUserName});
  });

  afterEach(async () => {
    if (host) await new Promise<void>((resolve) => host!.close(() => resolve()));
    host = undefined;
    resetNodeHttpOpts();
  });

  it('does not listen, and publishes the platform config anyway', async () => {
    const server = await startNodeServer({asMiddleware: true, port: 8077});
    expect(server.listening).toBe(false);
    expect(getPlatformConfig()).toMatchObject({asMiddleware: true, port: 8077});
  });

  it('installs no process exit handlers — those belong to the host', async () => {
    const before = process.listenerCount('SIGINT') + process.listenerCount('SIGTERM');
    await startNodeServer({asMiddleware: true, port: 8078});
    expect(process.listenerCount('SIGINT') + process.listenerCount('SIGTERM')).toBe(before);
  });

  it('keeps the flag when a later start passes only other options', async () => {
    // This is the plugin's path: it flips the flag through setNodeHttpOpts before loading the
    // entry, and the entry then calls startNodeServer({port}) as it always did.
    setNodeHttpOpts({asMiddleware: true});
    const server = await startNodeServer({port: 8079});
    expect(server.listening).toBe(false);
    expect(getPlatformConfig()).toMatchObject({asMiddleware: true, port: 8079});
  });

  it('still serves routes through httpRequestHandler mounted on the host', async () => {
    await startNodeServer({asMiddleware: true});
    host = createServer(httpRequestHandler);
    await new Promise<void>((resolve) => host!.listen(0, resolve));
    const port = (host.address() as {port: number}).port;

    const response = await fetch(`http://127.0.0.1:${port}/api/changeUserName`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({changeUserName: [{name: 'Leo', surname: 'Tungsten'}]}),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({changeUserName: {name: 'NewName', surname: 'Tungsten'}});
  });
});
