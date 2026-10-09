// A `stats` fence: big-number tiles, a GitHub-style diff line and one before / after bar chart, inside the window.

export type Tile = {value: string; label: string};
export type Bar = {label: string; before: string; after: string; unit: string};
export type Diff = {added: string; removed: string; label: string};
export type Chart = {tiles: Tile[]; bars: Bar[]; diff?: Diff};

export const MAX_TILES = 4;
export const MAX_BARS = 6;
const MAX_TILE_VALUE = 12;
const MAX_LABEL = 44;

const chartError = (source: string, line: number, message: string) => new Error(`${source}: stats line ${line}: ${message}`);

const toNumber = (text: string) => Number(text.replace(/[,_\s]/g, ''));

export function parseChart(block: string, source = 'card'): Chart {
  const chart: Chart = {tiles: [], bars: []};
  block.split('\n').forEach((raw, index) => {
    const line = index + 1;
    if (!raw.trim()) return;
    const colon = raw.indexOf(':');
    const kind = colon === -1 ? '' : raw.slice(0, colon).trim();
    const parts = raw
      .slice(colon + 1)
      .split('|')
      .map((part) => part.trim());
    if (kind === 'tile') {
      const [value, label = ''] = parts;
      if (parts.length > 2 || !value || !label) throw chartError(source, line, 'use "tile: <value> | <label>"');
      if ([...value].length > MAX_TILE_VALUE)
        throw chartError(source, line, `tile value "${value}" is over ${MAX_TILE_VALUE} characters`);
      if ([...label].length > MAX_LABEL) throw chartError(source, line, `tile label is over ${MAX_LABEL} characters`);
      chart.tiles.push({value, label});
    } else if (kind === 'bar') {
      const [label, before, after, unit = ''] = parts;
      if (parts.length < 3 || parts.length > 4 || !label)
        throw chartError(source, line, 'use "bar: <label> | <before> | <after> | <unit>" (unit optional)');
      for (const value of [before, after])
        if (!value || !Number.isFinite(toNumber(value)) || toNumber(value) < 0)
          throw chartError(source, line, `"${value}" is not a number of 0 or more`);
      if (toNumber(before) === 0 && toNumber(after) === 0) throw chartError(source, line, 'before and after are both 0');
      if ([...label].length > MAX_LABEL) throw chartError(source, line, `bar label is over ${MAX_LABEL} characters`);
      chart.bars.push({label, before, after, unit});
    } else if (kind === 'diff') {
      const [added, removed, label = ''] = parts;
      if (parts.length < 2 || parts.length > 3) throw chartError(source, line, 'use "diff: <added> | <removed> | <label>"');
      for (const value of [added, removed])
        if (!Number.isInteger(toNumber(value)) || toNumber(value) < 0)
          throw chartError(source, line, `"${value}" is not a whole number of 0 or more`);
      if (chart.diff) throw chartError(source, line, 'only one diff line per card');
      if ([...label].length > MAX_LABEL) throw chartError(source, line, `diff label is over ${MAX_LABEL} characters`);
      chart.diff = {added, removed, label};
    } else {
      throw chartError(source, line, `unknown line "${raw.trim()}" (use "tile: …", "diff: …" or "bar: …")`);
    }
  });
  if (chart.tiles.length === 0 && chart.bars.length === 0 && !chart.diff) throw new Error(`${source}: the stats block is empty`);
  if (chart.tiles.length > MAX_TILES) throw new Error(`${source}: ${chart.tiles.length} tiles, the window fits ${MAX_TILES}`);
  if (chart.bars.length > MAX_BARS) throw new Error(`${source}: ${chart.bars.length} bars, the window fits ${MAX_BARS}`);
  return chart;
}

// Each bar is scaled to its own row, so rows in different units share one chart.
export function chartHtml(chart: Chart, escape: (text: string) => string): string {
  const tiles = chart.tiles.length
    ? `<div class="tiles">${chart.tiles
        .map((tile) => `<div class="tile"><b>${escape(tile.value)}</b><span>${escape(tile.label)}</span></div>`)
        .join('')}</div>`
    : '';
  const rows = chart.bars
    .map((bar) => {
      const before = toNumber(bar.before);
      const after = toNumber(bar.after);
      const top = Math.max(before, after);
      const width = (value: number) => `${Math.max((value / top) * 100, 0.8).toFixed(1)}%`;
      const change = before === 0 ? '' : Math.round(((after - before) / before) * 100);
      const delta = change === '' ? '' : `<em>${change > 0 ? '+' : ''}${change}%</em>`;
      const unit = bar.unit ? ` ${escape(bar.unit)}` : '';
      return (
        `<div class="row"><span class="label">${escape(bar.label)}</span>` +
        `<div class="track"><i class="before" style="width:${width(before)}"></i>` +
        `<i class="after" style="width:${width(after)}"></i></div>` +
        `<span class="value">${escape(bar.before)} → <strong>${escape(bar.after)}</strong>${unit}${delta}</span></div>`
      );
    })
    .join('');
  const diff = chart.diff ? diffHtml(chart.diff, escape) : '';
  const legend = '<div class="legend"><span><i class="before"></i>before</span><span><i class="after"></i>after</span></div>';
  const bars = rows ? `<div class="chart">${rows}${legend}</div>` : '';
  return `<div class="stats">${tiles}${diff}${bars}</div>`;
}

// GitHub's diffstat: +added in green, -removed in red, five squares split by share.
function diffHtml(diff: Diff, escape: (text: string) => string): string {
  const added = toNumber(diff.added);
  const removed = toNumber(diff.removed);
  const total = added + removed;
  const green = total === 0 ? 0 : Math.round((added / total) * 5);
  const squares = Array.from({length: 5}, (_, i) => {
    const kind = total === 0 ? 'none' : i < green ? 'add' : 'del';
    return `<i class="${kind}"></i>`;
  }).join('');
  const label = diff.label ? `<span class="what">${escape(diff.label)}</span>` : '';
  return (
    `<div class="diff">${label}<span class="add">+${escape(diff.added)}</span>` +
    `<span class="del">−${escape(diff.removed)}</span><span class="squares">${squares}</span></div>`
  );
}
