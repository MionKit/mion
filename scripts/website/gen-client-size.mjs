// gen-client-size.mjs — bundle the published @mionjs/client the way a consumer's
// bundler would and write the byte count where the docs site can read it, so the
// home page's size claim is measured rather than typed.
//
// It bundles `packages/client/.dist/esm/index.js` with NOTHING external, so
// @mionjs/core and whatever it still pulls from @mionjs/run-types are inlined:
// the client's own dist externalises every @mionjs/* and is meaningless on its own.
// Each emitted chunk is gzipped SEPARATELY and summed, because that is what a
// server does; gzipping the concatenation would flatter the number.
//
// Needs the @mionjs dists built, which is why the website build runs it right
// after the stage that builds them.
//
// Output: container/website/app/data/client-size.json — COMMITTED, and imported by
// app/components/content/ClientSize.vue at build time rather than fetched at
// runtime, so the number is in the prerendered HTML with no hydration flash.
// Committing it also means the site still builds where the dists are absent: a
// stage that cannot measure leaves the last known-good file in place and warns.
//
// The file carries NO timestamp on purpose — a regenerate that finds the same
// bytes must leave the file byte-identical, or every build dirties the tree.

import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {gzipSync} from 'node:zlib';
import {buildSync} from 'esbuild';
import {loadEnv, REPO_ROOT} from '../lib/env.mjs';
import {die, note, reportCliError, warn} from '../lib/proc.mjs';

const OUT_DIR = join(REPO_ROOT, 'container/website/app/data');
const OUT_FILE = join(OUT_DIR, 'client-size.json');
const CLIENT_ENTRY = join(REPO_ROOT, 'packages/client/.dist/esm/index.js');

// Browser + esm so the exports maps resolve the way a web app resolves them, and
// splitting so the on-demand metadata lane lands in its own chunk instead of being
// inlined into the entry.
//
// tsconfigRaw is load-bearing: esbuild honours tsconfig `paths`, and the root one maps
// `@mionjs/*` onto `packages/*`, so without it this silently measures the SOURCE tree
// instead of the published dist a consumer installs (run-types' dist is hollowed at
// build time, so the two genuinely differ).
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

// A host that cannot measure keeps the committed number rather than writing a zero.
// `--check` refuses that fallback: a gate that reports green without measuring is
// worse than no gate, because it makes a stale number look verified.
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
