/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ServerOptions} from 'https';
import type {BinaryOptionsPatch} from '@mionjs/core';

// type-node-http-options-start
export interface NodeHttpOptions {
  protocol: 'http' | 'https';
  port: number;
  /** Native node's ServerOptions. By default maxHeaderSize defaults to 8KB, same as in latest node versions */
  options: ServerOptions;
  /** Set of default response header to add to every response*/
  defaultResponseHeaders: Record<string, string>;
  /**
   * 256KB by default, same as lambda payload
   * @link https://docs.aws.amazon.com/lambda/latest/operatorguide/payload.html
   * */
  maxBodySize: number; // default 256KB
  /**
   * Binary serialization options: buffer pooling, response-size statistics, and the mion
   * string cache. Pooling is armed by default on this platform — node's 'finish'/'close' events
   * give a proven-safe point to hand the buffer back, so responses reuse buffers instead of
   * allocating one per request. Turn it off with `{pool: {enabled: false}}`.
   */
  binary: BinaryOptionsPatch;
  /**
   * The HOST owns the socket: `startNodeServer()` builds the server and publishes the platform
   * config but never calls `listen()`, and installs no SIGINT/SIGTERM handlers (they would exit
   * the host's process). Mount `httpRequestHandler` wherever the host wants it — a vite dev
   * server (this is what `mionVitePlugin({server: {runMode: 'middleware'}})` sets for you), an
   * express/connect app, or your own `http.createServer`.
   */
  asMiddleware: boolean;
}
// type-node-http-options-end

// // fix for missing fetch types in node 18
// // @see https://stackoverflow.com/questions/71294230/how-can-i-use-native-fetch-with-node-in-typescript-node-v17-6
// declare global {
//     export const {fetch, FormData, Headers, Request, Response}: typeof import('undici');
//     type FormData = undici_types.FormData;
//     type Headers = undici_types.Headers;
//     type HeadersInit = undici_types.HeadersInit;
//     type BodyInit = undici_types.BodyInit;
//     type Request = undici_types.Request;
//     type RequestInit = undici_types.RequestInit;
//     type RequestInfo = undici_types.RequestInfo;
//     type RequestMode = undici_types.RequestMode;
//     type RequestRedirect = undici_types.RequestRedirect;
//     type RequestCredentials = undici_types.RequestCredentials;
//     type RequestDestination = undici_types.RequestDestination;
//     type ReferrerPolicy = undici_types.ReferrerPolicy;
//     type Response = undici_types.Response;
//     type ResponseInit = undici_types.ResponseInit;
//     type ResponseType = undici_types.ResponseType;
// }
