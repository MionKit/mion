/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RouteError, addErrorToCallContext} from './errors';
import {StatusCodes} from './status-codes';
import {CallContext, InternalHooksCollection, Mutable, Obj, RouterOptions} from './types';

export const parseRequestBody = (context: CallContext, opts: RouterOptions) => {
    if (!context.rawRequest.body) return;
    try {
        if (typeof context.rawRequest.body === 'string') {
            const parsedBody = opts.bodyParser.parse(context.rawRequest.body);
            if (typeof parsedBody !== 'object')
                throw new RouteError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    name: 'Invalid Request Body',
                    publicMessage: 'Wrong request body. Expecting an json body containing the route name and parameters.',
                });
            (context.request as Mutable<Obj>).body = parsedBody;
        } else if (typeof context.rawRequest.body === 'object') {
            // lets assume the body has been already parsed, TODO: investigate possible security issues
            (context.request as Mutable<Obj>).body = context.rawRequest.body;
        } else {
            throw new RouteError({
                statusCode: StatusCodes.BAD_REQUEST,
                name: 'Invalid Request Body',
                publicMessage: 'Wrong request body, expecting a json string.',
            });
        }
    } catch (err: any) {
        if (!(err instanceof RouteError)) {
            addErrorToCallContext(
                context,
                new RouteError({
                    statusCode: StatusCodes.UNPROCESSABLE_ENTITY,
                    name: 'Parsing Request Body Error',
                    publicMessage: `Invalid request body: ${err?.message || 'unknown parsing error.'}`,
                }),
                0
            );
        }
        addErrorToCallContext(context, err, 0);
    }
};

export function stringifyResponseBody(context: CallContext, opts: RouterOptions): void {
    const respBody: Obj = context.response.body;
    if (context.response.publicErrors.length) {
        respBody.errors = context.response.publicErrors;
        (context.response.json as Mutable<string>) = opts.bodyParser.stringify(context.response.publicErrors);
    } else {
        (context.response.json as Mutable<string>) = opts.bodyParser.stringify(respBody);
    }
    context.response.headers['Content-Type'] = opts.responseContentType;
}

export const bodyParserHooks = {
    parseJsonRequestBody: {
        internalHook: parseRequestBody,
    },
    stringifyJsonResponseBody: {
        internalHook: stringifyResponseBody,
    },
} satisfies InternalHooksCollection;
