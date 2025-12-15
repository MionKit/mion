import type {JITUtils, GenericPureFunction} from '@mionkit/core';
import {registerPureFnClosure, getPureFn, getCompiledPureFn, registerPureFnClosuresGroup} from './pureFn';

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
    function pureFunctionA(jUtils: JITUtils) {
        return function is_a(s: string, p: Params): boolean {
            if (p.isA) return s.includes('a');
            return true;
        };
    }
    // reflection never tag is required so pure function do not include any artifacts from @deepkit/compiler
    /** @reflection never */
    function pureFunctionB(jUtils: JITUtils) {
        const isA = jUtils.getPureFn('pureFunctionA') as ReturnType<typeof pureFunctionA>;
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
    expect(compiledIsA?.dependencies.has('pf_pureFunctionB')).toBeTruthy();
    expect(compiledIsB?.dependencies.has('pf_pureFunctionA')).toBeTruthy();
    expect(compiledIsA?.dependencies.has('pf_pureFunctionA')).toBeFalsy();
    expect(compiledIsB?.dependencies.has('pf_pureFunctionB')).toBeFalsy();
});
