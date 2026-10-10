import {h} from 'vue';
import {describe, expect, it} from 'vitest';
import {component, renderCard} from './render-helpers.ts';

const frame = (children: () => unknown, props: Record<string, unknown> = {}) =>
  h(component('CardFrame'), props, {title: () => ['Plain ', h('em', 'accent')], default: children});
const sequence = (html: string) => [...html.matchAll(/--cc-i:(\d+)/g)].map((m) => Number(m[1]));

describe('code card components', () => {
  it('CardFrame: the title with its accent, subtitle, footer, badge and kind', async () => {
    const html = await renderCard(() => frame(() => null, {subtitle: 'Sub', footer: 'Foot', badge: '@mionjs/x', kind: 'stats'}));
    expect(html).toMatch(/^<div class="code-card cc-kind-stats"/);
    expect(html).toContain('Plain <em>accent</em>');
    expect(html).toContain('<div class="cc-sub" data-cc="rise"');
    expect(html).toContain('<span class="cc-badge">@mionjs/x</span>');
  });

  it('numbers the animated elements in render order', async () => {
    const tile = (value: string) => h(component('CardTile'), {value, label: value});
    const html = await renderCard(() =>
      frame(() => h(component('CardWindow'), {file: 'f.ts'}, () => h(component('CardTiles'), () => [tile('1'), tile('2')])))
    );
    expect(sequence(html)).toEqual([0, 1, 2, 3]);
  });

  it('CardBar: widths scale to the larger value, with the % change', async () => {
    const bar = (props: Record<string, unknown>) => renderCard(() => h(component('CardBar'), {label: 'L', ...props}));
    const html = await bar({before: '200', after: '50', unit: 'ms'});
    expect(html).toContain('width:100.0%');
    expect(html).toContain('width:25.0%');
    expect(html).toContain('200 → <strong>50</strong> ms<em>-75%</em>');
    expect(await bar({before: '1,000', after: '2,000'})).toContain('<em>+100%</em>');
    // no % change from zero, and a zero bar keeps a visible sliver
    const fromZero = await bar({before: 0, after: 5});
    expect(fromZero).not.toContain('<em>');
    expect(fromZero).toContain('width:0.8%');
    await expect(bar({before: 0, after: 0})).rejects.toThrow('both 0');
    await expect(bar({before: 'abc', after: 1})).rejects.toThrow(/before/);
  });

  it('CardTiles: 1 to 4 tiles, and a tile value up to 12 characters', async () => {
    const tiles = (count: number, value = '1') =>
      renderCard(() => h(component('CardTiles'), () => Array.from({length: count}, () => h(component('CardTile'), {value, label: 'x'}))));
    expect(await tiles(4)).toContain('cc-tiles cc-count-4');
    await expect(tiles(5)).rejects.toThrow('1 to 4');
    await expect(tiles(1, '1234567890123')).rejects.toThrow(/value/);
  });

  it('CardDiff: five squares in the added / removed ratio', async () => {
    const diff = (added: number, removed: number) => renderCard(() => h(component('CardDiff'), {added, removed, label: 'files'}));
    const squares = (html: string) => [...html.matchAll(/<i class="(cc-\w+)"/g)].map((m) => m[1]);
    expect(squares(await diff(3, 2))).toEqual(['cc-add', 'cc-add', 'cc-add', 'cc-del', 'cc-del']);
    expect(squares(await diff(0, 0))).toEqual(Array(5).fill('cc-none'));
    await expect(diff(1.5, 0)).rejects.toThrow(/added/);
  });

  it('CardFacts: label / value rows', async () => {
    const html = await renderCard(() => h(component('CardFacts'), () => h(component('CardFact'), {label: 'Size', value: '4 KB'})));
    expect(html).toContain('<span>Size</span><b>4 KB</b>');
  });

  it('CardCode: Shiki colours, highlighted lines, one entrance step per line', async () => {
    const code = (highlight: string) => renderCard(() => h(component('CardCode'), {code: 'const a = 1;\nconst b = 2;\nconst c = 3;', highlight}));
    const html = await code('2-3');
    expect(html).toContain('class="shiki tokyo-night"');
    expect([...html.matchAll(/class="line( hl)?"/g)].map((m) => Boolean(m[1]))).toEqual([false, true, true]);
    expect(html).toContain('--cc-sub:2');
    await expect(code('4')).rejects.toThrow('outside the code');
    await expect(code('two')).rejects.toThrow('must look like');
  });
});
