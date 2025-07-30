/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {
    parseJsonNumber,
    parseJsonString,
    parseJsonStringRegex,
    parseJsonNull,
    parseJsonTrue,
    parseJsonFalse,
    parseStartArray,
    parseEndArray,
    parseStartObject,
    parseEndObject,
    parseComma,
    parseColon,
    skipWhitespace,
    peekNextChar,
} from './jsonBasicTypesTokenizer';

describe('JSON Basic Types Tokenizer', () => {
    describe('parseJsonNumber', () => {
        it('should parse positive integers', () => {
            expect(parseJsonNumber('123')).toEqual({value: 123, nextPos: 3});
            expect(parseJsonNumber('0')).toEqual({value: 0, nextPos: 1});
            expect(parseJsonNumber('42')).toEqual({value: 42, nextPos: 2});
        });

        it('should parse positive integers exactly like JSON.parse', () => {
            expect(parseJsonNumber('123').value).toBe(JSON.parse('123'));
            expect(parseJsonNumber('0').value).toBe(JSON.parse('0'));
            expect(parseJsonNumber('42').value).toBe(JSON.parse('42'));
        });

        it('should parse negative integers', () => {
            expect(parseJsonNumber('-123')).toEqual({value: -123, nextPos: 4});
            expect(parseJsonNumber('-0')).toEqual({value: -0, nextPos: 2});
            expect(parseJsonNumber('-42')).toEqual({value: -42, nextPos: 3});
        });

        it('should parse negative integers exactly like JSON.parse', () => {
            expect(parseJsonNumber('-123').value).toBe(JSON.parse('-123'));
            expect(parseJsonNumber('-0').value).toBe(JSON.parse('-0'));
            expect(parseJsonNumber('-42').value).toBe(JSON.parse('-42'));
        });

        it('should parse decimal numbers', () => {
            expect(parseJsonNumber('123.45')).toEqual({value: 123.45, nextPos: 6});
            expect(parseJsonNumber('-123.45')).toEqual({value: -123.45, nextPos: 7});
            expect(parseJsonNumber('0.5')).toEqual({value: 0.5, nextPos: 3});
            expect(parseJsonNumber('-0.5')).toEqual({value: -0.5, nextPos: 4});
        });

        it('should parse decimal numbers exactly like JSON.parse', () => {
            expect(parseJsonNumber('123.45').value).toBe(JSON.parse('123.45'));
            expect(parseJsonNumber('-123.45').value).toBe(JSON.parse('-123.45'));
            expect(parseJsonNumber('0.5').value).toBe(JSON.parse('0.5'));
            expect(parseJsonNumber('-0.5').value).toBe(JSON.parse('-0.5'));
        });

        it('should parse scientific notation', () => {
            expect(parseJsonNumber('1e5')).toEqual({value: 100000, nextPos: 3});
            expect(parseJsonNumber('1E5')).toEqual({value: 100000, nextPos: 3});
            expect(parseJsonNumber('1e+5')).toEqual({value: 100000, nextPos: 4});
            expect(parseJsonNumber('1e-5')).toEqual({value: 0.00001, nextPos: 4});
            expect(parseJsonNumber('-2.3e-4')).toEqual({value: -0.00023, nextPos: 7});
        });

        it('should parse scientific notation exactly like JSON.parse', () => {
            expect(parseJsonNumber('1e5').value).toBe(JSON.parse('1e5'));
            expect(parseJsonNumber('1E5').value).toBe(JSON.parse('1E5'));
            expect(parseJsonNumber('1e+5').value).toBe(JSON.parse('1e+5'));
            expect(parseJsonNumber('1e-5').value).toBe(JSON.parse('1e-5'));
            expect(parseJsonNumber('-2.3e-4').value).toBe(JSON.parse('-2.3e-4'));
        });

        it('should parse numbers with following characters', () => {
            expect(parseJsonNumber('123,')).toEqual({value: 123, nextPos: 3});
            expect(parseJsonNumber('123]')).toEqual({value: 123, nextPos: 3});
            expect(parseJsonNumber('123}')).toEqual({value: 123, nextPos: 3});
            expect(parseJsonNumber('123 ')).toEqual({value: 123, nextPos: 3});
        });

        it('should parse numbers at specific positions', () => {
            expect(parseJsonNumber('abc123def', 3)).toEqual({value: 123, nextPos: 6});
            expect(parseJsonNumber('  -45.6  ', 2)).toEqual({value: -45.6, nextPos: 7});
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
            expect(parseJsonString('"hello"')).toEqual({value: 'hello', nextPos: 7});
            expect(parseJsonString('""')).toEqual({value: '', nextPos: 2});
            expect(parseJsonString('"world"')).toEqual({value: 'world', nextPos: 7});
        });

        it('should parse simple strings exactly like JSON.parse', () => {
            expect(parseJsonString('"hello"').value).toBe(JSON.parse('"hello"'));
            expect(parseJsonString('""').value).toBe(JSON.parse('""'));
            expect(parseJsonString('"world"').value).toBe(JSON.parse('"world"'));
        });

        it('should parse strings with escape sequences', () => {
            expect(parseJsonString('"hello \\"world\\""')).toEqual({
                value: 'hello "world"',
                nextPos: 17,
            });
            expect(parseJsonString('"line1\\nline2"')).toEqual({
                value: 'line1\nline2',
                nextPos: 14,
            });
            expect(parseJsonString('"tab\\there"')).toEqual({
                value: 'tab\there',
                nextPos: 11,
            });
            expect(parseJsonString('"back\\\\slash"')).toEqual({
                value: 'back\\slash',
                nextPos: 13,
            });
        });

        it('should parse strings with escape sequences exactly like JSON.parse', () => {
            expect(parseJsonString('"hello \\"world\\""').value).toBe(JSON.parse('"hello \\"world\\""'));
            expect(parseJsonString('"line1\\nline2"').value).toBe(JSON.parse('"line1\\nline2"'));
            expect(parseJsonString('"tab\\there"').value).toBe(JSON.parse('"tab\\there"'));
            expect(parseJsonString('"back\\\\slash"').value).toBe(JSON.parse('"back\\\\slash"'));
        });

        it('should parse strings with unicode escapes', () => {
            expect(parseJsonString('"\\u0041"')).toEqual({value: 'A', nextPos: 8});
            expect(parseJsonString('"\\u0048\\u0065\\u006C\\u006C\\u006F"')).toEqual({
                value: 'Hello',
                nextPos: 32,
            });
        });

        it('should parse strings with unicode escapes exactly like JSON.parse', () => {
            expect(parseJsonString('"\\u0041"').value).toBe(JSON.parse('"\\u0041"'));
            expect(parseJsonString('"\\u0048\\u0065\\u006C\\u006C\\u006F"').value).toBe(JSON.parse('"\\u0048\\u0065\\u006C\\u006C\\u006F"'));
        });

        it('should parse strings at specific positions', () => {
            expect(parseJsonString('abc"hello"def', 3)).toEqual({
                value: 'hello',
                nextPos: 10,
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

    describe('parseJsonStringRegex', () => {
        it('should parse simple strings', () => {
            expect(parseJsonStringRegex('"hello"')).toEqual({value: 'hello', nextPos: 7});
            expect(parseJsonStringRegex('""')).toEqual({value: '', nextPos: 2});
            expect(parseJsonStringRegex('"world"')).toEqual({value: 'world', nextPos: 7});
        });

        it('should parse simple strings exactly like JSON.parse', () => {
            expect(parseJsonStringRegex('"hello"').value).toBe(JSON.parse('"hello"'));
            expect(parseJsonStringRegex('""').value).toBe(JSON.parse('""'));
            expect(parseJsonStringRegex('"world"').value).toBe(JSON.parse('"world"'));
        });

        it('should parse strings with escape sequences', () => {
            expect(parseJsonStringRegex('"hello \\"world\\""')).toEqual({
                value: 'hello "world"',
                nextPos: 17,
            });
            expect(parseJsonStringRegex('"line1\\nline2"')).toEqual({
                value: 'line1\nline2',
                nextPos: 14,
            });
            expect(parseJsonStringRegex('"tab\\there"')).toEqual({
                value: 'tab\there',
                nextPos: 11,
            });
            expect(parseJsonStringRegex('"back\\\\slash"')).toEqual({
                value: 'back\\slash',
                nextPos: 13,
            });
        });

        it('should parse strings with escape sequences exactly like JSON.parse', () => {
            expect(parseJsonStringRegex('"hello \\"world\\""').value).toBe(JSON.parse('"hello \\"world\\""'));
            expect(parseJsonStringRegex('"line1\\nline2"').value).toBe(JSON.parse('"line1\\nline2"'));
            expect(parseJsonStringRegex('"tab\\there"').value).toBe(JSON.parse('"tab\\there"'));
            expect(parseJsonStringRegex('"back\\\\slash"').value).toBe(JSON.parse('"back\\\\slash"'));
        });

        it('should parse strings with unicode escapes', () => {
            expect(parseJsonStringRegex('"\\u0041"')).toEqual({value: 'A', nextPos: 8});
            expect(parseJsonStringRegex('"\\u0048\\u0065\\u006C\\u006C\\u006F"')).toEqual({
                value: 'Hello',
                nextPos: 32,
            });
        });

        it('should parse strings with unicode escapes exactly like JSON.parse', () => {
            expect(parseJsonStringRegex('"\\u0041"').value).toBe(JSON.parse('"\\u0041"'));
            expect(parseJsonStringRegex('"\\u0048\\u0065\\u006C\\u006C\\u006F"').value).toBe(JSON.parse('"\\u0048\\u0065\\u006C\\u006C\\u006F"'));
        });

        it('should parse strings at specific positions', () => {
            expect(parseJsonStringRegex('abc"hello"def', 3)).toEqual({
                value: 'hello',
                nextPos: 10,
            });
        });

        it('should handle all valid escape sequences', () => {
            const testCases = [
                '"\\"quote\\""',      // \"
                '"\\\\"',             // \\
                '"\\/"',              // \/
                '"\\b"',              // \b
                '"\\f"',              // \f
                '"\\n"',              // \n
                '"\\r"',              // \r
                '"\\t"',              // \t
                '"\\u0020"',          // \u0020 (space)
                '"\\u00A9"',          // \u00A9 (copyright)
            ];

            testCases.forEach(testCase => {
                const regexResult = parseJsonStringRegex(testCase);
                const jsonParseResult = JSON.parse(testCase);
                expect(regexResult.value).toBe(jsonParseResult);
            });
        });

        it('should throw on invalid strings', () => {
            expect(() => parseJsonStringRegex('hello')).toThrow(); // No quotes
            expect(() => parseJsonStringRegex('"unterminated')).toThrow(); // Unterminated
            expect(() => parseJsonStringRegex('"invalid\\escape"')).toThrow(); // Invalid escape
            expect(() => parseJsonStringRegex('"\\u123"')).toThrow(); // Invalid unicode (too short)
            expect(() => parseJsonStringRegex('"\\uGHIJ"')).toThrow(); // Invalid unicode (non-hex)
        });

        it('should match original parseJsonString results for valid inputs', () => {
            const testCases = [
                '"hello"',
                '""',
                '"world"',
                '"hello \\"world\\""',
                '"line1\\nline2"',
                '"tab\\there"',
                '"back\\\\slash"',
                '"\\u0041"',
                '"\\u0048\\u0065\\u006C\\u006C\\u006F"',
            ];

            testCases.forEach(testCase => {
                const originalResult = parseJsonString(testCase);
                const regexResult = parseJsonStringRegex(testCase);

                expect(regexResult.value).toBe(originalResult.value);
                expect(regexResult.nextPos).toBe(originalResult.nextPos);
            });
        });
    });

    describe('parseJsonNull', () => {
        it('should parse null', () => {
            expect(parseJsonNull('null')).toEqual({value: null, nextPos: 4});
            expect(parseJsonNull('null,')).toEqual({value: null, nextPos: 4});
            expect(parseJsonNull('abcnulldef', 3)).toEqual({value: null, nextPos: 7});
        });

        it('should parse null exactly like JSON.parse', () => {
            expect(parseJsonNull('null').value).toBe(JSON.parse('null'));
        });

        it('should throw on invalid input', () => {
            expect(() => parseJsonNull('nul')).toThrow();
            expect(() => parseJsonNull('NULL')).toThrow(); // Case sensitive
            expect(() => parseJsonNull('true')).toThrow();
            expect(() => parseJsonNull('abc')).toThrow();
        });
    });

    describe('parseJsonTrue', () => {
        it('should parse true', () => {
            expect(parseJsonTrue('true')).toEqual({value: true, nextPos: 4});
            expect(parseJsonTrue('true]')).toEqual({value: true, nextPos: 4});
            expect(parseJsonTrue('  true  ', 2)).toEqual({value: true, nextPos: 6});
        });

        it('should parse true exactly like JSON.parse', () => {
            expect(parseJsonTrue('true').value).toBe(JSON.parse('true'));
        });

        it('should throw on invalid input', () => {
            expect(() => parseJsonTrue('tru')).toThrow();
            expect(() => parseJsonTrue('True')).toThrow(); // Case sensitive
            expect(() => parseJsonTrue('false')).toThrow();
            expect(() => parseJsonTrue('abc')).toThrow();
        });
    });

    describe('parseJsonFalse', () => {
        it('should parse false', () => {
            expect(parseJsonFalse('false')).toEqual({value: false, nextPos: 5});
            expect(parseJsonFalse('false}')).toEqual({value: false, nextPos: 5});
            expect(parseJsonFalse('abcfalsedef', 3)).toEqual({value: false, nextPos: 8});
        });

        it('should parse false exactly like JSON.parse', () => {
            expect(parseJsonFalse('false').value).toBe(JSON.parse('false'));
        });

        it('should throw on invalid input', () => {
            expect(() => parseJsonFalse('fals')).toThrow();
            expect(() => parseJsonFalse('False')).toThrow(); // Case sensitive
            expect(() => parseJsonFalse('true')).toThrow();
            expect(() => parseJsonFalse('abc')).toThrow();
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

    describe('Token Parsers', () => {
        describe('parseStartArray', () => {
            it('should parse opening array bracket', () => {
                expect(parseStartArray('[')).toBe(1);
                expect(parseStartArray('  [')).toBe(3);
                expect(parseStartArray('\t\n[')).toBe(3);
                expect(parseStartArray('[123]', 0)).toBe(1);
            });

            it('should throw on invalid input', () => {
                expect(() => parseStartArray('{')).toThrow();
                expect(() => parseStartArray('')).toThrow();
                expect(() => parseStartArray('  {')).toThrow();
            });
        });

        describe('parseEndArray', () => {
            it('should parse closing array bracket', () => {
                expect(parseEndArray(']')).toBe(1);
                expect(parseEndArray('  ]')).toBe(3);
                expect(parseEndArray('\t\n]')).toBe(3);
                expect(parseEndArray('123]', 3)).toBe(4);
            });

            it('should throw on invalid input', () => {
                expect(() => parseEndArray('}')).toThrow();
                expect(() => parseEndArray('')).toThrow();
                expect(() => parseEndArray('  }')).toThrow();
            });
        });

        describe('parseStartObject', () => {
            it('should parse opening object brace', () => {
                expect(parseStartObject('{')).toBe(1);
                expect(parseStartObject('  {')).toBe(3);
                expect(parseStartObject('\t\n{')).toBe(3);
                expect(parseStartObject('{"key"', 0)).toBe(1);
            });

            it('should throw on invalid input', () => {
                expect(() => parseStartObject('[')).toThrow();
                expect(() => parseStartObject('')).toThrow();
                expect(() => parseStartObject('  [')).toThrow();
            });
        });

        describe('parseEndObject', () => {
            it('should parse closing object brace', () => {
                expect(parseEndObject('}')).toBe(1);
                expect(parseEndObject('  }')).toBe(3);
                expect(parseEndObject('\t\n}')).toBe(3);
                expect(parseEndObject('"value"}', 7)).toBe(8);
            });

            it('should throw on invalid input', () => {
                expect(() => parseEndObject(']')).toThrow();
                expect(() => parseEndObject('')).toThrow();
                expect(() => parseEndObject('  ]')).toThrow();
            });
        });

        describe('parseComma', () => {
            it('should parse comma separator', () => {
                expect(parseComma(',')).toBe(1);
                expect(parseComma('  ,')).toBe(3);
                expect(parseComma('\t\n,')).toBe(3);
                expect(parseComma('123,456', 3)).toBe(4);
            });

            it('should throw on invalid input', () => {
                expect(() => parseComma(';')).toThrow();
                expect(() => parseComma('')).toThrow();
                expect(() => parseComma('  ;')).toThrow();
            });
        });

        describe('parseColon', () => {
            it('should parse colon separator', () => {
                expect(parseColon(':')).toBe(1);
                expect(parseColon('  :')).toBe(3);
                expect(parseColon('\t\n:')).toBe(3);
                expect(parseColon('"key":"value"', 5)).toBe(6);
            });

            it('should throw on invalid input', () => {
                expect(() => parseColon(';')).toThrow();
                expect(() => parseColon('')).toThrow();
                expect(() => parseColon('  ;')).toThrow();
            });
        });
    });

    describe('Complex parsing scenarios', () => {
        it('should handle consecutive parsing with token parsers', () => {
            const str = '123,"hello",true,null';
            let pos = 0;

            const num = parseJsonNumber(str, pos);
            expect(num).toEqual({value: 123, nextPos: 3});
            pos = num.nextPos;

            pos = parseComma(str, pos);

            const strVal = parseJsonString(str, pos);
            expect(strVal).toEqual({value: 'hello', nextPos: 11});
            pos = strVal.nextPos;

            pos = parseComma(str, pos);

            const boolVal = parseJsonTrue(str, pos);
            expect(boolVal).toEqual({value: true, nextPos: 16});
            pos = boolVal.nextPos;

            pos = parseComma(str, pos);

            const nullVal = parseJsonNull(str, pos);
            expect(nullVal).toEqual({value: null, nextPos: 21});
        });

        it('should parse object structure with token parsers', () => {
            const str = '{"name":"John","age":30}';
            let pos = 0;

            // Parse opening brace
            pos = parseStartObject(str, pos);

            // Parse first key
            const key1 = parseJsonString(str, pos);
            expect(key1).toEqual({value: 'name', nextPos: 7});
            pos = key1.nextPos;

            // Parse colon
            pos = parseColon(str, pos);

            // Parse first value
            const value1 = parseJsonString(str, pos);
            expect(value1).toEqual({value: 'John', nextPos: 14});
            pos = value1.nextPos;

            // Parse comma
            pos = parseComma(str, pos);

            // Parse second key
            const key2 = parseJsonString(str, pos);
            expect(key2).toEqual({value: 'age', nextPos: 20});
            pos = key2.nextPos;

            // Parse colon
            pos = parseColon(str, pos);

            // Parse second value
            const value2 = parseJsonNumber(str, pos);
            expect(value2).toEqual({value: 30, nextPos: 23});
            pos = value2.nextPos;

            // Parse closing brace
            pos = parseEndObject(str, pos);

            expect(pos).toBe(str.length);
        });

        it('should parse array structure with token parsers', () => {
            const str = '[123,"hello",true]';
            let pos = 0;

            // Parse opening bracket
            pos = parseStartArray(str, pos);

            // Parse first element
            const elem1 = parseJsonNumber(str, pos);
            expect(elem1).toEqual({value: 123, nextPos: 4});
            pos = elem1.nextPos;

            // Parse comma
            pos = parseComma(str, pos);

            // Parse second element
            const elem2 = parseJsonString(str, pos);
            expect(elem2).toEqual({value: 'hello', nextPos: 12});
            pos = elem2.nextPos;

            // Parse comma
            pos = parseComma(str, pos);

            // Parse third element
            const elem3 = parseJsonTrue(str, pos);
            expect(elem3).toEqual({value: true, nextPos: 17});
            pos = elem3.nextPos;

            // Parse closing bracket
            pos = parseEndArray(str, pos);

            expect(pos).toBe(str.length);
        });
    });
});
