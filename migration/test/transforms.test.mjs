// The package MAP and the token rewrite. This is the write path, so it is tested against
// a fake targets table rather than the real one: the assertions stay stable whatever the
// naming decision ends up being.

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rewriteToken, rewriteMapped, OUT_OF_PHASE, detectCase, applyCase} from '../lib/transforms.mjs';

const TARGETS = {
  packages: {
    '@ts-runtypes/core': '@mionjs/run-types',
    '@ts-runtypes/devtools': null,
    '@ts-runtypes/bin': null,
    '@ts-runtypes/go-be-sidecar': null,
  },
  pkgDir: ['run', 'types'],
  envPrefix: ['mion', 'rt'],
  repoUrl: ['mionkit', 'mion'],
};

test('the mapped package is rewritten, subpath and surroundings preserved', () => {
  assert.equal(rewriteMapped('@ts-runtypes/core', TARGETS), '@mionjs/run-types');
  assert.equal(rewriteMapped('@ts-runtypes/core/formats', TARGETS), '@mionjs/run-types/formats');
  assert.equal(rewriteMapped('@ts-runtypes/core/builders', TARGETS), '@mionjs/run-types/builders');
  assert.equal(
    rewriteMapped('node_modules/@ts-runtypes/core/package.json', TARGETS),
    'node_modules/@mionjs/run-types/package.json'
  );
});

test('a package mapped to null is OUT OF PHASE, never half-renamed', () => {
  // The whole point of phasing: devtools is folded into @mionjs/devtools later, so phase
  // 1 must leave every one of its specifiers completely untouched.
  for (const token of [
    '@ts-runtypes/devtools',
    '@ts-runtypes/devtools/vite',
    '@ts-runtypes/devtools/rollup',
    '@ts-runtypes/bin',
    '@ts-runtypes/go-be-sidecar',
  ]) {
    assert.equal(rewriteMapped(token, TARGETS), OUT_OF_PHASE, `${token} must be out of phase`);
  }
});

test('the bare scope has no unambiguous target, so it waits for a later phase', () => {
  assert.equal(rewriteMapped('@ts-runtypes', TARGETS), OUT_OF_PHASE);
  assert.equal(rewriteMapped('@ts-runtypes/', TARGETS), OUT_OF_PHASE);
  assert.equal(rewriteMapped("'@ts-runtypes/*'", TARGETS), OUT_OF_PHASE);
});

test('an unmapped package STOPS the run rather than guessing', () => {
  // A new @ts-runtypes/* package that nobody decided about must not slip through silently.
  assert.throws(() => rewriteMapped('@ts-runtypes/brand-new', TARGETS), /no entry in targets\.packages/);
});

test('a key that is a PREFIX of another package name never matches mid-name', () => {
  // The real trap: `@ts-runtypes/bin` is a prefix of `@ts-runtypes/binary-linux-x64`.
  // Without a boundary check the binary packages would be rewritten to
  // `@mionjs/xary-linux-x64`, corrupting every per-platform package name.
  const targets = {packages: {'@ts-runtypes/bin': '@mionjs/rt-bin'}};
  assert.equal(rewriteMapped('@ts-runtypes/bin', targets), '@mionjs/rt-bin');
  assert.throws(
    () => rewriteMapped('@ts-runtypes/binary-linux-x64', targets),
    /no entry in targets\.packages/,
    'binary-linux-x64 is a DIFFERENT package and must not be matched by the bin key'
  );
});

test('a boundary is a non-name char, so subpaths still match', () => {
  const targets = {packages: {'@ts-runtypes/core': '@mionjs/run-types'}};
  assert.equal(rewriteMapped('@ts-runtypes/core/formats', targets), '@mionjs/run-types/formats');
  assert.equal(rewriteMapped("'@ts-runtypes/core'", targets), "'@mionjs/run-types'");
  assert.equal(rewriteMapped('@ts-runtypes/core"', targets), '@mionjs/run-types"');
  // Real tokens from this tree: prose hyphenation, a sentence-ending period, a glob.
  assert.equal(rewriteMapped('@ts-runtypes/core-owned', targets), '@mionjs/run-types-owned');
  assert.equal(rewriteMapped('@ts-runtypes/core.', targets), '@mionjs/run-types.');
  assert.equal(rewriteMapped('@ts-runtypes/core*', targets), '@mionjs/run-types*');
});

test('the bare scope and its globs wait for a later phase', () => {
  const targets = {packages: {'@ts-runtypes/core': '@mionjs/run-types'}};
  for (const token of ['@ts-runtypes', '@ts-runtypes/', "'@ts-runtypes/*'", 'node_modules/@ts-runtypes']) {
    assert.equal(rewriteMapped(token, targets), OUT_OF_PHASE, `${token} must wait`);
  }
});

test('longest key wins, so a prefix key cannot steal a longer package name', () => {
  const targets = {packages: {'@ts-runtypes/core': '@a/b', '@ts-runtypes/core-extra': '@c/d'}};
  assert.equal(rewriteMapped('@ts-runtypes/core-extra', targets), '@c/d');
  assert.equal(rewriteMapped('@ts-runtypes/core', targets), '@a/b');
});

test('every occurrence on one token is replaced, not just the first', () => {
  const token = '@ts-runtypes/core:@ts-runtypes/core';
  assert.equal(rewriteMapped(token, TARGETS), '@mionjs/run-types:@mionjs/run-types');
});

test('non-renaming marks return the token untouched', () => {
  for (const mark of ['keep', 'freeze', 'regenerate', 'manual']) {
    assert.equal(rewriteToken('getRunTypeId', mark, TARGETS), 'getRunTypeId');
  }
});

test('an empty target throws rather than writing a half-formed name', () => {
  assert.throws(() => rewriteToken('ts-runtypes', 'pkg-dir', {pkgDir: []}), /is empty in targets\.json/);
  assert.throws(() => rewriteToken('ts-runtypes', 'pkg-dir', {}), /is empty in targets\.json/);
});

test('a transform that matches nothing in its token throws', () => {
  // Silence here would mean a row was marked with the wrong transform and the site simply
  // never changed, which is the hardest kind of bug to notice in a 25000-site rewrite.
  assert.throws(() => rewriteToken('totally-unrelated', 'pkg-dir', TARGETS), /matched nothing/);
});

test('one target value covers every casing', () => {
  assert.equal(detectCase('ts-runtypes'), 'kebab');
  assert.equal(detectCase('tsRuntypes'), 'camel');
  assert.equal(detectCase('TsRuntypes'), 'pascal');
  assert.equal(detectCase('TS_RUNTYPES'), 'screaming');

  const words = ['run', 'types'];
  assert.equal(applyCase(words, 'kebab'), 'run-types');
  assert.equal(applyCase(words, 'camel'), 'runTypes');
  assert.equal(applyCase(words, 'pascal'), 'RunTypes');
  assert.equal(applyCase(words, 'screaming'), 'RUN_TYPES');
  assert.equal(applyCase(words, 'snake'), 'run_types');
});

test('env prefix rewrites keep the rest of the variable name', () => {
  assert.equal(rewriteToken('RT_SITE', 'env-var', TARGETS), 'MION_RT_SITE');
  assert.equal(rewriteToken('RT_WEBSITE_PORT', 'env-var', TARGETS), 'MION_RT_WEBSITE_PORT');
});

test('rewriteToken is free of hidden regex state across calls', () => {
  // A /g regex carries lastIndex; reusing one between calls would make the second call
  // silently skip. Same input twice must give the same answer.
  const once = rewriteToken('@ts-runtypes/core', 'npm-scope', TARGETS);
  const twice = rewriteToken('@ts-runtypes/core', 'npm-scope', TARGETS);
  assert.equal(once, twice);
  assert.equal(rewriteToken('RT_A', 'env-var', TARGETS), rewriteToken('RT_A', 'env-var', TARGETS));
});
