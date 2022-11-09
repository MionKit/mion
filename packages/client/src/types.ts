/* ########
 * 2022 MikroKit
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {SerializedTypes} from '@deepkit/type';
import {Executable} from '@mikrokit/router';

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
    'handler' | 'paramValidators' | 'paramsDeSerializers' | 'outputSerializer' | 'handlerType' | 'src'
> & {
    // paramValidators: RouteParamValidator[];
    // paramsDeSerializers: RouteParamDeserializer[];
    // outputSerializer: RouteOutputSerializer;
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
