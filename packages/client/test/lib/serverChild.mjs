/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// One test server per process, forked by serverProcess.ts: the router is one per process, and the server must come
// from the program the caller names (a lane's vitest config, or a tsconfig of its own). Plain JavaScript on purpose:
// nothing has to transform this file for it to run.
import {createServer, createServerModuleRunner} from 'vite';
import {mionVitePlugin} from '@mionjs/devtools/vite';
import {parseArgs} from 'node:util';
import {basename, dirname} from 'node:path';

const {values} = parseArgs({
  options: {
    config: {type: 'string'},
    tsconfig: {type: 'string'},
    entry: {type: 'string'},
    start: {type: 'string'},
    port: {type: 'string', default: '0'},
  },
});
if (!values.entry || !values.start || !(values.config || values.tsconfig)) {
  throw new Error('usage: serverChild.mjs (--config <vitest config> | --tsconfig <tsconfig>) --entry <file> --start <export> [--port <n>]');
}

const program = values.config ? {configFile: values.config} : programOf(values.tsconfig);
const vite = await createServer({
  ...program,
  mode: 'test',
  appType: 'custom',
  logLevel: 'warn',
  server: {middlewareMode: true, hmr: false, watch: null, ws: false},
});
const runner = createServerModuleRunner(vite.environments.ssr, {hmr: false});
const module = await runner.import(values.entry);
const server = await module[values.start](Number(values.port));
const port = server.address().port;
if (process.send) process.send({port});
else console.log(`test server listening on http://localhost:${port}`);

/** A tsconfig of its own, e.g. tsconfig.drift-a.json, builds into its own genDir, .mion-drift-a. */
function programOf(tsConfig) {
  const root = dirname(tsConfig);
  const genDir = `${root}/.mion-${basename(tsConfig).replace(/^tsconfig\.|\.json$/g, '')}`;
  return {
    configFile: false,
    root,
    resolve: {conditions: ['source']},
    ssr: {resolve: {conditions: ['source']}},
    plugins: [mionVitePlugin({runTypes: {tsConfig, genDir}})],
  };
}

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
