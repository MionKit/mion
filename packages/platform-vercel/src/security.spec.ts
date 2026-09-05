/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The adapter half of the security audit for vercel: the body is read as text and parsed by the
// router (a `req.json()` throw used to be a runtime 500 with no mion envelope), the query body decode
// runs inside the guard, and the router's own body limit is the only limit this platform has.

import {describe, it, expect, beforeAll} from 'vitest';
import {createMionRouter, resetRouter} from '@mionjs/router';
import type {CallContext} from '@mionjs/router';
import {MION_ROUTES, StatusCodes} from '@mionjs/core';
import {createVercelHandler, resetVercelHandlerOpts} from './vercelHandler.ts';

const mion = createMionRouter({contextDataFactory: () => ({user: null}), basePath: 'api/', maxBodySize: 64});

type SimpleUser = {name: string; surname: string};
const echo = mion.route((ctx: CallContext, user: SimpleUser): SimpleUser => user);

describe('vercel adapter hardening', () => {
  let handler: ReturnType<typeof createVercelHandler>;

  beforeAll(async () => {
    resetVercelHandlerOpts();
    resetRouter();
    mion.initRoutes({echo});
    handler = createVercelHandler();
  });

  const post = (path: string, body: string) =>
    handler.POST(new Request(`http://localhost${path}`, {method: 'POST', body, headers: {'content-type': 'application/json'}}));

  it('a malformed JSON body is a mion error, not a runtime 500', async () => {
    const response = await post('/api/echo', '{"echo": [}');
    expect(response.status).toBe(StatusCodes.UNEXPECTED_ERROR);
    const error = (await response.json())[MION_ROUTES.thrownErrors]['mionDeserializeRequest'];
    expect(error).toMatchObject({type: 'parsing-json-request-error', publicMessage: 'Invalid json request body.'});
  });

  it('a malformed ?data= query is a mion error', async () => {
    const response = await handler.GET(new Request('http://localhost/api/echo?data=!'));
    expect(response.status).toBe(StatusCodes.UNEXPECTED_ERROR);
    expect(response.headers.get('x-rpc-error')).toBe('invalid-query-body');
  });

  it('a body over the router limit is a 413', async () => {
    const response = await post('/api/echo', JSON.stringify({echo: [{name: 'x'.repeat(60), surname: 'y'}]}));
    expect(response.status).toBe(StatusCodes.PAYLOAD_TOO_LARGE);
    expect(response.headers.get('x-rpc-error')).toBe('request-payload-too-large');
  });

  it('a body inside the limit dispatches', async () => {
    const response = await post('/api/echo', '{"echo":[{"name":"a","surname":"b"}]}');
    expect(await response.json()).toEqual({echo: {name: 'a', surname: 'b'}});
  });
});
