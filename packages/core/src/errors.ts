/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {CoreRouterOptions, AnyErrorParams, TypedErrorParams, RpcErrorParams, RunTypeError} from './types/general.types.ts';
import {DEFAULT_CORE_OPTIONS} from './constants.ts';
import {randomUUID_V7} from './utils.ts';
import {registerClassSerializer} from '@mionjs/run-types/runtime';
import type {DataOnly} from '@mionjs/run-types';

// ############# Validation Error Types #############

export interface ValidationErrorData {
  typeErrors: RunTypeError[];
}

/** Raised when route or middleFn parameters fail validation; included in the client error unions so it stays typed. */
export type ValidationError = RpcError<'validation-error', ValidationErrorData>;

let options: CoreRouterOptions = {...DEFAULT_CORE_OPTIONS};

export function setErrorOptions(opts: CoreRouterOptions) {
  options = opts;
}

// `Error` re-typed so `message`/`name` are NOT inherited as required members: re-added below as optional
// + @nonEnumerable, so the resolver emits an enumerability guard and the internal message stays off the wire
// (`publicMessage` is what travels) while `DataOnly<T>` stays consistent. Runtime is still `Error`, so
// `instanceof Error` holds.
const ErrorBase = Error as unknown as {new (message?: string): Omit<Error, 'message' | 'name'>};

/** Generic strongly typed error, usable outside an RPC context. */
export class TypedError<ErrType extends string> extends ErrorBase {
  /** The error brand. Ideally a symbol, but it must serialize, so a namespaced prop is used instead. */
  // eslint-disable-next-line @typescript-eslint/prefer-as-const
  public readonly 'mion@isΣrrθr': true = true;
  /** Error type, can be used as discriminator in union types*/
  public readonly type: ErrType;
  // Optional + @nonEnumerable (see the ErrorBase note); the constructor makes them non-enumerable, so they never serialize.
  /** @nonEnumerable */
  declare message?: string;
  /** @nonEnumerable */
  declare name?: string;

  constructor({message, originalError, type}: TypedErrorParams<ErrType>) {
    const errorMessage = message || originalError?.message || '';
    super(errorMessage);
    this.type = type;

    // non-enumerable so JSON.stringify skips them
    Object.defineProperty(this, 'message', {
      value: errorMessage,
      writable: true,
      enumerable: false,
      configurable: true,
    });
    Object.defineProperty(this, 'name', {
      value: 'TypedError',
      writable: true,
      enumerable: false,
      configurable: true,
    });

    if (originalError?.stack) {
      try {
        this.stack = originalError.stack;
      } catch {
        try {
          Object.defineProperty(this, 'stack', {
            value: originalError.stack,
            writable: true,
            configurable: true,
          });
        } catch {
          // both failed: the error keeps its own generated stack
        }
      }
    }

    // `new.target` keeps a subclass's own prototype, so `instanceof Subclass` holds down the chain
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// type-rpc-error-start
export class RpcError<ErrType extends string, ErrData = any>
  extends TypedError<ErrType>
  implements RpcErrorParams<ErrType, ErrData>
{
  // `name`/`message` stay optional + @nonEnumerable as inherited from TypedError, so they stay off the wire here too.
  /** id of the error; generated as timestamp+uuid when RouterOptions.autoGenerateErrorId is true. */
  public readonly id?: number | string;
  /** the message that will be returned in the response */
  public readonly publicMessage: string;
  /** options data related to the error, ie validation data, must be json serializable */
  public readonly errorData?: Readonly<ErrData>;
  /** optional http status code */
  statusCode?: number;
  // The halting brand: true when this error ended the request (a `FatalError`, or one the router stamped).
  // Non-enumerable, so the client never sees it.
  /** @nonEnumerable */
  declare isFatal?: true;

  constructor({message, publicMessage, originalError, errorData, type, id, statusCode}: AnyErrorParams<ErrType, ErrData>) {
    const originalMessage = message || originalError?.message || publicMessage || '';

    super({
      message: originalMessage,
      originalError,
      type,
    });

    const {autoGenerateErrorId} = options;
    this.id = id ?? (autoGenerateErrorId ? randomUUID_V7() : undefined);
    this.publicMessage = publicMessage || '';
    this.errorData = errorData;
    this.statusCode = statusCode;

    Object.defineProperty(this, 'name', {
      value: 'RpcError',
      writable: true,
      enumerable: false,
      configurable: true,
    });

    Object.setPrototypeOf(this, new.target.prototype);
  }
}
// type-rpc-error-end

// type-fatal-error-start
/** A returned error that ENDS the request: the rest of the chain is skipped (only `alwaysRun` middleFns still run)
 *  and the error stays in the handler's own typed slot, so the client receives it strongly typed. Use it for gates
 *  such as auth. Same wire shape as `RpcError` (the brand never travels), so it decodes by its declared type. */
export class FatalError<ErrType extends string, ErrData = any> extends RpcError<ErrType, ErrData> {
  /** @nonEnumerable */
  declare readonly isFatal?: true;

  constructor(params: AnyErrorParams<ErrType, ErrData>) {
    super(params);
    markFatal(this);
    Object.defineProperty(this, 'name', {
      value: 'FatalError',
      writable: true,
      enumerable: false,
      configurable: true,
    });
  }
}
// type-fatal-error-end

/** Stamps the halting brand on an error (non-enumerable, never serialized). Returns the same instance. */
export function markFatal<Err extends RpcError<string>>(error: Err): Err {
  Object.defineProperty(error, 'isFatal', {
    value: true,
    writable: true,
    enumerable: false,
    configurable: true,
  });
  return error;
}

// #######  Error Type Guards #######

/** True for an RpcError, a subclass of one, or the same shape off the wire (TypedError included, never
 *  structurally distinguishable). The namespaced BRAND is the whole test: checking anything else only added
 *  false negatives on user subclasses carrying their own fields, and through `isFatalError` below that meant
 *  a FatalError that did not halt the request. */
export function isRpcError(error: any): error is RpcError<string> {
  if (!error) return false;
  return error['mion@isΣrrθr'] === true;
}

/** Returns true if the error carries the halting brand: a `FatalError`, or any error the router
 *  caught after it was thrown. Reads the brand, never `instanceof`, so a stamped plain RpcError counts. */
export function isFatalError(error: any): error is RpcError<string> & {isFatal: true} {
  return isRpcError(error) && error.isFatal === true;
}

/** A quick, non-strict check for any error: the mion brand or a Javascript Error.
 *  @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error/isError */
export function isAnyError(error: any): error is TypedError<any> | RpcError<string> | Error {
  if (!error) return false;
  const tErr = error as TypedError<string>;
  if (tErr['mion@isΣrrθr'] === true) return true;
  return isNativeError(error);
}

/** `Error.isError` when the engine has it, `instanceof Error` otherwise. Resolved ONCE: dispatch asks this
 *  of every value a handler returns and the capability never changes. `Error.isError` costs more and is kept
 *  anyway, as the only one that sees an error from another realm; missing one serializes it as a success. */
export const isNativeError: (value: unknown) => boolean =
  typeof (Error as {isError?: (value: unknown) => boolean}).isError === 'function'
    ? (Error as unknown as {isError: (value: unknown) => boolean}).isError
    : (value: unknown) => value instanceof Error;

// ############# mion error classes -> mion class serializers #############
// Registered alongside the class definitions so decoders rebuild real instances; loading @mionjs/core
// re-exports this module, which fires the registration before any decode runs.
// ⚠️ The registry is keyed by class NAME, so ONE registration per class covers EVERY generic instantiation.
registerClassSerializer<TypedError<string>>(TypedError, {
  deserialize: (data: DataOnly<TypedError<string>>) => new TypedError(data),
});

registerClassSerializer<RpcError<string>>(RpcError, {
  deserialize: (data: DataOnly<RpcError<string>>) => new RpcError(data),
});

// Own registration because the class name is part of a class type id: a handler declared `FatalError<'x'>`
// decodes back to a real FatalError, one declared `RpcError<'x'>` to an RpcError. Same wire shape either way.
registerClassSerializer<FatalError<string>>(FatalError, {
  deserialize: (data: DataOnly<FatalError<string>>) => new FatalError(data),
});
