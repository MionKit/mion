// Host-side audit collector for the competitors that can run outside the shared
// podman image. The canonical full audit runs every competitor inside the image
// (`pnpm rtx bench audit`); this is the faster host path, and the only one
// available when the image can't be pulled.
//
// zod / typebox / ajv build their schemas at RUNTIME, so they run directly via tsx.
// typia needs its build-time transform, but that transform (samchon/ttsc + typia's
// native plugin, driven through @ttsc/unplugin's esbuild adapter) is plain npm
// packages with an EMBEDDED Go toolchain — no system Go, no container required. So
// typia is included here too: we build its bundle with esbuild, then run it.
//
// Each competitor runs with RT_AUDIT_ALIGNMENT=1 (see shared/harness/audit.ts →
// maybeAudit), dropping results/<name>.alignment.json; run-audit.mjs then joins
// them. ts-runtypes is NOT collected here: it is the REFERENCE (zero divergences
// against the shared truth by construction, since the samples encode its semantics
// and it carries no overrides); the in-container audit runs it for real.
//
// Requirements: a node_modules resolvable from competitors/<name>/ that provides
// the competitor libraries (zod / @sinclair/typebox / ajv / ajv-formats, and for
// typia: typia / ttsc / @ttsc/unplugin / @typescript/native-preview / esbuild),
// plus a `tsx` runner. Point at tsx with RT_AUDIT_TSX; the deps must be installed
// somewhere node's upward node_modules walk finds (e.g. container/benchmarks/node_modules).
//
// Usage (from container/benchmarks/):
//   RT_AUDIT_TSX=/path/to/tsx node _audit/host-collect.mjs [zod typebox ajv typia]

import {spawnSync} from 'node:child_process';
import {build} from 'esbuild';
import path from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';

const BENCH_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RESULTS_DIR = process.env.RT_BENCH_RESULTS_DIR ?? path.join(BENCH_DIR, 'results');
const TSX = process.env.RT_AUDIT_TSX ?? 'tsx';
const DEFAULT = ['zod', 'typebox', 'ajv', 'typia'];

const competitors = process.argv.slice(2).length > 0 ? process.argv.slice(2) : DEFAULT;
const auditEnv = {...process.env, RT_AUDIT_ALIGNMENT: '1', RT_BENCH_RESULTS_DIR: RESULTS_DIR};

// zod / typebox / ajv: just run main.ts through tsx (runtime schemas).
function runTsx(competitor) {
  const main = path.join(BENCH_DIR, 'competitors', competitor, 'main.ts');
  return spawnSync(TSX, [main], {cwd: BENCH_DIR, stdio: 'inherit', env: auditEnv}).status === 0;
}

// typia: drive its own esbuild transform (the same typiaTsgo plugin the committed
// esbuild.config.mjs exports), pointing the ttsc program at typia's tsconfig so the
// shared harness files it imports are in the program, then run the bundle.
async function runTypia() {
  const dir = path.join(BENCH_DIR, 'competitors', 'typia');
  const {typiaTsgo} = await import(pathToFileURL(path.join(dir, 'esbuild.config.mjs')).href);
  const tsconfig = path.join(dir, 'tsconfig.json');
  const outfile = path.join(dir, 'dist', 'run.mjs');
  await build({
    entryPoints: [path.join(dir, 'main.ts')],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    minify: false,
    tsconfig,
    plugins: [typiaTsgo(tsconfig)],
  });
  return spawnSync(process.execPath, [outfile], {cwd: BENCH_DIR, stdio: 'inherit', env: auditEnv}).status === 0;
}

let failed = 0;
for (const competitor of competitors) {
  console.log(`-------- audit (host): ${competitor} --------`);
  let ok;
  try {
    ok = competitor === 'typia' ? await runTypia() : runTsx(competitor);
  } catch (err) {
    console.error(`==> ${competitor} threw: ${err instanceof Error ? err.message : String(err)}`);
    ok = false;
  }
  if (!ok) {
    console.error(`==> ${competitor} audit FAILED — see output above`);
    failed++;
  }
}

console.log(
  `\n==> host audit done: ${competitors.length - failed}/${competitors.length} competitor(s) collected into ${RESULTS_DIR}`
);
console.log('   ts-runtypes (reference, 0 by construction) is not collected here; the in-container run covers it.');
console.log('   Next: node _audit/run-audit.mjs && node _audit/classify.mjs');
process.exit(failed > 0 ? 1 : 0);
