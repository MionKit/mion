/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {CoreRouterOptions, AnyErrorParams, TypedErrorParams, RpcErrorParams, RunTypeError} from './types/general.types.ts';
import {DEFAULT_CORE_OPTIONS} from './constants.ts';
import {randomUUID_V7} from './utils.ts';
import {registerClassSerializer} from '@mionjs/run-types';
import type {DataOnly} from '@mionjs/run-types';

// ############# Validation Error Types #############

/**
 * Error data structure for validation errors.
 * Contains the list of type errors from parameter validation.
 */
export interface ValidationErrorData {
  /** List of type validation errors with paths and expected types */
  typeErrors: RunTypeError[];
}

/**
 * Strongly typed validation error.
 * Thrown when route or middleFn parameters fail type validation.
 * This type is included in the client error unions so validation errors can be properly typed.
 */
export type ValidationError = RpcError<'validation-error', ValidationErrorData>;

let options: CoreRouterOptions = {...DEFAULT_CORE_OPTIONS};

export function setErrorOptions(opts: CoreRouterOptions) {
  options = opts;
}

// `Error` re-typed so `message`/`name` are NOT inherited as required members. They are
// re-added below as OPTIONAL + @nonEnumerable so the resolver emits a runtime enumerability
// guard for them; the constructor defines them non-enumerable, so they are skipped when
// serializing (mion keeps the internal message off the wire and exposes `publicMessage`),
// while `DataOnly<T>` stays consistent (they are optional in the projected shape). Runtime
// is still `Error`, so `instanceof Error` holds. `stack`/`cause` stay inherited (optional).
const ErrorBase = Error as unknown as {new (message?: string): Omit<Error, 'message' | 'name'>};

/**
 * Generic strongly typed error class that can be used outside RPC context.
 * Contains the core error properties: mion@isΣrrθr, type, and message.
 */
export class TypedError<ErrType extends string> extends ErrorBase {
  /**
   * Unique error identifier,
   * Ideally this should be a symbol but we need to be able to serialize it so a namespaced prop is used instead
   */
  // eslint-disable-next-line @typescript-eslint/prefer-as-const
  public readonly 'mion@isΣrrθr': true = true;
  /** Error type, can be used as discriminator in union types*/
  public readonly type: ErrType;
  // Re-added as optional + @nonEnumerable (see the ErrorBase note above); the constructor
  // defines them non-enumerable, so they are dropped from the serialized envelope.
  /** @nonEnumerable */
  declare message?: string;
  /** @nonEnumerable */
  declare name?: string;

  constructor({message, originalError, type}: TypedErrorParams<ErrType>) {
    const errorMessage = message || originalError?.message || '';
    super(errorMessage);
    this.type = type;

    // Set message and name as non-enumerable to exclude from JSON.stringify
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
        // Fallback to defineProperty if direct assignment fails
        try {
          Object.defineProperty(this, 'stack', {
            value: originalError.stack,
            writable: true,
            configurable: true,
          });
        } catch {
          // If both methods fail, the error will use its own generated stack
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
  // `name`/`message` are inherited from TypedError as OPTIONAL + @nonEnumerable
  // (see there), so they stay off the wire here too; the constructor just overrides
  // `name`'s value to 'RpcError' (still non-enumerable).
  /**
   * id of the error, ideally each error should unique identifiable
   * * if RouterOptions.autoGenerateErrorId is set to true and id with timestamp+uuid will be generated
   * */
  public readonly id?: number | string;
  /** the message that will be returned in the response */
  public readonly publicMessage: string;
  /** options data related to the error, ie validation data, must be json serializable */
  public readonly errorData?: Readonly<ErrData>;
  /** optional http status code */
  statusCode?: number;
  // The halting brand: true when this error ended the request (a thrown error, stamped by the
  // router, or a `FatalError`). Off the wire (non-enumerable), the client never sees it.
  /** @nonEnumerable */
  declare isFatal?: true;

  constructor({message, publicMessage, originalError, errorData, type, id, statusCode}: AnyErrorParams<ErrType, ErrData>) {
    const originalMessage = message || originalError?.message || publicMessage || '';

    // Call parent TypedError constructor
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

    // Override name to be non-enumerable
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
/**
 * A returned error that ENDS the request: the rest of the execution chain is skipped (only
 * `alwaysRun` middleFns still run) while the error stays in the handler's own typed slot, so the
 * client receives it strongly typed. Use it for gates such as auth, where the route must not run.
 * Same wire shape as `RpcError` (the brand never travels), so it decodes by its declared type.
 */
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

/**
 * Returns true if the error is an RpcError, a subclass of one, or the same shape off the wire.
 *
 * The BRAND is the whole test. It is namespaced precisely so nothing sets it by accident, so
 * checking anything else only ever produced false negatives: `type` is a constructor invariant,
 * and a key-set check rejected the one thing a framework must not reject, a user subclass
 * carrying its own fields. That mattered most through `isFatalError` below, where a rejected
 * subclass meant a FatalError that did not halt the request. Covers TypedError too, which was
 * never distinguishable from an RpcError structurally.
 */
export function isRpcError(error: any): error is RpcError<string> {
  if (!error) return false;
  return error['mion@isΣrrθr'] === true;
}

/** Returns true if the error carries the halting brand: a `FatalError`, or any error the router
 *  caught after it was thrown. Reads the brand, never `instanceof`, so a stamped plain RpcError counts. */
export function isFatalError(error: any): error is RpcError<string> & {isFatal: true} {
  return isRpcError(error) && error.isFatal === true;
}

/**
 * Returns true if the error is a TypedError, RpcError, or any other Javascript Error.
 * if available uses Error.isError() or 'mion@isΣrrθr' prop from TypedError
 * Does not do strict type checking. This function is intended to quickly identify errors.
 * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error/isError
 */
export function isAnyError(error: any): error is TypedError<any> | RpcError<string> | Error {
  if (!error) return false;
  const tErr = error as TypedError<string>;
  if (tErr['mion@isΣrrθr'] === true) return true;
  return isNativeError(error);
}

/** `Error.isError` when the engine has it, `instanceof Error` otherwise. Resolved ONCE: the
 *  capability never changes at runtime, and dispatch asks this of every value a handler returns.
 *  `Error.isError` is the dearer of the two and kept anyway, because it is the only one that sees an
 *  error made in another realm, and missing one means serializing it into the body as a success. */
export const isNativeError: (value: unknown) => boolean =
  typeof (Error as {isError?: (value: unknown) => boolean}).isError === 'function'
    ? (Error as unknown as {isError: (value: unknown) => boolean}).isError
    : (value: unknown) => value instanceof Error;

// ############# mion error classes -> mion class serializers #############
// Registered here, alongside the class definitions, so JSON decoders rebuild real
// instances (`instanceof RpcError` holds after a round trip). Loading @mionjs/core (which
// re-exports this module) fires the registration before any decode runs.
//
// ⚠️ mion keys the registry by the class-NAME lane (since 0.9.2), so ONE registration
// per class covers EVERY generic instantiation the program uses, not just the <string> projection.
registerClassSerializer<TypedError<string>>(TypedError, {
  deserialize: (data: DataOnly<TypedError<string>>) => new TypedError(data),
});

registerClassSerializer<RpcError<string>>(RpcError, {
  deserialize: (data: DataOnly<RpcError<string>>) => new RpcError(data),
});

// Same wire shape as RpcError (the brand never travels). Registered under its own name because the
// class name is part of a class type id: a handler declared `FatalError<'x'>` decodes through this
// lane and comes back as a real FatalError; one declared `RpcError<'x'>` comes back as an RpcError.
registerClassSerializer<FatalError<string>>(FatalError, {
  deserialize: (data: DataOnly<FatalError<string>>) => new FatalError(data),
});
