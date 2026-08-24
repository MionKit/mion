// Captures the run environment + each competitor's resolved library version into
// results/env.json, for the docs to display on the benchmark pages. Runs in the
// benchmark container (where the per-competitor node_modules live), so versions are
// the ACTUAL installed ones, and os/cpu reflect where the benchmarks execute.
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const COMP = path.join(HERE, 'competitors');
const RESULTS = process.env.RT_BENCH_RESULTS_DIR ?? path.join(HERE, 'results');

// competitor dir -> the npm package whose version represents that competitor.
const LIBS = {
  'ts-runtypes': '@ts-runtypes/core',
  zod: 'zod',
  typebox: '@sinclair/typebox',
  ajv: 'ajv',
  typia: 'typia',
};

// Read a package's version straight from its installed package.json (follows pnpm
// symlinks); null when the package isn't present.
function versionOf(compDir, pkg) {
  try {
    const json = path.join(COMP, compDir, 'node_modules', ...pkg.split('/'), 'package.json');
    return JSON.parse(fs.readFileSync(json, 'utf8')).version;
  } catch {
    return null;
  }
}

const versions = {};
for (const [comp, pkg] of Object.entries(LIBS)) versions[comp] = versionOf(comp, pkg);

// TypeScript used by the typecost probe (typecost/_deps pins it).
function typescriptVersion() {
  for (const base of [path.join(HERE, 'typecost'), HERE]) {
    try {
      return JSON.parse(fs.readFileSync(path.join(base, 'node_modules', 'typescript', 'package.json'), 'utf8')).version;
    } catch {
      /* try next */
    }
  }
  return null;
}

const cpus = os.cpus() ?? [];
// The container (Linux VM) reports no CPU model, so bench.sh passes the host's.
const cpu = process.env.RT_BENCH_HOST_CPU?.trim() || cpus[0]?.model?.trim() || 'unknown';
const meta = {
  generatedAt: new Date().toISOString(),
  // The benchmarks run in a Linux container; type + arch is the useful part (the
  // kernel release just leaks the podman-machine distro, which confuses on macOS).
  os: `${os.type()} ${os.arch()}`,
  cpu,
  cores: cpus.length || null,
  node: process.version,
  typescript: typescriptVersion(),
  versions,
};

fs.mkdirSync(RESULTS, {recursive: true});
fs.writeFileSync(path.join(RESULTS, 'env.json'), JSON.stringify(meta, null, 2) + '\n');
console.log('wrote ' + path.join(RESULTS, 'env.json'));
console.log(JSON.stringify(meta, null, 2));
