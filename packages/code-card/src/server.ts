// `miondevx card serve`: preview cards in a browser and download their PNGs.
// Cards are re-read on every request, so an edit shows on refresh.

import {existsSync, mkdtempSync, readFileSync, readdirSync, rmSync} from 'node:fs';
import {createServer, type IncomingMessage, type Server} from 'node:http';
import type {AddressInfo} from 'node:net';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';
import {CARD_NAME, CARDS_DIR, TMP_DIR, escapeHtml, loadCard, renderCardHtml, resolveCardPath, validateCard} from './card.ts';
import {ZOOM, shootUrls} from './shoot.ts';

export const DEFAULT_PORT = 4400;
const MAX_BODY = 256 * 1024;
const MAX_ZOOM = 4;

export type ServeArgs = {port: number; browser?: string};
export type CardServerOptions = {browser?: string; cardPaths?: Record<string, string>};

export function parseServeArgs(argv: string[]): ServeArgs {
  const {values} = parseArgs({args: argv, options: {port: {type: 'string'}, browser: {type: 'string'}}});
  const port = values.port === undefined ? DEFAULT_PORT : Number(values.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error(`--port must be a number from 1 to 65535, got "${values.port}"`);
  return {port, browser: values.browser};
}

const listCards = (dir: string) =>
  existsSync(dir)
    ? readdirSync(dir)
        .filter((file) => file.endsWith('.md'))
        .map((file) => file.slice(0, -3))
        .sort()
    : [];

function indexPage(): string {
  const section = (heading: string, names: string[]) =>
    `<h2>${heading}</h2>` +
    (names.length
      ? `<ul>${names.map((name) => `<li><a href="/card/${name}">${escapeHtml(name)}</a> · <a href="/card/${name}.png" download>Download PNG</a></li>`).join('')}</ul>`
      : '<p>none</p>');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Code cards</title>
<style>body{font:16px/1.6 system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 16px;background:#18181b;color:#e4e4e7}a{color:#a3be7a}h2{margin-top:28px}</style>
</head><body><h1>Code cards</h1>${section('Kept in git (cards/)', listCards(CARDS_DIR))}${section('Throwaway (tmp/)', listCards(TMP_DIR))}</body></html>`;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((done, fail) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) return fail(new Error('request body too large'));
      chunks.push(chunk);
    });
    req.on('end', () => done(Buffer.concat(chunks).toString('utf8')));
    req.on('error', fail);
  });
}

function parseZoom(value: string | null): number {
  if (value === null) return 1;
  const zoom = Number(value);
  if (!(zoom > 0 && zoom <= MAX_ZOOM)) throw new Error(`zoom must be a number above 0 and up to ${MAX_ZOOM}`);
  return zoom;
}

export function createCardServer({browser, cardPaths = {}}: CardServerOptions = {}): Server {
  const cardPath = (name: string) => cardPaths[name] ?? resolveCardPath(name);
  const server = createServer(async (req, res) => {
    const send = (status: number, type: string, body: string | Buffer, headers: Record<string, string> = {}) => {
      res.writeHead(status, {'content-type': type, ...headers});
      res.end(body);
    };
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/') return send(200, 'text/html; charset=utf-8', indexPage());
      if (req.method === 'POST' && url.pathname === '/render') {
        const card = validateCard(JSON.parse(await readBody(req)), 'POST /render');
        return send(200, 'text/html; charset=utf-8', await renderCardHtml(card, {zoom: parseZoom(url.searchParams.get('zoom'))}));
      }
      const match = url.pathname.match(/^\/card\/([^/]+?)(\.png)?$/);
      if (req.method !== 'GET' || !match || !CARD_NAME.test(match[1]))
        return send(404, 'text/plain; charset=utf-8', 'not found\n');
      const [, name, png] = match;
      const card = loadCard(cardPath(name));
      if (!png)
        return send(200, 'text/html; charset=utf-8', await renderCardHtml(card, {zoom: parseZoom(url.searchParams.get('zoom'))}));
      const workDir = mkdtempSync(join(tmpdir(), 'code-card-png-'));
      try {
        const outPath = join(workDir, `${name}.png`);
        const self = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        await shootUrls([{url: `${self}/card/${name}?zoom=${ZOOM}`, outPath}], {browser});
        send(200, 'image/png', readFileSync(outPath), {'content-disposition': `attachment; filename="${name}.png"`});
      } finally {
        rmSync(workDir, {recursive: true, force: true});
      }
    } catch (err) {
      send(400, 'text/plain; charset=utf-8', `${(err as Error).message}\n`);
    }
  });
  return server;
}

export function main(argv: string[]): void {
  const {port, browser} = parseServeArgs(argv);
  const server = createCardServer({browser});
  server.listen(port, () => console.log(`code cards on http://localhost:${port}/ (cards from packages/code-card/)`));
  const stop = () => server.close(() => process.exit(0));
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    console.error(`card serve: ${(err as Error).message}`);
    process.exit(1);
  }
}
