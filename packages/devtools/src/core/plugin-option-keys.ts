import type {PluginOptions} from './unplugin.ts';

// The `satisfies` guard fails the typecheck both ways: a field added to PluginOptions and left out
// here (missing property), or a stale key kept here after a field is removed (excess property).
const PLUGIN_OPTION_KEY_TABLE = {
  binary: true,
  cwd: true,
  tsconfig: true,
  clientTsconfig: true,
  apiTsconfig: true,
  bundleApi: true,
  genDir: true,
  emitMode: true,
  validate: true,
  parallelScan: true,
  parallelRender: true,
  singleThreaded: true,
  hashLength: true,
  patternSampleCount: true,
  patternSampleRetries: true,
  jsonMaxBytes: true,
  markers: true,
  moduleMode: true,
  inlineMode: true,
  transformMode: true,
  sourcesContent: true,
  downgradeErrors: true,
  jsRuntime: true,
  detachResolver: true,
  devServer: true,
  pureFnReport: true,
  onPureFnReport: true,
  onBatchReport: true,
  onSiteFilesChanged: true,
  onGenerate: true,
  enrich: true,
} satisfies Record<keyof PluginOptions, true>;

// The plugin-option parity test compares this list to the generated TSCONFIG_PLUGIN_KEYS, so an option
// added on only one side fails CI.
export const PLUGIN_OPTION_KEYS = Object.keys(PLUGIN_OPTION_KEY_TABLE) as (keyof PluginOptions)[];
