/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {AnyClass, JitFnID, RunType} from '../types';
import {ReflectionKind, Type, TypeFunction, TypeParameter, TypeTuple, TypeTupleMember} from './_deepkit/src/reflection/type';
import {jitUtils} from './jitUtils';
import {validPropertyNameRegExp} from '../constants';
import {BaseRunType} from './baseRunTypes';
import type {JitCompiler} from './jitCompiler';

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
    return `[${arrayToArgumentsLiteral(value)}]`;
}

export function arrayToArgumentsLiteral(value: any[]): string {
    return value.map((v) => `${toLiteral(v)}`).join(', ');
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

export function isSameJitType(a: RunType, b: RunType): boolean {
    if (a === b) return true;
    if (a.src.kind !== b.src.kind) return false;
    return a.getJitId() === b.getJitId();
}

export function isSameJitCompiler(a: JitCompiler, b: JitCompiler): boolean {
    return a.fnId === b.fnId && isSameJitType(a.rootType, b.rootType);
}

export function memorize<Fn extends (...args: any[]) => any>(fn: Fn): Fn {
    let cached: undefined | any;
    return ((...args: any[]) => {
        if (!cached) cached = fn(...args);
        return cached;
    }) as Fn;
}

export function isSafePropName(name: string | number | symbol): boolean {
    return (typeof name === 'string' && validPropertyNameRegExp.test(name)) || typeof name === 'number';
}

export function getPropVarName(name: string | number | symbol): string | number {
    if (typeof name === 'symbol') return name.toString();
    return name;
}
export function getPropLiteral(name: string | number | symbol): string | number {
    return toLiteral(name);
}
export function useArrayAccessorForProp(name: string | number | symbol): boolean {
    if (typeof name === 'number') return true;
    return !isSafePropName(name);
}

export function getPropIndex(src: Type): number {
    const parent = src.parent;
    if (!parent) return -1;
    const types = (parent as {types: Type[]}).types;
    if (types) return types.indexOf(src);
    return 0;
}

export function getParamIndex(src: TypeParameter | TypeTupleMember): number {
    const parent = src.parent as TypeFunction | TypeTuple;
    if (!parent) return -1;
    if ((parent as TypeFunction).parameters) return (parent as TypeFunction).parameters.indexOf(src as TypeParameter);
    if ((parent as TypeTuple).types) return (parent as TypeTuple).types.indexOf(src as TypeTupleMember);
    return 0;
}

export function childIsExpression(fnId: JitFnID, child: BaseRunType): boolean {
    return child.jitFnIsExpression(fnId) || !child.isJitInlined();
}
