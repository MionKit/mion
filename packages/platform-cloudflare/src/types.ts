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
  /** Bytes a route takes when its own `maxBodySize` and its types say nothing (128 KB); the platform ceiling applies on top. */
  maxBodySize: number;
  /** The platform's request ceiling in bytes that no option can raise; set it when your plan or the vendor differs. */
  maxBodySizeCap?: number;
}
// type-cloudflare-handler-options-end

export interface CloudflareExecutionContext {
  waitUntil(promise: Promise<any>): void;
  passThroughOnException(): void;
}

/** Passed to the dispatch as `rawResponse`, so route handlers can reach env and ctx. */
export interface CloudflarePlatformContext<Env = unknown> {
  env: Env;
  ctx: CloudflareExecutionContext;
}
