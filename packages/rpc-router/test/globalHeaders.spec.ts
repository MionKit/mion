/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Merged once when the router starts and folded into each adapter's defaults; no middleware writes them per response.

import {describe, it, expect, beforeEach} from 'vitest';
import {createMionRouter, resetRouter, getGlobalResponseHeaders, getBuildVersion} from '../src/router.ts';
import {BUILD_VERSION_HEADER} from '@mionjs/core';
import type {Routes} from '../src/types/general.ts';

function routes(mion: ReturnType<typeof createMionRouter>) {
  return {sayHello: mion.route((ctx, name: string): string => `Hello, ${name}!`)} satisfies Routes;
}

describe('global response headers', () => {
  beforeEach(() => resetRouter());

  it('is empty before the router starts', () => {
    expect(getGlobalResponseHeaders()).toEqual({});
  });

  it('carries the option and never the build version: mionFetchMetadata sends that one', () => {
    const mion = createMionRouter({globalResponseHeaders: {'x-app-name': 'MyApp'}});
    mion.initRoutes(routes(mion), 'abc123');
    expect(getGlobalResponseHeaders()).toEqual({'x-app-name': 'MyApp'});
    expect(getBuildVersion()).toBe('abc123');
  });

  // No literal: the build fills the slot from this file's routes, so the JS suite runs the whole pipeline.
  it('keeps the version the build injects when the call leaves the slot empty', () => {
    const mion = createMionRouter();
    mion.initRoutes(routes(mion));
    expect(getBuildVersion()).toMatch(/^[A-Za-z0-9]{12}$/);
  });

  it('keeps no build version with apiVersionCheck off', () => {
    const mion = createMionRouter({apiVersionCheck: false});
    mion.initRoutes(routes(mion), 'abc123');
    expect(getBuildVersion()).toBeUndefined();
  });

  it('lets the option pin the build version: it then rides every response, and mionFetchMetadata adds none', () => {
    const mion = createMionRouter({globalResponseHeaders: {[BUILD_VERSION_HEADER]: 'mine'}});
    mion.initRoutes(routes(mion), 'abc123');
    expect(getGlobalResponseHeaders()[BUILD_VERSION_HEADER]).toBe('mine');
    expect(getBuildVersion()).toBeUndefined();
  });

  it('is frozen, so nothing can add a header per request', () => {
    const mion = createMionRouter({globalResponseHeaders: {'x-app-name': 'MyApp'}});
    mion.initRoutes(routes(mion), 'abc123');
    expect(Object.isFrozen(getGlobalResponseHeaders())).toBe(true);
  });

  it('is cleared by resetRouter', () => {
    const mion = createMionRouter({globalResponseHeaders: {'x-app-name': 'MyApp'}});
    mion.initRoutes(routes(mion), 'abc123');
    resetRouter();
    expect(getGlobalResponseHeaders()).toEqual({});
    expect(getBuildVersion()).toBeUndefined();
  });
});
