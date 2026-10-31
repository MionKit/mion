/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect, beforeEach} from 'vitest';
import {createMionRouter, resetRouter} from '../src/router.ts';
import {dispatchRoute} from '../src/dispatch.ts';
import {createCallContext} from '../src/callContext.ts';
import type {CallContext} from '../src/types/context.ts';
import {headersFromRecord} from '../src/lib/headers.ts';

const mion = createMionRouter();

const dispatch = (path: string, body: Record<string, any[]>, method?: string) =>
  dispatchRoute(path, JSON.stringify(body), headersFromRecord({}), headersFromRecord({}), {}, {}, undefined, undefined, method);

describe('request.method', () => {
  const routes = {
    readMethod: mion.query((ctx: CallContext): string => ctx.request.method),
  };

  beforeEach(() => {
    resetRouter();
    mion.initRoutes(routes);
  });

  it('is POST when the caller names none', async () => {
    expect((await dispatch('/readMethod', {})).body.readMethod).toBe('POST');
    expect(createCallContext('/readMethod', undefined, {}, headersFromRecord({}), headersFromRecord({})).request.method).toBe(
      'POST'
    );
  });

  it('is the method the caller passes', async () => {
    expect((await dispatch('/readMethod', {}, 'GET')).body.readMethod).toBe('GET');
  });
});
