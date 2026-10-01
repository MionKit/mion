/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The fetched lane arrives as its own chunk and a chunk can fail to load; a call never throws, so
// that failure comes back in the result's @thrownErrors like any error the router never saw.

import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import type {TestServerApi} from '@mionjs/test-server';
import {TEST_SERVER_BASE_URL} from '../globalSetup.ts';
import {resetClientCaches} from './lib/testUtils.ts';

const baseURL = TEST_SERVER_BASE_URL;
const user = {name: 'John', surname: 'Doe'};

vi.mock('#metadata-from-server', () => {
  throw new Error('Failed to fetch dynamically imported module');
});

describe('a fetched lane that cannot be loaded', () => {
  beforeEach(() => resetClientCaches());
  afterEach(() => {
    resetClientCaches();
    vi.resetModules();
  });

  it('comes back in @thrownErrors, never as a throw', async () => {
    const {resetMetadataFromServer} = await import('../src/lib/metadataFromServerLoader.ts');
    resetMetadataFromServer();
    const {initClient} = await import('./lib/fetchingClient.ts');
    const {routes} = initClient<TestServerApi>({baseURL});

    const [result, error, response] = await routes.sayHello(user).call();

    expect(result).toBeUndefined();
    expect(error).toBeUndefined();
    expect(response['@thrownErrors']?.[0]?.type).toBe('metadata-load-error');
  });
});
