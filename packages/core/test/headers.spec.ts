/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, expect, it} from 'vitest';
import {HeadersSubset, trustedHeadersSubset} from '../src/headers.ts';
import {isFatalError, type RpcError} from '../src/errors.ts';

function thrownBy(build: () => unknown): RpcError<string> | undefined {
  try {
    build();
  } catch (err) {
    return err as RpcError<string>;
  }
  return undefined;
}

describe('HeadersSubset checks itself when built', () => {
  it('passes a valid map, static form', () => {
    const subset = new HeadersSubset<'Authorization'>({Authorization: 'token'});
    expect(subset.headers).toEqual({Authorization: 'token'});
  });

  it('passes a valid map, form inferred from the return type', () => {
    const build = (): HeadersSubset<'Authorization', 'x-trace'> => new HeadersSubset({Authorization: 'token'});
    expect(build().headers).toEqual({Authorization: 'token'});
  });

  it('throws headers-validation-error on a wrong value, static form', () => {
    const error = thrownBy(() => new HeadersSubset<'Authorization'>({Authorization: 1 as unknown as string}));
    expect(isFatalError(error)).toBe(true);
    expect(error?.type).toBe('headers-validation-error');
    expect((error?.errorData as {typeErrors: unknown[]}).typeErrors.length).toBeGreaterThan(0);
  });

  it('throws headers-validation-error on a wrong value, form inferred from the return type', () => {
    const build = (): HeadersSubset<'Authorization'> => new HeadersSubset({Authorization: 1 as unknown as string});
    expect(thrownBy(build)?.type).toBe('headers-validation-error');
  });

  it('throws headers-validation-error on a missing required header', () => {
    const missing = {} as {Authorization: string; 'x-user': string};
    expect(thrownBy(() => new HeadersSubset<'Authorization' | 'x-user'>(missing))?.type).toBe('headers-validation-error');
  });

  it('accepts a missing optional header', () => {
    const subset = new HeadersSubset<'Authorization', 'x-trace'>({Authorization: 'token'});
    expect(subset.headers).toEqual({Authorization: 'token'});
  });

  it('skips the check when the build injected nothing', () => {
    const Unchecked: new (headers: Record<string, unknown>) => HeadersSubset<string> = HeadersSubset as any;
    expect(new Unchecked({Authorization: 1}).headers).toEqual({Authorization: 1});
  });
});

describe('trustedHeadersSubset', () => {
  it('builds an instance with no check', () => {
    const subset = trustedHeadersSubset<'Authorization'>({Authorization: 1 as unknown as string});
    expect(subset instanceof HeadersSubset).toBe(true);
    expect(subset.headers).toEqual({Authorization: 1});
  });
});
