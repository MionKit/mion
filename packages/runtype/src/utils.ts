/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind} from './_deepkit/src/reflection/type';
import {jitUtils} from './jitUtils';
import {RunType} from './types';

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

export function toLiteralArray(value: any[]): string {
    return `[${value.map((v) => toLiteral(v)).join(', ')}]`;
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
