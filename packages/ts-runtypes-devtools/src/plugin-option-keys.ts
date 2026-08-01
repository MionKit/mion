import type {PluginOptions} from './unplugin.ts';

// A record over EVERY PluginOptions key. `satisfies Record<keyof PluginOptions,
// true>` makes the typecheck fail if a field is added to PluginOptions but left
// out here (a missing property), or if a stale key lingers here after a field is
// removed (an excess-property error on the literal). So PLUGIN_OPTION_KEYS can
// never silently drift from the PluginOptions interface — the drift surfaces in
// the typecheck lane (`tsc` / lint), and the plugin-option parity test then
// compares this list against the generated tsconfig plugin key list.
const PLUGIN_OPTION_KEY_TABLE = {
  binary: true,
  cwd: true,
  tsconfig: true,
  genDir: true,
  emitMode: true,
  binarySizing: true,
  validate: true,
  parallelScan: true,
  parallelRender: true,
  singleThreaded: true,
  hashLength: true,
  patternSampleCount: true,
  patternSampleRetries: true,
  moduleMode: true,
  inlineMode: true,
  transformMode: true,
  sourcesContent: true,
  failOnError: true,
  jsRuntime: true,
  pureFnReport: true,
  onPureFnReport: true,
  enrich: true,
} satisfies Record<keyof PluginOptions, true>;

// The runtime list of PluginOptions keys, kept exhaustive by the satisfies guard
// above. The plugin-option parity test compares it to the generated tsconfig
// plugin key list (TSCONFIG_PLUGIN_KEYS) so a project option added to only one
// side fails CI.
export const PLUGIN_OPTION_KEYS = Object.keys(PLUGIN_OPTION_KEY_TABLE) as (keyof PluginOptions)[];
