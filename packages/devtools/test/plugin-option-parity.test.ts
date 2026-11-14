import {describe, expect, it} from 'vitest';
import {PLUGIN_OPTION_KEYS} from '../src/core/plugin-option-keys.ts';
import {TSCONFIG_PLUGIN_KEYS} from '../src/core/go-generated/tsconfig-plugin-keys.generated.ts';

// The parity contract: every PROJECT-semantic option is settable in BOTH the
// bundler PluginOptions and the tsconfig plugin entry, except a small, documented
// exception list. This test compares the runtime PluginOptions key list against
// the Go-generated tsconfig key mirror, so adding an option to only one side
// fails CI.

// Plugin-only: binary/cwd/tsconfig find the tsconfig so cannot come from it; jsRuntime is a host path like binary.
// transformMode/sourcesContent yield identical artifacts; callbacks cannot cross a bundler worker boundary as JSON.
const JS_ONLY = new Set([
  'binary',
  'cwd',
  'tsconfig',
  'transformMode',
  'sourcesContent',
  'onPureFnReport',
  'onBatchReport',
  'onSiteFilesChanged',
  'onGenerate',
  // Host code built on the plugin (serve flags, lifecycle hooks), never a project setting.
  'extensions',
  'jsRuntime',
  // Host bootstrap: unrefs the resolver child so Bun's runtime loader host can
  // exit. Never a project semantic.
  'detachResolver',
  // Host lane: the dev server is the one lane a RuntimeError never halts. Vite
  // fills it from its own config, the Next broker from `next dev`.
  'devServer',
]);
// tsconfig-only: `name` identifies the plugin in the `plugins` array, not a project option.
const GO_ONLY = new Set(['name']);

describe('PluginOptions <-> tsRuntypesPlugin project-option parity', () => {
  const js = new Set<string>(PLUGIN_OPTION_KEYS as readonly string[]);
  const go = new Set<string>(TSCONFIG_PLUGIN_KEYS as readonly string[]);

  it('every bundler project option exists in the tsconfig plugin struct', () => {
    const missingInGo = [...js].filter((k) => !go.has(k) && !JS_ONLY.has(k)).sort();
    expect(
      missingInGo,
      `PluginOptions has project option(s) with no tsRuntypesPlugin json key: ${missingInGo.join(', ')}. ` +
        'Add them to pkg/cli/config.go (+ `pnpm miondevx core codegen pluginkeys`), or to JS_ONLY if intentionally host-only.'
    ).toEqual([]);
  });

  it('every tsconfig project option exists in PluginOptions', () => {
    const missingInJs = [...go].filter((k) => !js.has(k) && !GO_ONLY.has(k)).sort();
    expect(
      missingInJs,
      `tsRuntypesPlugin has project option(s) missing from PluginOptions: ${missingInJs.join(', ')}. ` +
        'Add them to unplugin.ts PluginOptions (+ PLUGIN_OPTION_KEYS), or to GO_ONLY if intentionally tsconfig-only.'
    ).toEqual([]);
  });

  it('exception sets stay live (a stale exception would hide real drift)', () => {
    expect([...JS_ONLY].filter((k) => !js.has(k))).toEqual([]);
    expect([...GO_ONLY].filter((k) => !go.has(k))).toEqual([]);
  });
});
