/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {describe, it, expect, vi} from 'vitest';

// `next dev` re-evaluates the route bundle after an edit, @mionjs/router inside it, and a Vite reload re-runs the
// whole API module tree: each run is a fresh copy of the router module. A copy shares nothing with another, so the
// fresh one starts empty and its createMionRouter + initRoutes need no reset.
async function freshRouterCopy(): Promise<typeof import('../src/router.ts')> {
  vi.resetModules();
  return import('../src/router.ts');
}

describe('a fresh copy of the router module', () => {
  it('creates and initializes its own router while an older copy holds one', async () => {
    const first = await freshRouterCopy();
    const v1 = first.createMionRouter({basePath: 'v1'});
    v1.initRoutes({ping: v1.query((): string => 'v1')});
    const second = await freshRouterCopy();
    const v2 = second.createMionRouter({basePath: 'v2'});
    expect(() => v2.initRoutes({ping: v2.query((): string => 'v2')})).not.toThrow();
    expect(first.getRouterOptions().basePath).toBe('v1');
    expect(second.getRouterOptions().basePath).toBe('v2');
  });

  it('starts with empty tables, so the routes of the older copy never leak into it', async () => {
    const first = await freshRouterCopy();
    const mion = first.createMionRouter();
    mion.initRoutes({ping: mion.query((): string => 'pong')});
    expect(first.geRoutesSize()).toBeGreaterThan(0);
    const second = await freshRouterCopy();
    expect(second.geRoutesSize()).toBe(0);
  });

  it('starts with an empty batch table', async () => {
    await freshRouterCopy();
    const batches = await import('../src/batches.ts');
    batches.replaceBatches({b_old: {routes: ['ping']}});
    expect(batches.getBatchIds()).toEqual(['b_old']);
    await freshRouterCopy();
    const freshBatches = await import('../src/batches.ts');
    expect(freshBatches.getBatchIds()).toEqual([]);
  });

  it('comes with a fresh @mionjs/core, whose route metadata cache starts empty', async () => {
    vi.resetModules();
    const firstCore = await import('@mionjs/core');
    firstCore.routesCache.setMetadata('ping', {id: 'ping'} as never);
    expect(firstCore.routesCache.getMetadata('ping')).toBeDefined();
    vi.resetModules();
    const secondCore = await import('@mionjs/core');
    expect(secondCore.routesCache.getMetadata('ping')).toBeUndefined();
  });

  it('still refuses a second router within ONE copy', async () => {
    const copy = await freshRouterCopy();
    copy.createMionRouter();
    expect(() => copy.createMionRouter()).toThrow('keep @mionjs/* bundled');
  });
});
