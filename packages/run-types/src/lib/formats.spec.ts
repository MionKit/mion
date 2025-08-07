/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
// ###################### Types FORMATS #####################

import type {GenericPureFunction, JITUtils} from '@mionkit/core/types';
import {ReflectionKind} from '@deepkit/type';
import {runType} from './runType';
import {BaseRunTypeFormat} from './baseRunTypeFormat';
import {BaseRunType} from './baseRunTypes';
import {getCompiledPureFn, getPureFn, registerPureFnClosuresGroup, registerPureFnClosure, registerFormatter} from './formats';
import {TypeFormat} from './formats.runtype';
import {JitFunctions} from '../constants.functions';
import {JitCompiler, JitErrorsCompiler} from './jitCompiler';

type Max5 = TypeFormat<string, 'max5', {maxLength: 5}>;
class Max5Formatter extends BaseRunTypeFormat<any> {
    kind = ReflectionKind.string;
    name = 'max5';
    _mock() {}
    _compileIsType(comp: JitCompiler, rt: BaseRunType) {
        const p = this.getParams(rt);
        return `${comp.vλl}.length <= ${p.maxLength}`;
    }
    _compileTypeErrors(comp: JitErrorsCompiler, rt: BaseRunType) {
        const p = this.getParams(rt);
        const errFn = this.getCallJitFormatErr(comp, rt, this);
        return `if (${comp.vλl}.length > ${p.maxLength}) ${errFn('maxLength', p.maxLength)}`;
    }
}
registerFormatter(new Max5Formatter());

it('TypeFormat should have a different type id', async () => {
    const rtMax5 = runType<Max5>() as BaseRunType;
    const rt = runType<string>() as BaseRunType;
    expect(rtMax5.getTypeID()).toBe('5<{maxLength:5}>');
    expect(rt.getTypeID()).toBe(5);
});

it('Type should have a different type id if format is not in root Type', async () => {
    const rtMax5List = runType<Max5[]>() as BaseRunType; // root type is array
    const rtList = runType<string[]>() as BaseRunType; // root type is array
    expect(rtMax5List.getTypeID()).toBe('25:5<{maxLength:5}>');
    expect(rtList.getTypeID()).toBe('25:5');
    const rtMaxObj = runType<{a: Max5}>();
    const rtObj = runType<{a: string}>();
    expect(rtMaxObj.getTypeID()).toBe('30{a:5<{maxLength:5}>}');
    expect(rtObj.getTypeID()).toBe('30{a:5}');
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
    expect(compiledIsA?.dependencies.has('pf_pureFunctionB')).toBeTruthy();
    expect(compiledIsB?.dependencies.has('pf_pureFunctionA')).toBeTruthy();
    expect(compiledIsA?.dependencies.has('pf_pureFunctionA')).toBeFalsy();
    expect(compiledIsB?.dependencies.has('pf_pureFunctionB')).toBeFalsy();
});

it('isType Formats string', () => {
    const rtMax5 = runType<Max5>() as BaseRunType;
    const isTypeMax5 = rtMax5.createJitFunction(JitFunctions.isType);
    expect(isTypeMax5('a')).toBe(true);
    expect(isTypeMax5('aaaaa')).toBe(true);
    expect(isTypeMax5('aaaaaa')).toBe(false);
});

it('isType Formats object', () => {
    const rtObjectMax5 = runType<{a: Max5}>() as BaseRunType;
    const isTypeObjectMax5 = rtObjectMax5.createJitFunction(JitFunctions.isType);
    expect(isTypeObjectMax5({a: 'a'})).toBe(true);
    expect(isTypeObjectMax5({a: 'aaaaa'})).toBe(true);
    expect(isTypeObjectMax5({a: 'aaaaaa'})).toBe(false);
});

it('isType Formats list', () => {
    const rtListMax5 = runType<Max5[]>() as BaseRunType;
    const isTypeListMax5 = rtListMax5.createJitFunction(JitFunctions.isType);
    expect(isTypeListMax5(['a'])).toBe(true);
    expect(isTypeListMax5(['aaaaa'])).toBe(true);
    expect(isTypeListMax5(['aaaaaa'])).toBe(false);
});
