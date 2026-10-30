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
    expect(sequence(html)).toEqual([0, 1, 2]);
  });

  it('CardWindow: the frame never animates, so the block shows before its content plays', async () => {
    const html = await renderCard(() => frame(() => h(component('CardWindow'), {file: 'f.ts'}, () => null)));
    expect(html).toContain('<div class="cc-win"><div class="cc-bar">');
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

  it('CardLanes + CardLane: one beat per name, step, run, hit and result; a stopped lane bounces, shakes and dims', async () => {
    const steps = [{label: 'type', value: 'type User'}];
    const lane = (props: Record<string, unknown>) => h(component('CardLane'), {label: 'L', steps, result: 'R', ...props});
    const lanes = (...children: ReturnType<typeof h>[]) => renderCard(() => frame(() => h(component('CardLanes'), {gate: 'AOT compiler'}, () => children)));
    const html = await lanes(lane({stopped: true}), lane({packet: 'isUser'}));
    // title, gate, then per lane: name, 1 step, run, hit, result
    expect([...new Set(sequence(html))].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    for (const motion of ['bounce', 'shake', 'dim', 'stamp', 'travel']) expect(html).toContain(`data-cc="${motion}"`);
    expect([...html.matchAll(/data-cc="(bounce|travel)"/g)].map((match) => match[1])).toEqual(['bounce', 'travel']);
    await expect(lanes(lane({steps: []}))).rejects.toThrow('1 to 3 steps, got 0');
    await expect(lanes(lane({steps: [{label: 'x', value: ' '}]}))).rejects.toThrow('a label and a value');
    await expect(lanes(lane({packet: '123456789'}))).rejects.toThrow('over 8 characters');
    await expect(renderCard(() => lane({}))).rejects.toThrow('inside a CardLanes');
    await expect(renderCard(() => h(component('CardLanes'), {gate: ' '}))).rejects.toThrow('needs a name');
  });

  it('CardBatchCompile: a build scene then a run scene in a CardLoop, beats timed by --cc-at', async () => {
    const props = {code: ['batch([a, b]).call();'], id: 'b_1', routes: ['a', 'b'], mapper: '(x) => x', result: '[[a], [b]]'};
    const scene = (more: Record<string, unknown>) => renderCard(() => h(component('CardBatchCompile'), {...props, ...more}));
    const build = await scene({scene: 'build'});
    expect(build).toContain('<b class="cc-bc-now">1 · Build time</b>');
    expect(build).toContain('a → b');
    expect([...build.matchAll(/data-cc-at="travel"/g)]).toHaveLength(1);
    const run = await scene({scene: 'run'});
    expect(run).toContain('<b class="cc-bc-now">2 · Run time</b>');
    expect(run).toContain('POST /mion-batch?id=b_1');
    expect(run).toContain('2 routes + mapper');
    // the id goes over, the answer comes back
    expect([...run.matchAll(/data-cc-at="travel"/g)]).toHaveLength(2);
    expect(await scene({scene: 'run', routes: ['a']})).toContain('a + mapper');
    await expect(scene({scene: 'later'})).rejects.toThrow('scene is build or run');
    await expect(scene({scene: 'build', code: []})).rejects.toThrow('1 to 4 lines, got 0');
    await expect(scene({scene: 'build', code: ['', ' ']})).rejects.toThrow('the code is empty');
    for (const id of ['123456789', 'b 1', ''])
      await expect(scene({scene: 'build', id}), id).rejects.toThrow('1 to 8 characters, no spaces');
    for (const routes of [[], ['a', ' ']])
      await expect(scene({scene: 'build', routes}), String(routes)).rejects.toThrow('needs routes, each with a name');
    await expect(scene({scene: 'build', mapper: ' '})).rejects.toThrow('needs a mapper');
  });

  it('CardFrame kind mini: a plain panel, refusing a footer or badge', async () => {
    expect(await renderCard(() => frame(() => null, {kind: 'mini'}))).toMatch(/^<div class="code-card cc-kind-mini"/);
    await expect(renderCard(() => frame(() => null, {kind: 'mini', footer: 'Foot'}))).rejects.toThrow('no footer or badge');
  });

  it('CardLoop + CardRoundTrip: items stacked with their index, the still frame in the still item, beats timed by --cc-at', async () => {
    const values = [
      {type: 'Set<string>', wire: '["a"]', lost: 'empty {}'},
      {type: 'Date', wire: '"2024-02-02T02:02:02.000Z"'},
    ];
    const loop = (props: Record<string, unknown>) =>
      renderCard(() => frame(() => h(component('CardLoop'), props, {default: ({item}: {item: object}) => h(component('CardRoundTrip'), item)})));
    const html = await loop({items: values, hold: '3s', still: 1});
    // the loop takes one entrance step after the title
    expect(sequence(html)).toEqual([0, 1]);
    expect(html).toContain('--cc-loop-n:2;--cc-loop-hold:3s;--cc-loop-t:0.95;');
    expect([...html.matchAll(/--cc-loop-i:(\d+)/g)].map((match) => Number(match[1]))).toEqual([0, 1]);
    expect(html).toContain('<b>✓</b>Set&lt;string&gt;');
    // the second value has no `lost`, so no plain-JSON line
    expect([...html.matchAll(/class="cc-rt-lost"/g)]).toHaveLength(1);
    expect(html).toContain('data-cc-at="grow" style="--cc-at:0.04;--cc-until:0.4;"');
    await expect(loop({items: values.slice(0, 1)})).rejects.toThrow('2 to 8 items, got 1');
    await expect(loop({items: values, still: 2})).rejects.toThrow('still 2 is not an item index');
    await expect(renderCard(() => h(component('CardRoundTrip'), {type: 'Date', wire: ' '}))).rejects.toThrow('needs a wire');
  });

  it('CardValidationCall: call, client check, server check, typed result; a stopped call ends the track at the client', async () => {
    const call = (props: Record<string, unknown>) =>
      renderCard(() => h(component('CardValidationCall'), {call: 'getUser(1)', client: 'valid', server: 'route runs', ...props}));
    const passed = await call({result: 'User'});
    expect(passed).toContain('<b>✓</b>valid');
    expect(passed).toContain('data-cc-at="grow" style="--cc-at:0.04;--cc-until:0.4;"');
    expect(passed).toContain('class="cc-vc-result"');
    const stopped = await call({stopped: true, client: 'validation-error', server: 'no request sent'});
    expect(stopped).toContain('cc-vc-stopped');
    expect(stopped).toContain('<b>✕</b>validation-error');
    expect(stopped).toContain('--cc-at:0.04;--cc-until:0.22;');
    expect(stopped).not.toContain('cc-vc-result');
    await expect(call({stopped: true, result: 'User'})).rejects.toThrow('has no result');
    await expect(call({server: ' '})).rejects.toThrow('needs a server');
  });
});
