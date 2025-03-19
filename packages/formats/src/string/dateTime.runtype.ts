/* eslint-disable @typescript-eslint/ban-types */

/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {BaseRunType} from '@mionkit/runtype/src/lib/baseRunTypes';
import type {JitCompiler, JitErrorsCompiler} from '@mionkit/runtype/src/lib/jitCompiler';
import {JitRunTypeFormatter} from '@mionkit/runtype/src/lib/baseFormatter';
import {ReflectionKind} from '@deepkit/type';
import {TypeFormat} from '@mionkit/runtype/src/lib/formats.runtype'; // !Important: TypeFormat cant be imported as type for all runType functionality to work
import {
    ErrorsPureFunctionWithDeps,
    GenericPureFunction,
    GenericPureFunctionWithDeps,
    MockOperation,
    TypeFormatError,
} from '@mionkit/runtype/src/types';
import {dateFunctions, DateStringParams, dateStringValidator, DefaultDateParams} from './date.runtype';
import {DefaultTimeParams, timeFunctions, TimeStringParams, timeStringValidator} from './time.runtype';
import {
    compileErrorsPureFunctionCall,
    compilePureFunctionCall,
    registerFormatter,
    registerPureFnClosure,
} from '@mionkit/runtype/src/lib/formats';
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
        return compilePureFunctionCall(comp, rt, this, isDateTime, params, dependencies).callCode;
    }
    _compileTypeErrors(comp: JitErrorsCompiler, rt: BaseRunType): string {
        const params = this.getParams(rt);
        const dependencies = this.getIsDateTimeDependencies(params);
        return compileErrorsPureFunctionCall(comp, rt, this, dateTimeErrors, params, dependencies).callCode;
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
        return deps.isDateFn(parts[0], p.date) && deps.isTimeFn(parts[1], p.time);
    } as GenericPureFunctionWithDeps<StringDateTimeParams>;
}

/** @reflection never */
export function dateTimeErrors() {
    return function date_time_errors(
        dt: string,
        p: StringDateTimeParams,
        fPath: (string | number)[],
        errs: TypeFormatError[] = [],
        name: string = 'dateTime',
        deps: DateTimeDeps
    ): TypeFormatError[] {
        const parts = dt.split(p.splitChar);
        if (parts.length === 2) {
            if (!deps.isDateFn(parts[0], p.date)) errs.push({name, formatPath: [...fPath, 'date', 'format'], val: p.date.format});
            if (!deps.isTimeFn(parts[1], p.time)) errs.push({name, formatPath: [...fPath, 'time', 'format'], val: p.time.format});
        } else {
            errs.push({name, formatPath: [...fPath, 'date', 'format'], val: p.date.format});
            errs.push({name, formatPath: [...fPath, 'time', 'format'], val: p.time.format});
        }
        return errs;
    } as ErrorsPureFunctionWithDeps<StringDateTimeParams>;
}

// ######### Registering validator and pure functions ########
registerPureFnClosure(isDateTime, [...dateFunctions, ...timeFunctions]);
registerPureFnClosure(dateTimeErrors, [...dateFunctions, ...timeFunctions]);
registerFormatter(new DateTimeFormat());
