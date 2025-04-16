/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {AnyFn} from '@mionkit/core/src/types';
import {JITCompiledFunctions} from '@mionkit/core/src/types';
import {reflectFunction} from './lib/runType';
import {JitFunctions} from './constants';

export function getParamsJitFns<Fn extends AnyFn>(fn: Fn): JITCompiledFunctions[] {
    const rt = reflectFunction(fn);

    const paramsIndividualFns = rt
        .getParameters()
        .getChildRunTypes()
        .map((p) => {
            const paramFunctions: JITCompiledFunctions = {
                isType: p.createJitCompiledFunction(JitFunctions.isType.id),
                typeErrors: p.createJitCompiledFunction(JitFunctions.typeErrors.id),
                toJsonVal: p.createJitCompiledFunction(JitFunctions.toJsonVal.id),
                fromJsonVal: p.createJitCompiledFunction(JitFunctions.fromJsonVal.id),
                jsonStringify: p.createJitCompiledFunction(JitFunctions.jsonStringify.id),
            };
            return paramFunctions;
        });
    return paramsIndividualFns;
}

export function getReturnJitFns<Fn extends AnyFn>(fn: Fn): JITCompiledFunctions {
    const rt = reflectFunction(fn);

    const routerFunctions: JITCompiledFunctions = {
        isType: rt.createJitCompiledFunction(JitFunctions.isType.id),
        typeErrors: rt.createJitCompiledFunction(JitFunctions.typeErrors.id),
        toJsonVal: rt.createJitCompiledFunction(JitFunctions.toJsonVal.id),
        fromJsonVal: rt.createJitCompiledFunction(JitFunctions.fromJsonVal.id),
        jsonStringify: rt.createJitCompiledFunction(JitFunctions.jsonStringify.id),
    };
    return routerFunctions;
}
