// The splice itself. Every replacement changes length, so an edit applied left-to-right
// invalidates the offsets of the ones after it. These pin the ordering.

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyEdits} from '../lib/edits.mjs';

test('an empty edit list returns the text untouched', () => {
  assert.equal(applyEdits('hello', []), 'hello');
});

test('a single edit lands on its offsets', () => {
  assert.equal(applyEdits('abcdef', [{start: 2, end: 4, text: 'XY'}]), 'abXYef');
});

test('three edits on one line all land correctly', () => {
  // The case apply.mjs actually hits: several specifiers on one import line.
  const line = "import {a} from '@x/one'; import {b} from '@x/two'; // @x/three";
  const edits = [
    {start: line.indexOf('@x/one'), end: line.indexOf('@x/one') + 6, text: '@y/1'},
    {start: line.indexOf('@x/two'), end: line.indexOf('@x/two') + 6, text: '@y/2'},
    {start: line.indexOf('@x/three'), end: line.indexOf('@x/three') + 8, text: '@y/3'},
  ];
  assert.equal(
    applyEdits(line, edits),
    "import {a} from '@y/1'; import {b} from '@y/2'; // @y/3"
  );
});

test('order of the input list does not matter', () => {
  const line = 'aa bb cc';
  const edits = [
    {start: 0, end: 2, text: 'LONGER'},
    {start: 3, end: 5, text: 'X'},
    {start: 6, end: 8, text: 'MID'},
  ];
  const forwards = applyEdits(line, edits);
  const backwards = applyEdits(line, [...edits].reverse());
  assert.equal(forwards, 'LONGER X MID');
  assert.equal(forwards, backwards);
});

test('a replacement LONGER than the original does not shift later edits', () => {
  // The specific failure a left-to-right loop produces: the second edit lands off by the
  // length the first one grew.
  const line = 'xx yy';
  const out = applyEdits(line, [
    {start: 0, end: 2, text: 'aaaaaaaaaa'},
    {start: 3, end: 5, text: 'bb'},
  ]);
  assert.equal(out, 'aaaaaaaaaa bb');
});

test('a replacement SHORTER than the original does not shift later edits', () => {
  const line = 'xxxxxx yyyyyy';
  const out = applyEdits(line, [
    {start: 0, end: 6, text: 'a'},
    {start: 7, end: 13, text: 'b'},
  ]);
  assert.equal(out, 'a b');
});

test('overlapping edits throw rather than silently corrupting', () => {
  assert.throws(
    () => applyEdits('abcdef', [{start: 0, end: 4, text: 'X'}, {start: 2, end: 6, text: 'Y'}]),
    /overlapping edits/
  );
});

test('adjacent (touching but not overlapping) edits are allowed', () => {
  assert.equal(applyEdits('abcd', [{start: 0, end: 2, text: 'X'}, {start: 2, end: 4, text: 'Y'}]), 'XY');
});

test('applyEdits does not mutate the caller list', () => {
  const edits = [{start: 3, end: 5, text: 'X'}, {start: 0, end: 2, text: 'Y'}];
  const before = edits.map((e) => e.start);
  applyEdits('aa bb', edits);
  assert.deepEqual(edits.map((e) => e.start), before);
});
