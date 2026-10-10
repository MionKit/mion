// The PNG route needs a browser, so it is covered by hand with `miondevx card serve`.
import type {AddressInfo} from 'node:net';
import {join} from 'node:path';
import {afterAll, afterEach, beforeAll, describe, expect, it, vi} from 'vitest';
import {CARDS_DIR} from '../src/card.ts';
import {closeRenderer} from '../src/render.ts';
import {DEFAULT_PORT, createCardServer, parseServeArgs} from '../src/server.ts';

describe('code card: serve flags', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('--port and --browser', () => {
    vi.stubEnv('MION_CARD_BROWSER', '');
    expect(parseServeArgs([])).toEqual({port: DEFAULT_PORT, browser: undefined});
    expect(parseServeArgs(['--port', '5000', '--browser', '/bin/chrome'])).toEqual({port: 5000, browser: '/bin/chrome'});
    expect(() => parseServeArgs(['--port', 'x'])).toThrow('--port must be a number');
    expect(() => parseServeArgs(['extra'])).toThrow(/positional/);
  });
});

describe('code card: preview server', () => {
  const server = createCardServer({cardPaths: {'card-0': join(CARDS_DIR, 'typed-match.vue')}});
  let base = '';
  beforeAll(async () => {
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await new Promise<void>((done) => server.close(() => done()));
    await closeRenderer();
  });

  it('lists the kept cards with preview and download links', async () => {
    const page = await (await fetch(`${base}/`)).text();
    expect(page).toContain('<a href="/card/typed-match">typed-match</a>');
    expect(page).toContain('<a href="/card/typed-match.png" download>');
  });

  it('renders a card page with the play / pause / replay preview, and the plain page on ?shot', async () => {
    const response = await fetch(`${base}/card/typed-match`);
    expect(response.status).toBe(200);
    const page = await response.text();
    expect(page).toContain('<em>Typed match</em>');
    expect(page).toContain('<button data-do="play">Play</button>');
    expect(await (await fetch(`${base}/card/typed-match?shot`)).text()).not.toContain('class="cc-preview"');
  });

  it('zooms a page on ?zoom= and refuses a zoom out of range', async () => {
    expect(await (await fetch(`${base}/card/typed-match?zoom=2`)).text()).toContain('zoom: 2;');
    const bad = await fetch(`${base}/card/typed-match?zoom=9`);
    expect(bad.status).toBe(400);
    expect(await bad.text()).toContain('zoom must be a number');
  });

  it('serves a card by the id the shot command gave it, wherever the file lives', async () => {
    expect(await (await fetch(`${base}/card/card-0`)).text()).toContain('<em>Typed match</em>');
  });

  it('names a missing card', async () => {
    const response = await fetch(`${base}/card/no-such-card`);
    expect(response.status).toBe(400);
    expect(await response.text()).toContain('no card named "no-such-card"');
  });

  it('answers 404 for a path that is not a card name', async () => {
    for (const path of ['/card/..%2Fcard', '/card/Bad_Name', '/nope'])
      expect((await fetch(`${base}${path}`)).status, path).toBe(404);
  });
});
