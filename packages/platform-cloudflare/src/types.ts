/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

export interface CloudflareHandlerOptions {
  /** Path prefix to strip from incoming URL (e.g., '/api/mion') */
  basePath: string;
  /** Bytes a route takes when its own `maxBodySize` and its types say nothing (128 KB); the platform ceiling applies on top. */
  maxBodySize: number;
  /** The platform's request ceiling in bytes that no option can raise; set it when your plan or the vendor differs. */
  maxBodySizeCap?: number;
}

export interface CloudflareExecutionContext {
  waitUntil(promise: Promise<any>): void;
  passThroughOnException(): void;
}

/** Passed to the dispatch as `rawResponse`, so route handlers can reach env and ctx. */
export interface CloudflarePlatformContext<Env = unknown> {
  env: Env;
  ctx: CloudflareExecutionContext;
}
