/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Merged once when the router starts and folded into each adapter's defaults; no middleFn writes them per response.

import {describe, it, expect, beforeEach} from 'vitest';
import {createMionRouter, resetRouter, getGlobalResponseHeaders} from './router.ts';
import {BUILD_VERSION_HEADER} from '@mionjs/core';
import type {Routes} from './types/general.ts';

function routes(mion: ReturnType<typeof createMionRouter>) {
  return {sayHello: mion.route((ctx, name: string): string => `Hello, ${name}!`)} satisfies Routes;
}

describe('global response headers', () => {
  beforeEach(() => resetRouter());

  it('is empty before the router starts', () => {
    expect(getGlobalResponseHeaders()).toEqual({});
  });

  it('carries the option and the injected build version', () => {
    const mion = createMionRouter({globalResponseHeaders: {'x-app-name': 'MyApp'}});
    mion.initRoutes(routes(mion), 'abc123');
    expect(getGlobalResponseHeaders()).toEqual({'x-app-name': 'MyApp', [BUILD_VERSION_HEADER]: 'abc123'});
  });

  it('sends no version header with apiVersionCheck off', () => {
    const mion = createMionRouter({apiVersionCheck: false, globalResponseHeaders: {'x-app-name': 'MyApp'}});
    mion.initRoutes(routes(mion), 'abc123');
    expect(getGlobalResponseHeaders()).toEqual({'x-app-name': 'MyApp'});
  });

  // No literal here: the build fills the slot from this file's own routes, so the whole pipeline answers in the JS suite.
  it('takes the version the build injects when the call leaves the slot empty', () => {
    const mion = createMionRouter();
    mion.initRoutes(routes(mion));
    expect(getGlobalResponseHeaders()[BUILD_VERSION_HEADER]).toMatch(/^[A-Za-z0-9]{12}$/);
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
  });
});
