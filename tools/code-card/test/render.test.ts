import {join} from 'node:path';
import {afterAll, describe, expect, it} from 'vitest';
import {CARDS_DIR} from '../src/card.ts';
import {cardCss, closeRenderer, renderFragment, renderPage, scaleCss} from '../src/render.ts';

afterAll(() => closeRenderer());

describe('code card: render', () => {
  it('scales every px size with the card width, never rem', () => {
    expect(scaleCss('a { padding: 40px 0.5px; margin: -2px; top: 1rem }')).toBe(
      'a { padding: calc(40 * var(--u)) calc(0.5 * var(--u)); margin: calc(-2 * var(--u)); top: 1rem }'
    );
    expect(cardCss()).not.toMatch(/\d+px/);
  });

  it('the stylesheet uses site colour tokens, never the olive itself', () => {
    expect(cardCss()).toContain('var(--site-accent)');
    expect(cardCss()).not.toMatch(/#79af43|#8aa85e|#bdd09d/i);
  });

  it('renders a card file to its .code-card element only', async () => {
    const html = await renderFragment(join(CARDS_DIR, 'typed-match.vue'));
    expect(html).toMatch(/^<div class="code-card cc-kind-code"/);
    expect(html).toContain('<em>Typed match</em> coming soon to run-types');
    expect(html).not.toMatch(/<html|@font-face/);
  });

  it('the PNG page: fonts inlined, rpc theme, player, no preview controls', async () => {
    const page = await renderPage(join(CARDS_DIR, 'drizzle-type-cost.vue'), {zoom: 2});
    expect(page).toContain("font-family:'Card Inter'");
    expect(page).toContain('src:url(data:font/woff2;base64,');
    expect(page).toContain("[data-site='rpc']");
    expect(page).toContain('<div class="cc-page" data-site="rpc">');
    expect(page).toContain('zoom: 2;');
    expect(page).toContain('export function arm(');
    expect(page).not.toContain('class="cc-preview"');
  });

  it('the preview page adds play / pause / replay and the check banner', async () => {
    const page = await renderPage(join(CARDS_DIR, 'drizzle-type-cost.vue'), {preview: true});
    expect(page).toContain('<button data-do="reset">Replay</button>');
    expect(page).toContain('<div class="cc-errors"></div>');
  });
});
