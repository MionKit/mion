/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// One client-routes lane's test server in its own process, started by laneServer.ts with the lane's vitest config:
// vite transforms the entry with the lane's own plugin and program, so it runs what that resolver compiled
// (batch table included). Plain JavaScript so nothing has to transform this file.
import {createServer, createServerModuleRunner} from 'vite';
import {fileURLToPath} from 'node:url';

const [configFile, root] = process.argv.slice(2);
if (!configFile || !root) throw new Error('usage: laneServerChild.mjs <vitest config file> <vitest project root>');
const entry = fileURLToPath(new URL('../../../private-test-server/src/test-server.ts', import.meta.url));

// Vitest's own project root: both processes then name the shared genDir's modules alike. Any other root (vite's
// default is the cwd, the repo root here) names them apart, and each one's generate prunes the other's modules.
const vite = await createServer({
  configFile,
  root,
  mode: 'test',
  appType: 'custom',
  logLevel: 'warn',
  server: {middlewareMode: true, hmr: false, watch: null, ws: false},
});
const runner = createServerModuleRunner(vite.environments.ssr, {hmr: false});
const {startTestServer} = await runner.import(entry);
const server = await startTestServer(0);
const port = server.address().port;
if (process.send) process.send({port, root: vite.config.root});
else console.log(`lane server listening on http://localhost:${port}`);

let closing;
function close() {
  closing ??= (async () => {
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
