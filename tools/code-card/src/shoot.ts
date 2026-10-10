// `miondevx card shot`: playwright-cli only opens http pages, so the cards go through the preview server.
// The page's layout checks run first: a card that wraps or overflows fails instead of being photographed.

import {spawn} from 'node:child_process';
import {existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import type {AddressInfo} from 'node:net';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {basename, dirname, join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';
import {PAGE_WIDTH, keptCards, resolveCardPath} from './card.ts';
import {closeRenderer, renderFragment} from './render.ts';
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
  return {all: Boolean(values.all), out: values.out, browser: values.browser ?? defaultBrowser(), cards: positionals};
}

/** MION_CARD_BROWSER, for hosts where Playwright's own Chromium is not installed. */
export const defaultBrowser = () => process.env.MION_CARD_BROWSER || undefined;

// The sandbox is off because the pages are our own cards and some hosts (containers, CI) cannot run it.
export function cliConfig(browser?: string) {
  return {
    browser: {
      browserName: 'chromium',
      launchOptions: {headless: true, chromiumSandbox: false, ...(browser ? {executablePath: browser} : {})},
      contextOptions: {viewport: {width: PAGE_WIDTH * ZOOM, height: 800 * ZOOM}},
    },
  };
}

// The root package.json's @playwright/cli, shared with the website-browser skill.
export const cliScript = () => createRequire(import.meta.url).resolve('@playwright/cli/playwright-cli.js');

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

type Cli = (...args: string[]) => Promise<string>;

/** Opens `url` in a headless Chromium and hands `work` the CLI. The CLI reports some failures only in its output. */
export async function withBrowser<T>(url: string, browser: string | undefined, work: (cli: Cli) => Promise<T>): Promise<T> {
  const workDir = mkdtempSync(join(tmpdir(), 'code-card-'));
  const configPath = join(workDir, 'cli.config.json');
  writeFileSync(configPath, JSON.stringify(cliConfig(browser)));
  const session = `code-card-${process.pid}-${++sessionCount}`;
  const cli: Cli = async (...args) => {
    const {status, output} = await runCli(session, workDir, args);
    if (status !== 0 || output.includes('### Error')) throw new Error(`playwright-cli ${args[0]} failed: ${cliFailure(output)}`);
    return output;
  };
  try {
    await cli('open', url, '--config', configPath).catch((err: Error) => {
      throw new Error(
        `${err.message}\nfix: pass --browser <path to chrome>, or run \`pnpm exec playwright-cli install-browser chromium\``
      );
    });
    return await work(cli);
  } finally {
    await runCli(session, workDir, ['close']).catch(() => undefined);
    rmSync(workDir, {recursive: true, force: true});
  }
}

/** Runs `func` (an async function's source) in the open page; it returns JSON-serialisable data. */
export const evalJson = async (cli: Cli, func: string): Promise<unknown> => {
  const output = (await cli('eval', `async () => JSON.stringify(await (${func})())`, '--raw')).trim();
  const value: unknown = JSON.parse(output);
  return typeof value === 'string' ? JSON.parse(value) : value;
};

export async function shootUrls(targets: ShotTarget[], {browser}: {browser?: string} = {}): Promise<void> {
  await withBrowser(targets[0].url, browser, async (cli) => {
    for (const [i, target] of targets.entries()) {
      if (i > 0) await cli('goto', target.url);
      mkdirSync(dirname(target.outPath), {recursive: true});
      rmSync(target.outPath, {force: true});
      const errors = await evalJson(cli, '() => window.cardChecks');
      if (!Array.isArray(errors)) throw new Error(`unexpected layout check output: ${JSON.stringify(errors)}`);
      if (errors.length)
        throw new Error(`${basename(target.outPath, '.png')}: the layout checks failed:\n  ${errors.join('\n  ')}`);
      await cli('screenshot', '.code-card', '--filename', target.outPath);
      if (!existsSync(target.outPath)) throw new Error(`playwright-cli wrote no file at ${target.outPath}`);
    }
  });
}

export async function main(argv: string[]): Promise<void> {
  const options = parseShotArgs(argv);
  const paths = options.all ? keptCards() : options.cards.map(resolveCardPath);
  if (!paths.length) throw new Error('no cards to render');
  // a card that does not render fails here, before a browser starts
  for (const path of paths) await renderFragment(path);
  // Aliased so a card from any folder is served, not only cards/ and tmp/.
  const cardPaths = Object.fromEntries(paths.map((path, i) => [`card-${i}`, path]));
  const server = createCardServer({cardPaths});
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  try {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const targets = paths.map((path, i) => ({
      url: `${base}/card/card-${i}?zoom=${ZOOM}&shot`,
      outPath: join(options.out ? resolve(options.out) : dirname(path), `${basename(path, '.vue')}.png`),
    }));
    await shootUrls(targets, {browser: options.browser});
    for (const target of targets) console.log(target.outPath);
  } finally {
    await new Promise<void>((done) => server.close(() => done()));
    await closeRenderer();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((err: Error) => {
    console.error(`card shot: ${err.message}`);
    process.exit(1);
  });
}
