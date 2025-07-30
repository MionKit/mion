/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {
    parseJsonNumber,
    parseJsonString,
    parseJsonLiteral,
    parseJsonArray,
    parseJsonObject,
    parseJsonValue,
    skipWhitespace,
    peekNextChar
} from './jsonBasicTypesTokenizer';

describe('JSON Basic Types Tokenizer', () => {
    describe('parseJsonNumber', () => {
        it('should parse positive integers', () => {
            expect(parseJsonNumber('123')).toEqual({ value: 123, length: 3 });
            expect(parseJsonNumber('0')).toEqual({ value: 0, length: 1 });
            expect(parseJsonNumber('42')).toEqual({ value: 42, length: 2 });
        });

        it('should parse negative integers', () => {
            expect(parseJsonNumber('-123')).toEqual({ value: -123, length: 4 });
            expect(parseJsonNumber('-0')).toEqual({ value: -0, length: 2 });
            expect(parseJsonNumber('-42')).toEqual({ value: -42, length: 3 });
        });

        it('should parse decimal numbers', () => {
            expect(parseJsonNumber('123.45')).toEqual({ value: 123.45, length: 6 });
            expect(parseJsonNumber('-123.45')).toEqual({ value: -123.45, length: 7 });
            expect(parseJsonNumber('0.5')).toEqual({ value: 0.5, length: 3 });
            expect(parseJsonNumber('-0.5')).toEqual({ value: -0.5, length: 4 });
        });

        it('should parse scientific notation', () => {
            expect(parseJsonNumber('1e5')).toEqual({ value: 100000, length: 3 });
            expect(parseJsonNumber('1E5')).toEqual({ value: 100000, length: 3 });
            expect(parseJsonNumber('1e+5')).toEqual({ value: 100000, length: 4 });
            expect(parseJsonNumber('1e-5')).toEqual({ value: 0.00001, length: 4 });
            expect(parseJsonNumber('-2.3e-4')).toEqual({ value: -0.00023, length: 7 });
        });

        it('should parse numbers with following characters', () => {
            expect(parseJsonNumber('123,')).toEqual({ value: 123, length: 3 });
            expect(parseJsonNumber('123]')).toEqual({ value: 123, length: 3 });
            expect(parseJsonNumber('123}')).toEqual({ value: 123, length: 3 });
            expect(parseJsonNumber('123 ')).toEqual({ value: 123, length: 3 });
        });

        it('should parse numbers at specific positions', () => {
            expect(parseJsonNumber('abc123def', 3)).toEqual({ value: 123, length: 3 });
            expect(parseJsonNumber('  -45.6  ', 2)).toEqual({ value: -45.6, length: 5 });
        });

        it('should throw on invalid numbers', () => {
            expect(() => parseJsonNumber('abc')).toThrow();
            expect(() => parseJsonNumber('-')).toThrow();
            expect(() => parseJsonNumber('1.')).toThrow();
            expect(() => parseJsonNumber('1e')).toThrow();
            expect(() => parseJsonNumber('1e+')).toThrow();
            expect(() => parseJsonNumber('01')).toThrow(); // Leading zeros not allowed
            expect(() => parseJsonNumber('')).toThrow();
        });
    });

    describe('parseJsonString', () => {
        it('should parse simple strings', () => {
            expect(parseJsonString('"hello"')).toEqual({ value: 'hello', length: 7 });
            expect(parseJsonString('""')).toEqual({ value: '', length: 2 });
            expect(parseJsonString('"world"')).toEqual({ value: 'world', length: 7 });
        });

        it('should parse strings with escape sequences', () => {
            expect(parseJsonString('"hello \\"world\\""')).toEqual({ 
                value: 'hello "world"', 
                length: 17 
            });
            expect(parseJsonString('"line1\\nline2"')).toEqual({ 
                value: 'line1\nline2', 
                length: 14 
            });
            expect(parseJsonString('"tab\\there"')).toEqual({ 
                value: 'tab\there', 
                length: 11 
            });
            expect(parseJsonString('"back\\\\slash"')).toEqual({ 
                value: 'back\\slash', 
                length: 14 
            });
        });

        it('should parse strings with unicode escapes', () => {
            expect(parseJsonString('"\\u0041"')).toEqual({ value: 'A', length: 8 });
            expect(parseJsonString('"\\u0048\\u0065\\u006C\\u006C\\u006F"')).toEqual({ 
                value: 'Hello', 
                length: 32 
            });
        });

        it('should parse strings at specific positions', () => {
            expect(parseJsonString('abc"hello"def', 3)).toEqual({ 
                value: 'hello', 
                length: 7 
            });
        });

        it('should throw on invalid strings', () => {
            expect(() => parseJsonString('hello')).toThrow(); // Missing quotes
            expect(() => parseJsonString('"hello')).toThrow(); // Unterminated
            expect(() => parseJsonString('"hello\n"')).toThrow(); // Unescaped newline
            expect(() => parseJsonString('"\\x"')).toThrow(); // Invalid escape
            expect(() => parseJsonString('"\\u123"')).toThrow(); // Incomplete unicode
            expect(() => parseJsonString('"\\uGHIJ"')).toThrow(); // Invalid unicode
        });
    });

    describe('parseJsonLiteral', () => {
        it('should parse null', () => {
            expect(parseJsonLiteral('null')).toEqual({ value: null, length: 4 });
            expect(parseJsonLiteral('null,')).toEqual({ value: null, length: 4 });
        });

        it('should parse true', () => {
            expect(parseJsonLiteral('true')).toEqual({ value: true, length: 4 });
            expect(parseJsonLiteral('true]')).toEqual({ value: true, length: 4 });
        });

        it('should parse false', () => {
            expect(parseJsonLiteral('false')).toEqual({ value: false, length: 5 });
            expect(parseJsonLiteral('false}')).toEqual({ value: false, length: 5 });
        });

        it('should parse literals at specific positions', () => {
            expect(parseJsonLiteral('abcnulldef', 3)).toEqual({ value: null, length: 4 });
            expect(parseJsonLiteral('  true  ', 2)).toEqual({ value: true, length: 4 });
        });

        it('should throw on invalid literals', () => {
            expect(() => parseJsonLiteral('nul')).toThrow();
            expect(() => parseJsonLiteral('tru')).toThrow();
            expect(() => parseJsonLiteral('fals')).toThrow();
            expect(() => parseJsonLiteral('NULL')).toThrow(); // Case sensitive
            expect(() => parseJsonLiteral('True')).toThrow(); // Case sensitive
            expect(() => parseJsonLiteral('False')).toThrow(); // Case sensitive
            expect(() => parseJsonLiteral('abc')).toThrow();
        });
    });

    describe('skipWhitespace', () => {
        it('should skip various whitespace characters', () => {
            expect(skipWhitespace('   abc')).toBe(3);
            expect(skipWhitespace('\t\n\r abc')).toBe(4);
            expect(skipWhitespace('abc')).toBe(0);
            expect(skipWhitespace('')).toBe(0);
        });

        it('should skip whitespace at specific positions', () => {
            expect(skipWhitespace('abc   def', 3)).toBe(3);
            expect(skipWhitespace('  \t  ', 2)).toBe(3);
        });
    });

    describe('peekNextChar', () => {
        it('should peek at next non-whitespace character', () => {
            expect(peekNextChar('   a')).toBe('a');
            expect(peekNextChar('\t\n\rb')).toBe('b');
            expect(peekNextChar('c')).toBe('c');
            expect(peekNextChar('   ')).toBe(null);
            expect(peekNextChar('')).toBe(null);
        });

        it('should peek at specific positions', () => {
            expect(peekNextChar('abc   def', 3)).toBe('d');
            expect(peekNextChar('  \t  x', 2)).toBe('x');
        });
    });

    describe('parseJsonValue', () => {
        it('should parse any JSON value type', () => {
            expect(parseJsonValue('123')).toEqual({ value: 123, length: 3 });
            expect(parseJsonValue('"hello"')).toEqual({ value: 'hello', length: 7 });
            expect(parseJsonValue('true')).toEqual({ value: true, length: 4 });
            expect(parseJsonValue('false')).toEqual({ value: false, length: 5 });
            expect(parseJsonValue('null')).toEqual({ value: null, length: 4 });
            expect(parseJsonValue('[1,2,3]')).toEqual({ value: [1, 2, 3], length: 7 });
            expect(parseJsonValue('{"key":"value"}')).toEqual({ value: { key: 'value' }, length: 15 });
        });

        it('should handle leading whitespace', () => {
            expect(parseJsonValue('   123')).toEqual({ value: 123, length: 6 });
            expect(parseJsonValue('\t\n"hello"')).toEqual({ value: 'hello', length: 10 });
            expect(parseJsonValue('  true')).toEqual({ value: true, length: 6 });
        });

        it('should parse values at specific positions', () => {
            expect(parseJsonValue('abc123def', 3)).toEqual({ value: 123, length: 3 });
            expect(parseJsonValue('  "test"  ', 2)).toEqual({ value: 'test', length: 6 });
        });

        it('should throw on invalid values', () => {
            expect(() => parseJsonValue('undefined')).toThrow(); // Not valid JSON
            expect(() => parseJsonValue('')).toThrow(); // Empty string
            expect(() => parseJsonValue('   ')).toThrow(); // Only whitespace
        });
    });

    describe('parseJsonArray', () => {
        it('should parse empty arrays', () => {
            expect(parseJsonArray('[]')).toEqual({ value: [], length: 2 });
            expect(parseJsonArray('[ ]')).toEqual({ value: [], length: 3 });
            expect(parseJsonArray('[\t\n]')).toEqual({ value: [], length: 4 });
        });

        it('should parse arrays with single elements', () => {
            expect(parseJsonArray('[123]')).toEqual({ value: [123], length: 5 });
            expect(parseJsonArray('["hello"]')).toEqual({ value: ['hello'], length: 9 });
            expect(parseJsonArray('[true]')).toEqual({ value: [true], length: 6 });
            expect(parseJsonArray('[null]')).toEqual({ value: [null], length: 6 });
        });

        it('should parse arrays with multiple elements', () => {
            expect(parseJsonArray('[1,2,3]')).toEqual({ value: [1, 2, 3], length: 7 });
            expect(parseJsonArray('["a","b","c"]')).toEqual({ value: ['a', 'b', 'c'], length: 13 });
            expect(parseJsonArray('[1,"hello",true,null]')).toEqual({
                value: [1, 'hello', true, null],
                length: 21
            });
        });

        it('should handle whitespace in arrays', () => {
            expect(parseJsonArray('[ 1 , 2 , 3 ]')).toEqual({ value: [1, 2, 3], length: 13 });
            expect(parseJsonArray('[\n\t1,\n\t2\n]')).toEqual({ value: [1, 2], length: 11 });
        });

        it('should parse nested arrays', () => {
            expect(parseJsonArray('[[1,2],[3,4]]')).toEqual({
                value: [[1, 2], [3, 4]],
                length: 13
            });
            expect(parseJsonArray('[[], [1], [1,2]]')).toEqual({
                value: [[], [1], [1, 2]],
                length: 16
            });
        });

        it('should throw on invalid arrays', () => {
            expect(() => parseJsonArray('[')).toThrow(); // Unterminated
            expect(() => parseJsonArray('[1')).toThrow(); // Unterminated
            expect(() => parseJsonArray('[1,]')).toThrow(); // Trailing comma
            expect(() => parseJsonArray('[1 2]')).toThrow(); // Missing comma
            expect(() => parseJsonArray('1,2,3]')).toThrow(); // Missing opening bracket
        });
    });

    describe('parseJsonObject', () => {
        it('should parse empty objects', () => {
            expect(parseJsonObject('{}')).toEqual({ value: {}, length: 2 });
            expect(parseJsonObject('{ }')).toEqual({ value: {}, length: 3 });
            expect(parseJsonObject('{\t\n}')).toEqual({ value: {}, length: 4 });
        });

        it('should parse objects with single properties', () => {
            expect(parseJsonObject('{"key":"value"}')).toEqual({
                value: { key: 'value' },
                length: 15
            });
            expect(parseJsonObject('{"num":123}')).toEqual({
                value: { num: 123 },
                length: 11
            });
            expect(parseJsonObject('{"bool":true}')).toEqual({
                value: { bool: true },
                length: 13
            });
        });

        it('should parse objects with multiple properties', () => {
            expect(parseJsonObject('{"a":1,"b":2,"c":3}')).toEqual({
                value: { a: 1, b: 2, c: 3 },
                length: 19
            });
            expect(parseJsonObject('{"name":"John","age":30,"active":true}')).toEqual({
                value: { name: 'John', age: 30, active: true },
                length: 38
            });
        });

        it('should handle whitespace in objects', () => {
            expect(parseJsonObject('{ "a" : 1 , "b" : 2 }')).toEqual({
                value: { a: 1, b: 2 },
                length: 21
            });
            expect(parseJsonObject('{\n\t"key":\n\t"value"\n}')).toEqual({
                value: { key: 'value' },
                length: 21
            });
        });

        it('should parse nested objects', () => {
            expect(parseJsonObject('{"user":{"name":"John","age":30}}')).toEqual({
                value: { user: { name: 'John', age: 30 } },
                length: 33
            });
            expect(parseJsonObject('{"a":{},"b":{"c":1}}')).toEqual({
                value: { a: {}, b: { c: 1 } },
                length: 20
            });
        });

        it('should throw on invalid objects', () => {
            expect(() => parseJsonObject('{')).toThrow(); // Unterminated
            expect(() => parseJsonObject('{"key"')).toThrow(); // Unterminated
            expect(() => parseJsonObject('{"key":}')).toThrow(); // Missing value
            expect(() => parseJsonObject('{key:"value"}')).toThrow(); // Unquoted key
            expect(() => parseJsonObject('{"key""value"}')).toThrow(); // Missing colon
            expect(() => parseJsonObject('{"a":1,}')).toThrow(); // Trailing comma
        });
    });

    describe('Complex parsing scenarios', () => {
        it('should handle consecutive parsing', () => {
            const str = '123,"hello",true,null';
            let pos = 0;
            
            const num = parseJsonNumber(str, pos);
            expect(num).toEqual({ value: 123, length: 3 });
            pos += num.length;
            
            expect(str[pos]).toBe(',');
            pos++; // skip comma
            
            const strVal = parseJsonString(str, pos);
            expect(strVal).toEqual({ value: 'hello', length: 7 });
            pos += strVal.length;
            
            expect(str[pos]).toBe(',');
            pos++; // skip comma
            
            const boolVal = parseJsonLiteral(str, pos);
            expect(boolVal).toEqual({ value: true, length: 4 });
            pos += boolVal.length;
            
            expect(str[pos]).toBe(',');
            pos++; // skip comma
            
            const nullVal = parseJsonLiteral(str, pos);
            expect(nullVal).toEqual({ value: null, length: 4 });
        });
    });
});
