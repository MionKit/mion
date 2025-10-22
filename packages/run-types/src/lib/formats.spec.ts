/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
// ###################### Types FORMATS #####################

import {ReflectionKind} from '@deepkit/type';
import {runType} from './runType';
import {BaseRunTypeFormat} from './baseRunTypeFormat';
import {BaseRunType} from './baseRunTypes';
import {registerFormatter} from './formats';
import {TypeFormat} from './formats.runtype';
import {JitFunctions} from '../constants.functions';
import {JitCompiler, JitErrorsCompiler} from './jitCompiler';
import {JitCode} from '../types';

type Max5 = TypeFormat<string, 'max5', {maxLength: 5}>;
class Max5Formatter extends BaseRunTypeFormat<any> {
    kind = ReflectionKind.string;
    name = 'max5';
    _mock() {}
    visitIsType(comp: JitCompiler, rt: BaseRunType): JitCode {
        const p = this.getParams(rt);
        return {code: `${comp.vλl}.length <= ${p.maxLength}`, type: 'E'};
    }
    visitIsTypeErrors(comp: JitErrorsCompiler, rt: BaseRunType): JitCode {
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
