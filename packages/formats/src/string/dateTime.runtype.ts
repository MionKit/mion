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

type DateTimeDeps = {
    isDateFn: GenericPureFunction<DateStringParams>;
    isTimeFn: GenericPureFunction<TimeStringParams>;
};

/** @reflection never */
function isDateTime() {
    return function is_date_time(dt: string, p: StringDateTimeParams, deps: DateTimeDeps): boolean {
        const parts = dt.split(p.splitChar);
        if (parts.length !== 2) return false;
        return deps.isDateFn(parts[0], p.date, deps) && deps.isTimeFn(parts[1], p.time, deps);
    } as GenericPureFunction<StringDateTimeParams>;
}

/** @reflection never */
export function dateTimeErrors(utl: JITUtils) {
    return function date_time_errors(
        dt: any,
        err: RunTypeError[],
        stPath: StrNumber[],
        path: StrNumber[],
        exp: string,
        p: StringDateTimeParams,
        fName: string,
        fPath: StrNumber[],
        deps: DateTimeDeps
    ): RunTypeError[] {
        const index = dt.indexOf(p.splitChar);
        if (index === -1) {
            utl.formatErr(err, stPath, path, exp, fName, 'splitChar', p.splitChar, fPath);
            return err;
        }
        const datePart = dt.substring(0, index);
        const timePart = dt.substring(index + p.splitChar.length);
        if (!deps.isDateFn(datePart, p.date, deps))
            utl.formatErr(err, stPath, path, exp, fName, 'format', p.date.format, [...fPath, 'date']);
        if (!deps.isTimeFn(timePart, p.time, deps))
            utl.formatErr(err, stPath, path, exp, fName, 'format', p.time.format, [...fPath, 'time']);
        return err;
    } as ErrorsPureFunction<StringDateTimeParams>;
}

// ######### Registering validator and pure functions ########
registerPureFnClosure(isDateTime, [...dateFunctions, ...timeFunctions]);
registerPureFnClosure(dateTimeErrors, [...dateFunctions, ...timeFunctions]);
registerFormatter(new DateTimeFormat());
