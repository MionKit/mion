// Markdown report a `bench-report` labelled PR posts: its validation numbers vs the live site's, both gen-docs output.
// Machines drift run to run, but competitor code is unchanged (unless the PR bumps one), so the median of their
// PR/live ratios is the drift and every mion ratio is divided by it. A single case moves ±10% between runs of
// unchanged code, so tables use per-group geomeans; the per-case list only points at where to look.

import fs from 'node:fs';
import path from 'node:path';
import {rowMeans} from '../../../container/website/app/utils/benchAggregate.js';

const DATASETS = ['validation', 'validation-formats'];
const MION = 'mion';
const METRICS = [
  {key: 'validate', label: 'Is valid'},
  {key: 'validationErrors', label: 'Get errors'},
];
const PATHS = ['valid', 'invalid'];

/** caseKey → {group, results: {competitor: {validate, validationErrors}}}. */
export function readBenchData(dir) {
  const cases = new Map();
  let meta = null;
  for (const dataset of DATASETS) {
    const file = path.join(dir, dataset, 'index.json');
    if (!fs.existsSync(file)) throw new Error(`pr-report: no ${file}`);
    const index = JSON.parse(fs.readFileSync(file, 'utf8'));
    meta ??= index.meta ?? null;
    for (const section of index.sections) for (const c of section.cases) cases.set(c.key, {group: section.key, results: c.results});
  }
  return {cases, meta};
}

const speed = (entry, competitor, metric, at) => {
  const m = entry?.results?.[competitor]?.[metric];
  return m && m.status === 'ok' && m[at] > 0 ? m[at] : null;
};
const geomean = (xs) => (xs.length ? Math.exp(xs.reduce((sum, x) => sum + Math.log(x), 0) / xs.length) : null);
const median = (xs) => {
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted.length ? sorted[sorted.length >> 1] : null;
};
const fmtRatio = (r) => (r == null ? '-' : r.toFixed(2));

export function machineDrift(pr, live) {
  const competitors = new Set();
  for (const entry of live.cases.values()) for (const name of Object.keys(entry.results ?? {})) if (name !== MION) competitors.add(name);
  const perCompetitor = [];
  for (const name of competitors) {
    const ratios = [];
    for (const [key, entry] of live.cases)
      for (const {key: metric} of METRICS)
        for (const at of PATHS) {
          const a = speed(pr.cases.get(key), name, metric, at);
          const b = speed(entry, name, metric, at);
          if (a && b) ratios.push(a / b);
        }
    const g = geomean(ratios);
    if (g) perCompetitor.push(g);
  }
  return median(perCompetitor) ?? 1;
}

function groupsOf(data) {
  const groups = new Map();
  for (const [key, entry] of data.cases) {
    if (!groups.has(entry.group)) groups.set(entry.group, []);
    groups.get(entry.group).push(key);
  }
  return groups;
}

/** mion's place among every library on the group's mean speed, a skipped case counted at the slowest result
 *  (rowMeans), the same way the site's group rows fill it. */
function groupRank(data, keys, metric, at) {
  const toCase = ([key, entry]) => ({key, results: entry?.results ?? {}});
  const everyCase = [...data.cases].map(toCase);
  const competitors = [...new Set(everyCase.flatMap((kase) => Object.keys(kase.results)))];
  const {participants} = rowMeans(everyCase, competitors, metric);
  const {values} = rowMeans(
    keys.map((key) => toCase([key, data.cases.get(key)])),
    competitors,
    metric,
    false,
    participants
  );
  const scores = participants.map((name) => ({name, score: values[name]?.[at] ?? 0})).filter((entry) => entry.score > 0);
  if (scores.length < 2 || !scores.some((entry) => entry.name === MION)) return null;
  scores.sort((a, b) => b.score - a.score);
  return `${scores.findIndex((entry) => entry.name === MION) + 1}/${scores.length}`;
}

function headToHead(data, name, metric, at) {
  const ratios = [];
  for (const entry of data.cases.values()) {
    const a = speed(entry, MION, metric, at);
    const b = speed(entry, name, metric, at);
    if (a && b) ratios.push(a / b);
  }
  return {ratio: geomean(ratios), wins: ratios.filter((r) => r > 1).length, total: ratios.length};
}

export function renderReport(pr, live, env) {
  const drift = machineDrift(pr, live);
  const groups = groupsOf(pr);
  const lines = [];
  const machine = (m) => (m ? `${m.cpu ?? '?'}, ${m.cores ?? '?'} cores, ${m.os ?? '?'}, node ${m.node ?? '?'}` : 'unknown');
  lines.push('## Validation benchmarks: this PR vs the live site', '');
  lines.push(`- This PR: ${machine(env ?? pr.meta)}`);
  lines.push(`- Live site: ${machine(live.meta)}${live.meta?.generatedAt ? `, measured ${live.meta.generatedAt.slice(0, 10)}` : ''}`);
  lines.push(
    `- Machine drift, from the other libraries' unchanged code: ${drift.toFixed(3)}. mion's changes below are divided by it. ` +
      'A single case moves about ±10% between runs of unchanged code, so read the group means.',
    ''
  );

  lines.push('### mion speed change, PR vs live (drift removed, >1 = faster)', '');
  lines.push('| group | is valid: valid | is valid: invalid | get errors: valid | get errors: invalid |', '|---|---|---|---|---|');
  const all = new Map();
  for (const [group, keys] of groups) {
    const cells = [];
    for (const {key: metric} of METRICS)
      for (const at of PATHS) {
        const ratios = [];
        for (const key of keys) {
          const a = speed(pr.cases.get(key), MION, metric, at);
          const b = speed(live.cases.get(key), MION, metric, at);
          if (a && b) ratios.push(a / b / drift);
        }
        const id = `${metric}.${at}`;
        all.set(id, [...(all.get(id) ?? []), ...ratios]);
        cells.push(fmtRatio(geomean(ratios)));
      }
    lines.push(`| ${group} | ${cells.join(' | ')} |`);
  }
  lines.push(`| **all** | ${[...all.values()].map((r) => `**${fmtRatio(geomean(r))}**`).join(' | ')} |`, '');

  lines.push("### mion's rank per group (live → PR)", '');
  lines.push('Every library, by mean speed. A case a library skips counts at the slowest result among those that ran it.', '');
  lines.push('| group | is valid: valid | is valid: invalid | get errors: valid | get errors: invalid |', '|---|---|---|---|---|');
  for (const [group, keys] of groups) {
    const cells = [];
    for (const {key: metric} of METRICS)
      for (const at of PATHS) {
        const before = groupRank(live, keys, metric, at);
        const after = groupRank(pr, keys, metric, at);
        cells.push(before || after ? `${before ?? '-'} → ${after ?? '-'}` : '-');
      }
    lines.push(`| ${group} | ${cells.join(' | ')} |`);
  }
  lines.push('');

  const others = [...new Set([...pr.cases.values()].flatMap((entry) => Object.keys(entry.results ?? {})))].filter((name) => name !== MION);
  lines.push('### mion vs each library (mean speed ratio over shared cases, wins in brackets)', '');
  lines.push(`| | ${others.join(' | ')} |`, `|---|${others.map(() => '---').join('|')}|`);
  for (const {key: metric, label} of METRICS)
    for (const at of PATHS)
      for (const [side, data] of [
        ['live', live],
        ['PR', pr],
      ]) {
        const cells = others.map((name) => {
          const h = headToHead(data, name, metric, at);
          return h.ratio == null ? '-' : `${h.ratio.toFixed(2)}x (${h.wins}/${h.total})`;
        });
        lines.push(`| ${label}, ${at}, ${side} | ${cells.join(' | ')} |`);
      }
  lines.push('');

  const moves = [];
  for (const [key, entry] of pr.cases)
    for (const {key: metric, label} of METRICS)
      for (const at of PATHS) {
        const a = speed(entry, MION, metric, at);
        const b = speed(live.cases.get(key), MION, metric, at);
        if (a && b) moves.push({key, what: `${label}, ${at}`, ratio: a / b / drift, a, b});
      }
  moves.sort((x, y) => x.ratio - y.ratio);
  const row = (m) => `| ${m.key} | ${m.what} | ${(m.b / 1e6).toFixed(1)}M | ${(m.a / 1e6).toFixed(1)}M | ${m.ratio.toFixed(2)} |`;
  lines.push('<details><summary>Biggest per-case moves (mion, drift removed)</summary>', '');
  lines.push('| case | metric | live | PR | change |', '|---|---|---|---|---|');
  for (const m of [...moves.slice(0, 10), ...moves.slice(-10).reverse()]) lines.push(row(m));
  lines.push('', '</details>', '');
  return lines.join('\n');
}

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

if (process.argv[1] && process.argv[1].endsWith('pr-report.mjs')) {
  const prDir = arg('pr');
  const liveDir = arg('live');
  if (!prDir || !liveDir) {
    console.error('usage: pr-report.mjs --pr <bench-data dir> --live <bench-data dir> [--env <env.json>]');
    process.exit(2);
  }
  const envFile = arg('env');
  const env = envFile && fs.existsSync(envFile) ? JSON.parse(fs.readFileSync(envFile, 'utf8')) : null;
  process.stdout.write(renderReport(readBenchData(prDir), readBenchData(liveDir), env));
}
