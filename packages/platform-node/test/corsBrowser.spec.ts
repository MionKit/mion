/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// A real browser on one origin calling a mion server on another: only a browser enforces CORS, so only a browser
// proves the headers are right. Uses Playwright's Chromium, else the machine's Chrome (CI runners ship one).

import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import {createServer, type Server} from 'http';
import {chromium, type Browser, type Page} from 'playwright';
import {createMionRouter, resetRouter} from '@mionjs/router';
import {mionCors} from '@mionjs/router/middlewares';
import type {CallContext} from '@mionjs/router';
import {HeadersSubset} from '@mionjs/core';
import {resetNodeHttpOpts, setNodeHttpOpts, startNodeServer} from '../src/mionHttp.ts';

const apiPort = 8300;
const pagePort = 8301;
const apiOrigin = `http://127.0.0.1:${apiPort}`;
const pageOrigin = `http://127.0.0.1:${pagePort}`;

const mion = createMionRouter({basePath: 'api/'});
const auth = mion.headersMiddleware((ctx: CallContext, headers: HeadersSubset<'authorization'>): void => undefined);
const listUsers = mion.query((): HeadersSubset<'x-total'> => new HeadersSubset({'x-total': '2'}));

/** What the client does: a JSON POST with the auth header, then the returned header read back by name */
function callFromPage(page: Page, route = 'listUsers') {
  return page.evaluate(
    async ([api, routeId]) => {
      try {
        const response = await fetch(`${api}/api/${routeId}`, {
          method: 'POST',
          headers: {'content-type': 'application/json', authorization: 'token'},
          body: JSON.stringify({auth: [], [routeId]: []}),
        });
        return {status: response.status, total: response.headers.get('x-total')};
      } catch (error) {
        return {status: 0, total: null, error: String(error)};
      }
    },
    [apiOrigin, route]
  );
}

async function launchBrowser(): Promise<Browser> {
  try {
    return await chromium.launch();
  } catch {
    return chromium.launch({channel: 'chrome'});
  }
}

describe('a browser on another origin', () => {
  let browser: Browser;
  let page: Page;
  let pageServer: Server;
  let apiServer: Server | undefined;

  beforeAll(async () => {
    pageServer = createServer((req, res) => res.writeHead(200, {'content-type': 'text/html'}).end('<html></html>'));
    await new Promise<void>((resolve) => pageServer.listen(pagePort, '127.0.0.1', resolve));
    browser = await launchBrowser();
    page = await browser.newPage();
    await page.goto(pageOrigin);
  });

  afterAll(async () => {
    await browser?.close();
    await new Promise((resolve) => pageServer.close(resolve));
  });

  async function startApi(routes: Parameters<typeof mion.initRoutes>[0]) {
    if (apiServer) await new Promise((resolve) => apiServer?.close(resolve));
    resetNodeHttpOpts();
    resetRouter();
    mion.initRoutes(routes);
    setNodeHttpOpts({port: apiPort});
    apiServer = await startNodeServer();
  }

  afterAll(() => new Promise((resolve) => (apiServer ? apiServer.close(resolve) : resolve(undefined))));

  it('reads a returned HeadersSubset through mionCors, after the preflight', async () => {
    await startApi({cors: mionCors({origin: pageOrigin}), auth, listUsers});
    expect(await callFromPage(page)).toEqual({status: 200, total: '2'});
  });

  it('is blocked by the browser when the API does not add mionCors', async () => {
    // another route: the browser caches the first test's preflight answer per URL
    await startApi({auth, listOthers: listUsers});
    expect(await callFromPage(page, 'listOthers')).toMatchObject({status: 0, total: null});
  });
});
