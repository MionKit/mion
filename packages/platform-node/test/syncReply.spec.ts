/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The stub response records `end`, so a test can tell a reply inside the 'end' listener from one after an await.

import {describe, it, expect, beforeEach} from 'vitest';
import {createMionRouter, resetRouter} from '@mionjs/router';
import {IncomingMessage, ServerResponse} from 'http';
import {Socket} from 'net';
import {httpRequestHandler} from '../src/mionHttp.ts';

function stubExchange(path: string) {
  const req = new IncomingMessage(new Socket());
  req.url = path;
  req.method = 'GET';
  const res = new ServerResponse(req);
  const sent: {body?: string} = {};
  res.end = ((body: string) => {
    sent.body = body;
    return res;
  }) as ServerResponse['end'];
  return {req, res, sent};
}

const nextTick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('node: an all-sync router with alwaysAwait off should', () => {
  beforeEach(() => {
    resetRouter();
    const mion = createMionRouter({alwaysAwait: false});
    mion.initRoutes({
      hello: mion.route((): string => 'hello'),
      later: mion.route(async (): Promise<string> => 'later'),
    });
  });

  it('reply inside the end listener', () => {
    const {req, res, sent} = stubExchange('/hello');
    httpRequestHandler(req, res);
    req.emit('end');
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(sent.body!)).toEqual({hello: 'hello'});
  });

  it('reply to an async route after the await', async () => {
    const {req, res, sent} = stubExchange('/later');
    httpRequestHandler(req, res);
    req.emit('end');
    expect(sent.body).toBeUndefined();
    await nextTick();
    expect(JSON.parse(sent.body!)).toEqual({later: 'later'});
  });
});

describe('node: a router with the default alwaysAwait should', () => {
  beforeEach(() => {
    resetRouter();
    const mion = createMionRouter({});
    mion.initRoutes({hello: mion.route((): string => 'hello')});
  });

  it('reply to a sync route only after the await', async () => {
    const {req, res, sent} = stubExchange('/hello');
    httpRequestHandler(req, res);
    req.emit('end');
    expect(sent.body).toBeUndefined();
    await nextTick();
    expect(JSON.parse(sent.body!)).toEqual({hello: 'hello'});
  });
});
