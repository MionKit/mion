/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Stub responses record `end`, so a test can tell a reply inside the uWS callback from one after an await.

import {describe, it, expect, beforeEach} from 'vitest';
import {createMionRouter, resetRouter} from '@mionjs/router';
import type {HttpRequest, HttpResponse} from '@mionjs/bin-uws';
import {uwsRequestHandler} from '../src/uwsHttp.ts';

function stubRequest(path: string): HttpRequest {
  return {getUrl: () => path, getQuery: () => '', forEach: () => undefined} as unknown as HttpRequest;
}

function stubResponse() {
  const sent: {status?: string; body?: string} = {};
  const res = {
    onAborted: () => res,
    onData: () => res,
    // a body-less request: uWS calls back with an empty buffer
    collectBody: (_max: number, onBody: (body: ArrayBuffer) => void) => onBody(new ArrayBuffer(0)),
    cork: (write: () => void) => write(),
    writeStatus: (status: string) => (sent.status = status),
    writeHeader: () => res,
    end: (body: string) => (sent.body = body),
  };
  return {res: res as unknown as HttpResponse, sent};
}

describe('uws: an all-sync router should', () => {
  beforeEach(() => {
    resetRouter();
    const mion = createMionRouter({});
    mion.initRoutes({hello: mion.route((): string => 'hello')});
  });

  it('reply before the handler returns', () => {
    const {res, sent} = stubResponse();
    uwsRequestHandler(res, stubRequest('/hello'));
    expect(sent.status).toBe('200 OK');
    expect(JSON.parse(sent.body!)).toEqual({hello: 'hello'});
  });
});

describe('uws: a router with an async route should', () => {
  beforeEach(() => {
    resetRouter();
    const mion = createMionRouter({});
    mion.initRoutes({
      hello: mion.route((): string => 'hello'),
      slow: mion.route(async (): Promise<string> => 'slow'),
    });
  });

  it('reply to a sync route only after the await', async () => {
    const {res, sent} = stubResponse();
    uwsRequestHandler(res, stubRequest('/hello'));
    expect(sent.body).toBeUndefined();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(JSON.parse(sent.body!)).toEqual({hello: 'hello'});
  });
});
