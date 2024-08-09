/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {isSameType, ReflectionKind} from './_deepkit/src/reflection/type';
import {jitUtils} from './jitUtils';
import type {AnyClass, JitErrorPath, RunType} from './types';

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

/** prints a pathChain to source code */
export function pathChainToLiteral(pathChain: JitErrorPath): string {
    return `[${pathChain.map((item) => (item.isLiteral ? toLiteral(item.value) : item.value)).join(', ')}]`;
}

/** Clones PathChain into a new array and adds new property */
export function addToPathChain(pathChain: JitErrorPath, property: string | number, isLiteral = true): JitErrorPath {
    return [...pathChain, {value: property, isLiteral}];
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

/**
 * Checks whether or not a type has circular references, must be called within the properties of an object as is checking type parents.
 * Can't check from a root object down to its properties
 * self and child could be the same type i.e:  type Circular = Circular[];
 */
export function hasCircularRunType(self: RunType, child: RunType, parents: RunType[]): boolean {
    if (self === child || isSameType(self.src, child.src)) return true;
    return _hasCircularRunType(child, parents);
}

function _hasCircularRunType(rt: RunType, parents: RunType[], index = 0): boolean {
    const parent = parents[index];
    if (!parent) return false;
    if (parent.isSingle) return _hasCircularRunType(rt, parents, index + 1);
    if (isSameType(rt.src, parent.src)) return true;
    return _hasCircularRunType(rt, parents, index + 1);
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

export function replaceInCode(code: string, replacements: Record<string, string>): string {
    for (const key in replacements) {
        code = code.replaceAll(key, replacements[key]);
    }
    return code;
}
