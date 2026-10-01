// A platform-declared type (`@types/node` redeclares lib globals too) is not data: properties drop, roots are refused.

import {EventEmitter} from 'node:events';
import {URL as NodeURL} from 'node:url';
import {describe, expect, it} from 'vitest';
import {createJsonDecoderFn, createJsonEncoderFn, createRemoveUnknownKeysFn, createValidateFn} from '@mionjs/run-types';

interface Job {
  id: string;
  timer: NodeJS.Timeout;
  events: EventEmitter;
  headers: Headers;
  abort: AbortController;
}

class Point {
  x = 1;
  y = 2;
}

function makeJob(): Job {
  const timer = setTimeout(() => {}, 0);
  clearTimeout(timer);
  return {id: 'a', timer, events: new EventEmitter(), headers: new Headers({a: 'b'}), abort: new AbortController()};
}

describe('platform types are not data', () => {
  it('validate ignores the platform members of a real Job', () => {
    const validate = createValidateFn<Job>();
    expect(validate(makeJob())).toBe(true);
    expect(validate({id: 'a'})).toBe(true);
    expect(validate({id: 1})).toBe(false);
  });

  it('JSON leaves them out instead of writing their object shape', () => {
    const encode = createJsonEncoderFn<Job>(undefined, {strategy: 'clone'});
    expect(JSON.parse(encode(makeJob()) as string)).toEqual({id: 'a'});
    const decode = createJsonDecoderFn<{query: URLSearchParams; id: number}>();
    expect(decode('{"id":1,"query":{"size":1}}')).toEqual({id: 1});
  });

  it('removeUnknownKeys builds with no error and shares the platform value', () => {
    const clone = createRemoveUnknownKeysFn<{id: string; query: URLSearchParams; headers: Headers}>();
    const value = {id: 'a', query: new URLSearchParams('a=1'), headers: new Headers()};
    const out = clone(value);
    expect(out.query).toBe(value.query);
    expect(out.headers).toBe(value.headers);
    expect(() => createRemoveUnknownKeysFn<{timer: NodeJS.Timeout}>()).not.toThrow();
    expect(() => createRemoveUnknownKeysFn<{events: EventEmitter}>()).not.toThrow();
  });

  it('Blob and Request are taken whole in every family, not walked', () => {
    const validate = createValidateFn<{blob: Blob; request: Request}>();
    expect(validate({blob: new Blob(['x']), request: new Request('https://mion.io')})).toBe(true);
    expect(validate({blob: 1, request: 'nope'})).toBe(true);
    const encode = createJsonEncoderFn<{id: number; response: Response}>(undefined, {strategy: 'clone'});
    expect(JSON.parse(encode({id: 1, response: new Response()}) as string)).toEqual({id: 1});
    const decode = createJsonDecoderFn<{id: number; blob: Blob}>();
    expect(decode('{"id":1}')).toEqual({id: 1});
    expect(() => createRemoveUnknownKeysFn<{blob: Blob; request: Request}>()).not.toThrow();
  });

  it('the value call shape reads the same type as the static one', () => {
    const job = makeJob();
    const validate = createValidateFn(job);
    expect(validate(makeJob())).toBe(true);
    expect(validate({id: 1})).toBe(false);
  });

  it('the root is refused like a lib class', () => {
    // @mion-downgrade-error VL001
    expect(() => createValidateFn<Headers>()).toThrow(/VL001/);
    // @mion-downgrade-error VL001
    expect(() => createValidateFn<EventEmitter>()).toThrow(/VL001/);
  });

  it('URL is data, from the global and from node:url alike', () => {
    const validate = createValidateFn<{link: URL; other: NodeURL}>();
    expect(validate({link: new URL('https://mion.io'), other: new NodeURL('https://mion.io')})).toBe(true);
    expect(validate({link: 'https://mion.io', other: new NodeURL('https://mion.io')})).toBe(false);
  });

  it('a class the author declares stays data', () => {
    const validate = createValidateFn<{point: Point}>();
    expect(validate({point: {x: 1, y: 2}})).toBe(true);
    expect(validate({point: {x: 1}})).toBe(false);
  });
});
