/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ClientContext} from 'aws-lambda';
import {DEFAULT_PREFILL_OPTIONS} from './constants';
import {ClientOptions, RemoteCall, RequestData, ResponseData} from './types';

let clientOptions: ClientOptions = {
    ...DEFAULT_PREFILL_OPTIONS,
};

export const setClientOptions = (prefillOptions_: Partial<ClientOptions> = {}) => {
    clientOptions = {
        ...clientOptions,
        ...prefillOptions_,
    };
};

export function initClient<R>() {}

export const remote = <REQ extends RequestData, RESP extends ResponseData>(
    path: string,
    ...args: any[]
): RemoteCall<REQ, RESP> => {
    let requestData: RequestData = {
        ...(args.length ? {path: args} : {}),
    };
    const remoteCall: RemoteCall<REQ, RESP> = {
        data: (reqData: Partial<REQ> = {}) => {
            requestData = {
                ...reqData,
                ...requestData,
            };
            return remoteCall;
        },
        call: async (): Promise<RESP> => {
            const headers = getHeaders(requestData, null);
            const body = getBody(requestData, null);
            // TODO split data in headers
            const response = await fetch(clientOptions.apiURL, {
                headers: {
                    'content-type': 'application/json',
                    ...headers,
                },
                body: Object.keys(body).length ? JSON.stringify(body) : '',
            });
            return response.json();
        },
    };

    return remoteCall;
};

const getHeaders = (requestData: RequestData, remoteExecutable): RequestData => {
    // TODO: SPLIT headers
    return {};
};

const getBody = (requestData: RequestData, remoteExecutable): RequestData => {
    // TODO: SPLIT Body
    return {};
};

export const prefillData = <ARGS extends any[]>(fieldName: string, ...args: ARGS): void => {};
