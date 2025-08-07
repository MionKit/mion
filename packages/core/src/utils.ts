/* ###############
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ############### */

/** Generates a random UUID V7, no hyphens are included in the uuid */
export function randomUUID_V7(): string {
    const uuid = crypto.randomUUID();
    const timestamp = BigInt(Date.now());
    const tHex = timestamp.toString(16).padStart(12, '0');
    return `${tHex.substring(0, 8)}-${tHex.substring(8)}-7${uuid.substring(15)}`;
}

/**
 * Browser-safe function to access environment variables.
 * Returns undefined when running in browser environments where process is not available.
 * @param key - The environment variable key to retrieve
 * @returns The environment variable value or undefined if not available/in browser
 */
export function getENV(key: string): string | undefined {
    if (typeof process !== 'undefined' && process.env) {
        return process.env[key];
    }
    return undefined;
}
