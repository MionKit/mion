// URL as data: instanceof validate, href on the wire, `URL.canParse`-guarded rebuild, re-wrap on clone, href formats.

import type * as TF from '@mionjs/run-types/formats';
import {describe, expect, it} from 'vitest';
import {
  createValidateFn,
  createGetValidationErrorsFn,
  createJsonEncoderFn,
  createJsonDecoderFn,
  createRemoveUnknownKeysFn,
  getRunTypeId,
} from '@mionjs/run-types';
import {createMockDataFn} from '@mionjs/run-types/mocking';
import * as TFB from '@mionjs/run-types/formats';

interface Link {
  title: string;
  link: URL;
}

const home = new URL('https://example.com/a?b=1#c');

describe('URL validate', () => {
  it('accepts a URL instance and rejects its string form', () => {
    const validate = createValidateFn<URL>();
    expect(validate(home)).toBe(true);
    expect(validate(home.href)).toBe(false);
    expect(validate({href: home.href})).toBe(false);
  });

  it('value-first: the URL value reaches the same validator', () => {
    const validate = createValidateFn(home);
    expect(validate(home)).toBe(true);
    expect(validate(home.href)).toBe(false);
  });

  it('reports a URL type error', () => {
    const getErrors = createGetValidationErrorsFn<Link>();
    expect(getErrors({title: 'a', link: home})).toEqual([]);
    expect(getErrors({title: 'a', link: home.href})).toEqual([{path: ['link'], expected: 'URL'}]);
  });
});

describe('URL JSON round trip', () => {
  const value: Link = {title: 'home', link: home};

  it('clone strategy', () => {
    const encode = createJsonEncoderFn<Link>();
    const decode = createJsonDecoderFn<Link>();
    const json = encode(value) as string;
    expect(JSON.parse(json)).toEqual({title: 'home', link: home.href});
    const decoded = decode(json);
    expect(decoded.link).toBeInstanceOf(URL);
    expect(decoded.link.href).toBe(home.href);
  });

  it('mutate strategy', () => {
    const encode = createJsonEncoderFn<Link>(undefined, {strategy: 'mutate'});
    const decode = createJsonDecoderFn<Link>(undefined, {strategy: 'mutate'});
    const decoded = decode(encode({title: 'home', link: new URL(home.href)}) as string);
    expect(decoded.link).toBeInstanceOf(URL);
    expect(decoded.link.href).toBe(home.href);
  });

  it('compact strategy', () => {
    const encode = createJsonEncoderFn<Link>(undefined, {strategy: 'compact'});
    const decode = createJsonDecoderFn<Link>(undefined, {strategy: 'compact'});
    const decoded = decode(encode(value) as string);
    expect(decoded.link).toBeInstanceOf(URL);
    expect(decoded.link.href).toBe(home.href);
  });

  // `new URL(bad)` throws, so the decoder leaves anything it cannot parse for validate to refuse.
  it('leaves an unparsable or non-string wire value in place, without throwing', () => {
    const decode = createJsonDecoderFn<Link>();
    const validate = createValidateFn<Link>();
    for (const wire of ['not a url', '/relative/path', 42, null, {href: home.href}]) {
      const decoded = decode(JSON.stringify({title: 'x', link: wire})) as unknown as {link: unknown};
      expect(decoded.link).toEqual(wire);
      expect(validate(decoded)).toBe(false);
    }
  });
});

describe('URL clone (removeUnknownKeys)', () => {
  it('returns a fresh URL with the same href', () => {
    const clean = createRemoveUnknownKeysFn<Link>();
    const cloned = clean({title: 'a', link: home});
    expect(cloned.link).toBeInstanceOf(URL);
    expect(cloned.link).not.toBe(home);
    expect(cloned.link.href).toBe(home.href);
  });
});

describe('NativeUrl formats', () => {
  it('NativeUrl<P> checks the href length', () => {
    const validate = createValidateFn<TF.NativeUrl<{maxLength: 22}>>();
    expect(validate(new URL('https://example.com/ab'))).toBe(true);
    expect(validate(new URL('https://example.com/abc'))).toBe(false);
    expect(validate('https://example.com/')).toBe(false);
  });

  it('reports the failing param under the nativeUrl name', () => {
    const getErrors = createGetValidationErrorsFn<TF.NativeUrl<{maxLength: 22}>>();
    expect(getErrors(new URL('https://example.com/ab'))).toEqual([]);
    expect(getErrors(new URL('https://example.com/abc'))).toEqual([
      {path: [], expected: 'URL', format: {name: 'nativeUrl', formatPath: ['maxLength'], val: 22}},
    ]);
    expect(getErrors('https://example.com/')).toEqual([{path: [], expected: 'URL'}]);
  });

  it('NativeUrlHttp and NativeUrlFile reuse the url patterns', () => {
    const isHttp = createValidateFn<TF.NativeUrlHttp>();
    expect(isHttp(new URL('https://example.com/'))).toBe(true);
    expect(isHttp(new URL('ftp://example.com/'))).toBe(false);
    const isFile = createValidateFn<TF.NativeUrlFile>();
    expect(isFile(new URL('file:///tmp/a.txt'))).toBe(true);
    expect(isFile(new URL('https://example.com/'))).toBe(false);
  });

  it('value-first builders resolve to the type-first ids', () => {
    expect(getRunTypeId(TFB.nativeUrl())).toBe(getRunTypeId<URL>());
    expect(getRunTypeId(TFB.nativeUrl({maxLength: 22}))).toBe(getRunTypeId<TF.NativeUrl<{maxLength: 22}>>());
    expect(getRunTypeId(TFB.nativeUrlHttp())).toBe(getRunTypeId<TF.NativeUrlHttp>());
    expect(getRunTypeId(TFB.nativeUrlFile({maxLength: 100}))).toBe(getRunTypeId<TF.NativeUrlFile<{maxLength: 100}>>());
  });

  it('the value-first builder validates like the type', () => {
    const validate = createValidateFn(TFB.nativeUrl({maxLength: 22}));
    expect(validate(new URL('https://example.com/ab'))).toBe(true);
    expect(validate(new URL('https://example.com/abc'))).toBe(false);
  });
});

describe('URL mock data', () => {
  it('mocks a URL that passes validate', () => {
    const mock = createMockDataFn<Link>();
    const validate = createValidateFn<Link>();
    for (let i = 0; i < 20; i++) {
      const value = mock();
      expect(value.link).toBeInstanceOf(URL);
      expect(validate(value)).toBe(true);
    }
  });

  it('mocks NativeUrl formats that pass their own checks', () => {
    const mockHttp = createMockDataFn<TF.NativeUrlHttp<{maxLength: 60}>>();
    const isHttp = createValidateFn<TF.NativeUrlHttp<{maxLength: 60}>>();
    const mockFile = createMockDataFn<TF.NativeUrlFile>();
    const isFile = createValidateFn<TF.NativeUrlFile>();
    for (let i = 0; i < 20; i++) {
      expect(isHttp(mockHttp())).toBe(true);
      expect(isFile(mockFile())).toBe(true);
    }
  });
});
