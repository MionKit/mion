// Installs the Chromium the root @playwright/cli pin expects, where every Playwright tool looks for it
// (PLAYWRIGHT_BROWSERS_PATH, else Playwright's own cache). Run by both setups; `--check` by both startup hooks.

import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const REPO_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const NO_CLI = '@playwright/cli not installed (run pnpm install)';

const runCli = (args, options = {}) => {
  const cli = createRequire(join(REPO_DIR, 'package.json')).resolve('@playwright/cli/playwright-cli.js');
  return spawnSync(process.execPath, [cli, 'install-browser', 'chromium', ...args], {cwd: REPO_DIR, encoding: 'utf8', ...options});
};

/** `--dry-run` lists every dir the install fills; Playwright writes INSTALLATION_COMPLETE into each one last. */
function chromiumStatus() {
  let dryRun;
  try {
    dryRun = runCli(['--dry-run']);
  } catch {
    return {ok: false, label: NO_CLI};
  }
  const dirs = [...new Set([...(dryRun.stdout ?? '').matchAll(/Install location:\s+(\S.*)$/gm)].map((match) => match[1].trim()))];
  if (dryRun.status !== 0 || !dirs.length) return {ok: false, label: `cannot read the install plan: ${(dryRun.stderr || dryRun.stdout || '').trim()}`};
  const missing = dirs.filter((dir) => !existsSync(join(dir, 'INSTALLATION_COMPLETE')));
  const chromium = dirs.find((dir) => /[\\/]chromium-\d+$/.test(dir)) ?? dirs[0];
  return missing.length ? {ok: false, label: `${missing.join(', ')} not installed`} : {ok: true, label: chromium};
}

function report({ok, label}) {
  console.log(`${ok ? 'OK' : 'MISSING'} Playwright Chromium: ${label}`);
  return ok ? 0 : 1;
}

function main(argv) {
  const before = chromiumStatus();
  // Installing when present would still take Playwright's lock and prune other browsers.
  if (before.ok || before.label === NO_CLI || argv.includes('--check')) return report(before);
  // pnpm install keeps skipping browser downloads; only this one command may fetch.
  const {PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: _skip, ...env} = process.env;
  runCli([], {env, stdio: 'inherit'});
  return report(chromiumStatus());
}

process.exit(main(process.argv.slice(2)));
