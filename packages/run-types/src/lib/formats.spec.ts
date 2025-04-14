/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
// ###################### Types FORMATS #####################

import type {GenericPureFunction, JITUtils} from '@mionkit/core/src/types';
import {ReflectionKind} from '@deepkit/type';
import {runType} from '../runType';
import {BaseRunTypeFormat} from './baseRunTypeFormat';
import {BaseRunType} from './baseRunTypes';
import {getCompiledPureFn, getPureFn, registerPureFnClosuresGroup, registerPureFnClosure, registerFormatter} from './formats';
import {TypeFormat} from './formats.runtype';

it('TypeFormat should have a different jit id', async () => {
    type Max5 = TypeFormat<string, 'max5', {maxLength: 5}>;
    class Max5Formatter extends BaseRunTypeFormat<any> {
        kind = ReflectionKind.string;
        name = 'max5';
        _mock() {}
        _compileIsType(): undefined {}
        _compileTypeErrors(): undefined {}
        _compileFormat?(): undefined {}
    }
    registerFormatter(new Max5Formatter());
    const rtMax5 = runType<Max5>() as BaseRunType;
    const rt = runType<string>() as BaseRunType;
    expect(rtMax5.getJitId()).toBe('5<{maxLength:5}>');
    expect(rt.getJitId()).toBe(5);
});

it('register and get pure function', async () => {
    type StringParams = {
        isLowercase?: boolean;
        isNumeric?: boolean;
    };
    // reflection never tag is required so pure function do not include any artifacts from @deepkit/compiler
    /** @reflection never */
    function stringPureFn() {
        const isNumericRegexp = /^[0-9]+$/;
        return function is_s(s: string, p: StringParams): boolean {
            if (p.isLowercase && s !== s.toLowerCase()) return false;
            if (p.isNumeric && !isNumericRegexp.test(s)) return false;
            return true;
        };
    }
    registerPureFnClosure(stringPureFn);
    const restoredFn = getPureFn('stringPureFn') as ReturnType<typeof stringPureFn>;
    expect(restoredFn).toBeDefined();
    expect(restoredFn).toBeInstanceOf(Function);
    expect(restoredFn?.('a', {isLowercase: true})).toBe(true);
    expect(restoredFn?.('A', {isLowercase: true})).toBe(false);
});

it('register a group of pure functions so all declared as dependencies', async () => {
    type Params = {
        isA?: boolean;
        isB?: boolean;
    };
    // reflection never tag is required so pure function do not include any artifacts from @deepkit/compiler
    /** @reflection never */
    function pureFunctionA(jitUtils: JITUtils) {
        return function is_a(s: string, p: Params): boolean {
            if (p.isA) return s.includes('a');
            return true;
        };
    }
    // reflection never tag is required so pure function do not include any artifacts from @deepkit/compiler
    /** @reflection never */
    function pureFunctionB(jitUtils: JITUtils) {
        const isA = jitUtils.getPureFn('pureFunctionA') as ReturnType<typeof pureFunctionA>;
        return function is_b(s: string, p: Params): boolean {
            const isAResult = isA(s, p);
            if (p.isB) return isAResult && s.includes('b');
            return isAResult;
        } as GenericPureFunction<Params>;
    }
    registerPureFnClosuresGroup([pureFunctionA, pureFunctionB]);
    const compiledIsA = getCompiledPureFn('pureFunctionA');
    const compiledIsB = getCompiledPureFn('pureFunctionB');
    expect(compiledIsA).toBeDefined();
    expect(compiledIsB).toBeDefined();
    expect(compiledIsA?.fn).toBeDefined();
    expect(compiledIsB?.fn).toBeDefined();
    expect(compiledIsA?.dependencies.has('pureFunctionB')).toBeTruthy();
    expect(compiledIsB?.dependencies.has('pureFunctionA')).toBeTruthy();
    expect(compiledIsA?.dependencies.has('pureFunctionA')).toBeFalsy();
    expect(compiledIsB?.dependencies.has('pureFunctionB')).toBeFalsy();
});
