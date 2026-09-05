import {describe, expect, it} from 'vitest';
import {PLUGIN_OPTION_KEYS} from '../src/core/plugin-option-keys.ts';
import {TSCONFIG_PLUGIN_KEYS} from '../src/core/go-generated/tsconfig-plugin-keys.generated.ts';

// The parity contract: every PROJECT-semantic option is settable in BOTH the
// bundler PluginOptions and the tsconfig plugin entry, except a small, documented
// exception list. This test compares the runtime PluginOptions key list against
// the Go-generated tsconfig key mirror, so adding an option to only one side
// fails CI. See docs/todos (option-parity) for the rationale.

// Options settable ONLY on the bundler plugin: host bootstrap (binary/cwd/tsconfig
// are needed to FIND and READ the tsconfig, so they cannot come from it), internal
// wire knobs (transformMode/sourcesContent produce identical artifacts either way,
// never a project semantic), the JS-only in-process callbacks onPureFnReport,
// onBatchReport and onSiteFilesChanged (loader options cross a bundler worker
// boundary as plain JSON, so a function can never be one),
// `enrich` — the opt-in enrichment auto-sync is a host/dev-loop behavior (drives
// disk writes from dev/watch), so it stays off the tsconfig plugin entry — and
// `jsRuntime`, a host-machine path like `binary` (the plugin defaults it to its
// own process.execPath at spawn).
const JS_ONLY = new Set([
  'binary',
  'cwd',
  'tsconfig',
  'transformMode',
  'sourcesContent',
  'onPureFnReport',
  'onBatchReport',
  'onSiteFilesChanged',
  'enrich',
  'jsRuntime',
  // Host bootstrap: unrefs the resolver child so Bun's runtime loader host can
  // exit. Never a project semantic.
  'detachResolver',
]);
// Keys settable ONLY in the tsconfig plugin entry: `name` is the plugin identifier
// in the tsconfig `plugins` array (not a project option), and `i18n` is
// enrichment-lane config the bundler build never consumes (a future feature may
// drive enrichment from the plugin and move `i18n` into PluginOptions; until then
// it stays tsconfig-only).
const GO_ONLY = new Set(['name', 'i18n']);

describe('PluginOptions <-> tsRuntypesPlugin project-option parity', () => {
  const js = new Set<string>(PLUGIN_OPTION_KEYS as readonly string[]);
  const go = new Set<string>(TSCONFIG_PLUGIN_KEYS as readonly string[]);

  it('every bundler project option exists in the tsconfig plugin struct', () => {
    const missingInGo = [...js].filter((k) => !go.has(k) && !JS_ONLY.has(k)).sort();
    expect(
      missingInGo,
      `PluginOptions has project option(s) with no tsRuntypesPlugin json key: ${missingInGo.join(', ')}. ` +
        'Add them to cmd/mion/config.go (+ `pnpm miondevx core codegen pluginkeys`), or to JS_ONLY if intentionally host-only.'
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
