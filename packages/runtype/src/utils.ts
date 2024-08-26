/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {AnyClass, RunType} from './types';
import {isSameType, ReflectionKind} from './_deepkit/src/reflection/type';
import {jitUtils} from './jitUtils';
import {jitNames} from './constants';

export function toLiteral(value: number | string | boolean | undefined | null | bigint | RegExp | symbol): string {
    switch (typeof value) {
        case 'number':
            return `${value}`;
        case 'string':
            return jitUtils.asJSONString(value);
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

export function arrayToLiteral(value: any[]): string {
    return `[${value.map((v) => toLiteral(v)).join(', ')}]`;
}

export function shouldSkipJsonEncode(rt: RunType): boolean {
    return !rt.opts?.strictJSON && !rt.isJsonEncodeRequired;
}

export function shouldSkipJsonDecode(rt: RunType): boolean {
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

export function isClass(cls: AnyClass | any): cls is AnyClass {
    return (
        typeof cls === 'function' &&
        cls.prototype &&
        cls.prototype.constructor === cls &&
        cls.prototype.constructor.name &&
        cls.toString().startsWith('class')
    );
}

export function hasCircularParents(rt: RunType, parents: RunType[]): boolean {
    for (const parent of parents) {
        if (isSameType(rt.src, parent.src)) return true;
    }
    return false;
}

export function getErrorPath(pathChain: (string | number)[]): string {
    // TODO: remove the array destructuring for jitNames.circularPath when is not needed (not circular references)
    if (pathChain.length === 0) return `[...${jitNames.circularPath}]`;
    return `[...${jitNames.circularPath},${pathChain.join(',')}]`;
}

export function getExpected(rt: RunType): string {
    return toLiteral(rt.getName());
}
