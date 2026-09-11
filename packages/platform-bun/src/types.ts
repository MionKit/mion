/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

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
  /** The request limit a route takes when its own option is unset and its types cannot say (128 KB by
   *  default). A route's `maxBodySize` option always wins over it. */
  maxBodySize: number;
  /** The platform's own request ceiling in bytes, which no other option can raise; unset because this
   *  platform has none. The router never resolves a limit above it when set. */
  maxBodySizeCap?: number;
  /**
   * The HOST owns the socket: `startBunServer()` registers everything and publishes the platform
   * config but never calls `Bun.serve()`, and installs no SIGINT/SIGTERM handlers (they would exit
   * the host's process). Mount `bunRequestHandler` wherever the host wants it — your own
   * `Bun.serve({fetch})`, or a vite dev server through
   * `mionVitePlugin({server: {startScript, platform: '@mionjs/platform-bun'}})`.
   */
  asMiddleware: boolean;
}
// type-bun-http-options-end
