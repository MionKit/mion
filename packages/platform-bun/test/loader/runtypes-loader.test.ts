/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {expect, test} from 'bun:test';
import {runTypesLoader} from '../../loader/runtypes-loader';

// A thin wrapper: @mionjs/devtools/runtypes/bun owns both Bun plugin hosts (Bun.build and the Bun.plugin preload).

test('runTypesLoader builds a Bun plugin with a name and setup hook', () => {
  const plugin = runTypesLoader({});
  expect(typeof plugin.name).toBe('string');
  expect(plugin.name.length).toBeGreaterThan(0);
  expect(typeof plugin.setup).toBe('function');
});

// Route registration under the bun preload is covered end to end by test/bunHttp.test.ts; this file tests the plugin shape.
//
// It was previously a test.todo claiming the lane was blocked on cross-package injection. That
// diagnosis was wrong: the resolver's program follows imports, so router source was always
// scanned. The actual cause was bun-preload.ts not awaiting Bun.plugin(), which upstream's
// readiness gate now makes safe regardless.
test('the plugin exposes the two hooks Bun.plugin() drives', () => {
  const plugin = runTypesLoader({});
  // Bun calls setup(build) and the plugin registers onLoad/onResolve on it; nothing else is
  // part of the contract, so assert the shape rather than re-testing the transform here.
  expect(plugin.setup.length).toBeLessThanOrEqual(1);
  expect(Object.keys(plugin)).toEqual(expect.arrayContaining(['name', 'setup']));
});
