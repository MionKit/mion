// The TypeScript floor notice.
//
// package.json declares `typescript: ">=6.0.0"` as an OPTIONAL peer. Optional is
// the honest shape: the resolver carries its own compiler (the bundled tsgo) and
// never loads the consumer's, so a project with no TypeScript installed at all
// still builds. What an older copy can do is write a tsconfig the resolver reads
// differently than the editor does, which is worth saying once and no more.
//
// So the rule these tests pin is: warn, never throw, never fail a build.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {beforeEach, describe, expect, it} from 'vitest';
import {
  installedTypeScriptVersion,
  resetTypeScriptFloorCheckForTest,
  TYPESCRIPT_FLOOR_MAJOR,
  warnBelowTypeScriptFloor,
} from '../src/core/typescript-floor.ts';

// A throwaway project whose node_modules holds one typescript at `version`, or
// none at all when version is undefined.
function projectWithTypeScript(version?: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-ts-floor-'));
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({name: 'consumer', version: '0.0.0'}));
  if (version !== undefined) {
    const installed = path.join(dir, 'node_modules', 'typescript');
    fs.mkdirSync(installed, {recursive: true});
    fs.writeFileSync(
      path.join(installed, 'package.json'),
      JSON.stringify({name: 'typescript', version, main: './lib/typescript.js'})
    );
  }
  return dir;
}

describe('the TypeScript floor notice', () => {
  beforeEach(resetTypeScriptFloorCheckForTest);

  it('reads the version from the consumer project, not from whatever sits beside the plugin', () => {
    expect(installedTypeScriptVersion(projectWithTypeScript('5.9.2'))).toBe('5.9.2');
  });

  it('warns once when the installed TypeScript is below the floor', () => {
    const lines: string[] = [];
    const dir = projectWithTypeScript(`${TYPESCRIPT_FLOOR_MAJOR - 1}.9.2`);
    warnBelowTypeScriptFloor(dir, '@mionjs/devtools', (line) => lines.push(String(line)));
    warnBelowTypeScriptFloor(dir, '@mionjs/devtools', (line) => lines.push(String(line)));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain(`${TYPESCRIPT_FLOOR_MAJOR - 1}.9.2`);
    expect(lines[0]).toContain(`${TYPESCRIPT_FLOOR_MAJOR}.0.0`);
  });

  it.each([
    ['at the floor', `${TYPESCRIPT_FLOOR_MAJOR}.0.0`],
    ['above the floor', `${TYPESCRIPT_FLOOR_MAJOR + 1}.2.0`],
    ['not installed at all', undefined],
  ])('stays quiet when TypeScript is %s', (_label, version) => {
    const lines: string[] = [];
    warnBelowTypeScriptFloor(projectWithTypeScript(version), '@mionjs/devtools', (line) => lines.push(String(line)));
    expect(lines).toEqual([]);
  });

  // The floor is advisory, so nothing here may throw — a build must survive a
  // cwd that does not exist and a manifest that is not readable.
  it('never throws, whatever it finds', () => {
    const broken = projectWithTypeScript('5.0.0');
    fs.writeFileSync(path.join(broken, 'node_modules', 'typescript', 'package.json'), 'not json');
    expect(() => warnBelowTypeScriptFloor(broken, '@mionjs/devtools', () => {})).not.toThrow();
    resetTypeScriptFloorCheckForTest();
    expect(() =>
      warnBelowTypeScriptFloor(path.join(os.tmpdir(), 'rt-ts-floor-missing'), '@mionjs/devtools', () => {})
    ).not.toThrow();
  });
});
