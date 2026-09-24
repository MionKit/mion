/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Merged once when the router starts and folded into each adapter's defaults; no middleware writes them per response.

import {describe, it, expect, beforeEach} from 'vitest';
import {createMionRouter, resetRouter, getGlobalResponseHeaders} from '../src/router.ts';
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

  // the version header is the mion@syncRoutes middleware's own answer, see syncRoutes.spec.ts
  it('carries the option only, never the build version', () => {
    const mion = createMionRouter({globalResponseHeaders: {'x-app-name': 'MyApp'}});
    mion.initRoutes(routes(mion), 'abc123');
    expect(getGlobalResponseHeaders()).toEqual({'x-app-name': 'MyApp'});
    expect(getGlobalResponseHeaders()[BUILD_VERSION_HEADER]).toBeUndefined();
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
