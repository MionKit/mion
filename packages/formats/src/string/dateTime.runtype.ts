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
    type FormatParam,
    type RunTypeError,
    type StrNumber,
} from '@mionkit/runtype/src/types';
import type {BaseRunType} from '@mionkit/runtype/src/lib/baseRunTypes';
import type {JitCompiler, JitErrorsCompiler} from '@mionkit/runtype/src/lib/jitCompiler';
import type {JITUtils} from '@mionkit/runtype/src/lib/jitUtils';
import {BaseRunTypeFormat} from '@mionkit/runtype/src/lib/baseRunTypeFormat';
import {ReflectionKind} from '@deepkit/type';
import {dateFunctions, FormatParams_Date, DATE_RUN_TYPE_FORMATTER, DEFAULT_DATE_PARAMS} from './date.runtype';
import {DEFAULT_TIME_FORMAT_PARAMS, timeFunctions, FormatParams_Time, TIME_RUN_TYPE_FORMATTER} from './time.runtype';
import {registerFormatter, registerPureFnClosure} from '@mionkit/runtype/src/lib/formats';
import {fpVal, toLiteral} from '@mionkit/runtype/src/lib/utils';

// DateTime validator
export class DateTimeRunTypeFormat extends BaseRunTypeFormat<FormatParams_DateTime> {
    static id = 'dateTime' as const;
    kind = ReflectionKind.string;
    name = DateTimeRunTypeFormat.id;
    getIsDateTimeDependencies(params: FormatParams_DateTime) {
        const isDateFn = DATE_RUN_TYPE_FORMATTER.getFormatPureFn(fpVal(params.date.format));
        const isTimeFn = TIME_RUN_TYPE_FORMATTER.getFormatPureFn(fpVal(params.time.format));
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
        const mockedDate = DATE_RUN_TYPE_FORMATTER.mock(mockContext, rt, params.date);
        const mockTimeString = TIME_RUN_TYPE_FORMATTER.mock(mockContext, rt, params.time);
        return `${mockedDate}${params.splitChar}${mockTimeString}`;
    }
}

// ######### Pure functions ########

export type DateTimeDeps = {
    isDateFn: GenericPureFunction<FormatParams_Date>;
    isTimeFn: GenericPureFunction<FormatParams_Time>;
};

/** @reflection never */
function isDateTime() {
    return function is_date_time(dt: string, p: FormatParams_DateTime, deps: DateTimeDeps): boolean {
        const index = dt.indexOf(fpVal(p.splitChar));
        if (index === -1) return false;
        const datePart = dt.substring(0, index);
        const timePart = dt.substring(index + fpVal(p.splitChar).length);
        return deps.isDateFn(datePart, p.date, deps) && deps.isTimeFn(timePart, p.time, deps);
    } as GenericPureFunction<FormatParams_DateTime>;
}

/** @reflection never */
export function dateTimeErrors(utl: JITUtils) {
    return function date_time_errors(
        val: string,
        path: StrNumber[],
        ers: RunTypeError[],
        exp: string,
        fmtName: string,
        p: FormatParams_DateTime,
        fmtPath: StrNumber[],
        deps: DateTimeDeps,
        accessPath?: StrNumber[]
    ): RunTypeError[] {
        const index = val.indexOf(fpVal(p.splitChar));
        if (index === -1)
            return utl.formatErr(path, ers, exp, fmtName, 'splitChar', fpVal(p.splitChar), fmtPath, accessPath), ers;
        const datePart = val.substring(0, index);
        const timePart = val.substring(index + fpVal(p.splitChar).length);
        if (!deps.isDateFn(datePart, p.date, deps))
            utl.formatErr(path, ers, exp, fmtName, 'format', fpVal(p.date.format), [...fmtPath, 'date'], accessPath);
        if (!deps.isTimeFn(timePart, p.time, deps))
            utl.formatErr(path, ers, exp, fmtName, 'format', fpVal(p.time.format), [...fmtPath, 'time'], accessPath);
        return ers;
    } as ErrorsPureFunction<FormatParams_DateTime>;
}

// ######### Registering validator and pure functions ########

registerPureFnClosure(isDateTime, [...dateFunctions, ...timeFunctions]);
registerPureFnClosure(dateTimeErrors, [...dateFunctions, ...timeFunctions]);

export const DATE_TIME_RUN_TYPE_FORMATTER = registerFormatter(new DateTimeRunTypeFormat());

// ############### Run Types ###############

export type DEFAULT_DATE_TIME_PARAMS = {
    date: DEFAULT_DATE_PARAMS;
    time: DEFAULT_TIME_FORMAT_PARAMS;
    splitChar: 'T';
};

export type FormatParams_DateTime = {
    date: FormatParams_Date;
    time: FormatParams_Time;
    splitChar: FormatParam<string>;
};

export type DateTimeFormat<P extends Partial<FormatParams_DateTime> = {}> = TypeFormat<
    string,
    typeof DateTimeRunTypeFormat.id,
    DEFAULT_DATE_TIME_PARAMS & P
>;
