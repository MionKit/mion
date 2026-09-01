#!/usr/bin/env node
// Zero-dependency static server for a prerendered docs site
// (container/website/.output/<site>/public; MION_SITE picks which, default runtypes).
// Resolves clean URLs the same way Cloudflare
// Pages does (/benchmarks/validation -> benchmarks/validation.html), which a plain
// `python3 -m http.server` does not. No deps on purpose: works offline, needs no
// install, and keeps the repo's dependency surface minimal.
//
// Two ways in: `pnpm rtx website preview --no-build` serves whatever build is already
// in .output/public; plain `pnpm rtx website preview` regenerates first, then serves.
//   pnpm rtx website preview --no-build       # serve existing build, http://localhost:8080
//   pnpm rtx website preview --no-build 5000  # custom port (or PORT=5000)
//   pnpm rtx website preview                  # one-shot: build THEN serve (no benchmarks)
//
// check-static.mjs imports `createStaticServer` / `DEFAULT_ROOT` so its post-build
// checks hit the artifact through the SAME clean-URL resolution a visitor gets.

import {createServer} from 'node:http';
import {createReadStream, existsSync, readFileSync, statSync} from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
/** Prerendered artifact of one site: container/website/.output/<site>/public. */
export const publicRoot = (site) => path.resolve(HERE, '..', '..', 'container/website/.output', site, 'public');
export const DEFAULT_ROOT = publicRoot(process.env.MION_SITE || 'runtypes');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
};

const isFile = (file) => {
  try {
    return statSync(file).isFile();
  } catch {
    return false;
  }
};

// Map a request path to a file on disk, mirroring Cloudflare Pages: exact file,
// directory index, then the clean-URL .html sibling.
function resolveFile(root, reqUrl) {
  const rel = decodeURIComponent(reqUrl.split('?')[0]);
  const abs = path.normalize(path.join(root, rel));
  if (abs !== root && !abs.startsWith(root + path.sep)) return null; // traversal guard
  if (isFile(abs)) return abs;
  if (isFile(path.join(abs, 'index.html'))) return path.join(abs, 'index.html');
  if (isFile(`${abs}.html`)) return `${abs}.html`;
  return null;
}

// An http.Server over the prerendered tree at `root` — not listening yet, so the
// caller picks the port (0 = ephemeral, what check-static.mjs uses).
export function createStaticServer(root = DEFAULT_ROOT) {
  return createServer((req, res) => {
    const file = resolveFile(root, req.url ?? '/');
    if (file) {
      const stream = createReadStream(file);
      // A read error (e.g. the file vanished during a rebuild) must never crash the
      // server: handle the stream's 'error' event instead of letting it throw.
      stream.on('error', () => {
        if (!res.headersSent) res.writeHead(404, {'content-type': 'text/plain; charset=utf-8'});
        res.end();
      });
      res.writeHead(200, {'content-type': MIME[path.extname(file)] ?? 'application/octet-stream'});
      stream.pipe(res);
      return;
    }
    const notFound = path.join(root, '404.html');
    if (isFile(notFound)) {
      res.writeHead(404, {'content-type': MIME['.html']});
      res.end(readFileSync(notFound));
    } else {
      res.writeHead(404, {'content-type': 'text/plain; charset=utf-8'});
      res.end('404 Not Found');
    }
  });
}

// True when `root` holds a prerendered site (the checker reports this itself).
export const hasBuild = (root = DEFAULT_ROOT) => isFile(path.join(root, 'index.html'));

if (import.meta.main) {
  const port = Number(process.argv[2] ?? process.env.PORT ?? 8080);
  if (!existsSync(DEFAULT_ROOT) || !hasBuild()) {
    process.stderr.write(`No build found at ${DEFAULT_ROOT}\nRun \`pnpm rtx website build\` first (or \`pnpm rtx website preview\` to build + serve).\n`);
    process.exit(1);
  }
  createStaticServer().listen(port, () => {
    process.stdout.write(`\n  serving  ${path.relative(process.cwd(), DEFAULT_ROOT)}\n`);
    process.stdout.write(`  ->       http://localhost:${port}\n`);
    process.stdout.write(`  site     ${process.env.MION_SITE || 'runtypes'}  (set MION_SITE to serve the other one)\n\n`);
  });
}
