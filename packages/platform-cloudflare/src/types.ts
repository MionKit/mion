/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

export interface CloudflareHandlerOptions {
    /** Set of default response headers to add to every response */
    defaultResponseHeaders: Record<string, string>;
    /** Path prefix to strip from incoming URL (e.g., '/api/mion') */
    basePath: string;
}

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
