/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
// !Important: TypeFormat cant be imported as type for the runType functionality to work
import type {BaseRunType, JitFnCompiler, JitErrorsFnCompiler, JitCode} from '@mionkit/run-types';
import {TypeFormat, RunTypeOptions, BaseRunTypeFormat, registerFormatter} from '@mionkit/run-types';
import {ReflectionKind} from '@deepkit/type';
import {DEFAULT_DATE_PARAMS, DateStringRunTypeFormat} from './date.runtype';
import {FormatParams_DateTime} from '@mionkit/core';
import {DEFAULT_TIME_FORMAT_PARAMS, TimeStringRunTypeFormat} from './time.runtype';
import {stringIgnoreProps} from './stringFormat.runtype';
import {paramVal} from '../utils';

// DateTime validator
export class DateTimeRunTypeFormat extends BaseRunTypeFormat<FormatParams_DateTime> {
    static id = 'dateTime' as const;
    kind = ReflectionKind.string;
    name = DateTimeRunTypeFormat.id;
    dateFormatter: DateStringRunTypeFormat;
    timeFormatter: TimeStringRunTypeFormat;

    constructor(parentPath?: string[]) {
        super(parentPath);
        this.dateFormatter = new DateStringRunTypeFormat(this.getFormatPath('date'));
        this.timeFormatter = new TimeStringRunTypeFormat(this.getFormatPath('time'));
    }
    getIgnoredProps(): string[] | undefined {
        return stringIgnoreProps;
    }
    emitIsType(comp: JitFnCompiler, rt: BaseRunType): JitCode {
        const params = this.getParams(rt);
        const fnID = comp.fnID;
        const fmtName = this.getFormatName();
        const vλl = comp.vλl;
        const splitChar = paramVal(params.splitChar);
        const vDatePart = 'datePart' + this.getFormatNestLevel(); // Variable for date part
        const vTimePart = 'timePart' + this.getFormatNestLevel(); // Variable for time part
        const vSplitPos = 'splitPos' + this.getFormatNestLevel(); // Position of split character

        // Compile code for root, date part, and time part validation
        const dateCode = this.dateFormatter.compileFormat(fnID, comp, rt, params.date, vDatePart, fmtName);
        const timeCode = this.timeFormatter.compileFormat(fnID, comp, rt, params.time, vTimePart, fmtName);

        // If rootCode is empty, we don't need to emit jit code for it
        const returnCode = this.isRootFormat() ? `return true;` : '';

        const code = `
            const ${vSplitPos} = ${vλl}.indexOf('${splitChar}');
            if (${vSplitPos} === -1) return false;
            const ${vDatePart} = ${vλl}.substring(0, ${vSplitPos});
            const ${vTimePart} = ${vλl}.substring(${vSplitPos} + 1);
            if (!(${dateCode.code})) return false;
            if (!(${timeCode.code})) return false;
            ${returnCode}
        `;
        return {code, type: 'S'};
    }
    emitIsTypeErrors(comp: JitErrorsFnCompiler, rt: BaseRunType): JitCode {
        const params = this.getParams(rt);
        const fnID = comp.fnID;
        const fmtName = this.getFormatName();
        const splitChar = paramVal(params.splitChar);
        const errFn = this.getCallJitFormatErr(comp, rt, this, false);
        const vλl = comp.vλl;
        const vDatePart = 'datePart'; // Variable for date part
        const vTimePart = 'timePart'; // Variable for time part
        const vSplitPos = 'splitPos'; // Position of split character

        // Compile code for root, date part, and time part validation
        const dateCode = this.dateFormatter.compileFormat(fnID, comp, rt, params.date, vDatePart, fmtName);
        const timeCode = this.timeFormatter.compileFormat(fnID, comp, rt, params.time, vTimePart, fmtName);

        const code = `
            const ${vSplitPos} = ${vλl}.indexOf('${splitChar}');
            if (${vSplitPos} === -1) ${errFn('splitChar', splitChar)};
            const ${vDatePart} = ${vλl}.substring(0, ${vSplitPos});
            const ${vTimePart} = ${vλl}.substring(${vSplitPos} + 1);
            ${dateCode.code ? `${dateCode.code};` : ''}
            ${timeCode.code ? `${timeCode.code};` : ''}
        `;
        return {code, type: 'S'};
    }
    _mock(opts: RunTypeOptions, rt: BaseRunType): string {
        const params = this.getParams(rt);
        const splitChar = paramVal(params.splitChar);

        // Generate date part
        const datePart = this.dateFormatter.mock(opts, rt, params.date);

        // Generate time part
        const timePart = this.timeFormatter.mock(opts, rt, params.time);

        // Combine to form datetime
        return `${datePart}${splitChar}${timePart}`;
    }
}

// ######### Registering validator and pure functions ########
export const DATE_TIME_RUN_TYPE_FORMATTER = registerFormatter(new DateTimeRunTypeFormat());

// ############### Run Types ###############

export type DEFAULT_DATE_TIME_PARAMS = {
    date: DEFAULT_DATE_PARAMS;
    time: DEFAULT_TIME_FORMAT_PARAMS;
    splitChar: 'T';
};

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type StrDateTime<P extends Partial<FormatParams_DateTime> = {}, BrandName extends string = 'dateTime'> = TypeFormat<
    string,
    typeof DateTimeRunTypeFormat.id,
    DEFAULT_DATE_TIME_PARAMS & P,
    BrandName
>;
