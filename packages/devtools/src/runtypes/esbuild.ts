// @mionjs/devtools/runtypes/esbuild — the esbuild plugin (`unplugin.esbuild`).
// esbuild has no native transform phase: unplugin emulates `transform` via
// onLoad, so this entry loads every matched module. The rewrite + on-disk
// module generation otherwise behave as elsewhere.
import {unplugin} from '../core/unplugin.ts';

export * from '../core/unplugin.ts';
export default unplugin.esbuild;
