/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {CompiledPureFunction, PureFunctionFactory} from '../types/pureFunctions.types.ts';
import {getJitUtils, type JITUtils} from '../jit/jitUtils.ts';
import {createUniqueHash, pureFnHashLength} from './quickHash.ts';

export function registerPureFnFactory(
    namespace: string,
    functionID: string,
    createPureFn: PureFunctionFactory
): CompiledPureFunction {
    const existing = getJitUtils().getCompiledPureFn(namespace, functionID);
    if (existing) return existing;
    const compiled = parsePureFactoryFunction(namespace, functionID, createPureFn);

    // Run the factory once with a tracking proxy to auto-detect dependencies
    const {proxy, getDependencies} = createDependencyTrackingProxy();
    try {
        createPureFn(proxy);
    } catch {
        // Factory may fail if dependencies aren't registered yet, that's ok
        // We still capture whatever was accessed before the error
    }
    const detectedDeps = getDependencies();
    for (const dep of detectedDeps) {
        if (dep === functionID) continue;
        if (!compiled.pureFnDependencies.includes(dep)) compiled.pureFnDependencies.push(dep);
    }

    getJitUtils().addPureFn(namespace, compiled);
    return compiled;
}

/** Creates a proxy of jitUtils that records all pure function accesses (getPureFn, usePureFn, etc.) */
function createDependencyTrackingProxy(): {proxy: JITUtils; getDependencies: () => Set<string>} {
    const dependencies = new Set<string>();
    const realUtils = getJitUtils();

    const noopFn = () => () => {};

    const proxy = new Proxy(realUtils, {
        get(target, prop, receiver) {
            if (prop === 'getPureFn' || prop === 'usePureFn') {
                return (ns: string, fnName: string) => {
                    dependencies.add(fnName);
                    // Return a noop function so the factory can execute without errors
                    const real = target.getPureFn(ns, fnName);
                    return real ?? noopFn;
                };
            }
            if (prop === 'getCompiledPureFn') {
                return (ns: string, fnName: string) => {
                    dependencies.add(fnName);
                    return target.getCompiledPureFn(ns, fnName);
                };
            }
            if (prop === 'hasPureFn') {
                return (ns: string, fnName: string) => {
                    dependencies.add(fnName);
                    return target.hasPureFn(ns, fnName);
                };
            }
            if (prop === 'findCompiledPureFn') {
                return (fnName: string) => {
                    dependencies.add(fnName);
                    return target.findCompiledPureFn(fnName);
                };
            }
            return Reflect.get(target, prop, receiver);
        },
    });

    return {proxy, getDependencies: () => dependencies};
}

/**
 * Parses a pure function and returns it's data.
 * We are using toString() to get the function code, this might not work in all environments.
 */
function parsePureFactoryFunction(namespace: string, functionID: string, createJitFn: PureFunctionFactory): CompiledPureFunction {
    const fnString = createJitFn.toString();

    // Extract parameters
    const trimmed = fnString.trim();
    let paramNames: string[] = [];

    // Check if it's an arrow function without parentheses (single param, no parens)
    // Pattern: "x => ..." or "async x => ..." (single identifier before =>)
    const arrowIndex = trimmed.indexOf('=>');
    if (arrowIndex !== -1) {
        const beforeArrow = trimmed.substring(0, arrowIndex).trim();
        // Check if beforeArrow is a single valid identifier (no parentheses)
        const validIdentifier = /^[_$a-zA-Z][_$a-zA-Z0-9]*$/;
        if (validIdentifier.test(beforeArrow)) {
            // Arrow function without parentheses: x => { ... }
            paramNames = [beforeArrow];
        }
    }

    // Standard parsing for regular functions and arrow functions with parentheses
    if (paramNames.length === 0) {
        const paramsStart = fnString.indexOf('(') + 1;
        const paramsEnd = fnString.indexOf(')');
        if (paramsStart === 0 || paramsEnd === -1 || paramsEnd < paramsStart) {
            throw new Error("Invalid function, can't parse parameters");
        }

        const paramsString = fnString.substring(paramsStart, paramsEnd).trim();
        paramNames = paramsString.length > 0 ? paramsString.split(/\s*,\s*/) : [];
    }
    if (paramNames.length > 1) throw new Error('Pure function with context must have max 1 parameter');

    // Validate parameters
    const validIdentifier = /^[_$a-zA-Z][_$a-zA-Z0-9]*$/;
    for (const param of paramNames) {
        if (!validIdentifier.test(param))
            throw new Error(
                `Invalid parameter name: ${param}, pure function parameters must be valid identifiers and do not allow default values.`
            );
    }

    // Extract and normalize body using shared utility
    const body = normalizePureFnBody(extractFunctionBody(fnString));
    const compiled: CompiledPureFunction = {
        createPureFn: createJitFn,
        fn: null as any, // will be set later so all possible dependencies are resolved
        namespace,
        fnName: functionID,
        bodyHash: createUniqueHash(namespace + functionID + body, pureFnHashLength),
        paramNames,
        code: body,
        pureFnDependencies: [],
    };
    return compiled;
}

/** Normalizes a pure function body for consistent hashing (collapses whitespace, strips deepkit artifacts) */
export function normalizePureFnBody(body: string): string {
    let result = body;
    // Strip deepkit type compiler artifacts (__assignType wrappers) if present.
    // At runtime fn.toString() may contain __assignType(expr, [...]) calls injected by deepkit.
    // AST extraction also strips them. Both sides must produce the same normalized body for hash consistency.
    if (result.includes('__assignType')) result = stripAssignTypeWrappers(result);
    return result.replace(/[ \t]+/g, ' ').trim();
}

/** Strips __assignType(expr, [...]) wrappers from code, replacing them with just expr */
function stripAssignTypeWrappers(code: string): string {
    const marker = '__assignType(';
    let result = code;
    let idx = result.indexOf(marker);
    while (idx !== -1) {
        const start = idx;
        let pos = idx + marker.length;
        // Find the first argument by tracking balanced parentheses
        let depth = 1;
        const argStart = pos;
        let argEnd = pos;
        let foundSep = false;
        while (pos < result.length && depth > 0) {
            const ch = result[pos];
            if (ch === '(') depth++;
            else if (ch === ')') {
                depth--;
                if (depth === 0) break;
            } else if (ch === ',' && depth === 1 && !foundSep) {
                argEnd = pos;
                foundSep = true;
            }
            pos++;
        }
        if (!foundSep) argEnd = pos;
        const firstArg = result.substring(argStart, argEnd).trim();
        // Replace __assignType(expr, [...]) with expr
        const end = pos + 1; // skip closing ')'
        result = result.substring(0, start) + firstArg + result.substring(end);
        idx = result.indexOf(marker);
    }
    return result;
}

/** Extracts the function body from a function's toString() representation */
export function extractFunctionBody(fnString: string): string {
    const trimmed = fnString.trim();

    // Check if it's a regular function (starts with 'function' or 'async function')
    const isRegularFunction = trimmed.startsWith('function') || trimmed.startsWith('async function');

    if (isRegularFunction) {
        // Handle regular function - extract body between first { and last }
        const bodyStart = fnString.indexOf('{');
        const bodyEnd = fnString.lastIndexOf('}');
        if (bodyStart === -1 || bodyEnd === -1 || bodyEnd <= bodyStart) {
            throw new Error("Invalid function, can't parse body");
        }
        return fnString.substring(bodyStart + 1, bodyEnd).trim();
    }

    // Handle arrow functions
    const arrowIndex = fnString.indexOf('=>');
    if (arrowIndex !== -1) {
        const afterArrow = fnString.substring(arrowIndex + 2).trim();
        if (afterArrow.startsWith('{')) {
            // Arrow function with block body
            const bodyStart = fnString.indexOf('{', arrowIndex);
            const bodyEnd = fnString.lastIndexOf('}');
            if (bodyStart === -1 || bodyEnd === -1 || bodyEnd <= bodyStart) {
                throw new Error("Invalid arrow function, can't parse body");
            }
            return fnString.substring(bodyStart + 1, bodyEnd).trim();
        }
        // Arrow function with expression body - wrap in return
        return `return ${afterArrow}`;
    }

    throw new Error("Invalid function, can't determine function type");
}
