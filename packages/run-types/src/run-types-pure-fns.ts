/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {TypeFormatError, StrNumber, RunTypeError} from '@mionjs/core';
import {registerPureFnFactory} from '@mionjs/core';

export const cpf_asJSONString = registerPureFnFactory('mion', 'asJSONString', function () {
    // @ts-expect-error 2867
    if (typeof Bun !== 'undefined') return JSON.stringify; // bun has a faster JSON.stringify
    // eslint-disable-next-line no-control-regex
    const STR_ESCAPE = /[\u0000-\u001f\u0022\u005c\ud800-\udfff]/;
    const MAX_SCAPE_TEST_LENGTH = 1000;
    return function _asJSONStringRegexOnly(str) {
        // Always use regex test for strings >= 42 chars (n o for loop)
        if (str.length < MAX_SCAPE_TEST_LENGTH && STR_ESCAPE.test(str) === false) {
            return '"' + str + '"';
        } else {
            return JSON.stringify(str);
        }
    };
});

export const cpf_getUnknownKeysFromArray = registerPureFnFactory('mion', 'getUnknownKeysFromArray', function () {
    const MAX_UNKNOWN_KEYS = 10;
    return function _getUnknownKeysFromArray(obj: Record<StrNumber, any>, keys: StrNumber[]): StrNumber[] {
        const unknownKeys: StrNumber[] = [];
        for (const prop in obj) {
            let found = false;
            for (let j = 0; j < keys.length; j++) {
                if (keys[j] === prop) {
                    found = true;
                    break;
                }
            }
            if (!found) {
                unknownKeys.push(prop as string);
                if (unknownKeys.length >= MAX_UNKNOWN_KEYS) throw new Error('Too many unknown keys');
            }
        }
        return unknownKeys;
    };
});

export const cpf_hasUnknownKeysFromArray = registerPureFnFactory('mion', 'hasUnknownKeysFromArray', function () {
    return function _hasUnknownKeysFromArray(obj: Record<StrNumber, any>, keys: StrNumber[]): boolean {
        for (const prop in obj) {
            // iterates over the object keys and if not found prop adds to unknownKeys
            let found = false;
            for (let j = 0; j < keys.length; j++) {
                if (keys[j] === prop) {
                    found = true;
                    break;
                }
            }
            if (!found) return true;
        }
        return false;
    };
});

export const cpf_newRunTypeErr = registerPureFnFactory('mion', 'newRunTypeErr', function () {
    return function _err(
        pλth: readonly StrNumber[],
        εrr: RunTypeError[],
        expected: string,
        accessPath?: readonly StrNumber[]
    ): void {
        const path = accessPath?.length ? [...pλth, ...accessPath] : [...pλth];
        const runTypeErr: RunTypeError = {expected, path};
        εrr.push(runTypeErr);
    };
});

export const cpf_formatErr = registerPureFnFactory('mion', 'formatErr', function () {
    return function _formatErr(
        pλth: StrNumber[],
        εrr: RunTypeError[],
        expected: string,
        fmtName: string,
        paramName: string,
        paramVal: string | number | boolean | bigint,
        fmtPath: StrNumber[],
        accessPath?: StrNumber[],
        fmtAccessPath?: StrNumber[]
    ): void {
        const path = accessPath?.length ? [...pλth, ...accessPath] : [...pλth];
        const formatPath = fmtAccessPath?.length ? [...fmtPath, ...fmtAccessPath, paramName] : [...fmtPath, paramName];
        const format: TypeFormatError = {name: fmtName, formatPath: formatPath, val: paramVal};
        const runTypeErr: Required<RunTypeError> = {expected, path, format};
        εrr.push(runTypeErr);
    };
});

export const cpf_safeIterableKey = registerPureFnFactory('mion', 'safeIterableKey', function () {
    return function _safeKey(value: any): any {
        if (value === undefined) return null;
        if (value === null) return null;
        const type = typeof value;
        if (type === 'number' || type === 'string' || type === 'boolean') return value;
        return null;
    };
});

/** @reflection never */
export const cpf_sanitizeCompiledFn = registerPureFnFactory('mion', 'sanitizeCompiledFn', function () {
    const anonymousRegex = /^\s*function\s+anonymous\s*\(/;
    return function sanitizeCompiled(fnCode: string): string {
        if (anonymousRegex.test(fnCode)) {
            return fnCode.replace(anonymousRegex, 'function (');
        }
        return fnCode;
    };
});
