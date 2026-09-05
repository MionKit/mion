import {withMion} from '@mionjs/devtools/next';

// The batch transport, Next side. Next IS the client build here, so it writes the batch module
// (`.mion/rpc/batches.generated.js`) into the mion API's own project, which the API's vite build
// imports by itself. The `server` block only names that project; nothing is spawned.
export default await withMion(
  {reactStrictMode: true},
  {
    runTypes: {tsConfig: './tsconfig.json'},
    server: {
      startScript: '../api/src/init.ts',
      viteConfig: '../api/vite.config.ts',
    },
  }
);
