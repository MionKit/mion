// `miondevx card new <name>`: write a starter code card + its snippet into cards/ (kept in git) or tmp/ (ignored).

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

export const starterCard = (name: string) => `<script setup lang="ts">
import code from './${name}.snippet.ts?raw';
</script>

<template>
  <CardFrame subtitle="One plain sentence on what the code shows." footer="One short line under the window." badge="@mionjs/run-types">
    <template #title><em>Short title</em> in one line</template>
    <CardWindow file="example.ts">
      <CardCode :code="code" highlight="3" />
    </CardWindow>
  </CardFrame>
</template>
`;

export const starterSnippet = () => `import {getRunTypeId} from '@mionjs/run-types';

const id = getRunTypeId<{name: string}>();
`;

export function main(argv: string[]): void {
  const {name, tmp} = parseNewArgs(argv);
  const dir = tmp ? TMP_DIR : CARDS_DIR;
  const path = join(dir, `${name}.vue`);
  const snippet = join(dir, `${name}.snippet.ts`);
  for (const file of [path, snippet]) if (existsSync(file)) throw new Error(`${relative(PACKAGE_DIR, file)} already exists`);
  mkdirSync(dir, {recursive: true});
  writeFileSync(path, starterCard(name));
  writeFileSync(snippet, starterSnippet());
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
