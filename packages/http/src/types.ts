/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {Context, Obj, RawServerCallContext} from '@mionkit/core';
import {FullRouterOptions} from '@mionkit/router';
import {IncomingMessage, ServerResponse} from 'http';
import {ServerOptions} from 'https';

export type HttpOptions = {
    protocol: 'http' | 'https';
    port: number;
    /** ServerOptions.maxHeaderSize defaults to 8KB, same as default value in new node versions */
    options: ServerOptions;
    /** use callback instead promises for handling the requests */
    useCallbacks: boolean;
};

export type FullHttpOptions<RawContext extends RawServerCallContext = RawServerCallContext> = HttpOptions &
    FullRouterOptions<RawContext>;

export type HttpRequest = IncomingMessage & {body: string};

export type HttpRawServerContext = RawServerCallContext<HttpRequest, ServerResponse>;

export type HttpCallContext<SharedData extends Obj> = Context<SharedData, HttpRawServerContext>;
