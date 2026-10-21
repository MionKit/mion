import {join} from 'node:path';
import {getFileInfo} from 'prettier';
import {afterAll, describe, expect, it} from 'vitest';
import {CARDS_DIR, PACKAGE_DIR, keptCards, resolveCardPath} from '../src/card.ts';
import {closeRenderer, renderFragment} from '../src/render.ts';

afterAll(() => closeRenderer());

describe('code card: kept cards', () => {
  // Any Prettier run would reflow the hand-laid code a card shows.
  it('Prettier leaves card files alone', async () => {
    const ignorePath = join(PACKAGE_DIR, '../../.prettierignore');
    for (const file of ['typed-match.vue', 'typed-match.snippet.ts'])
      expect((await getFileInfo(join(CARDS_DIR, file), {ignorePath})).ignored, file).toBe(true);
    expect((await getFileInfo(join(PACKAGE_DIR, 'README.md'), {ignorePath})).ignored).toBe(false);
  });

  it('every kept card renders and is found by its name', async () => {
    const cards = keptCards();
    expect(cards).toContain(join(CARDS_DIR, 'typed-match.vue'));
    for (const path of cards) {
      expect(resolveCardPath(path.slice(CARDS_DIR.length + 1, -'.vue'.length))).toBe(path);
      await expect(renderFragment(path)).resolves.toMatch(/^<div class="code-card/);
    }
  });
});
