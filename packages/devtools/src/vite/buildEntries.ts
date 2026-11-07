/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {execFileSync} from 'child_process';
import {relative, resolve, sep} from 'path';
import {getExePath} from '@mionjs/bin-compiler';

/** Rollup lib entries derived from the package's OWN build tsconfig: its include/exclude decide what ships.
 *  Point vite-plugin-dts (tsconfigPath) and the mion plugin (tsConfig) at the same file, so all
 *  three lanes agree on one list. `tsconfigFile` is resolved against packageDir. */
export function collectBuildEntries(packageDir: string, tsconfigFile = 'tsconfig.build.json'): Record<string, string> {
  const configPath = resolve(packageDir, tsconfigFile);
  // Importing the Vite plugin must never load TypeScript's JS API
  let listed: string;
  try {
    listed = execFileSync(getExePath(), ['compile', '--list-files-only', '--cwd', packageDir, '--tsconfig', configPath], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const stderr = ((error as {stderr?: string}).stderr ?? '').trim();
    throw new Error(`[collectBuildEntries] could not parse ${configPath}: ${stderr || (error as Error).message}`);
  }
  const entries: Record<string, string> = {};
  for (const fileName of listed.split('\n').filter(Boolean)) {
    if (!fileName.endsWith('.ts') || fileName.endsWith('.d.ts')) continue;
    const relativePath = relative(packageDir, fileName).split(sep).join('/');
    if (relativePath.startsWith('..')) continue; // ambient files outside the package
    entries[relativePath.replace(/\.ts$/, '')] = fileName;
  }
  if (Object.keys(entries).length === 0) {
    throw new Error(`[collectBuildEntries] ${configPath} matched no TypeScript files — check its include/exclude.`);
  }
  return entries;
}
