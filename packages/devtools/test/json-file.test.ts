// The version bump rewrites every workspace package.json. Some use four-space
// indent, so a fixed two-space writer turned a one-line bump into whole-file diffs.
//
// Lives in this package for the same reason as drizzle-version-line.test.ts:
// scripts/ has no vitest project of its own.
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
// @ts-expect-error — plain .mjs release helper, no types
import {detectIndent, writeJsonKeepingIndent} from '../../../scripts/lib/json-file.mjs';

const dirs: string[] = [];
const scratch = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'json-file-'));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, {recursive: true, force: true});
});

describe('writeJsonKeepingIndent', () => {
  it.each([
    ['two spaces', '  '],
    ['four spaces', '    '],
    ['tabs', '\t'],
  ])('keeps a file indented with %s, changing only the edited line', (_, indent) => {
    const file = join(scratch(), 'package.json');
    const before = JSON.stringify({name: 'x', version: '0.12.2', scripts: {test: 'vitest'}}, null, indent) + '\n';
    writeFileSync(file, before);
    writeJsonKeepingIndent(file, {...JSON.parse(before), version: '0.13.0'});
    expect(readFileSync(file, 'utf8')).toBe(before.replace('"0.12.2"', '"0.13.0"'));
  });

  it('falls back to two spaces for a file with no indented key', () => {
    expect(detectIndent('{"version":"0.12.2"}\n')).toBe('  ');
  });
});
