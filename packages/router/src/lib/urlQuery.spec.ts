/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect} from 'vitest';
import {findMionQueryParam} from './urlQuery.ts';
import {toBase64Url} from '@mionjs/core';

describe('findMionQueryParam', () => {
  it('reads a value, wherever the parameter sits', () => {
    expect(findMionQueryParam('page=2', 'page')).toBe('2');
    expect(findMionQueryParam('id=three&page=2', 'page')).toBe('2');
    expect(findMionQueryParam('page=2&id=three', 'page')).toBe('2');
    expect(findMionQueryParam('a=1&page=2&b=3', 'page')).toBe('2');
  });

  it('is undefined when there is no query string, or no such parameter', () => {
    expect(findMionQueryParam(undefined, 'page')).toBeUndefined();
    expect(findMionQueryParam('', 'page')).toBeUndefined();
    expect(findMionQueryParam('id=three', 'page')).toBeUndefined();
  });

  it('a parameter written without a value reads as present and empty', () => {
    expect(findMionQueryParam('flag', 'flag')).toBe('');
    expect(findMionQueryParam('flag=', 'flag')).toBe('');
    expect(findMionQueryParam('flag=1', 'flag')).toBe('1');
    expect(findMionQueryParam('id=three&flag', 'flag')).toBe('');
    expect(findMionQueryParam('flag&id=three', 'flag')).toBe('');
    // which is how a bare flag is told apart from an absent one
    expect(findMionQueryParam('id=three', 'flag')).toBeUndefined();
  });

  it('the first occurrence wins on a repeat', () => {
    expect(findMionQueryParam('a=1&a=2', 'a')).toBe('1');
    expect(findMionQueryParam('id=first&id=second', 'id')).toBe('first');
  });

  it('keeps an = that appears inside a value', () => {
    expect(findMionQueryParam('a=b=c', 'a')).toBe('b=c');
    expect(findMionQueryParam('data=eyJhIjoxfQ==', 'data')).toBe('eyJhIjoxfQ==');
  });

  it('does not match a name that merely starts with, ends with or contains the wanted one', () => {
    expect(findMionQueryParam('pages=1', 'page')).toBeUndefined();
    expect(findMionQueryParam('notid=x', 'id')).toBeUndefined();
    expect(findMionQueryParam('ids=x', 'id')).toBeUndefined();
    expect(findMionQueryParam('myidhere=x', 'id')).toBeUndefined();
  });

  it('does not match the name inside another parameter value', () => {
    expect(findMionQueryParam('batch=id', 'id')).toBeUndefined();
    expect(findMionQueryParam('note=very-page-indeed', 'page')).toBeUndefined();
    expect(findMionQueryParam('id=page', 'page')).toBeUndefined();
  });

  it('skips a parameter with an empty name', () => {
    expect(findMionQueryParam('=x', '')).toBeUndefined();
    expect(findMionQueryParam('&&a=1', 'a')).toBe('1');
    expect(findMionQueryParam('=x&a=1', 'a')).toBe('1');
  });

  it('returns the value raw, exactly as it sits in the url', () => {
    // percent escapes and + are left alone: a consumer decodes when it needs to, which is what lets
    // the batch id decode while a base64url query body must not
    expect(findMionQueryParam('id=a%2Fb', 'id')).toBe('a%2Fb');
    expect(findMionQueryParam('id=a+b', 'id')).toBe('a+b');
    expect(findMionQueryParam('id=%E0%A4%A', 'id')).toBe('%E0%A4%A');
  });

  it('a name that is an Object.prototype key reads as absent when it was not sent', () => {
    expect(findMionQueryParam('a=1', 'toString')).toBeUndefined();
    expect(findMionQueryParam('a=1', 'constructor')).toBeUndefined();
    expect(findMionQueryParam('a=1', '__proto__')).toBeUndefined();
    // and as its own value when it WAS sent
    expect(findMionQueryParam('toString=hi', 'toString')).toBe('hi');
    expect(findMionQueryParam('__proto__=hi', '__proto__')).toBe('hi');
  });

  it('finds a parameter next to a long query body payload', () => {
    const payload = toBase64Url(JSON.stringify({echo: ['page']}));
    expect(findMionQueryParam(`data=${payload}`, 'page')).toBeUndefined();
    expect(findMionQueryParam(`data=${payload}&page=2`, 'page')).toBe('2');
    expect(findMionQueryParam(`data=${payload}&page=2`, 'data')).toBe(payload);
  });
});
