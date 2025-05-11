/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind} from '@deepkit/type';
import type {Type, TypeFunction, TypeParameter, TypeTuple, TypeTupleMember} from '@deepkit/type';
import type {FormatParam, FormatParamLiteral, PureFunctionWithClosure, TypeFormatValue} from '@mionkit/core/src/types';
import {jitUtils} from '../../../core/src/jitUtils';
import {validPropertyNameRegExp} from '../constants';
import type {AnyClass, JitFnID, RunType} from '../types';
import {BaseRunType} from './baseRunTypes';
import {isFormatParamMeta} from './guards';
import type {JitCompiler, JitErrorsCompiler} from './jitCompiler';
import {createHashLiteral} from './quickHash';

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

export function sanitizePropName(name: string | number | symbol): string {
    const sName = typeof name === 'string' ? name : String(name);
    return sName.replace(/[^a-zA-Z0-9_$]/g, '_');
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
    return child.getCodeType(fnId) === 'E' || !child.isJitInlined();
}

/**
 * Escapes special characters in a regular expression.
 * Should be the same as https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/RegExp/escape
 * @param val
 * @returns
 */
export function regexpEscape(val: string): string {
    return val.replace(/[/\-\\^$*+?.()|[\]{}]/g, '\\$&');
}

// ######### To literal with context ########

const maxStringLength = 10;

/**
 * Transforms values into a literal string to be used in JIT code.
 * ie: {total: 5, name: 'hello'} gets transformed into teh string '{total: 5, name: "hello"}' that can be used as JIT code.
 * Some literals are automatically added to the context to reduce code size. in this case the reference to the context variable is returned.
 * Otherwise the literal is returned.
 *
 * Important this is intended for actual immutable literals, if two empty arrays are passed they will be transformed into the same reference.
 * so those object or arrays should never be modified in jit code. //TODO: investigate using object.freeze
 *
 * @param comp
 * @param params
 * @param ignoreProps
 * @param isDependencies
 * @returns
 */
export function toLiteralInContext(
    // if compiled is passed it is assumed that the params are dependencies and will be transformed into code
    comp: JitCompiler | JitErrorsCompiler,
    params: TypeFormatValue | Record<string, string | PureFunctionWithClosure>,
    // TODO: somewhere the ignoreProps are not passed and we still outputting 'samples' and 'sampleChars' to jit code were is not needed
    ignoreProps: string[] = [],
    isDependencies = false
): string {
    switch (true) {
        case typeof params === 'string': {
            const literal = toLiteral(params);
            // if string is longer than 10 chars we add it as a new variable in the context to reduce code size
            if (params.length > maxStringLength) {
                const hash = createHashLiteral(params);
                const strName = hash;
                if (!comp.contextCodeItems.has(strName)) comp.contextCodeItems.set(strName, `const ${strName} = ${literal}`);
                return strName;
            }
            return literal;
        }
        case typeof params === 'number':
            return `${params}`;
        case typeof params === 'boolean':
            return params ? 'true' : 'false';
        case params instanceof RegExp: {
            // if param is a regexp we add it as a new variable in the context (so we are not creating a new regexp on each call)
            const regCode = params.toString();
            const hash = createHashLiteral(regCode);
            const regName = hash;
            if (!comp.contextCodeItems.has(regName)) comp.contextCodeItems.set(regName, `const ${regName} = ${regCode}`);
            return regName;
        }
        case Array.isArray(params): {
            // arrays are added to the context as a new variable
            const arrCode = `[${params.map((v) => toLiteralInContext(comp, v, ignoreProps, isDependencies)).join(',')}]`;
            const hash = createHashLiteral(arrCode);
            const arrName = hash;
            if (!comp.contextCodeItems.has(arrName)) comp.contextCodeItems.set(arrName, `const ${arrName} = ${arrCode}`);

            return arrName;
        }
        case typeof params === 'object': {
            // objects are added to the context as a new variable
            const entriesLiterals = Object.entries(params).map(([k, v]) => {
                if (ignoreProps.includes(k) || typeof v === 'undefined') return undefined;
                const propName = isSafePropName(k) ? k : toLiteral(k);
                if (!isDependencies) return `${propName}:${toLiteralInContext(comp, v, ignoreProps, isDependencies)}`;
                return `${propName}:${dependencyValueToLiteral(comp, v)}`;
            });
            const objCode = `{${entriesLiterals.filter(Boolean).join(',')}}`;
            const hash = createHashLiteral(objCode);
            const objName = hash;
            if (!comp.contextCodeItems.has(objName)) comp.contextCodeItems.set(objName, `const ${objName} = ${objCode}`);
            return objName;
        }
        case typeof params === 'bigint':
            return toLiteral(params);
        default:
            throw new Error(`Unsupported type format params ${params}`);
    }
}

export function dependencyValueToLiteral(comp: JitCompiler | JitErrorsCompiler | undefined, propVal: any): string {
    if (typeof propVal === 'function') {
        if (!comp) throw new Error('Dependencies must be pure functions or code');
        comp.addPureFnDependency(propVal);
        return `utl.getPureFn(${toLiteral(propVal.name)})`;
    }
    if (typeof propVal === 'string') return propVal;
    throw new Error('Dependencies must be pure functions or code');
}

export function typeParamsToString(
    params: TypeFormatValue | Record<string, string | PureFunctionWithClosure>,
    ignoreProps: string[]
): string {
    switch (true) {
        case typeof params === 'string':
            return toLiteral(params);
        case typeof params === 'number':
            return `${params}`;
        case typeof params === 'boolean':
            return params ? 'true' : 'false';
        case params instanceof RegExp:
            return params.toString();
        case Array.isArray(params):
            return `[${params.map((v) => typeParamsToString(v, ignoreProps)).join(', ')}]`;
        case typeof params === 'object': {
            const entriesLiterals = Object.entries(params).map(([k, v]) => {
                if (ignoreProps.includes(k) || typeof v === 'undefined') return undefined;
                return `${k}:${typeParamsToString(v, ignoreProps)}`;
            });
            return `{${entriesLiterals.filter(Boolean).join(',')}}`;
        }
        case typeof params === 'bigint':
            return `${params}n`;
        default:
            throw new Error(`Unsupported type format params ${params}`);
    }
}
export function getFormatterHash(rt: BaseRunType): string {
    const literal = rt.getFormatTypeID();
    if (!literal) throw new Error('Formatter JIT ID not found');
    return createHashLiteral(literal);
}

/** Returns the literal value of a FormatParam */
export function fpVal<L extends FormatParamLiteral>(p: FormatParam<L>): L {
    return isFormatParamMeta(p) ? p.val : p;
}
