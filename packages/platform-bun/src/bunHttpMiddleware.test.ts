/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {expect, test, beforeAll, afterAll, describe, setDefaultTimeout} from 'bun:test';
import {createMionRouter, resetRouter, getPlatformConfig} from '@mionjs/router';
import {setBunHttpOpts, resetBunHttpOpts, startBunServer, bunRequestHandler} from './bunHttp.ts';
import {CallContext} from '@mionjs/router';
import {Server} from 'bun';

setDefaultTimeout(30_000);

// `asMiddleware` + the exported `bunRequestHandler` are what let a HOST own the socket: your own
// Bun.serve, or a vite dev server in middleware mode (which bridges node req/res to this handler,
// since vite's middleware layer is connect in every runtime — see oven-sh/bun#12212).

describe('bun asMiddleware should', () => {
  type SimpleUser = {name: string; surname: string};
  type Context = CallContext<ReturnType<typeof getSharedData>>;
  const getSharedData = () => ({auth: {me: null as any}});
  const mion = createMionRouter({contextDataFactory: getSharedData, basePath: 'api/'});
  const changeUserName = mion.route((context: Context, user: SimpleUser): SimpleUser => {
    return {name: 'NewName', surname: user.surname};
  });

  let host: Server<any> | undefined;

  beforeAll(async () => {
    resetBunHttpOpts();
    resetRouter();
    await mion.initRoutes({changeUserName});
  });

  afterAll(() => {
    void host?.stop(true);
    resetBunHttpOpts();
  });

  test('register everything without opening a port', async () => {
    const server = await startBunServer({asMiddleware: true, port: 8081});
    expect(server).toBeUndefined();
    expect(getPlatformConfig()).toMatchObject({asMiddleware: true, port: 8081});
    // nothing is listening on the port it was configured with
    expect(fetch('http://127.0.0.1:8081/api/changeUserName')).rejects.toThrow();
  });

  test('serve the same routes through bunRequestHandler mounted on the host', async () => {
    host = Bun.serve({port: 0, fetch: bunRequestHandler});
    const response = await fetch(`http://127.0.0.1:${host.port}/api/changeUserName`, {
      method: 'POST',
      body: JSON.stringify({changeUserName: [{name: 'Leo', surname: 'Tungsten'}]}),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({changeUserName: {name: 'NewName', surname: 'Tungsten'}});
  });

  test('keep the flag when a later start passes only other options', async () => {
    setBunHttpOpts({asMiddleware: true});
    // the overload types this as a Server (the flag rode setBunHttpOpts, not the argument) —
    // the runtime truth is undefined, which is exactly why the plugin discards the return value
    const server = (await startBunServer({port: 8082})) as unknown;
    expect(server).toBeUndefined();
    expect(getPlatformConfig()).toMatchObject({asMiddleware: true, port: 8082});
  });
});
