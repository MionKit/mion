import {plugin} from 'bun';
import {runTypesLoader} from './loader/runtypes-loader';
import {join} from 'path';

const tsConfig = join(__dirname, './tsconfig.json');

// Belt-and-braces. Bun.plugin() returns a promise for an async setup but does NOT wait for it before
// loading modules, so an un-awaited registration races the resolver's startup and files load with no
// injected type info (MissingRtFnsError at initRouter, with no warning). @mionjs/devtools/runtypes/bun
// makes that safe on its own by gating every load on the resolver being ready, so this await is no
// longer load-bearing — but it costs nothing and keeps the ordering obvious.
await plugin(runTypesLoader({tsConfig}));
