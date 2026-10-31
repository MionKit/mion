/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Only a real browser enforces CORS and sends the Sec-Fetch-Site and Origin headers mionSecurity reads.

import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import {createServer, type Server} from 'http';
import {chromium, type Browser, type Page} from 'playwright';
import {createMionRouter, resetRouter} from '@mionjs/router';
import {mionSecurity} from '@mionjs/router/middlewares';
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
let deleted = 0;
const deleteAll = mion.mutation((): number => ++deleted);

interface BrowserElement {
  method: string;
  action: string;
  enctype: string;
  name: string;
  value: string;
  append(child: BrowserElement): void;
  submit(): void;
}
interface BrowserDocument {
  createElement(tag: string): BrowserElement;
  body: BrowserElement;
}

/** A forged request from another site: a plain HTML form, no script, no preflight */
async function submitFormFromPage(page: Page, routeId: string): Promise<boolean> {
  const before = deleted;
  await page.goto(pageOrigin);
  await Promise.all([
    page.waitForNavigation(),
    page.evaluate(
      ([api, id]) => {
        // runs in the browser: this package's types have no DOM
        const document = (globalThis as unknown as {document: BrowserDocument}).document;
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = `${api}/api/${id}`;
        form.enctype = 'text/plain';
        const input = document.createElement('input');
        input.name = `{"${id}":[],"x":"`;
        input.value = '"}';
        form.append(input);
        document.body.append(form);
        form.submit();
      },
      [apiOrigin, routeId]
    ),
  ]);
  return deleted > before;
}

/** What the mion client does from the page */
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

  it('reads a returned HeadersSubset through mionSecurity with cors, after the preflight', async () => {
    await startApi({mionSecurity: mionSecurity({origins: [pageOrigin], cors: {}}), auth, listUsers});
    expect(await callFromPage(page)).toEqual({status: 200, total: '2'});
  });

  it('is blocked by the browser when the API sets up no CORS', async () => {
    // another route: the browser caches the first test's preflight answer per URL
    await startApi({auth, listOthers: listUsers});
    expect(await callFromPage(page, 'listOthers')).toMatchObject({status: 0, total: null});
  });

  it('runs a mutation from a plain form on another site when the API has no mionSecurity', async () => {
    await startApi({deleteAll});
    expect(await submitFormFromPage(page, 'deleteAll')).toBe(true);
  });

  it('never runs a mutation from a plain form on another site behind mionSecurity, even from a trusted origin', async () => {
    // the trusted origin passes the cross-origin check: the form content type is what refuses it
    await startApi({mionSecurity: mionSecurity({origins: [pageOrigin]}), deleteAll});
    expect(await submitFormFromPage(page, 'deleteAll')).toBe(false);
    await startApi({mionSecurity: mionSecurity(), deleteAll});
    expect(await submitFormFromPage(page, 'deleteAll')).toBe(false);
  });
});
