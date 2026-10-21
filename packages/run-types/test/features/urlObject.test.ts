// URL as data: instanceof validate, href on the wire, `new URL()` rebuild from a string, re-wrap on clone, href formats.

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

  it('leaves a non-string wire value in place for validate to refuse', () => {
    const decode = createJsonDecoderFn<Link>();
    const validate = createValidateFn<Link>();
    for (const wire of [42, null, {href: home.href}]) {
      const decoded = decode(JSON.stringify({title: 'x', link: wire})) as unknown as {link: unknown};
      expect(decoded.link).toEqual(wire);
      expect(validate(decoded)).toBe(false);
    }
  });

  // Like Temporal.X.from, `new URL(bad)` throws: a decoder may throw on bad input.
  it('throws on a string that is not a URL', () => {
    const decode = createJsonDecoderFn<Link>();
    for (const wire of ['not a url', '/relative/path']) {
      expect(() => decode(JSON.stringify({title: 'x', link: wire}))).toThrow(TypeError);
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

describe('Url object formats', () => {
  it('Url<P> checks the href length', () => {
    const validate = createValidateFn<TF.Url<{maxLength: 22}>>();
    expect(validate(new URL('https://example.com/ab'))).toBe(true);
    expect(validate(new URL('https://example.com/abc'))).toBe(false);
    expect(validate('https://example.com/')).toBe(false);
  });

  it('reports the failing param under the url object format name', () => {
    const getErrors = createGetValidationErrorsFn<TF.Url<{maxLength: 22}>>();
    expect(getErrors(new URL('https://example.com/ab'))).toEqual([]);
    expect(getErrors(new URL('https://example.com/abc'))).toEqual([
      {path: [], expected: 'URL', format: {name: 'nativeUrl', formatPath: ['maxLength'], val: 22}},
    ]);
    expect(getErrors('https://example.com/')).toEqual([{path: [], expected: 'URL'}]);
  });

  it('UrlHttp and UrlFile reuse the url patterns', () => {
    const isHttp = createValidateFn<TF.UrlHttp>();
    expect(isHttp(new URL('https://example.com/'))).toBe(true);
    expect(isHttp(new URL('ftp://example.com/'))).toBe(false);
    const isFile = createValidateFn<TF.UrlFile>();
    expect(isFile(new URL('file:///tmp/a.txt'))).toBe(true);
    expect(isFile(new URL('https://example.com/'))).toBe(false);
  });

  it('value-first builders resolve to the type-first ids', () => {
    expect(getRunTypeId(TFB.url())).toBe(getRunTypeId<URL>());
    expect(getRunTypeId(TFB.url({maxLength: 22}))).toBe(getRunTypeId<TF.Url<{maxLength: 22}>>());
    expect(getRunTypeId(TFB.urlHttp())).toBe(getRunTypeId<TF.UrlHttp>());
    expect(getRunTypeId(TFB.urlFile({maxLength: 100}))).toBe(getRunTypeId<TF.UrlFile<{maxLength: 100}>>());
  });

  it('a value typed as a url object resolves to the type-first id', () => {
    const link: TF.Url<{maxLength: 22}> = new URL('https://example.com/ab');
    const web: TF.UrlHttp = new URL('https://example.com/');
    expect(getRunTypeId(link)).toBe(getRunTypeId<TF.Url<{maxLength: 22}>>());
    expect(getRunTypeId(web)).toBe(getRunTypeId<TF.UrlHttp>());
  });

  it('the string and object families keep different ids', () => {
    expect(getRunTypeId<TF.StringUrl>()).not.toBe(getRunTypeId<TF.Url>());
    expect(getRunTypeId(TFB.stringUrl())).toBe(getRunTypeId<TF.StringUrl>());
    expect(getRunTypeId(TFB.stringUrlHttp())).toBe(getRunTypeId<TF.StringUrlHttp>());
    expect(getRunTypeId(TFB.stringUrlFile())).toBe(getRunTypeId<TF.StringUrlFile>());
  });

  it('a value typed as a url string resolves to the type-first id, apart from the object', () => {
    const text: TF.StringUrl = 'https://example.com' as TF.StringUrl;
    const link: TF.Url = new URL('https://example.com');
    expect(getRunTypeId(text)).toBe(getRunTypeId<TF.StringUrl>());
    expect(getRunTypeId(link)).toBe(getRunTypeId<TF.Url>());
    expect(getRunTypeId(text)).not.toBe(getRunTypeId(link));
  });

  it('the value-first builder validates like the type', () => {
    const validate = createValidateFn(TFB.url({maxLength: 22}));
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

  it('mocks Url object formats that pass their own checks', () => {
    const mockHttp = createMockDataFn<TF.UrlHttp<{maxLength: 60}>>();
    const isHttp = createValidateFn<TF.UrlHttp<{maxLength: 60}>>();
    const mockFile = createMockDataFn<TF.UrlFile>();
    const isFile = createValidateFn<TF.UrlFile>();
    for (let i = 0; i < 20; i++) {
      expect(isHttp(mockHttp())).toBe(true);
      expect(isFile(mockFile())).toBe(true);
    }
  });
});
