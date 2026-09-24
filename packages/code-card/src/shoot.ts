// `miondevx card shot`: playwright-cli only opens http pages, so the cards go through the preview server.

import {spawn} from 'node:child_process';
import {existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import type {AddressInfo} from 'node:net';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {basename, dirname, join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';
import {CARDS_DIR, loadCard, resolveCardPath} from './card.ts';
import {createCardServer} from './server.ts';

export const SHOT_USAGE = 'usage: miondevx card shot <name|path…> | --all  [--out <dir>] [--browser <path>]';
export const ZOOM = 2;

export type ShotArgs = {all: boolean; out?: string; browser?: string; cards: string[]};
export type ShotTarget = {url: string; outPath: string};

export function parseShotArgs(argv: string[]): ShotArgs {
  const {values, positionals} = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {all: {type: 'boolean'}, out: {type: 'string'}, browser: {type: 'string'}},
  });
  if (values.all && positionals.length) throw new Error(`pass card names or --all, not both. ${SHOT_USAGE}`);
  if (!values.all && !positionals.length) throw new Error(SHOT_USAGE);
  return {all: Boolean(values.all), out: values.out, browser: values.browser, cards: positionals};
}

// The sandbox is off because the pages are our own cards and some hosts (containers, CI) cannot run it.
export function cliConfig(browser?: string) {
  return {
    browser: {
      browserName: 'chromium',
      launchOptions: {headless: true, chromiumSandbox: false, ...(browser ? {executablePath: browser} : {})},
      contextOptions: {viewport: {width: 1200 * ZOOM, height: 800 * ZOOM}},
    },
  };
}

const cliScript = () => createRequire(import.meta.url).resolve('@playwright/cli/playwright-cli.js');

// The CLI prints a stack trace or a markdown report; keep the lines that say what went wrong.
export function cliFailure(output: string): string {
  const errors = output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('Error:'));
  return errors.length ? errors.map((line) => line.replace(/^Error: (Daemon pid=\d+: )?/, '')).join('\n') : output.trim();
}

let sessionCount = 0;

function runCli(session: string, cwd: string, args: string[]): Promise<{status: number | null; output: string}> {
  return new Promise((done, fail) => {
    const child = spawn(process.execPath, [cliScript(), `-s=${session}`, ...args], {cwd});
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    child.on('error', fail);
    child.on('close', (status) => done({status, output}));
  });
}

// The CLI reports some failures only in its output, not in its exit code.
export async function shootUrls(targets: ShotTarget[], {browser}: {browser?: string} = {}): Promise<void> {
  const workDir = mkdtempSync(join(tmpdir(), 'code-card-'));
  const configPath = join(workDir, 'cli.config.json');
  writeFileSync(configPath, JSON.stringify(cliConfig(browser)));
  const session = `code-card-${process.pid}-${++sessionCount}`;
  const cli = async (...args: string[]) => {
    const {status, output} = await runCli(session, workDir, args);
    if (status !== 0 || output.includes('### Error')) throw new Error(`playwright-cli ${args[0]} failed: ${cliFailure(output)}`);
  };
  try {
    await cli('open', targets[0].url, '--config', configPath).catch((err: Error) => {
      throw new Error(
        `${err.message}\nfix: pass --browser <path to chrome>, or run \`pnpm exec playwright-cli install-browser chromium\``
      );
    });
    for (const [i, target] of targets.entries()) {
      if (i > 0) await cli('goto', target.url);
      mkdirSync(dirname(target.outPath), {recursive: true});
      rmSync(target.outPath, {force: true});
      await cli('screenshot', '.stage', '--filename', target.outPath);
      if (!existsSync(target.outPath)) throw new Error(`playwright-cli wrote no file at ${target.outPath}`);
    }
  } finally {
    await runCli(session, workDir, ['close']).catch(() => undefined);
    rmSync(workDir, {recursive: true, force: true});
  }
}

export async function main(argv: string[]): Promise<void> {
  const options = parseShotArgs(argv);
  const paths = options.all
    ? readdirSync(CARDS_DIR)
        .filter((file) => file.endsWith('.md'))
        .map((file) => join(CARDS_DIR, file))
    : options.cards.map(resolveCardPath);
  if (!paths.length) throw new Error('no cards to render');
  for (const path of paths) loadCard(path);
  // Aliased so a card from any folder is served, not only cards/ and tmp/.
  const cardPaths = Object.fromEntries(paths.map((path, i) => [`card-${i}`, path]));
  const server = createCardServer({cardPaths});
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  try {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const targets = paths.map((path, i) => ({
      url: `${base}/card/card-${i}?zoom=${ZOOM}`,
      outPath: join(options.out ? resolve(options.out) : dirname(path), `${basename(path, '.md')}.png`),
    }));
    await shootUrls(targets, {browser: options.browser});
    for (const target of targets) console.log(target.outPath);
  } finally {
    await new Promise<void>((done) => server.close(() => done()));
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((err: Error) => {
    console.error(`card shot: ${err.message}`);
    process.exit(1);
  });
}
