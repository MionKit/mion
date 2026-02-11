import type {CompiledPureFunction, PureFunctionClosure} from '../types/pureFunctions.types';
import {getJitUtils} from '../jitUtils';
import {createUniqueHash} from './quickHash';

export function getPureFunctionKey(fn: PureFunctionClosure): string {
    const name = fn.name;
    if (!name) throw new Error('Pure Functions must have a name');
    return name;
}

export function registerPureFnClosuresGroup(namespace: string, fnsWithCtx: PureFunctionClosure[]): CompiledPureFunction[] {
    const compiledFns = fnsWithCtx.map((fn) => registerPureFnClosure(namespace, fn));
    compiledFns.forEach((cfn) => {
        compiledFns.forEach((cf) => {
            if (cfn.fnName === cf.fnName) return;
            cf.dependencies.add(cfn.fnName);
        });
    });
    return compiledFns;
}

export function registerPureFnClosure(
    namespace: string,
    fnWithCtx: PureFunctionClosure,
    dependencies?: PureFunctionClosure[]
): CompiledPureFunction {
    const key = getPureFunctionKey(fnWithCtx);
    const existing = getJitUtils().getCompiledPureFn(namespace, key);
    if (existing) return existing;
    const compiled = parsePureFunctionWithCtx(namespace, fnWithCtx);
    if (dependencies) {
        dependencies.forEach((d) => registerPureFnClosure(namespace, d));
        dependencies.forEach((d) => compiled.dependencies.add(getPureFunctionKey(d)));
    }
    getJitUtils().addPureFn(namespace, compiled);
    return compiled;
}

/**
 * Parses a pure function and returns it's data.
 * We are using toString() to get the function code, this might not work in all environments.
 * Also using regexp to parse the function code, a proper AST could be better bu this is working for now and is simpler.
 * @param namespace - The namespace this pure function belongs to
 * @param createJitFn - The pure function closure
 * @returns
 */
function parsePureFunctionWithCtx(namespace: string, createJitFn: PureFunctionClosure): CompiledPureFunction {
    if (!createJitFn.name) throw new Error('Pure Functions must have a name');

    const fnString = createJitFn.toString();
    const bodyStart = fnString.indexOf('{');
    const bodyEnd = fnString.lastIndexOf('}');
    if (bodyStart === -1 || bodyEnd === -1 || bodyEnd <= bodyStart) throw new Error("Invalid function, can't parse body");

    const paramsStart = fnString.indexOf('(') + 1;
    const paramsEnd = fnString.indexOf(')');

    if (paramsStart === 0 || paramsEnd === -1 || paramsEnd < paramsStart) {
        throw new Error("Invalid function, can't parse parameters");
    }

    const paramsString = fnString.substring(paramsStart, paramsEnd).trim();
    const paramNames = paramsString.length > 0 ? paramsString.split(/\s*,\s*/) : [];
    if (paramNames.length > 1) throw new Error('Pure function with context must have max 1 parameter');

    // Validate parameters
    const validIdentifier = /^[_$a-zA-Z][_$a-zA-Z0-9]*$/;
    for (const param of paramNames) {
        if (!validIdentifier.test(param))
            throw new Error(
                `Invalid parameter name: ${param}, pure function parameters must be valid identifiers and do not allow default values.`
            );
    }

    const body = fnString
        .substring(bodyStart + 1, bodyEnd)
        .trim()
        .replace(/[ \t]+/g, ' ');
    const compiled: CompiledPureFunction = {
        createJitFn: createJitFn,
        fn: null as any, // will be set later so all possible dependencies are resolved
        namespace,
        fnName: createJitFn.name,
        bodyHash: createUniqueHash(namespace + createJitFn.name + body, 8),
        paramNames,
        code: body,
        dependencies: new Set<string>(),
    };
    return compiled;
}
