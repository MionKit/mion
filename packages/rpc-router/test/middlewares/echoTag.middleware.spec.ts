/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect, beforeEach} from 'vitest';
import {createMionRouter, resetRouter} from '../../src/router.ts';
import {dispatchRoute} from '../../src/dispatch.ts';
import {headersFromRecord} from '../../src/lib/headers.ts';
import {mionEchoTag} from '../../middlewares.ts';

function dispatch(path: string, body: unknown) {
  const headers = headersFromRecord({});
  const raw = JSON.stringify(body);
  return dispatchRoute(path, raw, headers, headersFromRecord({}), {headers, body: raw}, {});
}

describe('mion@echoTag from @mionjs/router/middlewares', () => {
  beforeEach(() => resetRouter());

  it('runs like any middleware, placed inside a group', async () => {
    const mion = createMionRouter();
    const hello = mion.route((ctx, name: string): string => `Hello ${name}`);
    mion.initRoutes({users: {...mionEchoTag, hello}});
    const response = await dispatch('/users/hello', {'users/mion@echoTag': ['tag-1'], 'users/hello': ['Ann']});
    expect(response.body['users/mion@echoTag']).toBe('tag-1');
    expect(response.body['users/hello']).toBe('Hello Ann');
  });

  it('answers an empty tag when the client sent none', async () => {
    const mion = createMionRouter();
    const hello = mion.route((ctx, name: string): string => `Hello ${name}`);
    mion.initRoutes({...mionEchoTag, hello});
    const response = await dispatch('/hello', {hello: ['Ann']});
    expect(response.body['mion@echoTag']).toBe('');
    expect(response.body.hello).toBe('Hello Ann');
  });
});
