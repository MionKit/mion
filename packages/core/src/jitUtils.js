"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.jitUtils = void 0;
exports.isSafeMapKeyValue = isSafeMapKeyValue;
exports.restoreCompiledJitFnsCache = restoreCompiledJitFnsCache;
exports.getFnCaches = getFnCaches;
const __ΩRecord = ['K', 'T', 'Record', 'l\'e#"Rb!b"Pde"!N#!w#y'];
function __assignType(fn, args) {
    fn.__type = args;
    return fn;
}
const constants_1 = require("./constants");
const jitFunctionsCache_1 = require("./_autogen/jitFunctionsCache");
const pureFunctionsCache_1 = require("./_autogen/pureFunctionsCache");
const STR_ESCAPE = /[\u0000-\u001f\u0022\u005c\ud800-\udfff]/;
const MAX_SCAPE_TEST_LENGTH = 1000;
const jitFnsCache = jitFunctionsCache_1.cΦmpilεdCachε;
const pureFnsCache = pureFunctionsCache_1.cΦmpilεdCachε;
const deserializeFnsRegistry = (Map.Ω = [['&'], ['DeserializeClassFn', '"w!']], new Map());
const serializableClassRegistry = (Map.Ω = [['&'], ['SerializableClass', '"w!']], new Map());
exports.jitUtils = {
    asJSONString: __assignType(function asJSONString(str) {
        if (str.length < 42) {
            const len = str.length;
            let result = '';
            let last = -1;
            let point = 255;
            for (var i = 0; i < len; i++) {
                point = str.charCodeAt(i);
                if (point === 0x22 ||
                    point === 0x5c) {
                    last === -1 && (last = 0);
                    result += str.slice(last, i) + '\\';
                    last = i;
                }
                else if (point < 32 || (point >= 0xd800 && point <= 0xdfff)) {
                    return JSON.stringify(str);
                }
            }
            return (last === -1 && '"' + str + '"') || '"' + result + str.slice(last) + '"';
        }
        else if (str.length < MAX_SCAPE_TEST_LENGTH && STR_ESCAPE.test(str) === false) {
            return '"' + str + '"';
        }
        else {
            return JSON.stringify(str);
        }
    }, ['str', 'asJSONString', 'P&2!"/"']),
    addToJitCache: __assignType(function addToJitCache(comp) {
        jitFnsCache[comp.jitFnHash] = comp;
    }, ['JitCompiledFn', 'comp', 'addToJitCache', 'P"w!2""/#']),
    removeFromJitCache: __assignType(function removeFromJitCache(comp) {
        if (!jitFnsCache[comp.jitFnHash])
            return;
        jitFnsCache[comp.jitFnHash] = undefined;
    }, ['JitCompiledFn', 'comp', 'removeFromJitCache', 'P"w!2""/#']),
    getJIT: __assignType(function getJIT(jitFnHash) {
        return jitFnsCache[jitFnHash];
    }, ['jitFnHash', 'JitCompiledFn', 'getJIT', 'P&2!P"w"-J/#']),
    getJitFn: __assignType(function getJitFn(jitFnHash) {
        const comp = jitFnsCache[jitFnHash];
        if (!comp)
            throw new Error(`Jit function not found for jitFnHash ${jitFnHash}`);
        return comp.fn;
    }, ['jitFnHash', 'args', '', 'getJitFn', 'P&2!P"@2""/#/$']),
    hasJitFn: __assignType(function hasJitFn(jitFnHash) {
        return !!jitFnsCache[jitFnHash]?.fn;
    }, ['jitFnHash', 'hasJitFn', 'P&2!"/"']),
    safeKey: __assignType(function safeKey(value) {
        if (isSafeMapKeyValue(value))
            return value;
        return null;
    }, ['value', 'safeKey', 'P"2!"/"']),
    addPureFn: __assignType(function addPureFn(compiledFn) {
        const fnHash = compiledFn.pureFnHash;
        if (!fnHash)
            throw new Error('Pure function must have a name and must be unique');
        const existing = pureFnsCache[fnHash];
        if (existing)
            return existing;
        pureFnsCache[fnHash] = compiledFn;
    }, ['CompiledPureFunction', 'compiledFn', 'addPureFn', 'P"w!2""/#']),
    usePureFn: __assignType(function usePureFn(fnHash) {
        const compiled = pureFnsCache[fnHash];
        if (!compiled)
            throw new Error(`Pure function with name ${fnHash} not found`);
        initPureFunction(compiled);
        return compiled.fn;
    }, ['fnHash', 'PureFunction', 'usePureFn', 'P&2!"w"/#']),
    getPureFn: __assignType(function getPureFn(fnHash) {
        const compiled = pureFnsCache[fnHash];
        if (!compiled)
            return;
        initPureFunction(compiled);
        return compiled.fn;
    }, ['fnHash', 'PureFunction', 'getPureFn', 'P&2!P"w"-J/#']),
    getCompiledPureFn: __assignType(function getCompiledPureFn(fnHash) {
        return pureFnsCache[fnHash];
    }, ['fnHash', 'CompiledPureFunction', 'getCompiledPureFn', 'P&2!P"w"-J/#']),
    hasPureFn: __assignType(function hasPureFn(fnHash) {
        return !!pureFnsCache[fnHash];
    }, ['fnHash', 'hasPureFn', 'P&2!)/"']),
    setSerializableClass: __assignType(function setSerializableClass(cls) {
        const className = cls.name;
        const existingClass = serializableClassRegistry.get(className);
        if (existingClass && existingClass !== cls)
            throw new Error(`Deserializable Class ${className} already registered`);
        serializableClassRegistry.set(className, cls);
    }, ['cls', 'setSerializableClass', 'P"2!"/"']),
    useSerializeClass: __assignType(function useSerializeClass(className) {
        const cls = serializableClassRegistry.get(className);
        if (!cls)
            throw new Error(`Serializable class with name ${className} not found, be sure to register it first`);
        return cls;
    }, ['className', 'SerializableClass', 'useSerializeClass', 'P&2!"w"/#']),
    getSerializeClass: __assignType(function getSerializeClass(className) {
        return serializableClassRegistry.get(className);
    }, ['className', 'SerializableClass', 'getSerializeClass', 'P&2!P"w"-J/#']),
    setDeserializeFn: __assignType(function setDeserializeFn(cls, deserializeFn) {
        const className = cls.name;
        const fn = deserializeFnsRegistry.get(className);
        if (fn && fn !== deserializeFn)
            throw new Error(`Deserialize function for class ${className} already exists`);
        if (fn)
            return;
        deserializeFnsRegistry.set(className, deserializeFn);
    }, ['cls', 'DeserializeClassFn', 'deserializeFn', 'setDeserializeFn', 'P"2!"w"2#"/$']),
    useDeserializeFn: __assignType(function useDeserializeFn(className) {
        const fn = deserializeFnsRegistry.get(className);
        if (!fn)
            throw new Error(`Deserialize function for class ${className} not found, be sure to register it first`);
        return fn;
    }, ['className', 'DeserializeClassFn', 'useDeserializeFn', 'P&2!"w"/#']),
    getDeserializeFn: __assignType(function getDeserializeFn(className) {
        return deserializeFnsRegistry.get(className);
    }, ['className', 'DeserializeClassFn', 'getDeserializeFn', 'P&2!P"w"-J/#']),
    getUnknownKeysFromArray: __assignType(function getUnknownKeysFromArray(obj, keys) {
        const unknownKeys = [];
        for (const prop in obj) {
            let found = false;
            for (let j = 0; j < keys.length; j++) {
                if (keys[j] === prop) {
                    found = true;
                    break;
                }
            }
            if (!found) {
                unknownKeys.push(prop);
                if (unknownKeys.length >= constants_1.MAX_UNKNOWN_KEYS)
                    throw new Error('Too many unknown keys');
            }
        }
        return unknownKeys;
    }, [() => __ΩRecord, 'StrNumber', 'obj', 'keys', 'getUnknownKeysFromArray', 'P"w""o!#2#"w"F2$"w"F/%']),
    hasUnknownKeysFromArray: __assignType(function hasUnknownKeysFromArray(obj, keys) {
        for (const prop in obj) {
            let found = false;
            for (let j = 0; j < keys.length; j++) {
                if (keys[j] === prop) {
                    found = true;
                    break;
                }
            }
            if (!found)
                return true;
        }
        return false;
    }, [() => __ΩRecord, 'StrNumber', 'obj', 'keys', 'hasUnknownKeysFromArray', 'P"w""o!#2#"w"F2$)/%']),
    err: __assignType(function err(pλth, εrr, expected, accessPath) {
        const path = accessPath?.length ? [...pλth, ...accessPath] : [...pλth];
        const runTypeErr = { expected, path };
        εrr.push(runTypeErr);
    }, ['StrNumber', 'p\u03BBth', 'RunTypeError', '\u03B5rr', 'expected', 'accessPath', 'err', 'P"w!F92""w#F2$&2%"w!F92&8"/\'']),
    formatErr: __assignType(function formatErr(pλth, εrr, expected, fmtName, paramName, paramVal, fmtPath, accessPath, fmtAccessPath) {
        const path = accessPath?.length ? [...pλth, ...accessPath] : [...pλth];
        const formatPath = fmtAccessPath?.length ? [...fmtPath, ...fmtAccessPath, paramName] : [...fmtPath, paramName];
        const format = { name: fmtName, formatPath: formatPath, val: paramVal };
        const runTypeErr = { expected, path, format };
        εrr.push(runTypeErr);
    }, ['StrNumber', 'p\u03BBth', 'RunTypeError', '\u03B5rr', 'expected', 'fmtName', 'paramName', 'paramVal', 'fmtPath', 'accessPath', 'fmtAccessPath', 'formatErr', 'P"w!F2""w#F2$&2%&2&&2\'P&\')*J2("w!F2)"w!F2*8"w!F2+8"/,']),
};
function isSafeMapKeyValue(value, depth = 0) {
    if (depth > constants_1.MAX_STACK_DEPTH)
        return false;
    if (value === undefined)
        return true;
    if (value === null)
        return true;
    const type = typeof value;
    if (type === 'number' || type === 'string' || type === 'boolean')
        return true;
    return false;
}
isSafeMapKeyValue.__type = ['value', 'depth', 'isSafeMapKeyValue', 'P"2!"2")/#'];
function initPureFunction(compiled) {
    if (compiled.fn)
        return;
    if (process.env.MION_COMPILE === 'true' || process.env.JEST_WORKER_ID !== undefined) {
        const { paramNames, code: body } = compiled;
        try {
            const newWithCtx = paramNames.length ? new Function(...paramNames, body) : new Function(body);
            compiled.fn = newWithCtx(exports.jitUtils);
            return;
        }
        catch (error) {
            console.warn(`Pure ${compiled.pureFnHash} can not be deserialized. Function code:\n${compiled.closureFn.toString()}`);
            throw new Error(`Pure function ${compiled.pureFnHash} can not be deserialized: ${error?.message}`);
        }
    }
    compiled.fn = compiled.closureFn(exports.jitUtils);
}
initPureFunction.__type = ['CompiledPureFunction', 'compiled', 'initPureFunction', 'P"w!2"!/#'];
function restoreCompiledJitFn(jitCache, pureCache, fnHash) {
    const jitCompiled = jitCache[fnHash];
    if (!jitCompiled)
        throw new Error(`Jit function ${fnHash} not found`);
    if (jitCompiled.fn)
        return;
    const pureDependencies = jitCompiled.pureFnDependencies;
    pureDependencies.forEach(__assignType((depName) => restoreCompiledPureFn(pureCache, depName), ['depName', '', 'P"2!"/"']));
    const dependencies = jitCompiled.dependenciesSet;
    dependencies.forEach(__assignType((dep) => restoreCompiledJitFn(jitCache, pureCache, dep), ['dep', '', 'P"2!"/"']));
    jitCompiled.fn = jitCompiled.closureFn(exports.jitUtils);
}
restoreCompiledJitFn.__type = ['JitFunctionsCache', 'jitCache', 'PureFunctionsCache', 'pureCache', 'fnHash', 'restoreCompiledJitFn', 'P"w!2""w#2$&2%"/&'];
function restoreCompiledPureFn(pureCache, fnName) {
    const pureCompiled = pureCache[fnName];
    if (!pureCompiled)
        throw new Error(`Pure function ${fnName} not found`);
    if (pureCompiled.fn)
        return;
    const dependencies = pureCompiled.dependencies;
    dependencies.forEach(__assignType((depName) => restoreCompiledPureFn(pureCache, depName), ['depName', '', 'P"2!"/"']));
    pureCompiled.fn = pureCompiled.closureFn(exports.jitUtils);
}
restoreCompiledPureFn.__type = ['PureFunctionsCache', 'pureCache', 'fnName', 'restoreCompiledPureFn', 'P"w!2"&2#"/$'];
function restoreCompiledJitFnsCache(jitCache, pureCache) {
    const keysPureFns = Object.keys(pureCache);
    keysPureFns.forEach(__assignType((key) => restoreCompiledPureFn(pureCache, key), ['key', '', 'P"2!"/"']));
    const keysJitFns = Object.keys(jitCache);
    keysJitFns.forEach(__assignType((key) => restoreCompiledJitFn(jitCache, pureCache, key), ['key', '', 'P"2!"/"']));
}
restoreCompiledJitFnsCache.__type = ['JitFunctionsCache', 'jitCache', 'PureFunctionsCache', 'pureCache', 'restoreCompiledJitFnsCache', 'P"w!2""w#2$"/%'];
function getFnCaches() {
    return {
        jitFnsCache: jitFnsCache,
        pureFnsCache: pureFnsCache,
    };
}
getFnCaches.__type = ['getFnCaches', 'P"/!'];
restoreCompiledJitFnsCache(jitFnsCache, pureFnsCache);
//# sourceMappingURL=jitUtils.js.map