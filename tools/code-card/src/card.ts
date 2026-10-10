// Where cards live and how a card name maps to its `.vue` file.

import {existsSync, readdirSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const PACKAGE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
export const REPO_DIR = join(PACKAGE_DIR, '..', '..');
export const CARDS_DIR = join(PACKAGE_DIR, 'cards');
export const TMP_DIR = join(PACKAGE_DIR, 'tmp');
export const COMPONENTS_DIR = join(PACKAGE_DIR, 'components');
export const PAGE_WIDTH = 1200;
export const CARD_NAME = /^[a-z0-9][a-z0-9-]*$/;

export const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Every card kept in git, as paths. */
export const keptCards = () =>
  readdirSync(CARDS_DIR)
    .filter((file) => file.endsWith('.vue'))
    .map((file) => join(CARDS_DIR, file));

export function resolveCardPath(nameOrPath: string): string {
  if (nameOrPath.endsWith('.vue') || nameOrPath.includes('/')) {
    const path = resolve(nameOrPath);
    if (!existsSync(path)) throw new Error(`no card file at ${path}`);
    return path;
  }
  for (const dir of [CARDS_DIR, TMP_DIR]) {
    const path = join(dir, `${nameOrPath}.vue`);
    if (existsSync(path)) return path;
  }
  throw new Error(`no card named "${nameOrPath}" in tools/code-card/cards/ or tools/code-card/tmp/`);
}
