// @mionjs/devtools/runtypes/vite — the Vite plugin. `unplugin.vite(options)` returns
// a Vite plugin (or a small plugin array Vite flattens), so the call shape
// `plugins: [runtypes(options)]` matches the standalone plugin this entry
// replaces.
import {unplugin} from '../core/unplugin.ts';

export * from '../core/unplugin.ts';
export default unplugin.vite;
