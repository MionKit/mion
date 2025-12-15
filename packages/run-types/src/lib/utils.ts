/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind} from '@deepkit/type';
import type {Type, TypeFunction, TypeParameter, TypeTuple, TypeTupleMember} from '@deepkit/type';
import type {PureFunctionClosure, TypeFormatValue} from '@mionkit/core';
import type {AnyClass, JitFnID, RunType} from '../types';
import type {BaseRunType, CollectionRunType, MemberRunType} from './baseRunTypes';
import type {JitFnCompiler, JitErrorsFnCompiler} from './jitFnCompiler';
import type {PropertyRunType} from '../nodes/member/property';
import {getJitUtils} from '@mionkit/core';
import {validPropertyNameRegExp} from '../constants';
import {createHashLiteral} from './quickHash';
import {ReflectionSubKind} from '../constants.kind';
import {getJitFnSettings} from './jitFnsRegistry';
import type {JitCode} from '../types';

export function toLiteral(value: number | string | boolean | undefined | null | bigint | RegExp | symbol): string {
    switch (typeof value) {
        case 'number':
            return `${value}`;
        case 'string':
            return getJitUtils().asJSONString(value);
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
    return a.getTypeID() === b.getTypeID();
}

export function isSameJitCompiler(a: JitFnCompiler, b: JitFnCompiler): boolean {
    return a.fnID === b.fnID && isSameJitType(a.rootType, b.rootType);
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

export function childIsExpression(childJCode: JitCode, child: BaseRunType): boolean {
    return childJCode.type === 'E' || !child.isJitInlined();
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
    comp: JitFnCompiler | JitErrorsFnCompiler,
    params: TypeFormatValue | Record<string, string | PureFunctionClosure>,
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
                if (!comp.hasContextItem(strName)) comp.setContextItem(strName, `const ${strName} = ${literal}`);
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
            if (!comp.hasContextItem(regName)) comp.setContextItem(regName, `const ${regName} = ${regCode}`);
            return regName;
        }
        case Array.isArray(params): {
            // arrays are added to the context as a new variable
            const arrCode = `[${params.map((v) => toLiteralInContext(comp, v, ignoreProps, isDependencies)).join(',')}]`;
            const hash = createHashLiteral(arrCode);
            const arrName = hash;
            if (!comp.hasContextItem(arrName)) comp.setContextItem(arrName, `const ${arrName} = ${arrCode}`);

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
            if (!comp.hasContextItem(objName)) comp.setContextItem(objName, `const ${objName} = ${objCode}`);
            return objName;
        }
        case typeof params === 'bigint':
            return toLiteral(params);
        default:
            throw new Error(`Unsupported type format params ${params}`);
    }
}

export function dependencyValueToLiteral(comp: JitFnCompiler | JitErrorsFnCompiler | undefined, propVal: any): string {
    if (typeof propVal === 'function') {
        if (!comp) throw new Error('Dependencies must be pure functions or code');
        comp.addPureFnDependency(propVal);
        return `utl.getPureFn(${toLiteral(propVal.name)})`;
    }
    if (typeof propVal === 'string') return propVal;
    throw new Error('Dependencies must be pure functions or code');
}

export function typeParamsToString(
    params: TypeFormatValue | Record<string, string | PureFunctionClosure>,
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

/** Complexity of each type family, we can add more types and weights here if we want to optimize further */
const familyComplexity = {
    A: 2,
    M: 20, // member usually involves iteration
    C: 10, // collection usually involves calling and extra jit function
    F: 10_000_000,
}; // function should go always last
const typesComplexity = {
    [ReflectionKind.indexSignature]: 20, // index involves traversing all object keys
    [ReflectionKind.array]: 30, // array involves iterating all items
    [ReflectionKind.property]: 0, // property involves just checking a single property
    [ReflectionKind.propertySignature]: 0, // property involves just checking a single property
    [ReflectionKind.boolean]: 1, // boolean is fast to check
    [ReflectionKind.null]: 1, // null is fast to check
    [ReflectionKind.undefined]: 1, // undefined is fast to check
    [ReflectionKind.enum]: 20, // enum can involve checking multiple values
};
const subTypesComplexity = {
    [ReflectionSubKind.date]: 3,
};

/**
 * Returns an arbitrary complexity number for a runType, this depends on the type family and the complexity of all children.
 * There might be better options to get the type complexity, as this also depends on the runtime operation and the compiled operation.
 * but this is an initial approximation.
 */
export function getTotalComplexity(comp: JitFnCompiler, rt: BaseRunType, stack: BaseRunType[] = []): number {
    if (!rt) return 0;
    if (stack.includes(rt)) return 0;
    stack.push(rt);
    let result = 0;
    const subKindC = rt.src.subKind ? subTypesComplexity[rt.src.subKind] : undefined;
    const typeC = subKindC || typesComplexity[rt.src.kind];
    const familyC = rt.getFamily();
    if (familyC === 'A') result = typeC || familyComplexity.A;
    else if (familyC === 'M') {
        const childRT = (rt as MemberRunType<any>).getJitChild(comp);
        if (!childRT) return typeC ?? familyComplexity.M;
        const childC = getTotalComplexity(comp, childRT, stack);
        result = (typeC ?? familyComplexity.M) + childC;
    } else if (familyC === 'C') {
        const childrenC = (rt as CollectionRunType<any>)
            .getJitChildren(comp)
            .map((child) => getTotalComplexity(comp, child, stack));
        const totalChildrenC = childrenC.reduce((acc, childC) => acc + childC, 0);
        result = (typeC ?? familyComplexity.C) + totalChildrenC;
    } else {
        result = typeC ?? familyComplexity.F;
    }
    stack.pop();
    return result;
}

/**
 * Sort runTypes by complexity, ascending. this way less complex code can be executed first.
 * This could help to fail fast and avoid unnecessary checks.
 */
export function sortRunTypeByComplexity(comp: JitFnCompiler, a: BaseRunType, b: BaseRunType): number {
    if (a.getFamily() === 'M' && b.getFamily() === 'M') {
        const aIsDiscriminator = (a as PropertyRunType).isUnionDiscriminator;
        const bIsDiscriminator = (b as PropertyRunType).isUnionDiscriminator;
        if (aIsDiscriminator && !bIsDiscriminator) return -1;
        if (!aIsDiscriminator && bIsDiscriminator) return 1;
    }
    if (b.getFamily() === 'M' && (b as PropertyRunType).isUnionDiscriminator) return 1;
    const aTotal = getTotalComplexity(comp, a);
    const bTotal = getTotalComplexity(comp, b);
    return aTotal - bTotal;
}

export function sortDiscriminatorsFirst(a: BaseRunType, b: BaseRunType): number {
    if (a.getFamily() === 'M' && b.getFamily() === 'M') {
        const aIsDiscriminator = (a as PropertyRunType).isUnionDiscriminator;
        const bIsDiscriminator = (b as PropertyRunType).isUnionDiscriminator;
        if (aIsDiscriminator && !bIsDiscriminator) return -1;
        if (!aIsDiscriminator && bIsDiscriminator) return 1;
    }
    return 0;
}

export function createIfElseFn(): (isEnd?: boolean) => string {
    let isFirst = true;
    return (end = false) => {
        const elseIf = end ? 'else' : 'else if';
        const iF = isFirst ? 'if' : elseIf;
        isFirst = false;
        return iF;
    };
}

export function getJitFnArgCallVarName(parentComp: JitFnCompiler, rt: BaseRunType, idFnToCall: JitFnID, argKey: string): string {
    const fnConfig = getJitFnSettings(idFnToCall);
    const defaultArgVal = fnConfig.jitDefaultArgs[argKey];
    // vλl is a special case because it is the only arg that changes based on the stack
    if (argKey === 'vλl' && fnConfig.noInitialVλl) return 'undefined'; // when no initial vλl is required, we pass undefined
    if (argKey === 'vλl') return parentComp.getCurrentStackItem().vλl; // when vλl is required we pass the current stack item

    // first check if the arg is provided by the context
    const varNameFromContext = parentComp.getChildrenCallArgs(idFnToCall)?.[argKey];
    if (varNameFromContext) return varNameFromContext;
    // then check if the arg is provided by the parent function
    const varNameFromParent = parentComp.args[argKey];
    if (varNameFromParent) return varNameFromParent;
    // if neither the parent nor the context has the arg, we create a new default value in the context
    // if there is no default value, we can't call the function
    if (!defaultArgVal)
        throw new Error(
            `Can not call jit function ${idFnToCall} because it requires argument ${argKey} but it is not provided,
            neither in the parent function nor in the function context and there is no default value for it.`
        );
    const defaultName = fnConfig.jitArgs[argKey];
    const optsVarName = `${defaultName}_${idFnToCall}0`; // we don't need to use nestLevel as value is the same for all calls
    parentComp.setContextItem(optsVarName, `const ${optsVarName} = ${defaultArgVal}`);
    return optsVarName;
}

/**
 * Returns true if the parent of the runType is of the given kind.
 * handles special case of union types, as we need to check the parent of the union.
 * @param rt
 * @param kind
 * @returns
 */
export function parentIs(rt: BaseRunType, kind: ReflectionKind | ReflectionKind[]): boolean {
    const parentRT = rt.getParent();
    if (!parentRT) return false;
    if (parentRT.src.kind === ReflectionKind.union) return parentIs(parentRT, kind);
    if (Array.isArray(kind) ? kind.includes(parentRT.src.kind) : parentRT.src.kind === kind) return true;
    return false;
}

/** Add full stop to code if needed */
export function addFullStop(code: string): string {
    if (!code) return code;
    const lastChar = code.length - 1;
    const hasFullStop = code[lastChar] === ';';
    if (hasFullStop) return code;
    const hasBlockClose = code[lastChar] === '}';
    return hasBlockClose ? code : `${code};`;
}
