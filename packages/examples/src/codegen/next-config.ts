import {withMion} from '@mionjs/devtools/next';

// next.config.ts. `await` is required: the whole-program scan has to finish before
// Turbopack starts handing files to loader workers, and there is no later hook to
// wait in.
//
// Turbopack has no plugin API, so this is not an ordinary bundler plugin. The config
// starts a broker holding the resolver, and a loader registered through
// `turbopack.rules` asks it to rewrite each file. `next --webpack` falls back to the
// webpack plugin automatically.
export default await withMion({
  reactStrictMode: true,
});
