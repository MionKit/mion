// The manifest of code cards exported to the website: each card's source files and their hash. `pnpm miondevx
// card export` writes it; check-tree rehashes it, so a card edited without a re-export fails CI.
import {createHash} from 'node:crypto';
import {existsSync, readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';

export const CARDS_EXPORT_DIR = 'container/website/app/data/cards';
export const CARD_MANIFEST = `${CARDS_EXPORT_DIR}/manifest.json`;

/** One hash over the repo-relative `sources`: path and content of each, in sorted order. */
export function hashSources(root, sources) {
  const hash = createHash('sha256');
  for (const source of [...sources].sort()) hash.update(`${source}\0`).update(readFileSync(join(root, source))).update('\0');
  return hash.digest('hex');
}

/** What is out of date between the exported cards and their sources, one line each; [] when all match. */
export function staleCards(root) {
  const dir = join(root, CARDS_EXPORT_DIR);
  const fragments = existsSync(dir) ? readdirSync(dir).filter((file) => file.endsWith('.html')) : [];
  const manifest = existsSync(join(root, CARD_MANIFEST)) ? JSON.parse(readFileSync(join(root, CARD_MANIFEST), 'utf8')) : {};
  const stale = [];
  for (const file of fragments)
    if (!manifest[file.slice(0, -'.html'.length)]) stale.push(`${CARDS_EXPORT_DIR}/${file}: not in ${CARD_MANIFEST}`);
  for (const [name, {hash, sources}] of Object.entries(manifest)) {
    if (!existsSync(join(dir, `${name}.html`))) stale.push(`${name}: ${CARDS_EXPORT_DIR}/${name}.html is missing`);
    const missing = sources.filter((source) => !existsSync(join(root, source)));
    if (missing.length) stale.push(`${name}: its source ${missing.join(', ')} is gone`);
    else if (hashSources(root, sources) !== hash) stale.push(`${name}: its sources changed since the last export`);
  }
  return stale;
}
