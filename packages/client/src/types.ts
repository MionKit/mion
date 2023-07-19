/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {SerializedTypes} from '@deepkit/type';
import type {Executable, Route, HookDef, Handler, CallContext} from '@mionkit/router';

export type ClientOptions = {
    apiURL: string;
    prefillStorage: 'localStorage' | 'sessionStorage' | 'none';
};

export type RequestData = {
    [key: string]: any[];
};

export type ResponseData = {
    [key: string]: any;
};

export type RemoteExecutable = Omit<
    Executable,
    'handler' | 'paramValidators' | 'paramsDeSerializers' | 'returnValueSerializer' | 'handlerType' | 'src'
> & {
    // paramValidators: FunctionParamValidator[];
    // paramsDeSerializers: FunctionParamDeserializer[];
    // returnValueSerializer: FunctionReturnSerializer;
    serializedHandler: SerializedTypes;
};

export interface RemoteCall<Request, Response> {
    data: (request: Partial<Request>) => this;
    call: () => Promise<Response>;
}

/** Prefill data for  remote route or hook */
export type RemotePrefill<F> = F extends (arg0: any, ...rest: infer ARG) => any ? (...rest: ARG) => void : never;
/** Remote route call */
export type RemoteHandler<F, Request, Response> = F extends (arg0: any, ...rest: infer ARG) => any
    ? (...rest: ARG) => RemoteCall<Request, Response>
    : never;

export type RemoteParams<F> = F extends (arg0: any, ...rest: infer ARG) => infer R ? ARG : never;
export type RemoteReturn<F> = F extends (arg0: any, ...rest: infer ARG) => infer R ? Awaited<R> : never;

// ########## remote maps ###########

// export type ReHandler<H> = H;

// export type ClientRoute<RO> = {
//     [P in keyof RO]: RO[P] extends (arg0: Context<any, any>, ...rest: infer Req) => infer Resp
//         ? (...rest: Req) => Promise<Awaited<Resp>>
//         : RO[P];
// };

// export type RHandler<H extends Handler> = H extends (arg0: Context<any, any>, ...rest: infer Req) => infer Resp
//     ? (...rest: Req) => Promise<Awaited<Resp>>
//     : never;

// export type RemoteRoute<R extends Route> = {
//     [P in keyof R]: R[P] extends (arg0: Context<any, any>, ...rest: infer Req) => infer Resp
//         ? (...rest: Req) => Promise<Awaited<Resp>>
//         : R[P];
// };

// export type RemoteRoute<R extends Route> = R extends Route ? RemoteRoute<R> : R extends Handler ? RHandler<R> : never;

// const sum = {
//     /** Route Handler */
//     route: (c: any, a: number, b: number) => a + b,
// };
// const sum2 = (c: any, a: number, b: number) => a + b;

// type Sum = typeof sum;
// type Sum2 = typeof sum2;
// type ClientSum = RemoteRoute<Sum>;
// type ClientSum2 = RemoteRoute<Sum2>;
