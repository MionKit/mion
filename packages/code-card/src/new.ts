// `miondevx card new <name>`: write a starter card into cards/ (kept in git) or tmp/ (ignored).

import {existsSync, mkdirSync, writeFileSync} from 'node:fs';
import {join, relative} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';
import {CARD_NAME, CARDS_DIR, PACKAGE_DIR, TMP_DIR} from './card.ts';

export const NEW_USAGE = 'usage: miondevx card new <name> [--tmp]';

export function parseNewArgs(argv: string[]): {name: string; tmp: boolean} {
  const {values, positionals} = parseArgs({args: argv, allowPositionals: true, options: {tmp: {type: 'boolean'}}});
  if (positionals.length !== 1) throw new Error(NEW_USAGE);
  const [name] = positionals;
  if (!CARD_NAME.test(name)) throw new Error(`card name "${name}" must be lowercase letters, digits and dashes`);
  return {name, tmp: Boolean(values.tmp)};
}

export const starterCard = () => `---
title: *Short title* in one line
subtitle: One plain sentence on what the code shows.
file: example.ts
highlight: 3
footer: One short line under the window.
badge: @mionjs/run-types
---

\`\`\`ts
import { getRunTypeId } from '@mionjs/run-types';

const id = getRunTypeId<{ name: string }>();
\`\`\`
`;

export function main(argv: string[]): void {
  const {name, tmp} = parseNewArgs(argv);
  const dir = tmp ? TMP_DIR : CARDS_DIR;
  const path = join(dir, `${name}.md`);
  if (existsSync(path)) throw new Error(`${relative(PACKAGE_DIR, path)} already exists`);
  mkdirSync(dir, {recursive: true});
  writeFileSync(path, starterCard());
  console.log(path);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    console.error(`card new: ${(err as Error).message}`);
    process.exit(1);
  }
}
