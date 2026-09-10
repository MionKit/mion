/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, expect, it, vi} from 'vitest';
import {mionVitePlugin} from './mionVitePlugin.ts';

// The deepkit/AOT-era options were accepted-and-ignored through the mion migration, then
// removed. Deleting them from the interfaces only fails a TYPED config — an untyped vite.config.js
// would drop them silently, which is worse than the warn it replaces. Hence the config-time throw,
// and hence these tests read the options through `as never`: they assert the RUNTIME guard, which is
// the half that covers untyped configs. Delete this spec together with the guard at 1.0.

const removed = [
  ['aotCaches', {aotCaches: {cache: true}}],
  ['serverPureFunctions', {serverPureFunctions: {clientSrcPath: '/src/client'}}],
  ['batches', {batches: {emit: true}}],
  ['runTypes.compilerOptions', {runTypes: {compilerOptions: {sourceMap: true}}}],
  ['runTypes.include', {runTypes: {include: ['**/*.ts']}}],
  ['runTypes.exclude', {runTypes: {exclude: ['**/router.ts']}}],
  ['runTypes.reflectionMode', {runTypes: {reflectionMode: 'always'}}],
  ['runTypes.reflection', {runTypes: {reflection: true}}],
] as const;

describe('mionVitePlugin removed options', () => {
  it.each(removed)('throws on %s, naming it', (name, options) => {
    expect(() => mionVitePlugin(options as never)).toThrow(new RegExp(name.replace('.', '\\.')));
  });

  it('names every removed option it found, not just the first', () => {
    const call = () => mionVitePlugin({aotCaches: {}, serverPureFunctions: {}, runTypes: {exclude: []}} as never);
    expect(call).toThrow(/aotCaches/);
    expect(call).toThrow(/serverPureFunctions/);
    expect(call).toThrow(/runTypes\.exclude/);
  });

  it('points at the replacement rather than only reporting the removal', () => {
    expect(() => mionVitePlugin({serverPureFunctions: {}} as never)).toThrow(/automatic/);
    expect(() => mionVitePlugin({serverMappers: {}} as never)).toThrow(/automatic/);
    // the transport needs no option; a split project points `server` at the API instead
    expect(() => mionVitePlugin({batches: {consume: '/x.json'}} as never)).toThrow(/client\.tsConfig/);
    expect(() => mionVitePlugin({runTypes: {exclude: []}} as never)).toThrow(/tsconfig/);
  });

  it('leaves a config that passes none of them alone', () => {
    expect(() => mionVitePlugin({runTypes: {tsConfig: '/tsconfig.json'}})).not.toThrow();
    expect(() => mionVitePlugin({})).not.toThrow();
  });

  it('ignores an explicit undefined — an absent key is not a stale config', () => {
    expect(() => mionVitePlugin({aotCaches: undefined, runTypes: {exclude: undefined}} as never)).not.toThrow();
  });

  it('leaves a plain server block alone', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => mionVitePlugin({server: {startScript: '/srv.ts'}})).not.toThrow();
    expect(() => mionVitePlugin({server: {startScript: '/srv.ts', build: {outDir: 'dist-api'}}})).not.toThrow();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

// Four `server` keys that configure nothing, because the API runs in this same process. Same
// reasoning as the block above: an untyped vite.config.js would drop them silently, and a config
// asking for a server that never starts is worse than one that fails to load.
const removedServer = [
  ['runMode', {runMode: 'childProcess'}],
  ['viteConfig', {viteConfig: '/srv.vite.config.ts'}],
  ['waitTimeout', {waitTimeout: 30000}],
  ['env', {env: {MION_TEST_PORT: '8086'}}],
] as const;

describe('mionVitePlugin unsupported server options', () => {
  it.each(removedServer)('throws on server.%s, naming it', (name, block) => {
    expect(() => mionVitePlugin({server: {startScript: '/srv.ts', ...block}} as never)).toThrow(new RegExp(`server\\.${name}`));
  });

  it('names every unsupported server key it found, not just the first', () => {
    const call = () =>
      mionVitePlugin({server: {startScript: '/srv.ts', runMode: 'childProcess', waitTimeout: 1, env: {}}} as never);
    expect(call).toThrow(/server\.runMode/);
    expect(call).toThrow(/server\.waitTimeout/);
    expect(call).toThrow(/server\.env/);
  });

  it('points at the replacement: start the API yourself, vite dev already listens', () => {
    expect(() => mionVitePlugin({server: {startScript: '/srv.ts', runMode: 'childProcess'}} as never)).toThrow(/globalSetup/);
  });

  it('ignores an explicit undefined — an absent key is not a stale config', () => {
    expect(() => mionVitePlugin({server: {startScript: '/srv.ts', runMode: undefined, env: undefined}} as never)).not.toThrow();
  });
});

// 'allSingle' used to be rejected at config time: the transform named every binding from the FIRST
// family bundle, so a mion marker got 1 of the 9 compiled fns it asked for and every route died at
// boot with a MissingRtFnsError naming a route the user never wrote. Fixed in RunTypes 0.12.2
// (each fnId is now imported from the bundle that exports it), so all three modes are accepted.
describe('mion module modes', () => {
  it.each(['default', 'allModules', 'allSingle'])("accepts moduleMode '%s'", (moduleMode) => {
    expect(() => mionVitePlugin({runTypes: {moduleMode}} as never)).not.toThrow();
  });
});
