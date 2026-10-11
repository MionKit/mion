// Installs the Chromium the root @playwright/cli pin expects, where every Playwright tool looks for it
// (PLAYWRIGHT_BROWSERS_PATH, else Playwright's own cache). Run by both setups; `--check` by both startup hooks.
// Usage: node scripts/lib/playwright-chromium.mjs [--check]   Exit: 0 installed, 1 missing or install failed.

import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const REPO_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const cliScript = (root) => createRequire(join(root, 'package.json')).resolve('@playwright/cli/playwright-cli.js');
const runCli = (root, args, options = {}) =>
  spawnSync(process.execPath, [cliScript(root), 'install-browser', 'chromium', ...args], {cwd: root, encoding: 'utf8', ...options});

/** `--dry-run` lists every dir the install fills; Playwright writes INSTALLATION_COMPLETE into each one last. */
export function chromiumStatus(root = REPO_DIR) {
  let dryRun;
  try {
    dryRun = runCli(root, ['--dry-run']);
  } catch {
    return {ok: false, label: '@playwright/cli not installed (run pnpm install)'};
  }
  const dirs = [...new Set([...(dryRun.stdout ?? '').matchAll(/Install location:\s+(\S.*)$/gm)].map((match) => match[1].trim()))];
  if (dryRun.status !== 0 || !dirs.length) return {ok: false, label: `cannot read the install plan: ${(dryRun.stderr || dryRun.stdout || '').trim()}`};
  const missing = dirs.filter((dir) => !existsSync(join(dir, 'INSTALLATION_COMPLETE')));
  const chromium = dirs.find((dir) => /[\\/]chromium-\d+$/.test(dir)) ?? dirs[0];
  return missing.length ? {ok: false, label: `${missing.join(', ')} not installed`} : {ok: true, label: chromium};
}

function main(argv) {
  const before = chromiumStatus();
  if (before.ok || argv.includes('--check')) {
    console.log(`${before.ok ? 'OK' : 'MISSING'} Playwright Chromium: ${before.label}`);
    return before.ok ? 0 : 1;
  }
  // pnpm install keeps skipping browser downloads; only this one command may fetch.
  const {PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: _skip, ...env} = process.env;
  runCli(REPO_DIR, [], {env, stdio: 'inherit'});
  const after = chromiumStatus();
  console.log(`${after.ok ? 'OK' : 'MISSING'} Playwright Chromium: ${after.label}`);
  return after.ok ? 0 : 1;
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
