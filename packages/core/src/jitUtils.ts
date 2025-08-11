/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {
    CompiledPureFunction,
    JitCompiledFn,
    JitFunctionsCache,
    Mutable,
    PureFunction,
    PureFunctionsCache,
    RunTypeError,
    TypeFormatError,
    DeserializeClassFn,
    AnyClass,
    SerializableClass,
    JITUtils,
    StrNumber,
} from './types';
import {MAX_STACK_DEPTH, MAX_UNKNOWN_KEYS} from './constants';
import {cΦmpilεdCachε as tCache} from './_autogen/jitFunctionsCache';
import {cΦmpilεdCachε as pCache} from './_autogen/pureFunctionsCache';
import {getENV} from './utils';

// eslint-disable-next-line no-control-regex
const STR_ESCAPE = /[\u0000-\u001f\u0022\u005c\ud800-\udfff]/;
const MAX_SCAPE_TEST_LENGTH = 1000; // possible to tweak after benchmarking
// initial map to store jit functions, file gest recompiled 🔁 and overridden when
const jitFnsCache: JitFunctionsCache = tCache;
const pureFnsCache: PureFunctionsCache = pCache;
// serializable classes registry, serializable classes can be automatically deserialized if they are registered here
const deserializeFnsRegistry = new Map<string, DeserializeClassFn<any>>();
const serializableClassRegistry = new Map<string, SerializableClass>();

/**
 * Object that wraps all utilities that are used by the jit generated functions for encode, decode, stringify etc..
 * !!! DO NOT MODIFY METHOD NAMES OF PROPERTY OR METHODS AS THESE ARE HARDCODED IN THE JIT GENERATED CODE !!!
 */
export const jitUtils: JITUtils = {
    /** optimized function to convert an string into a json string wrapped in double quotes */
    asJSONString(str: string) {
        // Bellow code for 'asJSONString' is copied from from https://github.com/fastify/fast-json-stringify/blob/master/lib/serializer.js
        // which in turn got 'inspiration' from typia https://github.com/samchon/typia/blob/master/src/functional/$string.ts
        // both under MIT license
        // typia license: https://github.com/samchon/typia/blob/master/LICENSE
        // fastify lisecense: https://github.com/fastify/fast-json-stringify/blob/master/LICENSE
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
                    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
                    last === -1 && (last = 0);
                    result += str.slice(last, i) + '\\';
                    last = i;
                } else if (point < 32 || (point >= 0xd800 && point <= 0xdfff)) {
                    // The current character is non-printable characters or a surrogate.
                    return JSON.stringify(str);
                }
            }

            return (last === -1 && '"' + str + '"') || '"' + result + str.slice(last) + '"';
        } else if (str.length < MAX_SCAPE_TEST_LENGTH && STR_ESCAPE.test(str) === false) {
            // Only use the regular expression for shorter input. The overhead is otherwise too much.
            return '"' + str + '"';
        } else {
            return JSON.stringify(str);
        }
    },
    addToJitCache(comp: JitCompiledFn) {
        jitFnsCache[comp.jitFnHash] = comp;
    },
    removeFromJitCache(comp: JitCompiledFn) {
        if (!jitFnsCache[comp.jitFnHash]) return;
        (jitFnsCache[comp.jitFnHash] as any) = undefined;
    },
    getJIT(jitFnHash: string): JitCompiledFn | undefined {
        return jitFnsCache[jitFnHash];
    },
    getJitFn(jitFnHash: string): (...args: any[]) => any {
        const comp = jitFnsCache[jitFnHash];
        if (!comp) throw new Error(`Jit function not found for jitFnHash ${jitFnHash}`);
        return comp.fn;
    },
    hasJitFn(jitFnHash: string) {
        return !!jitFnsCache[jitFnHash]?.fn;
    },
    safeKey(value: any): any {
        if (isSafeMapKeyValue(value)) return value;
        return null;
    },
    addPureFn(compiledFn: CompiledPureFunction) {
        const fnHash = compiledFn.pureFnHash;
        if (!fnHash) throw new Error('Pure function must have a name and must be unique');
        const existing = pureFnsCache[fnHash];
        if (existing) return existing;
        pureFnsCache[fnHash] = compiledFn;
    },
    usePureFn(fnHash: string): PureFunction {
        const compiled = pureFnsCache[fnHash];
        if (!compiled) throw new Error(`Pure function with name ${fnHash} not found`);
        initPureFunction(compiled);
        return compiled.fn;
    },
    getPureFn(fnHash: string): PureFunction | undefined {
        const compiled = pureFnsCache[fnHash];
        if (!compiled) return;
        initPureFunction(compiled);
        return compiled.fn;
    },
    getCompiledPureFn(fnHash: string): CompiledPureFunction | undefined {
        return pureFnsCache[fnHash];
    },
    hasPureFn(fnHash: string): boolean {
        return !!pureFnsCache[fnHash];
    },
    setSerializableClass<C extends SerializableClass>(cls: C) {
        const className = cls.name;
        const existingClass = serializableClassRegistry.get(className);
        if (existingClass && existingClass !== cls) throw new Error(`Deserializable Class ${className} already registered`);
        serializableClassRegistry.set(className, cls);
    },
    useSerializeClass(className: string): SerializableClass {
        const cls = serializableClassRegistry.get(className);
        if (!cls) throw new Error(`Serializable class with name ${className} not found, be sure to register it first`);
        return cls;
    },
    getSerializeClass(className: string): SerializableClass | undefined {
        return serializableClassRegistry.get(className);
    },
    setDeserializeFn<C extends AnyClass>(cls: C, deserializeFn: DeserializeClassFn<InstanceType<C>>) {
        const className = cls.name;
        const fn = deserializeFnsRegistry.get(className);
        if (fn && fn !== deserializeFn) throw new Error(`Deserialize function for class ${className} already exists`);
        if (fn) return;
        deserializeFnsRegistry.set(className, deserializeFn);
    },
    useDeserializeFn(className: string): DeserializeClassFn<any> {
        const fn = deserializeFnsRegistry.get(className);
        if (!fn) throw new Error(`Deserialize function for class ${className} not found, be sure to register it first`);
        return fn;
    },
    getDeserializeFn(className: string): DeserializeClassFn<any> | undefined {
        return deserializeFnsRegistry.get(className);
    },

    // TODO: all functions bellow could be moved to pure functions instead being part of jitUtils
    getUnknownKeysFromArray(obj: Record<StrNumber, any>, keys: StrNumber[]): StrNumber[] {
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
        // console.log('getUnknownKeysFromArray: ', false, unknownKeys);
        return unknownKeys;
    },
    hasUnknownKeysFromArray(obj: Record<StrNumber, any>, keys: StrNumber[]): boolean {
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
    },
    /**
     * Creates an new RunTypeError and adds it to the errors array
     * Note that all paths are copied when creating the new RunTypeError
     * so they can't be modified after the error is created
     */
    err(pλth: readonly StrNumber[], εrr: RunTypeError[], expected: string, accessPath?: readonly StrNumber[]) {
        const path = accessPath?.length ? [...pλth, ...accessPath] : [...pλth];
        const runTypeErr: RunTypeError = {expected, path};
        εrr.push(runTypeErr);
    },
    /**
     * Creates an new RunTypeError with a TypeFormatError and adds it to the errors array
     * Note that all paths are copied when creating the new RunTypeError
     * so they can't be modified after the error is created
     */
    formatErr(
        pλth: StrNumber[],
        εrr: RunTypeError[],
        expected: string,
        fmtName: string,
        paramName: string,
        paramVal: string | number | boolean | bigint,
        fmtPath: StrNumber[],
        accessPath?: StrNumber[],
        fmtAccessPath?: StrNumber[]
    ) {
        const path = accessPath?.length ? [...pλth, ...accessPath] : [...pλth];
        const formatPath = fmtAccessPath?.length ? [...fmtPath, ...fmtAccessPath, paramName] : [...fmtPath, paramName];
        const format: TypeFormatError = {name: fmtName, formatPath: formatPath, val: paramVal};
        const runTypeErr: Required<RunTypeError> = {expected, path, format};
        εrr.push(runTypeErr);
    },
};

/**
 * Checks if key map can be serialized/deserialized with json and still works as a key for a map.
 * ie: if a map key is an string, it can be serialized to json and deserialized back an still will identify the correct map entry.
 * ie: if a map entry is an object, the object can not be serialized/deserialized and wont work as the same key for entry map as they are not same memory ref.
 *  */
export function isSafeMapKeyValue(value: any, depth = 0): boolean {
    if (depth > MAX_STACK_DEPTH) return false;
    if (value === undefined) return true;
    if (value === null) return true;
    const type = typeof value;
    if (type === 'number' || type === 'string' || type === 'boolean') return true;
    return false;
}

function initPureFunction(compiled: CompiledPureFunction): asserts compiled is Required<CompiledPureFunction> {
    if (compiled.fn) return;
    if (getENV('MION_COMPILE') === 'true' || getENV('JEST_WORKER_ID') !== undefined) {
        const {paramNames, code: body} = compiled;
        try {
            // when testing we immediately add the deserialized function to ensure test are working with deserialized functions
            // this is to ensure that the deserialization process is working correctly
            // this process is not needed in production as the original function is used
            const newWithCtx = paramNames.length ? new Function(...paramNames, body) : new Function(body);
            compiled.fn = newWithCtx(jitUtils) as PureFunction;
            return;
        } catch (error: any) {
            console.warn(`Pure ${compiled.pureFnHash} can not be deserialized. Function code:\n${compiled.closureFn.toString()}`);
            throw new Error(`Pure function ${compiled.pureFnHash} can not be deserialized: ${error?.message}`);
        }
    }
    compiled.fn = compiled.closureFn(jitUtils);
}

function restoreCompiledJitFn(jitCache: JitFunctionsCache, pureCache: PureFunctionsCache, fnHash: string) {
    const jitCompiled = jitCache[fnHash];
    if (!jitCompiled) throw new Error(`Jit function ${fnHash} not found`);
    if ((jitCompiled as any).fn) return;

    const pureDependencies = jitCompiled.pureFnDependencies;
    pureDependencies.forEach((depName) => restoreCompiledPureFn(pureCache, depName));

    const dependencies = jitCompiled.dependenciesSet;
    dependencies.forEach((dep) => restoreCompiledJitFn(jitCache, pureCache, dep));
    (jitCompiled as Mutable<JitCompiledFn>).fn = jitCompiled.closureFn(jitUtils);
}

function restoreCompiledPureFn(pureCache: PureFunctionsCache, fnName: string) {
    const pureCompiled = pureCache[fnName];
    if (!pureCompiled) throw new Error(`Pure function ${fnName} not found`);
    if (pureCompiled.fn) return;
    const dependencies = pureCompiled.dependencies;
    dependencies.forEach((depName) => restoreCompiledPureFn(pureCache, depName));
    pureCompiled.fn = pureCompiled.closureFn(jitUtils);
}

/**
 * Restores the full state of a compiled jit functions cache,
 * The JIT fn itself can't be compiled to code as it contains references to context code and jitUtils.
 * So we need to restore it manually by invoking the closure function.
 * */
export function restoreCompiledJitFnsCache(jitCache: JitFunctionsCache, pureCache: PureFunctionsCache) {
    const keysPureFns = Object.keys(pureCache);
    keysPureFns.forEach((key) => restoreCompiledPureFn(pureCache, key));
    const keysJitFns = Object.keys(jitCache);
    keysJitFns.forEach((key) => restoreCompiledJitFn(jitCache, pureCache, key));
}

/**
 * Returns the jit and pure functions caches.
 * DO NOT MODIFY THE RETURNED OBJECTS AS THEY ARE THE ORIGINAL ONES USED BY THE JIT FUNCTIONS
 * @returns
 */
export function getFnCaches() {
    return {
        jitFnsCache: jitFnsCache as Readonly<JitFunctionsCache>,
        pureFnsCache: pureFnsCache as Readonly<PureFunctionsCache>,
    };
}

restoreCompiledJitFnsCache(jitFnsCache, pureFnsCache);
