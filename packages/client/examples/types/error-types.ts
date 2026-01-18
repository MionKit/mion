import {RpcError} from '@mionkit/core';

// start-result
type Result<RouteSuccess, RouteError, HooksResults, HooksErrors> = [
    RouteSuccess | undefined,
    RouteError | undefined,
    HooksResults | undefined,
    HooksErrors | undefined,
];
// end-result

// start-call-with-hooks-result
type HookSuccess<T> = T extends {resolvedValue?: infer V} ? V : never;
type HookError<T> = T extends {error?: infer E} ? E : never;

type CallWithHooksResult<RouteSuccess, RouteError, Hooks> = [
    RouteSuccess | undefined,
    RouteError | undefined,
    {[K in keyof Hooks]?: HookSuccess<Hooks[K]>} | undefined,
    {[K in keyof Hooks]?: HookError<Hooks[K]>} | undefined,
];
// end-call-with-hooks-result

// start-typed-event
class TypedEvent<S = void, E extends RpcError<string, any> = never> {
    /** Register persistent success handler */
    onSuccess(handler: (result: S) => void): TypedEvent<S, E> {
        return this;
    }

    /** Register persistent error handler for specific error type */
    onError<T extends E['type']>(errorType: T, handler: (error: Extract<E, {type: T}>) => void): TypedEvent<S, E> {
        return this;
    }

    /** Remove a registered error handler */
    offError<T extends E['type']>(errorType: T): TypedEvent<S, E> {
        return this;
    }

    /** Remove success handler */
    offSuccess(): TypedEvent<S, E> {
        return this;
    }
}
// end-typed-event

// start-rpc-error
class RpcErrorType<T extends string = string, ErrData = unknown> extends Error {
    /** Error type identifier for typed handling */
    type: T;
    /** HTTP status code */
    statusCode: number;
    /** Public message sent to client */
    publicMessage: string;
    /** Optional typed error data */
    errorData?: ErrData;

    constructor(opts: {type: T; statusCode?: number; publicMessage: string; errorData?: ErrData}) {
        super(opts.publicMessage);
        this.type = opts.type;
        this.statusCode = opts.statusCode ?? 500;
        this.publicMessage = opts.publicMessage;
        this.errorData = opts.errorData;
    }
}
// end-rpc-error

