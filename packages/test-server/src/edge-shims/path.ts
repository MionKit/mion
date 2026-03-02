/** Lightweight path.join polyfill for edge runtime (used only in error messages) */
export function join(...parts: string[]): string {
    return parts.filter(Boolean).join('/');
}
