/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {JitFunctions} from '../../../constants.functions';
import {runType} from '../../../lib/createRunType';
import type {BaseRunType} from '../../../lib/baseRunTypes';

// ####################### ADDITIONAL TESTS SPECIFIC ONLY TO JSON #######################

it('interface json encode/decode should be marked as noop when there are no actions required', () => {
    interface NoJsonENCDECRequired {
        a: number;
        b: string;
    }
    interface sonENCDECRequired {
        a: bigint;
        c: Date;
    }

    const rtNoop = runType<NoJsonENCDECRequired>() as BaseRunType;
    const rtEncRequired = runType<sonENCDECRequired>() as BaseRunType;
    expect(rtNoop.createJitCompiledFunction(JitFunctions.toJsonVal.id).isNoop).toBe(true);
    expect(rtNoop.createJitCompiledFunction(JitFunctions.fromJsonVal.id).isNoop).toBe(true);
    expect(rtEncRequired.createJitCompiledFunction(JitFunctions.toJsonVal.id).isNoop).toBe(false);
    expect(rtEncRequired.createJitCompiledFunction(JitFunctions.fromJsonVal.id).isNoop).toBe(false);
});

it('tuple json encode/decode should be marked as noop when there are no actions required', () => {
    type NoJsonENCDECRequired = [number, string];
    type sonENCDECRequired = [bigint, Date];

    const rtNoop = runType<NoJsonENCDECRequired>() as BaseRunType;
    const rtEncRequired = runType<sonENCDECRequired>() as BaseRunType;
    expect(rtNoop.createJitCompiledFunction(JitFunctions.toJsonVal.id).isNoop).toBe(true);
    expect(rtNoop.createJitCompiledFunction(JitFunctions.fromJsonVal.id).isNoop).toBe(true);
    expect(rtEncRequired.createJitCompiledFunction(JitFunctions.toJsonVal.id).isNoop).toBe(false);
    expect(rtEncRequired.createJitCompiledFunction(JitFunctions.fromJsonVal.id).isNoop).toBe(false);
});

it('json encode/decode should never be marked as noop as encoding/decoding is always required', () => {
    type atomicNoEncRequired = number | string;
    type atomicEncRequired = bigint | Date;

    const rtNoop = runType<atomicNoEncRequired>() as BaseRunType;
    const rtEncRequired = runType<atomicEncRequired>() as BaseRunType;
    expect(rtNoop.createJitCompiledFunction(JitFunctions.toJsonVal.id).isNoop).toBe(false);
    expect(rtNoop.createJitCompiledFunction(JitFunctions.fromJsonVal.id).isNoop).toBe(false);
    expect(rtEncRequired.createJitCompiledFunction(JitFunctions.toJsonVal.id).isNoop).toBe(false);
    expect(rtEncRequired.createJitCompiledFunction(JitFunctions.fromJsonVal.id).isNoop).toBe(false);
});
