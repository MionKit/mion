/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

/**
 * Options for HTTP headers
 */
export interface HeaderOptions {
    [key: string]: any;
}

/**
 * Options for HTTP cookies
 */
export interface CookieOptions {
    maxAge?: number;
    expires?: Date;
    path?: string;
    domain?: string;
    secure?: boolean;
    httpOnly?: boolean;
    sameSite?: 'Strict' | 'Lax' | 'None';
    [key: string]: any;
}

/**
 * Represents an HTTP header parameter with a specific name and optional value
 * Used to declare that a handler parameter should be populated from an HTTP header
 *
 * @example
 * ```ts
 * hook((ctx, auth: HttpHeader<'authorization'>): string => {
 *   return auth.value;
 * })
 * ```
 */
export class HttpHeader<Name extends string = string, Value = string> {
    constructor(
        public name: Name,
        public value: Value,
        public options?: HeaderOptions
    ) {}
}

/**
 * Represents an HTTP cookie parameter with a specific name
 * Used to declare that a handler parameter should be populated from an HTTP cookie
 *
 * @example
 * ```ts
 * hook((ctx, session: Cookie<'session-id'>): string => {
 *   return session.value;
 * })
 * ```
 */
export class Cookie<Name extends string = string> {
    constructor(
        public name: Name,
        public value: string,
        public options?: CookieOptions
    ) {}
}

/**
 * Represents a body parameter wrapper
 * Used to explicitly declare that a handler parameter should be populated from the request body
 * This is useful when mixing with header/cookie parameters
 *
 * @example
 * ```ts
 * hook((ctx, auth: HttpHeader<'authorization'>, data: BodyParam<User>): string => {
 *   return `${auth.value}:${data.value.name}`;
 * })
 * ```
 */
export class BodyParam<T = any> {
    constructor(public value: T) {}
}
