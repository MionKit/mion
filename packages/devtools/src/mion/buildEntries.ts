/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {relative, resolve, sep} from 'path';
import ts from 'typescript';

/** Rollup lib entries for a package build, derived from the package's OWN build
 *  tsconfig — nothing is hardcoded here. The tsconfig's include/exclude decide
 *  what ships: every TypeScript file in the parsed program becomes an entry
 *  (declaration files are skipped — they cannot be bundle entries). The same
 *  tsconfig should drive vite-plugin-dts (tsconfigPath) and, where present, the
 *  runtypes plugin (runTypes.tsConfig), so all three lanes agree on one list.
 *  `tsconfigFile` is resolved against packageDir (default: tsconfig.build.json). */
export function collectBuildEntries(packageDir: string, tsconfigFile = 'tsconfig.build.json'): Record<string, string> {
  const configPath = resolve(packageDir, tsconfigFile);
  const host: ts.ParseConfigFileHost = {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
      throw new Error(`[collectBuildEntries] ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`);
    },
  };
  const parsed = ts.getParsedCommandLineOfConfigFile(configPath, undefined, host);
  if (!parsed) throw new Error(`[collectBuildEntries] could not parse ${configPath}`);
  const entries: Record<string, string> = {};
  for (const fileName of parsed.fileNames) {
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
