/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {
    CoreRouterOptions,
    AnyErrorParams,
    TypedErrorParams,
    RpcErrorParams,
    RunTypeError,
    StrNumber,
} from './types/general.types.ts';
import {DEFAULT_CORE_OPTIONS} from './constants.ts';
import {randomUUID_V7} from './utils.ts';
import {registerClassSerializer} from '@ts-runtypes/core';
import type {DataOnly} from '@ts-runtypes/core';

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
// re-added below as OPTIONAL + @nonEnumerable so @ts-runtypes emits a runtime enumerability
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

        Object.setPrototypeOf(this, TypedError.prototype);
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

        Object.setPrototypeOf(this, RpcError.prototype);
    }
}
// type-rpc-error-end

// #######  Error Type Guards #######

function hasUnknownKeys(obj: Record<StrNumber, any>, keys: StrNumber[]): boolean {
    for (const prop in obj) {
        // iterates over the object keys and if not found prop adds to unknownKeys
        let found = false;
        for (let j = 0; j < keys.length; j++) {
            if (keys[j] === prop) {
                found = true;
                break;
            }
        }
        if (!found) return true;
    }
    return false;
}

/** Returns true if the error is a TypedError or has the same structure. */
export function isTypedError(error: any): error is TypedError<any> {
    if (!error) return false;
    if (error instanceof TypedError) return true;
    // name/stack are Error base props: serialized error shapes may carry them
    return (
        error &&
        error['mion@isΣrrθr'] === true &&
        (typeof error.type === 'string' || typeof error.type === 'number') &&
        !hasUnknownKeys(error, ['mion@isΣrrθr', 'type', 'message', 'name', 'stack'])
    );
}

/** Returns true if the error is a RpcError or has the same structure. */
export function isRpcError(error: any): error is RpcError<string> {
    if (!error) return false;
    if (error instanceof RpcError) return true;
    // name/stack are Error base props: serialized error shapes may carry them
    return (
        error &&
        error['mion@isΣrrθr'] === true &&
        (typeof error.type === 'string' || typeof error.type === 'number') &&
        (error.id === undefined || typeof error.id === 'string' || typeof error.id === 'number') &&
        !hasUnknownKeys(error, [
            'mion@isΣrrθr',
            'id',
            'message',
            'publicMessage',
            'errorData',
            'type',
            'statusCode',
            'name',
            'stack',
        ])
    );
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
    if (typeof (Error as any).isError === 'function') return (Error as any).isError(error);
    return error instanceof Error;
}

/**
 * @deprecated no-op since the ts-runtypes migration: TypedError/RpcError are registered with
 * the ts-runtypes class-serializer registry at the bottom of this module (see below), which
 * every mion server/client loads. For custom classes use registerClassSerializer instead.
 */
export function registerErrorDeserializers() {}

// ############# mion error classes -> ts-runtypes class serializers #############
// Registered here, alongside the class definitions, so JSON/binary decoders rebuild real
// instances (`instanceof RpcError` holds after a round trip). Loading @mionjs/core (which
// re-exports this module) fires the registration before any decode runs.
//
// ⚠️ ts-runtypes keys the registry by the class-NAME lane (since 0.9.2), so ONE registration
// per class covers EVERY generic instantiation the program uses, not just the <string> projection.
registerClassSerializer<TypedError<string>>(TypedError, {
    deserialize: (data: DataOnly<TypedError<string>>) => new TypedError(data),
});

registerClassSerializer<RpcError<string>>(RpcError, {
    deserialize: (data: DataOnly<RpcError<string>>) => new RpcError(data),
});
