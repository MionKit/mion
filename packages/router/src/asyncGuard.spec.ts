/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The dispatcher skips the await for a method it believes is synchronous. That belief comes from the
// declared type, so a handler whose type LIES (a cast, an `any`, a hand-built executable) could hand
// back a promise nobody waits for, and it would be serialized into the body as the answer. The
// backstop in runExecutionChain checks the first value each sync method ever returns, and marks the
// method async for good if it turns out to be a promise. These pin that it works, and that it costs
// nothing after the first call.

import {describe, it, expect} from 'vitest';
import {createMionRouter, resetRouter, getRouteExecutable} from './router.ts';
import {dispatchRoute} from './dispatch.ts';
import {headersFromRecord} from './lib/headers.ts';
import {Routes} from './types/general.ts';

const mion = createMionRouter({});

// declared sync, answers with a promise anyway: exactly what the guard exists for
const liar = () => Promise.resolve('answered late') as unknown as string;

const routes = {
  // every method here is declared sync, so the router drops its awaits and the guard is load-bearing
  honest: mion.route((): string => 'answered now'),
  liar: mion.route((): string => liar()),
} satisfies Routes;

resetRouter();
mion.initRoutes(routes);

const call = (path: string) => dispatchRoute(path, '{}', headersFromRecord({}), headersFromRecord({}), {}, {});

describe('the un-awaited promise guard should', () => {
  it('resolve a lying handler on the very first request, not just later ones', async () => {
    const response = await call('/liar');
    expect(response.hasErrors).toBe(false);
    // a promise here would mean it was serialized into the body as the answer
    expect(response.body.liar).toBe('answered late');
  });

  it('mark the method async for good, so later requests do not re-check', async () => {
    await call('/liar');
    const executable = getRouteExecutable('liar');
    expect(executable?.isAsync).toBe(true);
    expect(executable?.asyncChecked).toBe(true);

    const second = await call('/liar');
    expect(second.body.liar).toBe('answered late');
  });

  it('leave an honest sync handler alone, checked once and still sync', async () => {
    const response = await call('/honest');
    expect(response.body.honest).toBe('answered now');
    const executable = getRouteExecutable('honest');
    expect(executable?.isAsync).toBe(false);
    // checked, and never checked again
    expect(executable?.asyncChecked).toBe(true);
  });
});
