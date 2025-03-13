/* eslint-disable @typescript-eslint/ban-types */

/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {BaseRunType} from '../lib/baseRunTypes';
import type {JitCompiler, JitErrorsCompiler} from '../lib/jitCompiler';
import {JitRunTypeFormatter} from '../lib/jitFormatters';
import {ReflectionKind} from '@deepkit/type';
import {TypeFormat} from '../lib/formats.runtype'; // !Important: TypeFormat cant be imported as type for all runType functionality to work
import {JitFnID, MockOperation} from '../types';
import {DateStringParams, dateStringValidator, DefaultDateParams} from './date.runtype';
import {DefaultTimeParams, TimeStringParams, timeStringValidator} from './time.runtype';
import {registerFormatter} from '../lib/formats';
import {JitFunctions} from '../constants';
import {toLiteral} from '../lib/utils';

export type StringDateTimeParams = {
    date: DateStringParams;
    time: TimeStringParams;
    splitChar: string;
};

export type DefaultDateTimeParams = {
    date: DefaultDateParams;
    time: DefaultTimeParams;
    splitChar: 'T';
};

export type DateTimeString<P extends Partial<StringDateTimeParams> = {}> = TypeFormat<
    string,
    typeof DateTimeFormat.id,
    DefaultDateTimeParams & P
>;

// DateTime validator
export class DateTimeFormat extends JitRunTypeFormatter<StringDateTimeParams> {
    static id = 'dateTime' as const;
    kind = ReflectionKind.string;
    name = DateTimeFormat.id;
    jitFnIsExpression(fnId: JitFnID) {
        switch (fnId) {
            case JitFunctions.isType.id:
                return false;
            default:
                return super.jitFnIsExpression(fnId);
        }
    }
    _compileIsType(comp: JitCompiler, rt: BaseRunType): string {
        const params = this.getParams(rt);
        const dateCode = dateStringValidator.compileIsType(comp, rt, params.date, ['date'], 'date');
        const timeCode = timeStringValidator.compileIsType(comp, rt, params.time, ['time'], 'time');
        const fName = `is_${this.name}${rt.getNestLevel()}`;
        const code = `function ${fName}(dt) {
            const [date, time] = dt.split(${toLiteral(params.splitChar)});
            if (!date || !time) return false;
            return ${dateCode} && ${timeCode};
        }`;
        comp.contextCodeItems.set(fName, code);
        return `${fName}(${comp.vλl})`;
    }
    _compileTypeErrors(comp: JitErrorsCompiler, rt: BaseRunType): string {
        const params = this.getParams(rt);
        const code = `const [date, time] = ${comp.vλl}.split(${params.splitChar})`;
        const dateCode = dateStringValidator.compileTypeErrors(comp, rt, params.date, ['date'], 'date');
        const timeCode = timeStringValidator.compileTypeErrors(comp, rt, params.time, ['time'], 'time');
        const invalid = {date: {format: params.date.format}, time: {format: params.time.format}};
        return `${code};if (!date || !time) ${comp.callJitErr(rt, {name: rt.getTypeName(), invalid})};${dateCode};${timeCode}`;
    }
    _mock(mockContext: MockOperation, rt: BaseRunType) {
        const params = this.getParams(rt);
        const mockedDate = dateStringValidator.mock(mockContext, rt, params.date);
        const mockTimeString = timeStringValidator.mock(mockContext, rt, params.time);
        return `${mockedDate}${params.splitChar}${mockTimeString}`;
    }
    _compileFormat?(comp: JitCompiler, rt: BaseRunType); // no format needed
}

// ######### Registering validator and pure functions ########
registerFormatter(new DateTimeFormat());

// function context_is_hX5NpZd1Hx() {
//     const isDateString_YMD0 = utl.getPureFn('isDateString_YMD');
//     // TODO this should be the root arams conatining seprate info for date and time
//     const args0 = {format: 'ISO'};
//     const isTimeString_ISO_TZ0 = utl.getPureFn('isTimeString_ISO_TZ');
//     function is_dateTime0(dt) {
//         const [date, time] = dt.split('T');
//         if (!date || !time) return false;
//         // TODO: this should be args0.date and args0.time
//         return isDateString_YMD0(date, args0) && isTimeString_ISO_TZ0(time, args0);
//     }
//     function is_hX5NpZd1Hx(v) {
//         return typeof v === 'string' && is_dateTime0(v);
//     }
//     return is_hX5NpZd1Hx;
// }
