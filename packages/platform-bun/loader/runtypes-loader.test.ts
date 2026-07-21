/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {expect, test} from 'bun:test';
import {runTypesLoader} from './runtypes-loader';

// The deepkit type-compiler loader is gone. runTypesLoader now wraps @ts-runtypes/devtools's Bun
// plugin (unplugin.bun) — the Bun counterpart of mionVitePlugin — plus the onStart/onLoad shims
// Bun's runtime plugin API needs (see the file docblock).

test('runTypesLoader builds a Bun plugin with a name and setup hook', () => {
    const plugin = runTypesLoader({});
    expect(typeof plugin.name).toBe('string');
    expect(plugin.name.length).toBeGreaterThan(0);
    expect(typeof plugin.setup).toBe('function');
});

// End-to-end route registration under the transparent `bun test`/`bun run` preload is blocked
// upstream: the resolver does not inject cross-package internal-route type ids on-demand, so
// initRouter() throws MissingRtFnsError. Tracked in docs/todos/platform-bun-runtypes-lane.md —
// promote this to a real test once the lane injects.
test.todo('registers a typed route without MissingRtFnsError (blocked: cross-package injection)');
