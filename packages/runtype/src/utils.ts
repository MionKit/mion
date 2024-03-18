/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind} from './_deepkit/src/reflection/type';
import {RunType} from './types';

export function toLiteral(value: number | string | boolean | undefined | null | bigint | RegExp | symbol): string {
    switch (typeof value) {
        case 'number':
            return `${value}`;
        case 'string':
            return asJSONString(value);
        case 'boolean':
            return value ? 'true' : 'false';
        case 'undefined':
            return 'undefined';
        case 'bigint':
            return `${value}n`;
        case 'symbol':
            return `Symbol(${toLiteral(value.description)})`;
        case 'object':
            if (value === null) return 'null';
            if (value instanceof RegExp) return value.toString();
            throw new Error(`Unsupported literal type ${value}`);
        default:
            throw new Error(`Unsupported literal type ${value}`);
    }
}

export function addToPathChain(pathChain: string, property: string | number, isLiteral = true): string {
    return `${pathChain} + '/' + ${isLiteral ? toLiteral(property) : property}`;
}

export function skipJsonEncode(rt: RunType): boolean {
    return !rt.opts?.strictJSON && !rt.isJsonEncodeRequired;
}

export function skipJsonDecode(rt: RunType): boolean {
    return !rt.opts?.strictJSON && !rt.isJsonDecodeRequired;
}

export function isFunctionKind(kind: ReflectionKind): boolean {
    return (
        kind === ReflectionKind.callSignature ||
        kind === ReflectionKind.method ||
        kind === ReflectionKind.function ||
        kind === ReflectionKind.methodSignature ||
        kind === ReflectionKind.indexSignature
    );
}

// Bellow code is copied from from https://github.com/fastify/fast-json-stringify/blob/master/lib/serializer.js
// which in turn got 'inspiration' from typia https://github.com/samchon/typia/blob/master/src/functional/$string.ts
// both under MIT license
// typia license: https://github.com/samchon/typia/blob/master/LICENSE
// fastify lisecense: https://github.com/fastify/fast-json-stringify/blob/master/LICENSE

export function asJSONString(str) {
    // eslint-disable-next-line no-control-regex
    const STR_ESCAPE = /[\u0000-\u001f\u0022\u005c\ud800-\udfff]/;
    if (str.length < 42) {
        const len = str.length;
        let result = '';
        let last = -1;
        let point = 255;

        // eslint-disable-next-line
        for (var i = 0; i < len; i++) {
            point = str.charCodeAt(i);
            if (
                point === 0x22 || // '"'
                point === 0x5c // '\'
            ) {
                last === -1 && (last = 0);
                result += str.slice(last, i) + '\\';
                last = i;
            } else if (point < 32 || (point >= 0xd800 && point <= 0xdfff)) {
                // The current character is non-printable characters or a surrogate.
                return JSON.stringify(str);
            }
        }

        return (last === -1 && '"' + str + '"') || '"' + result + str.slice(last) + '"';
    } else if (str.length < 5000 && STR_ESCAPE.test(str) === false) {
        // Only use the regular expression for shorter input. The overhead is otherwise too much.
        return '"' + str + '"';
    } else {
        return JSON.stringify(str);
    }
}
