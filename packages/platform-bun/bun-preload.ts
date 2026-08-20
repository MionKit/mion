import {plugin} from 'bun';
import {runTypesLoader} from './loader/runtypes-loader';
import {join} from 'path';

const tsConfig = join(__dirname, './tsconfig.json');

// MUST be awaited: Bun.plugin() returns a promise for an async setup but does NOT wait for it before
// loading modules. Without the await the resolver is still spawning when the first files load, the
// transform bails on a null resolver, and cross-package route() sites register with no injected type
// info (MissingRtFnsError at initRouter). It fails silently — no warning, just missing injections.
await plugin(runTypesLoader({tsConfig}));
