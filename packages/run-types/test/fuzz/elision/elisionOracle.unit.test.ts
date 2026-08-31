// Negative controls for the elision lane's oracles (the iron rule: a red lane
// must mean a real bug, so every oracle is proven to FIRE on a deliberately
// broken output) plus the module-filter contract. Binary-free — runs in the
// unit lane.

import {describe, expect, it} from 'vitest';
import {
  checkFnSiteAgreement,
  checkSharedEntriesIdentical,
  checkStaticRootSiteGone,
  checkStaticZeroReflection,
  checkValueRootKept,
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

  it('E2 fires when the static form kept a builder-printed root site', () => {
    const sites = [
      {fnId: 'abc', id: 'Root1'},
      {fnId: '', id: 'Root1'},
    ];
    expect(checkStaticRootSiteGone(1, 't', sites, 'Root1', false)?.oracle).toBe('E2-static-reflection');
  });

  it('E2 tolerates an escape-printed root and non-root reflection on the static side', () => {
    const withRoot = [
      {fnId: 'abc', id: 'Root1'},
      {fnId: '', id: 'Root1'},
    ];
    expect(checkStaticRootSiteGone(1, 't', withRoot, 'Root1', true)).toBeUndefined();
    const childOnly = [
      {fnId: 'abc', id: 'Root1'},
      {fnId: '', id: 'Child1'},
    ];
    expect(checkStaticRootSiteGone(1, 't', childOnly, 'Root1', false)).toBeUndefined();
  });

  it('E2 strict fires on any reflection payload in a declaration-free fixture', () => {
    expect(checkStaticZeroReflection(1, 't', {[RUNTYPES_BUNDLE_BASENAME]: 'x'}, [])?.oracle).toBe('E2-static-reflection');
    expect(checkStaticZeroReflection(1, 't', {}, [{fnId: '', id: 'Root1'}])?.oracle).toBe('E2-static-reflection');
    expect(checkStaticZeroReflection(1, 't', {abc_X: 'fn'}, [{fnId: 'abc', id: 'X'}])).toBeUndefined();
  });

  it('E2 differential fires when the value form lost its root reflection', () => {
    const none: {fnId: string; id: string}[] = [];
    const one = [{fnId: '', id: 'Root1'}];
    // Builder-printed root: value must carry exactly one MORE root site.
    expect(checkValueRootKept(1, 't', none, none, 'Root1', false, true)?.oracle).toBe('E2-value-missing-reflection');
    expect(checkValueRootKept(1, 't', none, one, 'Root1', false, true)).toBeUndefined();
    // Escape-printed root: the site rides both spellings — delta must be zero.
    expect(checkValueRootKept(1, 't', one, one, 'Root1', true, true)).toBeUndefined();
    expect(checkValueRootKept(1, 't', one, [...one, ...one], 'Root1', true, true)?.oracle).toBe('E2-value-missing-reflection');
    // Missing root graph row fires regardless of the site delta.
    expect(checkValueRootKept(1, 't', none, one, 'Root1', false, false)?.oracle).toBe('E2-value-missing-reflection');
  });
});
