/// <reference types="vite/client" />
import {basename} from 'node:path';
import {type Component, createSSRApp, h} from 'vue';
import {describe, expect, it} from 'vitest';
import {renderStrict} from '../src/render.ts';

// Renders components the way `card` does, without a file: a bad prop or a Vue warning throws.
const modules = import.meta.glob<{default: Component}>('../components/*.vue', {eager: true});
const component = (name: string) => modules[`../components/${name}.vue`].default;
function renderCard(render: () => ReturnType<typeof h>): Promise<string> {
  const app = createSSRApp({render});
  for (const [path, module] of Object.entries(modules)) app.component(basename(path, '.vue'), module.default);
  return renderStrict(app, 'test card');
}

const frame = (children: () => unknown, props: Record<string, unknown> = {}) =>
  h(component('CardFrame'), props, {title: () => ['Plain ', h('em', 'accent')], default: children});
const sequence = (html: string) => [...html.matchAll(/--cc-i:(\d+)/g)].map((match) => Number(match[1]));

describe('code card components', () => {
  it('CardFrame: the title with its accent, subtitle, footer, badge and kind', async () => {
    const html = await renderCard(() => frame(() => null, {subtitle: 'Sub', footer: 'Foot', badge: '@mionjs/x', kind: 'stats'}));
    expect(html).toMatch(/^<div class="code-card cc-kind-stats"/);
    expect(html).toContain('Plain <em>accent</em>');
    expect(html).toContain('<div class="cc-sub" data-cc="rise"');
    expect(html).toContain('<span class="cc-badge">@mionjs/x</span>');
  });

  it('CardFrame: step and speed set the entrance timing, left out when unset', async () => {
    expect(await renderCard(() => frame(() => null, {step: '0.2s', speed: '1s'}))).toContain('style="--cc-step:0.2s;--cc-speed:1s;"');
    expect(await renderCard(() => frame(() => null))).not.toContain('--cc-step');
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
    for (const before of ['abc', '', '  ', '-1']) await expect(bar({before, after: 1}), before).rejects.toThrow(/before/);
  });

  it('CardTiles: 1 to 4 tiles, and a tile value up to 12 characters, an emoji counting once', async () => {
    const tiles = (count: number, value = '1') =>
      renderCard(() => h(component('CardTiles'), () => Array.from({length: count}, () => h(component('CardTile'), {value, label: 'x'}))));
    expect(await tiles(4)).toContain('cc-tiles cc-count-4');
    await expect(tiles(5)).rejects.toThrow('1 to 4');
    await expect(renderCard(() => h(component('CardTiles')))).rejects.toThrow('got 0');
    await expect(tiles(1, '1234567890123')).rejects.toThrow(/value/);
    expect(await tiles(1, '12345678901🚀')).toContain('12345678901🚀');
  });

  it('CardDiff: five squares in the added / removed ratio', async () => {
    const diff = (added: number | string, removed: number) => renderCard(() => h(component('CardDiff'), {added, removed, label: 'files'}));
    const squares = (html: string) => [...html.matchAll(/<i class="(cc-\w+)"/g)].map((match) => match[1]);
    expect(squares(await diff(3, 2))).toEqual(['cc-add', 'cc-add', 'cc-add', 'cc-del', 'cc-del']);
    expect(squares(await diff(0, 0))).toEqual(Array(5).fill('cc-none'));
    await expect(diff(1.5, 0)).rejects.toThrow(/added/);
    await expect(diff('', 0)).rejects.toThrow(/added/);
  });

  it('CardFacts: label / value rows', async () => {
    const html = await renderCard(() => h(component('CardFacts'), () => h(component('CardFact'), {label: 'Size', value: '4 KB'})));
    expect(html).toContain('<span>Size</span><b>4 KB</b>');
  });

  it('CardCode: Shiki colours, highlighted lines, one entrance step per line', async () => {
    const code = (highlight: string, text = 'const a = 1;\nconst b = 2;\nconst c = 3;') =>
      renderCard(() => h(component('CardCode'), {code: text, highlight}));
    const html = await code('2-3');
    expect(html).toContain('class="shiki tokyo-night"');
    expect([...html.matchAll(/class="line( hl)?"/g)].map((match) => Boolean(match[1]))).toEqual([false, true, true]);
    expect(html).toContain('--cc-sub:2');
    expect([...(await code('3, 1, 3')).matchAll(/class="line hl"/g)]).toHaveLength(2);
    for (const bad of ['4', '0', '3-2']) await expect(code(bad), bad).rejects.toThrow('outside the code');
    for (const bad of ['two', '1-', '2..3']) await expect(code(bad), bad).rejects.toThrow('must look like');
    await expect(code('', '  \n')).rejects.toThrow('the code is empty');
  });
});
