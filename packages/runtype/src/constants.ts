/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

export const validPropertyNameRegExp = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export const mockRegExpsList = [
    /abc/, // Matches the string 'abc'
    /def/, // Matches the string 'def'
    /123/, // Matches the string '123'
    /xyz/, // Matches the string 'xyz'
    /[\w]+/, // Matches one or more word characters
    /\d{3}-\d{3}-\d{4}/, // Matches a phone number in the format XXX-XXX-XXXX
    /[A-Z]/, // Matches a single uppercase letter
    /[a-z]/, // Matches a single lowercase letter
    /\d+/, // Matches one or more digits
    /\s+/, // Matches one or more whitespace characters
    /^https?:\/\/[\w.-]+\.[a-zA-Z]{2,}$/i, // Matches a URL starting with http:// or https://
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i, // Matches an email address
    /\b\d{2}\/\d{2}\/\d{4}\b/, // Matches a date in the format MM/DD/YYYY
    /\b\d{1,2}:\d{2}\b/, // Matches a time in the format HH:MM
    /\b\d{1,2}:\d{2}:\d{2}\b/, // Matches a time in the format HH:MM:SS
    /\b\d{1,2}\/\d{1,2}\/\d{2}\b/, // Matches a date in the format M/D/YY
    /\b\d{1,2}\/\d{1,2}\/\d{4}\b/, // Matches a date in the format M/D/YYYY
    /\b\d{1,2}:\d{2}:\d{2} [AP]M\b/, // Matches a time in the format HH:MM:SS AM/PM
    /\b\d{1,2}:\d{2} [AP]M\b/, // Matches a time in the format HH:MM AM/PM
    /abc/gi, // Matches the string 'abc' with the global and case-insensitive flags
    /['"]/, // regexp that contains single and double quotes
    /\/(.*)\/(.*)?/, // regexp that contains a slash
    /\/\//, // regexp that contains two slashes
    /`/, // regexp that contains backticks
    /\/\\\//, // regexp double scaped \\
];

export const stringCharSet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890 ';

export const anyValuesList = [
    {},
    {hello: 'world'},
    [],
    [1, 3, 'hello'],
    'hello',
    1234,
    BigInt(1),
    true,
    false,
    null,
    undefined,
    Symbol('hello'),
    -124,
    0,
    124,
    0.1,
    -0.1,
    Infinity,
    NaN,
    new Date(),
    /abc/,
];

export const mockObjectList = [{}, {a: 1}, {b: 2}, {a: 1, b: 'hello'}, {a: 1, b: 2, c: 3}, {a: 'hello', b: 2, c: 'wold', d: 4}];

export const jitNames = {
    utils: 'µTils',
    errors: 'εrrs',
    path: 'pλth',
};
