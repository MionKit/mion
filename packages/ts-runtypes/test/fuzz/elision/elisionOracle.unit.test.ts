// Negative controls for the elision lane's oracles (the iron rule: a red lane
// must mean a real bug, so every oracle is proven to FIRE on a deliberately
// broken output) plus the module-filter contract. Binary-free — runs in the
// unit lane.

import {describe, expect, it} from 'vitest';
import {
  checkAllEntriesIdentical,
  checkFnSiteAgreement,
  checkSharedEntriesIdentical,
  checkRootSiteGone,
  checkZeroReflection,
  checkValueRootRow,
  comparableModules,
  normalizeSitePositions,
  RUNTYPES_BUNDLE_BASENAME,
} from './elisionOracle.ts';

describe('elision oracles fire on broken output (negative controls)', () => {
  it('E1a fires when the spellings resolve different fn keys', () => {
    expect(checkFnSiteAgreement(1, 't', ['abc_X', 'def_X'], ['abc_X', 'def_Y'])?.oracle).toBe('E1-id-drift');
    expect(checkFnSiteAgreement(1, 't', ['abc_X'], ['abc_X', 'def_X'])?.oracle).toBe('E1-id-drift');
  });

  it('E1a stays quiet on matching keys', () => {
    expect(checkFnSiteAgreement(1, 't', ['abc_X', 'def_X'], ['abc_X', 'def_X'])).toBeUndefined();
  });

  it('E1b fires on a missing shared module', () => {
    expect(checkSharedEntriesIdentical(1, 't', {abc_X: 'code'}, {})?.oracle).toBe('E1-entry-drift');
  });

  it('E1b fires on a single-byte drift in a shared module', () => {
    expect(checkSharedEntriesIdentical(1, 't', {abc_X: 'code'}, {abc_X: 'codf'})?.oracle).toBe('E1-entry-drift');
  });

  it('E1b stays quiet when every static module matches', () => {
    expect(checkSharedEntriesIdentical(1, 't', {abc_X: 'code'}, {abc_X: 'code', extra: 'reflection'})).toBeUndefined();
  });

  it('position normalization erases coordinates but never real drift', () => {
    const a = normalizeSitePositions("['rj',,'X','never',,'[RJ001] boom (at g.ts:5:45)']");
    const b = normalizeSitePositions("['rj',,'X','never',,'[RJ001] boom (at g.ts:3:27)']");
    expect(a).toBe(b);
    const c = normalizeSitePositions("['rj',,'X','never',,'[RJ001] BOOM (at g.ts:3:27)']");
    expect(c).not.toBe(b);
  });

  it('the module filter keeps fn entries and pure fns, drops the bundle and facades', () => {
    const filtered = comparableModules({
      abc_X: 'fn entry',
      'pf/rt/findCycle': 'pure fn',
      [RUNTYPES_BUNDLE_BASENAME]: 'bundle',
      Xyz123: 'facade',
    });
    expect(Object.keys(filtered).sort()).toEqual(['abc_X', 'pf/rt/findCycle']);
  });

  it('E1c fires on any module drift in a declaration-free fixture, either direction', () => {
    expect(checkAllEntriesIdentical(1, 't', {abc_X: 'code'}, {abc_X: 'code'})).toBeUndefined();
    // The bundle is no longer excluded: an extra reflection module on either
    // side is drift now.
    expect(checkAllEntriesIdentical(1, 't', {abc_X: 'code'}, {abc_X: 'code', [RUNTYPES_BUNDLE_BASENAME]: 'bundle'})?.oracle).toBe(
      'E1-entry-drift'
    );
    expect(checkAllEntriesIdentical(1, 't', {abc_X: 'code', [RUNTYPES_BUNDLE_BASENAME]: 'bundle'}, {abc_X: 'code'})?.oracle).toBe(
      'E1-entry-drift'
    );
    expect(checkAllEntriesIdentical(1, 't', {abc_X: 'code'}, {abc_X: 'codf'})?.oracle).toBe('E1-entry-drift');
  });

  it('E2 fires when either form kept a builder-printed root site', () => {
    const sites = [
      {fnId: 'abc', id: 'Root1'},
      {fnId: '', id: 'Root1'},
    ];
    expect(checkRootSiteGone(1, 't', 'static', sites, 'Root1', false)?.oracle).toBe('E2-reflection');
    expect(checkRootSiteGone(1, 't', 'value', sites, 'Root1', false)?.oracle).toBe('E2-reflection');
  });

  it('E2 tolerates an escape-printed root and non-root reflection', () => {
    const withRoot = [
      {fnId: 'abc', id: 'Root1'},
      {fnId: '', id: 'Root1'},
    ];
    expect(checkRootSiteGone(1, 't', 'static', withRoot, 'Root1', true)).toBeUndefined();
    expect(checkRootSiteGone(1, 't', 'value', withRoot, 'Root1', true)).toBeUndefined();
    const childOnly = [
      {fnId: 'abc', id: 'Root1'},
      {fnId: '', id: 'Child1'},
    ];
    expect(checkRootSiteGone(1, 't', 'static', childOnly, 'Root1', false)).toBeUndefined();
  });

  it('E2 strict fires on any reflection payload in a declaration-free fixture, either form', () => {
    expect(checkZeroReflection(1, 't', 'static', {[RUNTYPES_BUNDLE_BASENAME]: 'x'}, [])?.oracle).toBe('E2-reflection');
    expect(checkZeroReflection(1, 't', 'value', {[RUNTYPES_BUNDLE_BASENAME]: 'x'}, [])?.oracle).toBe('E2-reflection');
    expect(checkZeroReflection(1, 't', 'value', {}, [{fnId: '', id: 'Root1'}])?.oracle).toBe('E2-reflection');
    expect(checkZeroReflection(1, 't', 'static', {abc_X: 'fn'}, [{fnId: 'abc', id: 'X'}])).toBeUndefined();
  });

  it('E2 row check fires when the value form kept (or lost) the root graph row', () => {
    // Builder-printed root: a row on the value side means a factory argument was
    // treated as a value use.
    expect(checkValueRootRow(1, 't', false, true)?.oracle).toBe('E2-value-row');
    expect(checkValueRootRow(1, 't', false, false)).toBeUndefined();
    // Escape-printed root: the id lookup demands its row in both spellings.
    expect(checkValueRootRow(1, 't', true, false)?.oracle).toBe('E2-value-row');
    expect(checkValueRootRow(1, 't', true, true)).toBeUndefined();
  });
});
