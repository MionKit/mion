import {describe, expect, it} from 'vitest';
import {parseCard, renderCardHtml} from '../src/card.ts';
import {MAX_BARS, MAX_FACTS, MAX_TILES, parseChart} from '../src/chart.ts';

const statsCard = `---
title: "*7× lighter* docs"
file: report
---

\`\`\`stats
tile: 7× | lighter root file
tile: 58 → 0 | files over the limit
bar: Root size | 44.1 | 6.2 | KB
bar: Over limit | 58 | 0
\`\`\`
`;

describe('code card: stats fence', () => {
  it('reads tiles and bars, and keeps no highlight', () => {
    const card = parseCard(statsCard);
    expect(card.lang).toBe('stats');
    expect(card.highlight).toEqual([]);
    expect(card.chart).toEqual({
      tiles: [
        {value: '7×', label: 'lighter root file'},
        {value: '58 → 0', label: 'files over the limit'},
      ],
      bars: [
        {label: 'Root size', before: '44.1', after: '6.2', unit: 'KB'},
        {label: 'Over limit', before: '58', after: '0', unit: ''},
      ],
      facts: [],
    });
  });

  it('leaves a code card without a chart key', () => {
    expect(parseCard('---\ntitle: Hi\n---\n```ts\nx;\n```\n')).not.toHaveProperty('chart');
  });

  it('draws tiles, bars scaled to their own row, the change and a legend instead of code', async () => {
    const html = await renderCardHtml(parseCard(statsCard));
    expect(html).toContain('<div class="tile"><b>7×</b><span>lighter root file</span></div>');
    expect(html).toContain('<i class="before" style="width:100.0%"></i><i class="after" style="width:14.1%"></i>');
    expect(html).toContain('44.1 → <strong>6.2</strong> KB<em>-86%</em>');
    // A zero after-value still shows a sliver, so the row never looks empty by mistake.
    expect(html).toContain('<i class="after" style="width:0.8%"></i>');
    expect(html).toContain('class="legend"');
    expect(html).not.toContain('class="shiki');
  });

  it('accepts a bar that grows and says so', async () => {
    const html = await renderCardHtml(parseCard('---\ntitle: Hi\n---\n```stats\nbar: Speed | 1,000 | 2,500 | ops\n```\n'));
    expect(html).toContain('<i class="before" style="width:40.0%"></i><i class="after" style="width:100.0%"></i>');
    expect(html).toContain('<em>+150%</em>');
  });

  it('escapes every text it draws', async () => {
    const html = await renderCardHtml(parseCard('---\ntitle: Hi\n---\n```stats\ntile: <b> | a & b\n```\n'));
    expect(html).toContain('<b>&lt;b&gt;</b><span>a &amp; b</span>');
  });

  it('refuses a malformed block with the line and the reason', () => {
    expect(() => parseChart('')).toThrow('the stats block is empty');
    expect(() => parseChart('pie: 1 | 2')).toThrow('stats line 1: unknown line "pie: 1 | 2"');
    expect(() => parseChart('tile: 7×')).toThrow('stats line 1: use "tile: <value> | <label>"');
    expect(() => parseChart('tile: 1234567890123 | x')).toThrow('is over 12 characters');
    expect(() => parseChart('bar: x | 1')).toThrow('use "bar: <label> | <before> | <after> | <unit>"');
    expect(() => parseChart('bar: x | lots | 2')).toThrow('"lots" is not a number of 0 or more');
    expect(() => parseChart('bar: x | -1 | 2')).toThrow('"-1" is not a number of 0 or more');
    expect(() => parseChart('bar: x | 0 | 0')).toThrow('before and after are both 0');
    expect(() => parseChart(Array(MAX_TILES + 1).fill('tile: 1 | x').join('\n'))).toThrow(`the window fits ${MAX_TILES}`);
    expect(() => parseChart(Array(MAX_BARS + 1).fill('bar: x | 1 | 2').join('\n'))).toThrow(`the window fits ${MAX_BARS}`);
  });

  it('draws a GitHub-style diff line: green added, red removed, five squares split by share', async () => {
    const card = parseCard('---\ntitle: Hi\n---\n```stats\ndiff: 6,533 | 7,289 | 158 files changed\n```\n');
    expect(card.chart?.diff).toEqual({added: '6,533', removed: '7,289', label: '158 files changed'});
    const html = await renderCardHtml(card);
    expect(html).toContain('<span class="what">158 files changed</span><span class="add">+6,533</span>');
    expect(html).toContain('<span class="del">−7,289</span>');
    expect(html).toContain(
      '<span class="squares"><i class="add"></i><i class="add"></i><i class="del"></i><i class="del"></i><i class="del"></i></span>'
    );
  });

  it('refuses a bad diff line', () => {
    expect(() => parseChart('diff: 1')).toThrow('use "diff: <added> | <removed> | <label>"');
    expect(() => parseChart('diff: 1.5 | 2')).toThrow('"1.5" is not a whole number of 0 or more');
    expect(() => parseChart('diff: 1 | 2\ndiff: 3 | 4')).toThrow('stats line 2: only one diff line per card');
  });

  it('groups facts into one list and sizes four tiles as a 2x2 grid', async () => {
    const card = parseCard(
      '---\ntitle: Hi\n---\n```stats\ntile: 1 | a\ntile: 2 | b\ntile: 3 | c\ntile: 4 | d\nfact: Root file | 307 → 89 lines\n```\n'
    );
    expect(card.chart?.facts).toEqual([{label: 'Root file', value: '307 → 89 lines'}]);
    const html = await renderCardHtml(card);
    expect(html).toContain('<div class="tiles count-4">');
    expect(html).toContain('<div class="fact"><span>Root file</span><b>307 → 89 lines</b></div>');
    expect(html).toContain('<body class="stats-card">');
    expect(() => parseChart('fact: only label')).toThrow('use "fact: <label> | <value>"');
    expect(() => parseChart(Array(MAX_FACTS + 1).fill('fact: a | b').join('\n'))).toThrow(`the window fits ${MAX_FACTS}`);
  });

    it('refuses a highlight on a stats card', () => {
    expect(() => parseCard('---\ntitle: Hi\nhighlight: 1\n---\n```stats\ntile: 1 | x\n```\n')).toThrow(
      'highlight does not apply to a stats block'
    );
  });
});
