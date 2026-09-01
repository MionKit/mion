// Runs both published lint transports over their caveat sources (oxlint on
// build-vite, eslint on smoke-esbuild). Convenience wrapper; the assertions live
// in test/lint-transport.test.mjs.
//
// Both linters run from THIS directory, so each app's lint config names its
// tsconfig relative to here (oxlint) or absolutely (eslint).
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BIN = path.join(HERE, 'node_modules/.bin');

// The lint lane resolves its binary through @ts-runtypes/bin, which takes no
// plugin option — MION_BIN is its override. Forward the fixture's single host knob
// to it, resolved against the invoking cwd because the child runs in HERE.
// Unset in-container / in CI, where the published launcher is what we prove.
function lintEnv() {
  const override = process.env.MION_E2E_BINARY;
  return override ? {...process.env, MION_BIN: path.resolve(override)} : process.env;
}

const jobs = [
  {name: 'oxlint (build-vite)', bin: 'oxlint', args: ['--config', 'apps/build-vite/oxlintrc.e2e.json', 'apps/build-vite/src/caveat.ts']},
  {name: 'eslint (smoke-esbuild)', bin: 'eslint', args: ['--config', 'apps/smoke-esbuild/eslint.config.mjs', 'apps/smoke-esbuild/src/caveat.ts']},
];

for (const job of jobs) {
  const bin = path.join(BIN, job.bin);
  if (!existsSync(bin)) {
    console.log(`SKIP ${job.name} — ${job.bin} not installed`);
    continue;
  }
  console.log(`\n=== ${job.name} ===`);
  spawnSync(bin, job.args, {cwd: HERE, stdio: 'inherit', env: lintEnv()});
}
