/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// type-cloudflare-handler-options-start
export interface CloudflareHandlerOptions {
  /** Set of default response headers to add to every response */
  defaultResponseHeaders: Record<string, string>;
  /** Path prefix to strip from incoming URL (e.g., '/api/mion') */
  basePath: string;
  /** The request limit a route takes when its own `maxBodySize` option is unset and its types cannot
   *  say, in bytes (128 KB by default). A route's option always wins over it; the platform's own
   *  request ceiling still applies on top. */
  maxBodySize: number;
  /** The platform's own request ceiling in bytes, which no other option can raise: the router never
   *  resolves a limit above it. Defaults to the platform's documented ceiling; set it by hand when your plan allows
   *  more or the vendor changes it. */
  maxBodySizeCap?: number;
}
// type-cloudflare-handler-options-end

/** Cloudflare Worker execution context */
export interface CloudflareExecutionContext {
  waitUntil(promise: Promise<any>): void;
  passThroughOnException(): void;
}

/** Combined Cloudflare platform context passed as rawResponse to dispatchRoute */
export interface CloudflarePlatformContext<Env = unknown> {
  env: Env;
  ctx: CloudflareExecutionContext;
}
