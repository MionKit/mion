/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect, beforeEach} from 'vitest';
import {HeadersSubset} from '@mionjs/core';
import type {TestServerApi} from '@mionjs/test-server';
import {initClient} from './client.ts';
import {resetClientCaches} from './lib/testUtils.ts';
import {TEST_SERVER_BASE_URL} from '../globalSetup.ts';

describe('a route returning a HeadersSubset', () => {
  beforeEach(() => resetClientCaches());

  it('gives the headers back on the fetched lane', async () => {
    const {routes, middleFns} = initClient<TestServerApi>({baseURL: TEST_SERVER_BASE_URL});
    const auth = middleFns.auth(new HeadersSubset({Authorization: 'XWYZ-TOKEN'}));
    const [result, error] = await routes.respondHeaders('fetched').call({middleFns: {auth}});
    expect(error).toBeUndefined();
    expect(result).toBeInstanceOf(HeadersSubset);
    expect(result?.headers['x-mion-echo']).toBe('fetched');
  });
});
