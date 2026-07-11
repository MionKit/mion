/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
// ###################### Types FORMATS #####################

import {it, expect} from 'vitest';
import {ReflectionKind} from '@deepkit/type';
import {runType} from '../createRunType.ts';
import {BaseRunTypeFormat} from './baseRunTypeFormat.ts';
import {BaseRunType} from './baseRunTypes.ts';
import {registerFormatter, getFormatterParams} from './formats.ts';
import {TypeFormat} from '../formats.runtype.ts';
import {JitFunctions} from '../constants.functions.ts';
import {JitFnCompiler, JitErrorsFnCompiler} from './jitFnCompiler.ts';
import {JitCode} from '../types.ts';

type Max5 = TypeFormat<string, 'max5', {maxLength: 5}>;
class Max5Formatter extends BaseRunTypeFormat<any> {
    kind = ReflectionKind.string;
    name = 'max5';
    _mock() {}
    emitIsType(comp: JitFnCompiler, rt: BaseRunType): JitCode {
        const p = this.getParams(rt);
        return {code: `${comp.vλl}.length <= ${p.maxLength}`, type: 'E'};
    }
    emitIsTypeErrors(comp: JitErrorsFnCompiler, rt: BaseRunType): JitCode {
        const p = this.getParams(rt);
        const errFn = this.getCallJitFormatErr(comp, rt, this);
        return {code: `if (${comp.vλl}.length > ${p.maxLength}) ${errFn('maxLength', p.maxLength)}`, type: 'S'};
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

// ###################### TypeFormat with Brand Tests #####################

// Test TypeFormat with brand parameter - brand should be ignored by runtime validation
type Max5WithBrand = TypeFormat<string, 'max5', {maxLength: 5}, 'MyBrand'>;

it('TypeFormat with brand should work the same as without brand', () => {
    const rtMax5WithBrand = runType<Max5WithBrand>() as BaseRunType;
    const isTypeMax5WithBrand = rtMax5WithBrand.createJitFunction(JitFunctions.isType);
    expect(isTypeMax5WithBrand('a')).toBe(true);
    expect(isTypeMax5WithBrand('aaaaa')).toBe(true);
    expect(isTypeMax5WithBrand('aaaaaa')).toBe(false);
});

it('TypeFormat with brand should have correct type id', () => {
    const rtMax5WithBrand = runType<Max5WithBrand>() as BaseRunType;
    // The type id should contain the format params
    expect(rtMax5WithBrand.getTypeID()).toContain('maxLength');
});

it('TypeFormat with brand should have params accessible via runtime reflection', () => {
    const rtMax5WithBrand = runType<Max5WithBrand>() as BaseRunType;
    const params = getFormatterParams<{maxLength: number}>(rtMax5WithBrand, 'max5');
    // The params should be accessible via getFormatterParams
    expect(params.maxLength).toBe(5);
});

it('TypeFormat without brand should work correctly', () => {
    const rtMax5 = runType<Max5>() as BaseRunType;
    const params = getFormatterParams<{maxLength: number}>(rtMax5, 'max5');
    expect(params.maxLength).toBe(5);
});

it('TypeFormat with brand should have brand accessible via runtime reflection', () => {
    const rtMax5WithBrand = runType<Max5WithBrand>() as BaseRunType;
    const params = getFormatterParams<{maxLength: number; brand: string}>(rtMax5WithBrand, 'max5');
    // The brand should be accessible via getFormatterParams
    expect(params.maxLength).toBe(5);
    expect(params.brand).toBe('MyBrand');
});

it('TypeFormat without brand should not have brand in params', () => {
    const rtMax5 = runType<Max5>() as BaseRunType;
    const params = getFormatterParams<{maxLength: number; brand?: string}>(rtMax5, 'max5');
    expect(params.maxLength).toBe(5);
    expect(params.brand).toBeUndefined();
});
