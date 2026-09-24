/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// One drift server in its own process: the router is one per process, and each server is its own program
// (tsconfig.drift-<name>.json), so its ids are what that program's build mints. Plain JavaScript on purpose:
// nothing has to transform this file for it to run.
import {createServer, createServerModuleRunner} from 'vite';
import {mionVitePlugin} from '@mionjs/devtools/vite';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

const [name, port] = process.argv.slice(2);
if (!name || !port) throw new Error('usage: driftServerChild.mjs <a|b|c> <port>');
const packageRoot = fileURLToPath(new URL('../..', import.meta.url));

const vite = await createServer({
  configFile: false,
  root: packageRoot,
  mode: 'test',
  appType: 'custom',
  logLevel: 'warn',
  resolve: {conditions: ['source']},
  ssr: {resolve: {conditions: ['source']}},
  plugins: [
    mionVitePlugin({
      runTypes: {
        tsConfig: resolve(packageRoot, `tsconfig.drift-${name}.json`),
        genDir: resolve(packageRoot, `.mion-drift-${name}`),
      },
    }),
  ],
  server: {middlewareMode: true, hmr: false, watch: null, ws: false},
});
const runner = createServerModuleRunner(vite.environments.ssr, {hmr: false});
const {start} = await runner.import(resolve(packageRoot, `test/drift/api${name.toUpperCase()}.ts`));
const server = await start(Number(port));
process.send?.({port: server.address().port});

let closing;
function close() {
  closing ??= (async () => {
    // an idle keep-alive socket would hold the port the next server needs
    server.closeAllConnections();
    await new Promise((done) => server.close(() => done()));
    await runner.close();
    await vite.close();
    process.exit(0);
  })();
  return closing;
}
process.on('message', (message) => {
  if (message === 'close') void close();
});
process.on('disconnect', () => void close());
