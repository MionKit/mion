/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The test server of one bundleApi lane, in its own process. Started by test/lib/laneServer.ts
// with the lane's vitest config file as the only argument: a vite server over that config transforms
// the test-server entry with the lane's own mion plugin, against the lane's own program, so the
// server this process runs is the one the lane's resolver compiled (its batch table included).
// Plain JavaScript on purpose: nothing has to transform this file for it to run.
import {createServer, createServerModuleRunner} from 'vite';
import {fileURLToPath} from 'node:url';

const configFile = process.argv[2];
if (!configFile) throw new Error('usage: laneServerChild.mjs <vitest config file>');
const entry = fileURLToPath(new URL('../../../test-server/src/test-server.ts', import.meta.url));

const vite = await createServer({
  configFile,
  mode: 'test',
  appType: 'custom',
  logLevel: 'warn',
  server: {middlewareMode: true, hmr: false, watch: null, ws: false},
});
const runner = createServerModuleRunner(vite.environments.ssr, {hmr: false});
const {startTestServer} = await runner.import(entry);
const server = await startTestServer(0);
const port = server.address().port;
if (process.send) process.send({port});
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
