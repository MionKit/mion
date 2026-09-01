// Transform-wire benchmark — 'go' vs 'edits' transform mode, settled on DATA.
//
// 'go' mode: the resolver applies the rewrite and ships the whole rewritten
// file + source map per file. 'edits' mode: it ships the raw edit list
// (importBlock + edits + a source hash) and the FE applies it. Same artifacts,
// different wire — so the question is purely which wire is cheaper end to end.
//
// This drives the real ResolverClient (the same transport the plugin uses) over
// a synthetic corpus swept across file size × marker-site density × file count,
// and for each cell records, per mode:
//   - end-to-end per-file transform latency (round-trip + 'edits'-mode apply),
//   - wire bytes BOTH directions (client.wireStats(), the cheap line counters),
//   - request count.
// 'go' is measured twice — with and without the sourcesContent map trim — since
// eliding it is the cheap milestone-0 win that narrows the comparison.
//
// RE-BASELINE (protocol startup-config audit): request wire sizes dropped by
// the `outDir` + `omitSourcesContent` bytes that used to ride EVERY transform
// request — both are spawn config now. The trim itself became a session flag,
// so each mode's client is constructed with it rather than passing it per call.
// Numbers recorded before that change read a few bytes high on the request side;
// response sizes and timings are unaffected.
//
// Reusable both ways: `node transform-wire/transform-wire.mjs` on the host (the
// binary + built @mionjs/devtools resolve locally) and in the bench container
// (`pnpm rtx bench transform-wire`), where the numbers are stable.
// Median of N (default 5), a warm-up pass discarded, tiers interleaved.

import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const argOf = (flag) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const intEnv = (name, dflt) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : dflt;
};

const COMPETITOR_DIR = process.cwd();
const RESULTS_DIR = process.env.MION_VALIDATION_BENCH_RESULTS_DIR ?? path.join(COMPETITOR_DIR, 'results');
const N = intEnv('MION_TRANSFORM_WIRE_N', 5);
const QUICK = process.env.MION_VALIDATION_BENCH_QUICK === '1';

// @mionjs/devtools ships per-file dist modules; import the transport + applier
// by ABSOLUTE path (Node's package `exports` gate never applies to file URLs),
// so the bench uses the exact code the plugin ships without widening its API.
const PKG_ROOT = argOf('--pkg') ?? path.join(COMPETITOR_DIR, 'node_modules', '@mionjs/devtools');
const distImport = (file) => import(pathToFileURL(path.join(PKG_ROOT, 'dist', file)).href);
const {ResolverClient} = await distImport('resolver-client.js');
const {applyEdits, sourceHash} = await distImport('apply-edits.js');

const MION_BINARY = process.env.MION_BINARY ?? argOf('--binary') ?? path.join(COMPETITOR_DIR, 'bin', 'mion');

// The REAL marker package (package.json + built dist .d.ts tree) as virtual
// node_modules sources, so the corpus resolves '@mionjs/run-types' exactly the
// way a consumer install does — no hand-written stand-in to drift. Candidates
// cover both postures: in the container the bench mounts the package at
// COMPETITOR_DIR/node_modules/@mionjs/run-types; on the host --pkg points at
// packages/devtools, whose sibling directory is the package.
const MARKER_PKG_DIR = [
  path.join(COMPETITOR_DIR, 'node_modules', '@mionjs', 'run-types'),
  path.resolve(PKG_ROOT, '..', 'core'),
  path.resolve(PKG_ROOT, '..', 'run-types'),
].find((dir) => fs.existsSync(path.join(dir, 'package.json')));
if (!MARKER_PKG_DIR) {
  console.error('transform-wire: cannot locate the @mionjs/run-types package (looked next to COMPETITOR_DIR and --pkg)');
  process.exit(1);
}
const MARKER_OVERLAY = (() => {
  const files = {
    'node_modules/@mionjs/run-types/package.json': fs.readFileSync(path.join(MARKER_PKG_DIR, 'package.json'), 'utf8'),
  };
  const walk = (dir, rel) => {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      if (entry.isDirectory()) walk(path.join(dir, entry.name), `${rel}${entry.name}/`);
      else if (entry.name.endsWith('.d.ts')) {
        files[`node_modules/@mionjs/run-types/dist/${rel}${entry.name}`] = fs.readFileSync(path.join(dir, entry.name), 'utf8');
      }
    }
  };
  walk(path.join(MARKER_PKG_DIR, 'dist'), '');
  return files;
})();

// ── corpus ───────────────────────────────────────────────────────────────────
// One file = `filler` comment lines (to grow file size independently of site
// count) + `sites` distinct interfaces, each with a createValidateFn<T>() call.
// Distinct types per site so every site interns a real cache entry.
function genFile(fileIndex, sites, filler) {
  const lines = [`import {createValidateFn} from '@mionjs/run-types';`];
  for (let i = 0; i < filler; i++) {
    lines.push(`// filler ${fileIndex}-${i}: lorem ipsum dolor sit amet consectetur adipiscing elit sed do`);
  }
  for (let s = 0; s < sites; s++) {
    const t = `T_${fileIndex}_${s}`;
    lines.push(
      `interface ${t} { id: number; name: string; tags: string[]; nested: {created: number; active: boolean; label: string}; }`
    );
    lines.push(`export const v_${fileIndex}_${s} = createValidateFn<${t}>();`);
  }
  return lines.join('\n') + '\n';
}

function genCorpus({files, sites, filler}) {
  const sources = {...MARKER_OVERLAY};
  const names = [];
  for (let f = 0; f < files; f++) {
    const name = `corpus/file_${f}.ts`;
    sources[name] = genFile(f, sites, filler);
    names.push(name);
  }
  return {sources, names};
}

// Approximate file size in bytes per config, printed alongside so the small vs
// big story is legible. filler line ~78 B; each site ~140 B.
const approxBytes = ({sites, filler}) => filler * 78 + sites * 140 + 40;

const CONFIGS = QUICK
  ? [{files: 4, sites: 4, filler: 20}]
  : [
      {files: 12, sites: 1, filler: 0}, // tiny: one site, no filler
      {files: 12, sites: 2, filler: 10}, // small, sparse
      {files: 12, sites: 8, filler: 10}, // small, dense
      {files: 12, sites: 8, filler: 300}, // large files, dense
      {files: 12, sites: 8, filler: 1200}, // very large files
      {files: 60, sites: 4, filler: 40}, // many files
    ];

// ── measurement ────────────────────────────────────────────────────────────
const MODES = [
  {key: 'go', label: 'go (full code + map)', emitEdits: false},
  {key: 'go-noSC', label: 'go, no sourcesContent', emitEdits: false, omitSourcesContent: true},
  {key: 'edits', label: 'edits (FE applies)', emitEdits: true},
];

// transformFile returns the round-trip ms and, for 'edits', the FE apply ms
// separately — so the breakdown shows WHERE 'edits' spends its time (the JS-side
// map generation is O(file size), the cost it trades the wire savings for).
async function transformFile(client, mode, file, source) {
  if (mode.emitEdits) {
    const t0 = process.hrtime.bigint();
    const resp = await client.transform([file], {emitEdits: true});
    const rtMs = Number(process.hrtime.bigint() - t0) / 1e6;
    const fr = resp.transformed[file];
    if (!fr) return {rtMs, applyMs: 0};
    const t1 = process.hrtime.bigint();
    if (sourceHash(source) === fr.sourceHash) applyEdits(file, source, fr.importBlock ?? '', fr.edits ?? []);
    return {rtMs, applyMs: Number(process.hrtime.bigint() - t1) / 1e6};
  }
  const t0 = process.hrtime.bigint();
  await client.transform([file]);
  return {rtMs: Number(process.hrtime.bigint() - t0) / 1e6, applyMs: 0};
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  if (s.length >= 3) {
    s.shift();
    s.pop();
  }
  return s.reduce((a, b) => a + b, 0) / (s.length || 1);
};
const round2 = (n) => Math.round(n * 100) / 100;

async function runMode(mode, names, sources) {
  // The sourcesContent trim is SESSION config (--omit-sources-content), so it
  // rides client construction — one spawn per mode, which this loop already did.
  const client = new ResolverClient(MION_BINARY, COMPETITOR_DIR, '', {
    serverMode: true,
    ...(mode.omitSourcesContent ? {omitSourcesContent: true} : {}),
  });
  try {
    await client.setSources(sources);
    // Warm-up pass (discarded): first-touch scan + type interning per file.
    for (const file of names) await transformFile(client, mode, file, sources[file]);

    // Sequential: per-file round-trip + apply, and wire bytes both directions.
    const before = client.wireStats();
    let totalRt = 0;
    let totalApply = 0;
    for (let round = 0; round < N; round++) {
      for (const file of names) {
        const {rtMs, applyMs} = await transformFile(client, mode, file, sources[file]);
        totalRt += rtMs;
        totalApply += applyMs;
      }
    }
    const after = client.wireStats();
    const transforms = N * names.length;

    // Concurrent: fire the whole corpus at once (Promise.all) and time the wall.
    // This is the realistic build shape — the resolver pipe is FIFO, so a big
    // 'go' response blocks the next file's response until it fully drains, while
    // 'edits' small responses clear fast. Median of N rounds.
    const concRounds = [];
    for (let round = 0; round < N; round++) {
      const t0 = process.hrtime.bigint();
      await Promise.all(names.map((file) => transformFile(client, mode, file, sources[file])));
      concRounds.push(Number(process.hrtime.bigint() - t0) / 1e6);
    }

    return {
      key: mode.key,
      label: mode.label,
      seqMsPerFile: round2((totalRt + totalApply) / transforms),
      roundTripMsPerFile: round2(totalRt / transforms),
      applyMsPerFile: round2(totalApply / transforms),
      concMsPerCorpus: round2(median(concRounds)),
      bytesOutPerFile: Math.round((after.bytesWritten - before.bytesWritten) / transforms),
      bytesInPerFile: Math.round((after.bytesRead - before.bytesRead) / transforms),
    };
  } finally {
    client.close();
  }
}

async function main() {
  if (!fs.existsSync(MION_BINARY)) {
    console.error(`transform-wire: binary not found at ${MION_BINARY}`);
    process.exit(1);
  }
  console.error(`transform-wire: binary=${MION_BINARY}\ntransform-wire: median of ${N}${QUICK ? ' (QUICK)' : ''}\n`);

  const cells = [];
  for (const config of CONFIGS) {
    const {sources, names} = genCorpus(config);
    const kib = round2(approxBytes(config) / 1024);
    const label = `files=${config.files} sites/file=${config.sites} ~${kib} KiB/file`;
    console.error(`-------- ${label} --------`);
    const modes = [];
    for (const mode of MODES) {
      const result = await runMode(mode, names, sources);
      modes.push(result);
      const apply = mode.emitEdits ? ` (apply ${result.applyMsPerFile})` : '';
      console.error(
        `  ${mode.label.padEnd(24)}  seq ${String(result.seqMsPerFile).padStart(6)} ms/file${apply.padEnd(14)}` +
          `conc ${String(result.concMsPerCorpus).padStart(7)} ms   in ${String(result.bytesInPerFile).padStart(7)} B`
      );
    }
    const go = modes.find((m) => m.key === 'go');
    const edits = modes.find((m) => m.key === 'edits');
    const wireRatio = edits.bytesInPerFile > 0 ? round2(go.bytesInPerFile / edits.bytesInPerFile) : 0;
    const concSpeedup = edits.concMsPerCorpus > 0 ? round2(go.concMsPerCorpus / edits.concMsPerCorpus) : 0;
    console.error(
      `  → 'edits' cuts inbound wire ${wireRatio}×; concurrent build ${concSpeedup}× vs 'go' (>1 = edits faster)\n`
    );
    cells.push({config, approxKiBPerFile: kib, modes, goVsEditsInboundRatio: wireRatio, goVsEditsConcSpeedup: concSpeedup});
  }

  // Data-driven default: 'edits' is the default when it never LOSES the
  // concurrent build (the realistic shape) and always lightens the wire.
  const editsWins = cells.every((c) => c.goVsEditsInboundRatio >= 1.2 && c.goVsEditsConcSpeedup >= 0.95);
  const recommendedDefault = editsWins ? 'edits' : 'go';

  const out = {
    n: N,
    quick: QUICK,
    cells,
    recommendedDefault,
    notes: [
      "Inbound = resolver→FE (the bloat 'edits' removes); outbound is file paths either way.",
      "seqMsPerFile = round-trip (+ FE apply for 'edits') one file at a time; concMsPerCorpus = whole corpus fired at once (the realistic build shape, where the FIFO pipe makes big 'go' responses block).",
    ],
  };
  fs.mkdirSync(RESULTS_DIR, {recursive: true});
  const outPath = path.join(RESULTS_DIR, 'transform-wire.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');
  console.error(`\ntransform-wire: recommended default = '${recommendedDefault}'`);
  console.log(`wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
