// gen-client-size.mjs — measures the published @mionjs/client the way a consumer's bundler would, so
// the home page's size claim is measured rather than typed. Bundles the client dist with NOTHING
// external (that dist externalises every @mionjs/* and is meaningless on its own), and gzips each
// chunk SEPARATELY, as a server does. Its output, container/website/app/data/client-size.json, is
// COMMITTED and imported at build time: the site still builds where the dists are absent, and the
// number is in the prerendered HTML with no hydration flash. It carries NO timestamp, so a run that
// finds the same bytes leaves the file byte-identical instead of dirtying the tree.

import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {gzipSync} from 'node:zlib';
import {buildSync} from 'esbuild';
import {loadEnv, REPO_ROOT} from '../lib/env.mjs';
import {die, note, reportCliError, warn} from '../lib/proc.mjs';

const OUT_DIR = join(REPO_ROOT, 'container/website/app/data');
const OUT_FILE = join(OUT_DIR, 'client-size.json');
const CLIENT_ENTRY = join(REPO_ROOT, 'packages/client/.dist/esm/index.js');

// Browser + esm so the exports maps resolve as a web app resolves them; splitting so the on-demand
// metadata lane lands in its own chunk. tsconfigRaw is load-bearing: esbuild honours the root
// tsconfig `paths`, which would silently measure the SOURCE tree instead of the published dist.
function measureClient() {
  if (!existsSync(CLIENT_ENTRY)) throw new Error(`${CLIENT_ENTRY} is missing - build the dists first (pnpm run build)`);
  const built = buildSync({
    entryPoints: [CLIENT_ENTRY],
    bundle: true,
    minify: true,
    splitting: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    legalComments: 'none',
    tsconfigRaw: '{}',
    outdir: join(REPO_ROOT, '.client-size-out'),
    write: false,
    logLevel: 'silent',
  });
  const chunks = built.outputFiles.filter((file) => file.path.endsWith('.js'));
  if (chunks.length === 0) throw new Error('esbuild emitted no chunks');
  let minified = 0;
  let gzipped = 0;
  for (const chunk of chunks) {
    minified += chunk.contents.length;
    gzipped += gzipSync(chunk.contents, {level: 9}).length;
  }
  return {minified, gzipped};
}

const readExisting = () => {
  try {
    return JSON.parse(readFileSync(OUT_FILE, 'utf8'));
  } catch {
    return null;
  }
};

// A host that cannot measure keeps the committed number rather than writing a zero; `--check`
// refuses that fallback, which would make a stale number look verified.
export function main(args = []) {
  const check = args.includes('--check');
  for (const arg of args) if (arg !== '--check') die(`gen-client-size: unknown arg '${arg}' (want: [--check])`, 2);

  const existing = readExisting();
  let client;
  try {
    client = measureClient();
  } catch (err) {
    if (check) die(`gen-client-size: --check cannot verify the committed size - ${err.message}`);
    if (!existing?.client) die(`gen-client-size: cannot measure the client and no committed size to fall back on - ${err.message}`);
    warn(`client size kept at ${existing.client.gzipped} B gzipped (could not remeasure: ${err.message})`);
    client = existing.client;
  }

  const next = JSON.stringify({client}, null, 2) + '\n';
  const current = existing === null ? '' : JSON.stringify(existing, null, 2) + '\n';
  const human = `${(client.gzipped / 1024).toFixed(1)} kB gzipped, ${(client.minified / 1024).toFixed(1)} kB minified`;

  if (check) {
    if (next === current) return note(`client size up to date (${human})`);
    die(`gen-client-size: ${OUT_FILE} is stale - run 'pnpm miondevx website client-size' and commit the result`);
  }

  if (next === current) return note(`client size unchanged (${human})`);
  mkdirSync(OUT_DIR, {recursive: true});
  writeFileSync(OUT_FILE, next);
  note(`client size -> ${OUT_FILE} (${human})`);
}

if (import.meta.main) {
  loadEnv();
  try {
    main(process.argv.slice(2));
  } catch (err) {
    reportCliError(err);
  }
}
