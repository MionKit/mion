import {mkdirSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {afterAll, describe, expect, it} from 'vitest';
import {TMP_DIR} from '../src/card.ts';
import {parseNewArgs, starterCard, starterSnippet} from '../src/new.ts';
import {closeRenderer, renderFragment} from '../src/render.ts';

const DIR = join(TMP_DIR, 'new-test');
afterAll(async () => {
  await closeRenderer();
  rmSync(DIR, {recursive: true, force: true});
});

describe('code card: new', () => {
  it('the starter card renders', async () => {
    mkdirSync(DIR, {recursive: true});
    writeFileSync(join(DIR, 'demo.vue'), starterCard('demo'));
    writeFileSync(join(DIR, 'demo.snippet.ts'), starterSnippet());
    const html = await renderFragment(join(DIR, 'demo.vue'));
    expect(html).toContain('<em>Short title</em> in one line');
    expect(html).toContain('getRunTypeId');
  });

  it('one name, optional --tmp', () => {
    expect(parseNewArgs(['demo'])).toEqual({name: 'demo', tmp: false});
    expect(parseNewArgs(['demo', '--tmp'])).toEqual({name: 'demo', tmp: true});
    expect(() => parseNewArgs([])).toThrow('usage: miondevx card new');
    expect(() => parseNewArgs(['Bad_Name'])).toThrow('lowercase letters');
    expect(() => parseNewArgs(['demo', '--nope'])).toThrow(/Unknown option/);
  });
});
