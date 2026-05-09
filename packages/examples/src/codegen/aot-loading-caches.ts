// Import the populated AOT caches from the virtual module — the mion Vite plugin
// emits this at build time AND in dev (the buildStart pre-pass populates it before
// any user code runs).
import {aotCaches} from 'virtual:mion-aot/caches';
import {initMionRouter} from '@mionjs/router';
import {routes as myRoutes} from './aot-routes-example.ts';

// Pass `aotCaches` to initMionRouter — it loads the JIT, pure-fn, and router caches
// into the global registry and flips the router into strict AOT mode.
export const myApi = await initMionRouter(myRoutes, {aotCaches});
