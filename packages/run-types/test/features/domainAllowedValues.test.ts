// `allowedValues` on the quick domain presets (`Domain`, `Hostname`): one whole-value check beside the pattern,
// with validate and validation errors agreeing.
// Marker coverage rule: static `createX<T>()` and value-first `createX(builder)` as paired tests.

import {describe, it, expect} from 'vitest';
import {createGetValidationErrorsFn, createValidateFn, getRunTypeId} from '@mionjs/run-types';
import * as TF from '@mionjs/run-types/formats';
import {createMockDataFn} from '@mionjs/run-types/mocking';

type Site = TF.Domain<{allowedValues: {val: ['example.com', 'mion.io']}}>;
type Host = TF.Hostname<{allowedValues: {val: ['example.com']}}>;

describe('allowedValues on the quick domain presets', () => {
  it('Domain accepts only the listed domains (static)', () => {
    const isSite = createValidateFn<Site>();
    expect(isSite('example.com')).toBe(true);
    expect(isSite('mion.io')).toBe(true);
    expect(isSite('other.org')).toBe(false);
    const getErrors = createGetValidationErrorsFn<Site>();
    expect(getErrors('example.com')).toEqual([]);
    const [error] = getErrors('other.org');
    expect(error?.format?.name).toBe('domain');
    expect(error?.format?.formatPath).toEqual(['allowedValues']);
    expect(error?.format?.errorType).toBeUndefined();
  });

  it('Domain accepts only the listed domains (value-first builder)', () => {
    const site = TF.domain({allowedValues: {val: ['example.com', 'mion.io']}});
    expect(getRunTypeId(site)).toBe(getRunTypeId<Site>());
    const isSite = createValidateFn(site);
    expect(isSite('mion.io')).toBe(true);
    expect(isSite('other.org')).toBe(false);
    expect(createGetValidationErrorsFn(site)('other.org')[0]?.format?.formatPath).toEqual(['allowedValues']);
  });

  it('Hostname runs the host-name rules AND the list (static)', () => {
    const isHost = createValidateFn<Host>();
    expect(isHost('example.com')).toBe(true);
    expect(isHost('other.org')).toBe(false);
    const getErrors = createGetValidationErrorsFn<Host>();
    expect(getErrors('example.com')).toEqual([]);
    expect(getErrors('other.org').map((error) => error.format?.formatPath)).toEqual([['allowedValues']]);
  });

  it('Hostname runs the host-name rules AND the list (value-first builder)', () => {
    const host = TF.hostname({allowedValues: {val: ['example.com']}});
    expect(getRunTypeId(host)).toBe(getRunTypeId<Host>());
    expect(createValidateFn(host)('other.org')).toBe(false);
    expect(createValidateFn(host)('example.com')).toBe(true);
  });

  it('mock data passes the list', () => {
    const isSite = createValidateFn<Site>();
    const mockSite = createMockDataFn<Site>();
    const isHost = createValidateFn<Host>();
    const mockHost = createMockDataFn<Host>();
    for (let i = 0; i < 20; i++) {
      expect(isSite(mockSite())).toBe(true);
      expect(isHost(mockHost())).toBe(true);
    }
  });

  it('a bare Domain still accepts any domain the pattern accepts', () => {
    expect(createValidateFn<TF.Domain>()('other.org')).toBe(true);
  });
});
