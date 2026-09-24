// Taking the PNG needs a browser, so it is covered by hand with `miondevx card shot`.
import {readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {getFileInfo} from 'prettier';
import {beforeAll, describe, expect, it} from 'vitest';
import {
  CARDS_DIR,
  PACKAGE_DIR,
  DEFAULT_CODE_SIZE,
  DEFAULT_PADDING,
  maxColumns,
  parseCard,
  parseHighlight,
  renderCardHtml,
  resolveCardPath,
  titleHtml,
  validateCard,
} from '../src/card.ts';

const fullCard = `---
title: "*Typed match* coming soon"
subtitle: Match unknown data by type.
file: feed.ts
highlight: 2-3
footer: Just TypeScript.
badge: '@mionjs/run-types'
---

\`\`\`ts
const a = 1;
const b = 'two';
const c = <T>(value: T) => value;
\`\`\`
`;

describe('code card: parseCard', () => {
  it('reads every field, the fence language and the code', () => {
    const card = parseCard(fullCard);
    expect(card).toEqual({
      title: '*Typed match* coming soon',
      subtitle: 'Match unknown data by type.',
      file: 'feed.ts',
      footer: 'Just TypeScript.',
      badge: '@mionjs/run-types',
      lang: 'ts',
      highlight: [2, 3],
      padding: DEFAULT_PADDING,
      codeSize: DEFAULT_CODE_SIZE,
      code: "const a = 1;\nconst b = 'two';\nconst c = <T>(value: T) => value;",
    });
  });

  it('needs only a title and a code block; the language defaults to ts', () => {
    const card = parseCard('---\ntitle: Hi\n---\n```\nx;\n```\n');
    expect(card).toMatchObject({
      title: 'Hi',
      subtitle: '',
      file: '',
      footer: '',
      badge: '',
      lang: 'ts',
      highlight: [],
      code: 'x;',
    });
  });

  it('keeps a four-backtick fence open across a three-backtick line', () => {
    const card = parseCard('---\ntitle: Hi\n---\n````md\n```ts\nx;\n```\n````\n');
    expect(card.lang).toBe('md');
    expect(card.code).toBe('```ts\nx;\n```');
  });

  it.each([
    ['no title', '```ts\nx;\n```', 'missing title'],
    ['no code block', '---\ntitle: Hi\n---\ntext', 'no fenced code block'],
    ['an open fence', '---\ntitle: Hi\n---\n```ts\nx;', 'no closing fence'],
    ['an empty block', '---\ntitle: Hi\n---\n```ts\n\n```', 'code block is empty'],
    ['an open frontmatter', '---\ntitle: Hi\n```ts\nx;\n```', 'no closing ---'],
    ['a line without a colon', '---\ntitle Hi\n---\n```ts\nx;\n```', 'not "key: value"'],
    ['an unknown key', '---\ntitle: Hi\ncolour: red\n---\n```ts\nx;\n```', 'unknown key "colour"'],
    [
      'a line too wide',
      `---\ntitle: Hi\n---\n\`\`\`ts\n${'x'.repeat(maxColumns(DEFAULT_PADDING, DEFAULT_CODE_SIZE) + 1)}\n\`\`\``,
      `the window fits ${maxColumns(DEFAULT_PADDING, DEFAULT_CODE_SIZE)}`,
    ],
  ])('fails on %s', (_, markdown, message) => {
    expect(() => parseCard(markdown, 'demo.md')).toThrow(message);
    expect(() => parseCard(markdown, 'demo.md')).toThrow(/^demo\.md: /);
  });

  it('counts an emoji as one column', () => {
    expect(() =>
      parseCard(`---\ntitle: Hi\n---\n\`\`\`ts\n${'👋'.repeat(maxColumns(DEFAULT_PADDING, DEFAULT_CODE_SIZE))}\n\`\`\``)
    ).not.toThrow();
  });
});

describe('code card: parseHighlight', () => {
  it('reads single lines, ranges and lists, sorted and deduplicated', () => {
    expect(parseHighlight('', 5)).toEqual([]);
    expect(parseHighlight('3', 5)).toEqual([3]);
    expect(parseHighlight('4-5, 1, 4', 5)).toEqual([1, 4, 5]);
  });

  it.each(['0', '6', '3-2', 'a', '1-', '2..3'])('rejects "%s"', (spec) => {
    expect(() => parseHighlight(spec, 5)).toThrow(/highlight/);
  });
});

describe('code card: padding and codeSize', () => {
  const sized = (front: string, code = 'x;') => parseCard(`---\ntitle: Hi\n${front}\n---\n\`\`\`ts\n${code}\n\`\`\``);

  it('defaults to 40px padding and 22px code, which fits 80 columns', () => {
    expect(sized('')).toMatchObject({padding: 40, codeSize: 22});
    expect(maxColumns(DEFAULT_PADDING, DEFAULT_CODE_SIZE)).toBe(80);
  });

  it('reads whole px values, with or without "px"', () => {
    expect(sized('padding: 24\ncodeSize: 26px')).toMatchObject({padding: 24, codeSize: 26});
  });

  it('fits more columns with less padding or smaller code, fewer with bigger code', () => {
    expect(maxColumns(0, 22)).toBeGreaterThan(80);
    expect(maxColumns(40, 16)).toBeGreaterThan(80);
    expect(maxColumns(40, 30)).toBeLessThan(80);
    const line = 'x'.repeat(70);
    expect(() => sized('codeSize: 30', line)).toThrow('the window fits 58 (lower codeSize or padding for more)');
    expect(() => sized('codeSize: 16', 'x'.repeat(100))).not.toThrow();
  });

  it.each([
    ['padding: -1', 'from 0 to 120'],
    ['padding: 121', 'from 0 to 120'],
    ['codeSize: 11', 'from 12 to 32'],
    ['codeSize: 22.5', 'whole number'],
    ['codeSize: big', 'whole number'],
  ])('rejects %s', (front, message) => {
    expect(() => sized(front)).toThrow(message);
  });

  it('takes numbers from JSON, but not other types', () => {
    expect(validateCard({title: 'Hi', code: 'x;', padding: 10, codeSize: 18})).toMatchObject({padding: 10, codeSize: 18});
    expect(() => validateCard({title: 'Hi', code: 'x;', padding: true})).toThrow('"padding" must be a string');
    expect(() => validateCard({title: 'Hi', code: 'x;', title2: 1})).toThrow('unknown key');
  });

  it('writes both into the page', async () => {
    const html = await renderCardHtml(sized('padding: 24\ncodeSize: 26'));
    expect(html).toContain('--page-padding: 24px;');
    expect(html).toContain('--code-size: 26px;');
  });
});

describe('code card: validateCard (the JSON road)', () => {
  it('rejects a value that is not a string', () => {
    expect(() => validateCard({title: 'Hi', code: 'x;', highlight: 2})).toThrow('"highlight" must be a string');
  });
  it('rejects something that is not an object', () => {
    expect(() => validateCard(null)).toThrow('must be an object');
  });
});

describe('code card: renderCardHtml', () => {
  let html = '';
  beforeAll(async () => {
    html = await renderCardHtml(parseCard(fullCard));
  });

  it('paints the *accent* part of the title and escapes the rest', () => {
    expect(titleHtml('*a<b>* & "c"')).toBe('<span class="accent">a&lt;b&gt;</span> &amp; &quot;c&quot;');
    expect(html).toContain('<h1><span class="accent">Typed match</span> coming soon</h1>');
    expect(html).toContain('<title>Typed match coming soon</title>');
  });

  it('colours the code with Shiki and marks the highlighted lines', () => {
    expect(html).toContain('class="shiki tokyo-night"');
    const lines = [...html.matchAll(/<span class="line( hl)?">/g)].map((match) => Boolean(match[1]));
    expect(lines).toEqual([false, true, true]);
  });

  it('fills every slot and keeps the optional parts', () => {
    expect(html).not.toMatch(/\{\{\w+\}\}/);
    expect(html).toContain('<div class="sub">Match unknown data by type.</div>');
    expect(html).toContain('<span class="file">feed.ts</span>');
    expect(html).toContain('<code class="badge">@mionjs/run-types</code>');
  });

  it('drops the optional parts a card leaves out', async () => {
    const bare = await renderCardHtml(parseCard('---\ntitle: Hi\n---\n```ts\nx;\n```'));
    for (const part of ['class="sub"', 'class="file"', 'class="foot"']) expect(bare).not.toContain(part);
  });

  it('keeps a $ in the code as written', async () => {
    const dollars = await renderCardHtml(parseCard("---\ntitle: Hi\n---\n```ts\nconst s = '$& $1 $$';\n```"));
    expect(dollars).toContain('$&#x26; $1 $$');
  });

  it('zooms the page for a sharp PNG, 1x by default', async () => {
    expect(html).toContain('zoom: 1;');
    expect(await renderCardHtml(parseCard(fullCard), {zoom: 2})).toContain('zoom: 2;');
  });

  it('is self-contained: fonts inlined, no network URL', () => {
    expect(html).toContain('src:url(data:font/woff2;base64,');
    expect(html).not.toMatch(/https?:\/\//);
  });
});

describe('code card: kept cards', () => {
  // Any Prettier run would reflow the code inside a card.
  it('Prettier leaves card files alone', async () => {
    const ignorePath = join(PACKAGE_DIR, '../../.prettierignore');
    expect((await getFileInfo(join(CARDS_DIR, 'typed-match.md'), {ignorePath})).ignored).toBe(true);
    expect((await getFileInfo(join(PACKAGE_DIR, 'README.md'), {ignorePath})).ignored).toBe(false);
  });

  it('every kept card parses and is found by its name', () => {
    const names = readdirSync(CARDS_DIR)
      .filter((file) => file.endsWith('.md'))
      .map((file) => file.slice(0, -3));
    expect(names).toContain('typed-match');
    for (const name of names) {
      const path = resolveCardPath(name);
      expect(path).toBe(join(CARDS_DIR, `${name}.md`));
      expect(() => parseCard(readFileSync(path, 'utf8'), path)).not.toThrow();
    }
    expect(() => resolveCardPath('no-such-card')).toThrow('no card named "no-such-card"');
  });
});
