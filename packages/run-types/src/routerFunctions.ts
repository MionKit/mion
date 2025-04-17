/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {AnyFn, toCodeFn, JITCompiledFunctions} from '@mionkit/core/src/types';
import {reflectFunction} from './lib/runType';
import {JitFunctions} from './constants';
import {RunTypeOptions} from '@mionkit/run-types/src/types';

export function getParamsJitFns<Fn extends AnyFn>(fn: Fn, opts?: RunTypeOptions): JITCompiledFunctions {
    const rt = reflectFunction(fn);
    const paramFunctions: JITCompiledFunctions = {
        isType: rt.createJitCompiledParamsFunction(JitFunctions.isType, opts),
        typeErrors: rt.createJitCompiledParamsFunction(JitFunctions.typeErrors, opts),
        toJsonVal: rt.createJitCompiledParamsFunction(JitFunctions.toJsonVal, opts),
        fromJsonVal: rt.createJitCompiledParamsFunction(JitFunctions.fromJsonVal, opts),
        jsonStringify: rt.createJitCompiledParamsFunction(JitFunctions.jsonStringify, opts),
    };
    return paramFunctions;
}

export function getReturnJitFns<Fn extends AnyFn>(fn: Fn, opts?: RunTypeOptions): JITCompiledFunctions {
    const rt = reflectFunction(fn);

    const returnFunctions: JITCompiledFunctions = {
        isType: rt.createJitCompiledReturnFunction(JitFunctions.isType, opts),
        typeErrors: rt.createJitCompiledReturnFunction(JitFunctions.typeErrors, opts),
        toJsonVal: rt.createJitCompiledReturnFunction(JitFunctions.toJsonVal, opts),
        fromJsonVal: rt.createJitCompiledReturnFunction(JitFunctions.fromJsonVal, opts),
        jsonStringify: rt.createJitCompiledReturnFunction(JitFunctions.jsonStringify, opts),
    };
    return returnFunctions;
}

export function toCodeFn<Fn extends AnyFn>(fn: Fn, opts?: RunTypeOptions): toCodeFn {
    const rt = reflectFunction(fn);
    return rt.createJitCompiledFunction(JitFunctions.toCode.id, undefined, opts).fn;
}
