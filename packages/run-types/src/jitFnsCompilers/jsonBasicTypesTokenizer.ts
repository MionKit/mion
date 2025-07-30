/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

/**
 * JSON Basic Types Tokenizer
 *
 * This module provides functions to parse individual JSON tokens from strings.
 * Each function returns both the parsed value and the length consumed, allowing
 * parent parsers to continue from the correct position.
 */

export interface ParseResult<T> {
    value: T;
    nextPos: number; // Absolute position after parsing (startIndex + consumed)
}

/**
 * Parse a JSON number from the beginning of a string
 * Supports: 1, 1.4, -1, -3.56, 1e5, -2.3e-4, etc.
 */
export function parseJsonNumber(str: string, startIndex: number = 0): ParseResult<number> {
    let i = startIndex;
    const len = str.length;

    if (i >= len) {
        throw new Error(`Expected number at position ${startIndex}, but reached end of string`);
    }

    // Optional minus sign
    if (str[i] === '-') {
        i++;
    }

    if (i >= len || !isDigit(str[i])) {
        throw new Error(`Expected digit at position ${i}, found '${str[i] || 'EOF'}'`);
    }

    // Integer part
    if (str[i] === '0') {
        i++; // Single zero
        // Check for invalid leading zero (like "01", "02", etc.)
        if (i < len && isDigit(str[i])) {
            throw new Error(`Invalid number: leading zeros not allowed at position ${startIndex}`);
        }
    } else {
        // Non-zero digit followed by optional digits
        while (i < len && isDigit(str[i])) {
            i++;
        }
    }

    // Optional fractional part
    if (i < len && str[i] === '.') {
        i++; // consume '.'
        if (i >= len || !isDigit(str[i])) {
            throw new Error(`Expected digit after decimal point at position ${i}`);
        }
        while (i < len && isDigit(str[i])) {
            i++;
        }
    }

    // Optional exponent part
    if (i < len && (str[i] === 'e' || str[i] === 'E')) {
        i++; // consume 'e' or 'E'
        if (i < len && (str[i] === '+' || str[i] === '-')) {
            i++; // consume optional sign
        }
        if (i >= len || !isDigit(str[i])) {
            throw new Error(`Expected digit in exponent at position ${i}`);
        }
        while (i < len && isDigit(str[i])) {
            i++;
        }
    }

    const numberStr = str.substring(startIndex, i);
    const value = Number(numberStr);

    if (isNaN(value)) {
        throw new Error(`Invalid number: ${numberStr}`);
    }

    return {
        value,
        nextPos: i,
    };
}

/**
 * Parse a JSON string from the beginning of a string
 * Supports: "hello", "hello \"world\"", "line1\nline2", etc.
 */
export function parseJsonString(str: string, startIndex: number = 0): ParseResult<string> {
    let i = startIndex;
    const len = str.length;

    if (i >= len || str[i] !== '"') {
        throw new Error(`Expected '"' at position ${startIndex}, found '${str[i] || 'EOF'}'`);
    }

    i++; // consume opening quote
    let result = '';

    while (i < len) {
        const char = str[i];

        if (char === '"') {
            // End of string
            i++; // consume closing quote
            return {
                value: result,
                nextPos: i,
            };
        }

        if (char === '\\') {
            // Escape sequence
            i++; // consume backslash
            if (i >= len) {
                throw new Error(`Unexpected end of string in escape sequence at position ${i}`);
            }

            const escaped = str[i];
            switch (escaped) {
                case '"':
                    result += '"';
                    break;
                case '\\':
                    result += '\\';
                    break;
                case '/':
                    result += '/';
                    break;
                case 'b':
                    result += '\b';
                    break;
                case 'f':
                    result += '\f';
                    break;
                case 'n':
                    result += '\n';
                    break;
                case 'r':
                    result += '\r';
                    break;
                case 't':
                    result += '\t';
                    break;
                case 'u':
                    // Unicode escape sequence \uXXXX
                    if (i + 4 >= len) {
                        throw new Error(`Incomplete unicode escape sequence at position ${i}`);
                    }
                    const hexCode = str.substring(i + 1, i + 5);
                    if (!/^[0-9a-fA-F]{4}$/.test(hexCode)) {
                        throw new Error(`Invalid unicode escape sequence \\u${hexCode} at position ${i}`);
                    }
                    result += String.fromCharCode(parseInt(hexCode, 16));
                    i += 5; // consume 'u' + 4 hex digits
                    break;
                default:
                    throw new Error(`Invalid escape sequence \\${escaped} at position ${i}`);
            }
            if (escaped !== 'u') {
                i++; // increment for non-unicode escapes
            }
        } else if (char < ' ') {
            // Control characters must be escaped
            throw new Error(`Unescaped control character at position ${i}`);
        } else {
            result += char;
            i++;
        }
    }

    throw new Error(`Unterminated string starting at position ${startIndex}`);
}

/**
 * Parse JSON null literal
 */
export function parseJsonNull(str: string, startIndex: number = 0): ParseResult<null> {
    const remaining = str.substring(startIndex);

    if (remaining.startsWith('null')) {
        return {value: null, nextPos: startIndex + 4};
    }

    throw new Error(`Expected null at position ${startIndex}, found '${remaining.substring(0, 4)}'`);
}

/**
 * Parse JSON true literal
 */
export function parseJsonTrue(str: string, startIndex: number = 0): ParseResult<true> {
    const remaining = str.substring(startIndex);

    if (remaining.startsWith('true')) {
        return {value: true, nextPos: startIndex + 4};
    }

    throw new Error(`Expected true at position ${startIndex}, found '${remaining.substring(0, 4)}'`);
}

/**
 * Parse JSON false literal
 */
export function parseJsonFalse(str: string, startIndex: number = 0): ParseResult<false> {
    const remaining = str.substring(startIndex);

    if (remaining.startsWith('false')) {
        return {value: false, nextPos: startIndex + 5};
    }

    throw new Error(`Expected false at position ${startIndex}, found '${remaining.substring(0, 5)}'`);
}



/**
 * Skip whitespace characters and return the number of characters skipped
 */
export function skipWhitespace(str: string, startIndex: number = 0): number {
    let i = startIndex;
    const len = str.length;

    while (i < len && isWhitespace(str[i])) {
        i++;
    }

    return i - startIndex;
}

/**
 * Peek at the next non-whitespace character
 */
export function peekNextChar(str: string, startIndex: number = 0): string | null {
    const whitespaceSkipped = skipWhitespace(str, startIndex);
    const nextIndex = startIndex + whitespaceSkipped;

    return nextIndex < str.length ? str[nextIndex] : null;
}

/**
 * Parse opening array bracket '[' and return position after it
 */
export function parseStartArray(str: string, startIndex: number = 0): number {
    // Skip leading whitespace
    const whitespaceSkipped = skipWhitespace(str, startIndex);
    const actualStart = startIndex + whitespaceSkipped;

    if (actualStart >= str.length || str[actualStart] !== '[') {
        throw new Error(`Expected '[' at position ${actualStart}, found '${str[actualStart] || 'EOF'}'`);
    }

    return actualStart + 1; // Return absolute position after '['
}

/**
 * Parse closing array bracket ']' and return position after it
 */
export function parseEndArray(str: string, startIndex: number = 0): number {
    // Skip leading whitespace
    const whitespaceSkipped = skipWhitespace(str, startIndex);
    const actualStart = startIndex + whitespaceSkipped;

    if (actualStart >= str.length || str[actualStart] !== ']') {
        throw new Error(`Expected ']' at position ${actualStart}, found '${str[actualStart] || 'EOF'}'`);
    }

    return actualStart + 1; // Return position after ']'
}

/**
 * Parse opening object brace '{' and return position after it
 */
export function parseStartObject(str: string, startIndex: number = 0): number {
    // Skip leading whitespace
    const whitespaceSkipped = skipWhitespace(str, startIndex);
    const actualStart = startIndex + whitespaceSkipped;

    if (actualStart >= str.length || str[actualStart] !== '{') {
        throw new Error(`Expected '{' at position ${actualStart}, found '${str[actualStart] || 'EOF'}'`);
    }

    return actualStart + 1; // Return position after '{'
}

/**
 * Parse closing object brace '}' and return position after it
 */
export function parseEndObject(str: string, startIndex: number = 0): number {
    // Skip leading whitespace
    const whitespaceSkipped = skipWhitespace(str, startIndex);
    const actualStart = startIndex + whitespaceSkipped;

    if (actualStart >= str.length || str[actualStart] !== '}') {
        throw new Error(`Expected '}' at position ${actualStart}, found '${str[actualStart] || 'EOF'}'`);
    }

    return actualStart + 1; // Return position after '}'
}

/**
 * Parse comma ',' and return position after it
 */
export function parseComma(str: string, startIndex: number = 0): number {
    // Skip leading whitespace
    const whitespaceSkipped = skipWhitespace(str, startIndex);
    const actualStart = startIndex + whitespaceSkipped;

    if (actualStart >= str.length || str[actualStart] !== ',') {
        throw new Error(`Expected ',' at position ${actualStart}, found '${str[actualStart] || 'EOF'}'`);
    }

    return actualStart + 1; // Return position after ','
}

/**
 * Parse colon ':' and return position after it
 */
export function parseColon(str: string, startIndex: number = 0): number {
    // Skip leading whitespace
    const whitespaceSkipped = skipWhitespace(str, startIndex);
    const actualStart = startIndex + whitespaceSkipped;

    if (actualStart >= str.length || str[actualStart] !== ':') {
        throw new Error(`Expected ':' at position ${actualStart}, found '${str[actualStart] || 'EOF'}'`);
    }

    return actualStart + 1; // Return position after ':'
}

// Helper functions
function isDigit(char: string): boolean {
    return char >= '0' && char <= '9';
}

function isWhitespace(char: string): boolean {
    return char === ' ' || char === '\t' || char === '\n' || char === '\r';
}
