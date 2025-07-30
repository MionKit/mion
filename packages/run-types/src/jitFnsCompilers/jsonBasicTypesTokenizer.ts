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
    length: number; // Number of characters consumed
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
        length: i - startIndex
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
                length: i - startIndex
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
                    i += 4; // consume the 4 hex digits
                    break;
                default:
                    throw new Error(`Invalid escape sequence \\${escaped} at position ${i}`);
            }
            i++;
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
 * Parse JSON literal: null, true, or false
 */
export function parseJsonLiteral(str: string, startIndex: number = 0): ParseResult<null | boolean> {
    const remaining = str.substring(startIndex);
    
    if (remaining.startsWith('null')) {
        return { value: null, length: 4 };
    }
    
    if (remaining.startsWith('true')) {
        return { value: true, length: 4 };
    }
    
    if (remaining.startsWith('false')) {
        return { value: false, length: 5 };
    }
    
    throw new Error(`Expected null, true, or false at position ${startIndex}, found '${remaining.substring(0, 5)}'`);
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
 * Parse a JSON array from the beginning of a string
 * Supports: [], [1,2,3], ["a","b"], [1,"hello",true,null], etc.
 */
export function parseJsonArray(str: string, startIndex: number = 0): ParseResult<any[]> {
    let i = startIndex;
    const len = str.length;

    // Skip leading whitespace
    i += skipWhitespace(str, i);

    if (i >= len || str[i] !== '[') {
        throw new Error(`Expected '[' at position ${i}, found '${str[i] || 'EOF'}'`);
    }

    i++; // consume '['
    const result: any[] = [];

    // Skip whitespace after opening bracket
    i += skipWhitespace(str, i);

    // Check for empty array
    if (i < len && str[i] === ']') {
        i++; // consume ']'
        return { value: result, length: i - startIndex };
    }

    // Parse array elements
    while (i < len) {
        // Parse value
        const valueResult = parseJsonValue(str, i);
        result.push(valueResult.value);
        i += valueResult.length;

        // Skip whitespace after value
        i += skipWhitespace(str, i);

        if (i >= len) {
            throw new Error(`Unterminated array starting at position ${startIndex}`);
        }

        if (str[i] === ']') {
            i++; // consume ']'
            return { value: result, length: i - startIndex };
        }

        if (str[i] === ',') {
            i++; // consume ','
            i += skipWhitespace(str, i); // skip whitespace after comma
        } else {
            throw new Error(`Expected ',' or ']' at position ${i}, found '${str[i]}'`);
        }
    }

    throw new Error(`Unterminated array starting at position ${startIndex}`);
}

/**
 * Parse a JSON object from the beginning of a string
 * Supports: {}, {"key":"value"}, {"a":1,"b":2}, etc.
 */
export function parseJsonObject(str: string, startIndex: number = 0): ParseResult<Record<string, any>> {
    let i = startIndex;
    const len = str.length;

    // Skip leading whitespace
    i += skipWhitespace(str, i);

    if (i >= len || str[i] !== '{') {
        throw new Error(`Expected '{' at position ${i}, found '${str[i] || 'EOF'}'`);
    }

    i++; // consume '{'
    const result: Record<string, any> = {};

    // Skip whitespace after opening brace
    i += skipWhitespace(str, i);

    // Check for empty object
    if (i < len && str[i] === '}') {
        i++; // consume '}'
        return { value: result, length: i - startIndex };
    }

    // Parse object properties
    while (i < len) {
        // Parse key (must be a string)
        i += skipWhitespace(str, i);
        if (i >= len || str[i] !== '"') {
            throw new Error(`Expected property name (string) at position ${i}, found '${str[i] || 'EOF'}'`);
        }

        const keyResult = parseJsonString(str, i);
        const key = keyResult.value;
        i += keyResult.length;

        // Skip whitespace and expect ':'
        i += skipWhitespace(str, i);
        if (i >= len || str[i] !== ':') {
            throw new Error(`Expected ':' after property name at position ${i}, found '${str[i] || 'EOF'}'`);
        }
        i++; // consume ':'

        // Parse value
        i += skipWhitespace(str, i);
        const valueResult = parseJsonValue(str, i);
        result[key] = valueResult.value;
        i += valueResult.length;

        // Skip whitespace after value
        i += skipWhitespace(str, i);

        if (i >= len) {
            throw new Error(`Unterminated object starting at position ${startIndex}`);
        }

        if (str[i] === '}') {
            i++; // consume '}'
            return { value: result, length: i - startIndex };
        }

        if (str[i] === ',') {
            i++; // consume ','
            i += skipWhitespace(str, i); // skip whitespace after comma
        } else {
            throw new Error(`Expected ',' or '}' at position ${i}, found '${str[i]}'`);
        }
    }

    throw new Error(`Unterminated object starting at position ${startIndex}`);
}

/**
 * Parse any JSON value (number, string, boolean, null, array, object)
 * This is a convenience function that determines the type and calls the appropriate parser
 */
export function parseJsonValue(str: string, startIndex: number = 0): ParseResult<any> {
    // Skip leading whitespace
    const whitespaceSkipped = skipWhitespace(str, startIndex);
    const actualStart = startIndex + whitespaceSkipped;

    if (actualStart >= str.length) {
        throw new Error(`Expected JSON value at position ${startIndex}, but reached end of string`);
    }

    const char = str[actualStart];

    if (char === '"') {
        const result = parseJsonString(str, actualStart);
        return { value: result.value, length: whitespaceSkipped + result.length };
    }

    if (char === '-' || isDigit(char)) {
        const result = parseJsonNumber(str, actualStart);
        return { value: result.value, length: whitespaceSkipped + result.length };
    }

    if (char === 't' || char === 'f' || char === 'n') {
        const result = parseJsonLiteral(str, actualStart);
        return { value: result.value, length: whitespaceSkipped + result.length };
    }

    if (char === '[') {
        const result = parseJsonArray(str, actualStart);
        return { value: result.value, length: whitespaceSkipped + result.length };
    }

    if (char === '{') {
        const result = parseJsonObject(str, actualStart);
        return { value: result.value, length: whitespaceSkipped + result.length };
    }

    throw new Error(`Unexpected character '${char}' at position ${actualStart}`);
}

// Helper functions
function isDigit(char: string): boolean {
    return char >= '0' && char <= '9';
}

function isWhitespace(char: string): boolean {
    return char === ' ' || char === '\t' || char === '\n' || char === '\r';
}
