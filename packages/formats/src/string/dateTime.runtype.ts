/* eslint-disable @typescript-eslint/ban-types */

/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
// !Important: TypeFormat cant be imported as type for the runType functionality to work
import {TypeFormat} from '@mionkit/runtype/src/lib/formats.runtype';
import {
    GenericPureFunction,
    MockOperation,
    type ErrorsPureFunction,
    type RunTypeError,
    type StrNumber,
} from '@mionkit/runtype/src/types';
import type {BaseRunType} from '@mionkit/runtype/src/lib/baseRunTypes';
import type {JitCompiler, JitErrorsCompiler} from '@mionkit/runtype/src/lib/jitCompiler';
import type {JITUtils} from '@mionkit/runtype/src/lib/jitUtils';
import {JitRunTypeFormatter} from '@mionkit/runtype/src/lib/baseFormatter';
import {ReflectionKind} from '@deepkit/type';
import {dateFunctions, DateStringParams, dateStringValidator, DefaultDateParams} from './date.runtype';
import {DefaultTimeParams, timeFunctions, TimeStringParams, timeStringValidator} from './time.runtype';
import {registerFormatter, registerPureFnClosure} from '@mionkit/runtype/src/lib/formats';
import {toLiteral} from '@mionkit/runtype/src/lib/utils';

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
    getIsDateTimeDependencies(params: StringDateTimeParams) {
        const isDateFn = dateStringValidator.getFormatPureFn(params.date.format);
        const isTimeFn = timeStringValidator.getFormatPureFn(params.time.format);
        return {
            isDateFn: `utl.getPureFn(${toLiteral(isDateFn.name)})`,
            isTimeFn: `utl.getPureFn(${toLiteral(isTimeFn.name)})`,
        };
    }
    _compileIsType(comp: JitCompiler, rt: BaseRunType): string {
        const params = this.getParams(rt);
        const dependencies = this.getIsDateTimeDependencies(params);
        return this.compilePureFunctionCall(comp, rt, isDateTime, params, dependencies).callCode;
    }
    _compileTypeErrors(comp: JitErrorsCompiler, rt: BaseRunType): string {
        const params = this.getParams(rt);
        const dependencies = this.getIsDateTimeDependencies(params);
        return this.compileErrorsPureFunctionCall(comp, rt, dateTimeErrors, params, dependencies).callCode;
    }
    _mock(mockContext: MockOperation, rt: BaseRunType) {
        const params = this.getParams(rt);
        const mockedDate = dateStringValidator.mock(mockContext, rt, params.date);
        const mockTimeString = timeStringValidator.mock(mockContext, rt, params.time);
        return `${mockedDate}${params.splitChar}${mockTimeString}`;
    }
    _compileFormat?(comp: JitCompiler, rt: BaseRunType); // no format needed
}

// ######### Pure functions ########

export type DateTimeDeps = {
    isDateFn: GenericPureFunction<DateStringParams>;
    isTimeFn: GenericPureFunction<TimeStringParams>;
};

/** @reflection never */
function isDateTime() {
    return function is_date_time(dt: string, p: StringDateTimeParams, deps: DateTimeDeps): boolean {
        const index = dt.indexOf(p.splitChar);
        if (index === -1) return false;
        const datePart = dt.substring(0, index);
        const timePart = dt.substring(index + p.splitChar.length);
        return deps.isDateFn(datePart, p.date, deps) && deps.isTimeFn(timePart, p.time, deps);
    } as GenericPureFunction<StringDateTimeParams>;
}

/** @reflection never */
export function dateTimeErrors(utl: JITUtils) {
    return function date_time_errors(
        val: string,
        path: StrNumber[],
        ers: RunTypeError[],
        exp: string,
        fmtName: string,
        p: StringDateTimeParams,
        fmtPath: StrNumber[],
        deps: DateTimeDeps,
        accessPath?: StrNumber[]
    ): RunTypeError[] {
        const index = val.indexOf(p.splitChar);
        if (index === -1) return utl.formatErr(path, ers, exp, fmtName, 'splitChar', p.splitChar, fmtPath, accessPath), ers;
        const datePart = val.substring(0, index);
        const timePart = val.substring(index + p.splitChar.length);
        if (!deps.isDateFn(datePart, p.date, deps))
            utl.formatErr(path, ers, exp, fmtName, 'format', p.date.format, [...fmtPath, 'date'], accessPath);
        if (!deps.isTimeFn(timePart, p.time, deps))
            utl.formatErr(path, ers, exp, fmtName, 'format', p.time.format, [...fmtPath, 'time'], accessPath);
        return ers;
    } as ErrorsPureFunction<StringDateTimeParams>;
}

// ######### Registering validator and pure functions ########
registerPureFnClosure(isDateTime, [...dateFunctions, ...timeFunctions]);
registerPureFnClosure(dateTimeErrors, [...dateFunctions, ...timeFunctions]);
registerFormatter(new DateTimeFormat());
