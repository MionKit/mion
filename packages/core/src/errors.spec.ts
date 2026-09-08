/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect} from 'vitest';
import {
  RpcError,
  TypedError,
  FatalError,
  setErrorOptions,
  isRpcError,
  isFatalError,
  isAnyError,
  isNativeError,
  markFatal,
} from './errors.ts';
import {runInNewContext} from 'node:vm';
import {DEFAULT_CORE_OPTIONS} from './constants.ts';

describe('Route errors should', () => {
  it('automatically generate an id when RouteOptions autoGenerateErrorId is set to true', () => {
    // setErrorOptions REPLACES the options object, so pass a complete one
    setErrorOptions({...DEFAULT_CORE_OPTIONS, autoGenerateErrorId: true});
    const error = new RpcError({publicMessage: 'error', type: 'test-error'});
    expect(typeof error.id).toEqual('string');
    expect((error.id as string).length).toEqual(36);

    setErrorOptions({...DEFAULT_CORE_OPTIONS, autoGenerateErrorId: false});
    const error2 = new RpcError({publicMessage: 'error', type: 'test-error'});
    expect(error2.id).toEqual(undefined);
  });

  it('Parse and Stringify errors using JSON', () => {
    const error = new RpcError({
      id: '123WS',
      publicMessage: 'this is a public message',
      errorData: {data: 'data'},
      type: 'test-error',
    });

    const stringifiedError = JSON.stringify(error);
    const parsedError = new RpcError(JSON.parse(stringifiedError));
    expect(parsedError).toEqual(error);

    const errorWithSameMessage = new RpcError({
      id: '123WX',
      publicMessage: 'this is a message',
      errorData: {data: 'data'},
      type: 'test-error',
    });

    const stringifiedError2 = JSON.stringify(errorWithSameMessage);
    const parsedError2 = new RpcError(JSON.parse(stringifiedError2));
    expect(parsedError2).toEqual(errorWithSameMessage);
  });
});

describe('TypedError should', () => {
  it('create a basic typed error with core properties', () => {
    const error = new TypedError({
      message: 'Invalid input',
      type: 'validation-error',
    });

    expect(error['mion@isΣrrθr']).toBe(true);
    expect(error.message).toBe('Invalid input');
    expect(error.type).toBe('validation-error');
    expect(error instanceof Error).toBe(true);
    expect(error instanceof TypedError).toBe(true);
  });

  it('handle original error stack trace', () => {
    const originalError = new Error('Original error');
    const error = new TypedError({
      originalError,
      type: 'wrapped-error',
    });

    expect(error.message).toBe('Original error');
    expect(error.stack).toBe(originalError.stack);
  });

  it('use default values when not provided', () => {
    const error = new TypedError({
      type: 'typed-error',
    });

    expect(error['mion@isΣrrθr']).toBe(true);
    expect(error.type).toBe('typed-error');
    expect(error.message).toBe('');
  });

  it('be identified by type guard', () => {
    const error = new TypedError({type: 'fake'});
    const plainError = new Error('plain');
    const plainObject = {'mion@isΣrrθr': true, type: 'fake', message: ''};

    expect(isRpcError(error)).toBe(true);
    expect(isRpcError(plainError)).toBe(false); // no brand
    expect(isRpcError(plainObject)).toBe(true); // Should work with duck typing
    expect(isRpcError(null)).toBe(false);
    expect(isRpcError(undefined)).toBe(false);
  });
});

describe('RpcError inheritance should', () => {
  it('extend TypedError correctly', () => {
    const error = new RpcError({
      type: 'validation-error',
      publicMessage: 'Bad request',
      message: 'Invalid request',
    });

    expect(error instanceof TypedError).toBe(true);
    expect(error instanceof RpcError).toBe(true);
    expect(error['mion@isΣrrθr']).toBe(true);
    expect(error.type).toBe('validation-error');
    expect(error.publicMessage).toBe('Bad request');
    expect(error.message).toBe('Invalid request');
  });

  it('be identified by the type guard', () => {
    const error = new RpcError({
      publicMessage: 'Server error',
      type: 'server-error',
    });

    expect(isRpcError(error)).toBe(true);
  });

  // The brand is the WHOLE test, and these are the cases a key-set check used to fail. They matter
  // through isFatalError: a rejected subclass is a FatalError that never halts the request. The
  // `instanceof` fast path is deliberately bypassed here (a plain object with the same own
  // properties), which is what a second copy of @mionjs/core in the tree looks like.
  describe('when instanceof cannot hold', () => {
    it('accepts a subclass carrying its own extra fields', () => {
      class AuthError extends RpcError<'not-authorized'> {
        readonly attempts: number = 3;
      }
      const subclass = new AuthError({publicMessage: 'nope', type: 'not-authorized'});
      expect(isRpcError(subclass)).toBe(true);

      const offTheWire = {'mion@isΣrrθr': true, type: 'not-authorized', publicMessage: 'nope', attempts: 3};
      expect(offTheWire instanceof RpcError).toBe(false);
      expect(isRpcError(offTheWire)).toBe(true);
    });

    it('keeps a fatal subclass halting', () => {
      class GateError extends FatalError<'gate-closed'> {
        readonly gate: string = 'auth';
      }
      const fatal = new GateError({publicMessage: 'closed', type: 'gate-closed'});
      const offTheWire = {'mion@isΣrrθr': true, type: 'gate-closed', gate: 'auth', isFatal: true};

      expect(isFatalError(fatal)).toBe(true);
      expect(offTheWire instanceof RpcError).toBe(false);
      expect(isFatalError(offTheWire)).toBe(true);
    });

    it('still refuses anything without the brand', () => {
      expect(isRpcError({type: 'looks-like-one', publicMessage: 'but is not'})).toBe(false);
      expect(isRpcError(new Error('plain'))).toBe(false);
      expect(isFatalError({type: 'x', isFatal: true})).toBe(false);
    });

    it('answers false for the values a handler legitimately returns', () => {
      // dispatch reads the brand off whatever a handler returned, so every one of these reaches it
      expect(isRpcError(null)).toBe(false);
      expect(isRpcError(0)).toBe(false);
      expect(isRpcError('')).toBe(false);
      expect(isRpcError('a string')).toBe(false);
      expect(isRpcError([1, 2, 3])).toBe(false);
      expect(isAnyError(null)).toBe(false);
      expect(isAnyError('a string')).toBe(false);
      expect(isAnyError({id: 1})).toBe(false);
    });
  });
});

// The check that decides whether an undeclared Error is served as a SUCCESSFUL body or sent down the
// thrown path. `instanceof Error` cannot see an error built in another realm, so this pins the choice
// of Error.isError over it: a miss here means an error serialized as data.
describe('isNativeError should', () => {
  it('accept an error from another realm, which instanceof cannot', () => {
    const foreign = runInNewContext('new Error("from another realm")') as Error;
    expect(foreign instanceof Error).toBe(false);
    expect(isNativeError(foreign)).toBe(true);
    expect(isAnyError(foreign)).toBe(true);
  });

  it('accept a plain error and refuse plain data', () => {
    expect(isNativeError(new Error('plain'))).toBe(true);
    expect(isNativeError(new TypeError('typed'))).toBe(true);
    expect(isNativeError({message: 'looks like one', stack: 'fake'})).toBe(false);
    expect(isNativeError(null)).toBe(false);
    expect(isNativeError(undefined)).toBe(false);
    expect(isNativeError('boom')).toBe(false);
  });
});

describe('FatalError should', () => {
  it('be an RpcError with the halting brand', () => {
    const error = new FatalError({publicMessage: 'Not Authorized', type: 'not-authorized'});
    expect(error instanceof FatalError).toBe(true);
    expect(error instanceof RpcError).toBe(true);
    expect(error instanceof TypedError).toBe(true);
    expect(error.name).toBe('FatalError');
    expect(error.type).toBe('not-authorized');
    expect(error.publicMessage).toBe('Not Authorized');
    expect(error.isFatal).toBe(true);
    expect(isRpcError(error)).toBe(true);
    expect(isFatalError(error)).toBe(true);
  });

  it('not brand a plain RpcError, until markFatal stamps it', () => {
    const error = new RpcError({publicMessage: 'plain', type: 'plain-error'});
    expect(error.isFatal).toBeUndefined();
    expect(isFatalError(error)).toBe(false);
    expect(markFatal(error)).toBe(error);
    expect(isFatalError(error)).toBe(true);
    expect(error instanceof FatalError).toBe(false);
    expect(isFatalError(undefined)).toBe(false);
    expect(isFatalError({isFatal: true})).toBe(false);
  });

  it('keep a subclass prototype, so instanceof holds down the whole chain', () => {
    class AuthError extends FatalError<'not-authorized'> {
      constructor() {
        super({publicMessage: 'Not Authorized', type: 'not-authorized', statusCode: 401});
      }
    }
    class SoftError extends RpcError<'soft'> {
      constructor() {
        super({publicMessage: 'soft', type: 'soft'});
      }
    }
    const auth = new AuthError();
    expect(auth instanceof AuthError).toBe(true);
    expect(auth instanceof FatalError).toBe(true);
    expect(auth instanceof RpcError).toBe(true);
    expect(auth instanceof TypedError).toBe(true);
    expect(auth instanceof Error).toBe(true);
    expect(isFatalError(auth)).toBe(true);
    expect(auth.name).toBe('FatalError');
    const soft = new SoftError();
    expect(soft instanceof SoftError).toBe(true);
    expect(soft instanceof RpcError).toBe(true);
    expect(soft instanceof FatalError).toBe(false);
    // the same wire shape as the base class: no brand, no name, no message
    expect(JSON.parse(JSON.stringify(auth))).toEqual({
      'mion@isΣrrθr': true,
      publicMessage: 'Not Authorized',
      type: 'not-authorized',
      statusCode: 401,
    });
    expect(isRpcError(JSON.parse(JSON.stringify(soft)))).toBe(true);
  });

  it('keep the brand off the wire', () => {
    const error = new FatalError({id: 'f1', publicMessage: 'fatal', type: 'fatal-error', errorData: {a: 1}});
    expect(Object.keys(error)).not.toContain('isFatal');
    expect(JSON.parse(JSON.stringify(error))).toEqual({
      'mion@isΣrrθr': true,
      id: 'f1',
      publicMessage: 'fatal',
      type: 'fatal-error',
      errorData: {a: 1},
    });
    // the structural guard walks enumerable keys only, so the brand never makes the shape unknown
    const stamped = markFatal(new RpcError({publicMessage: 'x', type: 'x'}));
    expect(isRpcError(JSON.parse(JSON.stringify(stamped)))).toBe(true);
    // rebuilt by its declared class: an RpcError stays plain, a FatalError is fatal again
    const asRpc = new RpcError(JSON.parse(JSON.stringify(error)));
    expect(isFatalError(asRpc)).toBe(false);
    expect(asRpc).toEqual(new RpcError({id: 'f1', publicMessage: 'fatal', type: 'fatal-error', errorData: {a: 1}}));
    const asFatal = new FatalError(JSON.parse(JSON.stringify(error)));
    expect(isFatalError(asFatal)).toBe(true);
    expect(asFatal).toEqual(error);
  });
});
