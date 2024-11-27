/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {AnyClass, JitFnID, RunType} from '../types';
import {ReflectionKind, Type, TypeFunction, TypeParameter} from './_deepkit/src/reflection/type';
import {jitUtils} from './jitUtils';
import {isAtomicRunType, isCollectionRunType, isMemberRunType} from './guards';
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
    return a.opId === b.opId && isSameJitType(a.rootType, b.rootType);
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

export function getParamIndex(src: TypeParameter): number {
    const parent = src.parent as TypeFunction;
    if (!parent) return -1;
    if (parent.parameters) return parent.parameters.indexOf(src);
    return 0;
}

export function childIsExpression(fnId: JitFnID, child: BaseRunType): boolean {
    return child.jitFnIsExpression(fnId) || !child.isJitInlined();
}

export function shouldSkipJit(rt: RunType): boolean {
    if (isCollectionRunType(rt)) {
        const children = rt.getJitChildren();
        return !children.length;
    }
    if (isMemberRunType(rt)) {
        const child = rt.getJitChild();
        return !child;
    }
    if (isAtomicRunType(rt)) {
        return rt.getJitConstants().skipJit;
    }
    throw new Error('shouldSkipJit: unknown RunType');
}

export function shouldSkipJsonDecode(rt: RunType): boolean {
    if (shouldSkipJit(rt)) return true;
    if (isCollectionRunType(rt)) {
        const children = rt.getJsonDecodeChildren();
        return !children.length;
    }
    if (isMemberRunType(rt)) {
        const child = rt.getJsonDecodeChild();
        return !child;
    }
    if (isAtomicRunType(rt)) {
        return rt.getJitConstants().skipJsonDecode;
    }
    throw new Error('shouldSkipJsonDecode: unknown RunType');
}

export function shouldSkiJsonEncode(rt: RunType): boolean {
    if (shouldSkipJit(rt)) return true;
    if (isCollectionRunType(rt)) {
        const children = rt.getJsonEncodeChildren();
        return !children.length;
    }
    if (isMemberRunType(rt)) {
        const child = rt.getJsonEncodeChild();
        return !child;
    }
    if (isAtomicRunType(rt)) {
        return rt.getJitConstants().skipJsonEncode;
    }
    throw new Error('shouldSkiJsonEncode: unknown RunType');
}
