/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Merged once when the router starts; every adapter reads it per request.

import {describe, it, expect, beforeEach} from 'vitest';
import {createMionRouter, resetRouter, getResponseDefaults, getBuildVersion} from '../src/router.ts';
import {BUILD_VERSION_HEADER} from '@mionjs/core';
import {JSON_CONTENT_TYPE} from '../src/constants.ts';
import type {Routes} from '../src/types/general.ts';

function routes(mion: ReturnType<typeof createMionRouter>) {
  return {sayHello: mion.route((ctx, name: string): string => `Hello, ${name}!`)} satisfies Routes;
}

describe('response defaults', () => {
  beforeEach(() => resetRouter());

  it('holds server and content-type before the router starts', () => {
    expect(getResponseDefaults()).toEqual({server: 'mionjs', 'content-type': JSON_CONTENT_TYPE});
  });

  it('carries the option, lowercased, and never the build version: mionFetchMetadata sends that one', () => {
    const mion = createMionRouter({responseHeaders: {'X-App-Name': 'MyApp'}});
    mion.initRoutes(routes(mion), 'abc123');
    expect(getResponseDefaults()).toEqual({server: 'mionjs', 'x-app-name': 'MyApp', 'content-type': JSON_CONTENT_TYPE});
    expect(getBuildVersion()).toBe('abc123');
  });

  it('lets the option replace server, never content-type', () => {
    const mion = createMionRouter({responseHeaders: {Server: 'mine', 'Content-Type': 'text/html'}});
    mion.initRoutes(routes(mion), 'abc123');
    expect(getResponseDefaults()).toEqual({server: 'mine', 'content-type': JSON_CONTENT_TYPE});
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

  it('lets the option pin the build version, in any case: mionFetchMetadata then adds none', () => {
    const mion = createMionRouter({responseHeaders: {'X-Build-Version': 'mine'}});
    mion.initRoutes(routes(mion), 'abc123');
    expect(getResponseDefaults()[BUILD_VERSION_HEADER]).toBe('mine');
    expect(getBuildVersion()).toBeUndefined();
  });

  it('is back to server and content-type after resetRouter', () => {
    const mion = createMionRouter({responseHeaders: {'x-app-name': 'MyApp'}});
    mion.initRoutes(routes(mion), 'abc123');
    resetRouter();
    expect(getResponseDefaults()).toEqual({server: 'mionjs', 'content-type': JSON_CONTENT_TYPE});
    expect(getBuildVersion()).toBeUndefined();
  });
});
