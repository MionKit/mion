/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The fetched lane arrives as its own chunk and a chunk can fail to load; a call never throws, so
// that failure comes back in the result's undeclared slot like any error the router never saw.

import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import type {TestServerApi} from '@mionjs/test-server';
import {TEST_SERVER_BASE_URL} from '../globalSetup.ts';
import {resetClientCaches} from './lib/testUtils.ts';

const baseURL = TEST_SERVER_BASE_URL;
const user = {name: 'John', surname: 'Doe'};

vi.mock('#fetched-lane', () => {
  throw new Error('Failed to fetch dynamically imported module');
});

describe('a fetched lane that cannot be loaded', () => {
  beforeEach(() => resetClientCaches());
  afterEach(() => {
    resetClientCaches();
    vi.resetModules();
  });

  it('comes back in the undeclared slot, never as a throw', async () => {
    const {resetFetchedLane} = await import('./lib/laneLoader.ts');
    resetFetchedLane();
    const {initClient} = await import('./client.ts');
    const {routes} = initClient<TestServerApi>({baseURL});

    const [result, error, undeclared] = await routes.sayHello(user).call();

    expect(result).toBeUndefined();
    expect(error).toBeUndefined();
    expect(undeclared?.type).toBe('metadata-lane-load-error');
  });
});
