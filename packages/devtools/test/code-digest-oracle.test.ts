// Oracle: TypeScript's own parser strips every non-directive comment, and the Go code digest must not move.
import {spawnSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import {describe, expect, it} from 'vitest';
// @ts-expect-error — a plain .mjs repo script, no types.
import {TOKEN_HASHED, codeDigests} from '../../../scripts/ci/lanes.mjs';
// @ts-expect-error — a plain .mjs repo script, no types.
import {CODE_DIGEST_BIN} from '../../../scripts/core/build.mjs';

const REPO_ROOT = path.resolve(__dirname, '../../..');

function commentRanges(sourceFile: ts.SourceFile): ts.CommentRange[] {
  const text = sourceFile.text;
  const ranges = new Map<number, ts.CommentRange>();
  const visit = (node: ts.Node): void => {
    const children = node.getChildren(sourceFile);
    if (children.length === 0) {
      for (const range of [
        ...(ts.getLeadingCommentRanges(text, node.pos) ?? []),
        ...(ts.getTrailingCommentRanges(text, node.end) ?? []),
      ])
        ranges.set(range.pos, range);
      return;
    }
    children.forEach(visit);
  };
  visit(sourceFile);
  return [...ranges.values()].sort((left, right) => left.pos - right.pos);
}

// A stripped comment leaves a newline when it held one, so automatic semicolons stay where they were.
function strip(file: string, text: string, markers: string[]): {stripped: string; removed: number} {
  const isJs = /\.[cm]?js$/.test(file);
  const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, isJs ? ts.ScriptKind.JS : ts.ScriptKind.TS);
  let stripped = '';
  let at = 0;
  let removed = 0;
  for (const range of commentRanges(sourceFile)) {
    const comment = text.slice(range.pos, range.end);
    const line = text.slice(
      text.lastIndexOf('\n', range.pos) + 1,
      text.indexOf('\n', range.end) === -1 ? text.length : text.indexOf('\n', range.end)
    );
    if (markers.some((marker) => line.includes(marker)) || (isJs && comment.startsWith('/**'))) continue;
    stripped += text.slice(at, range.pos) + (comment.includes('\n') ? '\n' : ' ');
    at = range.end;
    removed += 1;
  }
  return {stripped: stripped + text.slice(at), removed};
}

describe('code-digest against the TypeScript parser', () => {
  it('gives every token-hashed TS/JS file the same digest with its comments stripped', () => {
    const markers = spawnSync(CODE_DIGEST_BIN, ['--markers'], {encoding: 'utf8'}).stdout.split('\n').filter(Boolean);
    expect(markers.length, 'mion-bin/code-digest is missing: run pnpm run check:builds').toBeGreaterThan(10);
    const listed = spawnSync('git', ['ls-files'], {cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});
    const files = listed.stdout.split('\n').filter((file) => TOKEN_HASHED(file) && !file.endsWith('.go'));
    const scratch = mkdtempSync(path.join(os.tmpdir(), 'code-digest-oracle-'));
    try {
      spawnSync('git', ['init', '-q'], {cwd: scratch});
      const pairs: {file: string; original: string; stripped: string}[] = [];
      let removed = 0;
      for (const file of files) {
        const text = readFileSync(path.join(REPO_ROOT, file), 'utf8');
        const result = strip(file, text, markers);
        removed += result.removed;
        const original = path.join(scratch, 'original', file);
        const stripped = path.join(scratch, 'stripped', file);
        mkdirSync(path.dirname(original), {recursive: true});
        mkdirSync(path.dirname(stripped), {recursive: true});
        writeFileSync(original, text);
        writeFileSync(stripped, result.stripped);
        pairs.push({file, original, stripped});
      }
      expect(pairs.length).toBeGreaterThan(1000);
      const paths = pairs.flatMap((pair) => [pair.original, pair.stripped]);
      const hashed = spawnSync('git', ['hash-object', '-w', '--stdin-paths'], {
        cwd: scratch,
        input: paths.join('\n'),
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
      });
      const ids = hashed.stdout.split('\n').filter(Boolean);
      expect(ids.length).toBe(paths.length);
      const entries = pairs.flatMap((pair, at) => [
        {objectname: ids[2 * at], path: pair.file},
        {objectname: ids[2 * at + 1], path: pair.file},
      ]);
      const {mode, byKey} = codeDigests(entries, {cwd: scratch});
      expect(mode).toBe('t');
      const key = (id: string, file: string): string => `${id} ${/\.[cm]?ts$/.test(file) ? 'ts' : 'js'}`;
      // A raw fallback hides nothing but skips nothing either: every token-hashed file must digest.
      expect(pairs.filter((pair, at) => !byKey.has(key(ids[2 * at], pair.file))).map((pair) => pair.file)).toEqual([]);
      const moved = pairs.filter(
        (pair, at) => byKey.get(key(ids[2 * at], pair.file)) !== byKey.get(key(ids[2 * at + 1], pair.file))
      );
      expect(
        moved.map((pair) => pair.file),
        `${removed} comments stripped`
      ).toEqual([]);
    } finally {
      rmSync(scratch, {recursive: true, force: true});
    }
  }, 120_000);
});
