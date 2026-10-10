// In Chromium (Playwright's or MION_CARD_BROWSER): layout checks fail a bad card; the animation ends on the PNG layout.
import {existsSync, mkdirSync, rmSync, writeFileSync} from 'node:fs';
import type {AddressInfo} from 'node:net';
import {join} from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {CARDS_DIR, TMP_DIR} from '../src/card.ts';
import {closeRenderer} from '../src/render.ts';
import {createCardServer} from '../src/server.ts';
import {defaultBrowser, evalJson, main as shot, withBrowser} from '../src/shoot.ts';

const DIR = join(TMP_DIR, 'browser-test');
const card = (name: string, title: string, body: string) =>
  writeFileSync(join(DIR, `${name}.vue`), `<template><CardFrame><template #title>${title}</template>${body}</CardFrame></template>\n`);

const server = createCardServer({
  cardPaths: {
    drizzle: join(CARDS_DIR, 'drizzle-type-cost.vue'),
    wraps: join(DIR, 'wraps.vue'),
    wide: join(DIR, 'wide.vue'),
    clipped: join(DIR, 'clipped.vue'),
  },
});
let base = '';
beforeAll(async () => {
  mkdirSync(DIR, {recursive: true});
  card('wraps', 'A title long enough to need a second line on a twelve hundred pixel wide card, surely', '');
  card('wide', 'Wide code', `<CardWindow><CardCode code="const x = '${'x'.repeat(120)}';" /></CardWindow>`);
  // the value outgrows its 300px column and is cut at the window's edge
  card('clipped', 'Clipped', '<CardWindow><CardBars><CardBar label="L" before="1,234,567,890" after="2,345,678,901" unit="steps" /></CardBars></CardWindow>');
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise<void>((done) => server.close(() => done()));
  await closeRenderer();
  rmSync(DIR, {recursive: true, force: true});
});

const checksOf = (name: string) => withBrowser(`${base}/card/${name}?shot`, defaultBrowser(), (cli) => evalJson(cli, '() => window.cardChecks'));

describe('code card in Chromium', {timeout: 60_000}, () => {
  it('both real cards pass their layout checks and become PNGs', async () => {
    const out = join(DIR, 'png');
    await shot(['--all', '--out', out]);
  });

  it('fails a title on two lines, and code too wide for its window', async () => {
    expect(await checksOf('wraps')).toEqual([expect.stringContaining('wraps onto a second line: "A title long enough')]);
    expect(await checksOf('wide')).toEqual([expect.stringContaining('too wide, scrolls sideways')]);
    expect(await checksOf('clipped')).toContainEqual(expect.stringContaining('sticks out of the card'));
  });

  it('shot refuses a card failing its checks, and writes no PNG', async () => {
    const out = join(DIR, 'refused');
    await expect(shot([join(DIR, 'wraps.vue'), '--out', out])).rejects.toThrow('wraps: the layout checks failed');
    expect(existsSync(join(out, 'wraps.png'))).toBe(false);
  });

  it('armed, the bars wait at zero; played, the card ends on its final layout', async () => {
    const widths = `() => [...document.querySelectorAll('.cc-track .cc-after')].map((bar) => Math.round(bar.getBoundingClientRect().width))`;
    const result = await withBrowser(`${base}/card/drizzle?shot`, defaultBrowser(), (cli) =>
      evalJson(
        cli,
        `async () => {
          await window.cardChecks;
          const {arm, play, card} = window.cardPlayer;
          const widths = ${widths};
          const final = widths();
          arm(card);
          await new Promise((done) => requestAnimationFrame(done));
          const armed = widths();
          play(card);
          await Promise.all(document.getAnimations().map((animation) => animation.finished));
          return {final, armed, played: widths()};
        }`
      )
    );
    const {final, armed, played} = result as {final: number[]; armed: number[]; played: number[]};
    expect(final.every((width) => width > 0)).toBe(true);
    expect(armed.every((width) => width === 0)).toBe(true);
    expect(played).toEqual(final);
  });
});
