/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Hand-written MINIMAL typings for the uWebSockets.js native module — only the
// surface @mionjs/platform-uws (and a direct consumer of this loader) needs.
// Upstream ships a full index.d.ts inside its git tags; these stay deliberately
// small so the repo typechecks offline and drift is bounded by the single
// pinned tag in package.json (`uwsTag`).

/** TLS options for SSLApp; mirrors upstream's AppOptions. */
export interface AppOptions {
  key_file_name?: string;
  cert_file_name?: string;
  ca_file_name?: string;
  passphrase?: string;
  dh_params_file_name?: string;
  ssl_ciphers?: string;
  ssl_prefer_low_memory_usage?: boolean;
}

/**
 * The request handed to route handlers. ONLY valid synchronously inside the
 * handler callback — uWS reuses it after the callback returns, so read
 * everything needed (url, query, headers) before any await.
 */
export interface HttpRequest {
  getUrl(): string;
  getQuery(): string;
  getMethod(): string;
  getCaseSensitiveMethod(): string;
  getHeader(lowerCaseKey: string): string;
  forEach(cb: (key: string, value: string) => void): void;
  setYield(yieldToOtherHandlers: boolean): HttpRequest;
}

/** The response object. Headers are write-only and must precede end(). */
export interface HttpResponse {
  writeStatus(status: string): HttpResponse;
  writeHeader(key: string, value: string): HttpResponse;
  write(chunk: string | ArrayBuffer | Uint8Array): boolean;
  end(body?: string | ArrayBuffer | Uint8Array, closeConnection?: boolean): HttpResponse;
  tryEnd(chunk: string | ArrayBuffer | Uint8Array, totalSize: number): [boolean, boolean];
  close(): HttpResponse;
  cork(cb: () => void): HttpResponse;
  onData(handler: (chunk: ArrayBuffer, isLast: boolean) => void): HttpResponse;
  /** Assembles the whole request body natively, calling back once; null when it exceeds maxSize.
   *  Single-read bodies are a zero-copy window DETACHED when the handler returns (copy before any
   *  await); multi-read bodies are assembled in C++ and their memory is ownership-transferred. */
  collectBody(maxSize: number, handler: (fullBody: ArrayBuffer | null) => void): HttpResponse;
  onDataV2(handler: (chunk: ArrayBuffer, maxRemainingBodyLength: bigint) => void): HttpResponse;
  onAborted(handler: () => void): HttpResponse;
  onWritable(handler: (offset: number) => boolean): HttpResponse;
  getWriteOffset(): number;
  getRemoteAddressAsText(): ArrayBuffer;
}

/** Opaque listen socket handle; pass to us_listen_socket_close to stop listening. */
export interface us_listen_socket {
  readonly __us_listen_socket: unique symbol;
}

export type UwsHttpHandler = (res: HttpResponse, req: HttpRequest) => void;

/** An app returned by App()/SSLApp(); routes register before listen(). */
export interface TemplatedApp {
  listen(port: number, cb: (listenSocket: us_listen_socket | false) => void): TemplatedApp;
  listen(host: string, port: number, cb: (listenSocket: us_listen_socket | false) => void): TemplatedApp;
  any(pattern: string, handler: UwsHttpHandler): TemplatedApp;
  get(pattern: string, handler: UwsHttpHandler): TemplatedApp;
  post(pattern: string, handler: UwsHttpHandler): TemplatedApp;
  put(pattern: string, handler: UwsHttpHandler): TemplatedApp;
  del(pattern: string, handler: UwsHttpHandler): TemplatedApp;
  options(pattern: string, handler: UwsHttpHandler): TemplatedApp;
  close(): TemplatedApp;
}

/** The native module's exports (the addon IS the whole API). */
export interface UwsNative {
  App(options?: AppOptions): TemplatedApp;
  SSLApp(options: AppOptions): TemplatedApp;
  us_listen_socket_close(socket: us_listen_socket): void;
}

/** Host triple override for tests; production callers pass nothing. */
export interface UwsHostInfo {
  platform?: string;
  arch?: string;
  abi?: string;
  env?: Record<string, string | undefined>;
}

/** Absolute path of the host's uws_<platform>_<arch>_<abi>.node binary. */
export function resolveUwsBinaryPath(host?: UwsHostInfo): string;

/** Loads (once) and returns the uWebSockets.js native module for the host. */
export function loadUws(): UwsNative;
