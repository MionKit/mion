/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {BinaryOptionsPatch} from '@mionjs/core';

/** Bun serve options without fetch/error handlers (those are provided by mion) */
type BunServeOptions = Omit<Bun.Serve.BaseServeOptions<unknown>, 'error'> &
  Omit<Bun.Serve.HostnamePortServeOptions<unknown>, 'error'>;

// type-bun-http-options-start
export interface BunHttpOptions {
  port: number;
  /** Bun's native Server Options */
  options: BunServeOptions;
  /** Set of default response header to add to every response*/
  defaultResponseHeaders: Record<string, string>;
  /**
   * 256KB by default, same as lambda payload
   * @link https://docs.aws.amazon.com/lambda/latest/operatorguide/payload.html
   * */
  maxBodySize: number; // default 256KB
  /**
   * Binary serialization options: buffer pooling, response-size statistics, and the mion
   * string cache. Pooling is armed by default on this platform — Bun copies the bytes into the
   * Response synchronously (proven in bunHttp.binary.test.ts), so the buffer can be handed back as
   * soon as the Response is constructed. Turn it off with `{pool: {enabled: false}}`.
   */
  binary: BinaryOptionsPatch;
  /**
   * The HOST owns the socket: `startBunServer()` registers everything and publishes the platform
   * config but never calls `Bun.serve()`, and installs no SIGINT/SIGTERM handlers (they would exit
   * the host's process). Mount `bunRequestHandler` wherever the host wants it — your own
   * `Bun.serve({fetch})`, or a vite dev server through
   * `mionVitePlugin({server: {runMode: 'middleware', platform: '@mionjs/platform-bun'}})`.
   */
  asMiddleware: boolean;
}
// type-bun-http-options-end
