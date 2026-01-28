/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {BaseRunType, JitFnCompiler, JitErrorsFnCompiler, JitCode} from '@mionkit/run-types';
// TypeFormat is needed for type definitions even though it's not directly used in this file
// !Important: TypeFormat cant be imported as type for all runType functionality to work
import {TypeFormat, registerFormatter, BaseRunTypeFormat, RunTypeOptions, random} from '@mionkit/run-types';
import {ReflectionKind} from '@deepkit/type';
import {paramVal} from '../utils';
import {FormatParams_BigInt} from '@mionkit/core';

// ############### BigInt Format ###############

/**
 * BigIntFormat is the base class for bigint formats.
 * It is used to define the bigint format and its parameters.
 * Jit code will be generated for each one of the BigIntFormat parameters.
 */
export class BigIntRunTypeFormat extends BaseRunTypeFormat<FormatParams_BigInt> {
    static readonly id = 'bigintFormat' as const;
    readonly kind = ReflectionKind.bigint;
    readonly name = BigIntRunTypeFormat.id;

    emitIsType(comp: JitFnCompiler, rt: BaseRunType): JitCode {
        const params = this.getParams(rt);
        const v = comp.vλl;

        // Create an array to hold all conditions
        const conditions: string[] = [];

        // Check range constraints
        if (params.max !== undefined) {
            const maxVal = paramVal(params.max);
            conditions.push(`${v} <= ${maxVal}n`);
        }
        if (params.min !== undefined) {
            const minVal = paramVal(params.min);
            conditions.push(`${v} >= ${minVal}n`);
        }
        if (params.lt !== undefined) {
            const ltVal = paramVal(params.lt);
            conditions.push(`${v} < ${ltVal}n`);
        }
        if (params.gt !== undefined) {
            const gtVal = paramVal(params.gt);
            conditions.push(`${v} > ${gtVal}n`);
        }

        // Check multipleOf constraint
        if (params.multipleOf !== undefined) {
            const multipleOfVal = paramVal(params.multipleOf);
            conditions.push(`(${v} % ${multipleOfVal}n === 0n)`);
        }

        // Join all conditions with AND operator
        return {code: conditions.length ? conditions.join(' && ') : 'true', type: 'E'};
    }

    emitIsTypeErrors(comp: JitErrorsFnCompiler, rt: BaseRunType): JitCode {
        const params = this.getParams(rt);
        const v = comp.vλl;
        const errFn = this.getCallJitFormatErr(comp, rt, this, false);

        // Create an array to hold all error conditions
        const conditions: string[] = [];

        // Check range constraints
        if (params.max !== undefined) {
            const maxVal = paramVal(params.max);
            conditions.push(`if (${v} > ${maxVal}n) ${errFn('max', maxVal)}`);
        }
        if (params.min !== undefined) {
            const minVal = paramVal(params.min);
            conditions.push(`if (${v} < ${minVal}n) ${errFn('min', minVal)}`);
        }
        if (params.lt !== undefined) {
            const ltVal = paramVal(params.lt);
            conditions.push(`if (${v} >= ${ltVal}n) ${errFn('lt', ltVal)}`);
        }
        if (params.gt !== undefined) {
            const gtVal = paramVal(params.gt);
            conditions.push(`if (${v} <= ${gtVal}n) ${errFn('gt', gtVal)}`);
        }

        // Check multipleOf constraint
        if (params.multipleOf !== undefined) {
            const multipleOfVal = paramVal(params.multipleOf);
            conditions.push(`if ((${v} % ${multipleOfVal}n !== 0n)) ${errFn('multipleOf', multipleOfVal)}`);
        }

        // Join all error conditions with newlines
        return {code: conditions.join(';'), type: 'S'};
    }

    // No format transformation needed for bigints
    emitFormat(): JitCode {
        // No transformation needed for bigints
        return {code: undefined, type: 'S'};
    }

    _mock(opts: RunTypeOptions, rt: BaseRunType): bigint {
        const params = this.getParams(rt);
        let min = params.min !== undefined ? (paramVal(params.min) as bigint) : -99999n;
        let max = params.max !== undefined ? (paramVal(params.max) as bigint) : 99999n;

        // Adjust for exclusive bounds
        if (params.gt !== undefined) {
            const gtVal = paramVal(params.gt) as bigint;
            min = gtVal + 1n;
        }
        if (params.lt !== undefined) {
            const ltVal = paramVal(params.lt) as bigint;
            max = ltVal - 1n;
        }

        // Generate a random bigint within the range
        // Convert to numbers for random function, then back to bigint
        // This limits the range to safe integers, but is a reasonable approach for most use cases
        const minNum = Number(min > BigInt(Number.MIN_SAFE_INTEGER) ? min : BigInt(Number.MIN_SAFE_INTEGER));
        const maxNum = Number(max < BigInt(Number.MAX_SAFE_INTEGER) ? max : BigInt(Number.MAX_SAFE_INTEGER));

        let result = BigInt(random(minNum, maxNum));

        // Handle multipleOf constraint
        if (params.multipleOf !== undefined) {
            const multipleOfVal = paramVal(params.multipleOf) as bigint;
            // Find the largest multiple of multipleOfVal that is <= result
            const factor = result / multipleOfVal;
            result = factor * multipleOfVal;
        }

        return result;
    }

    validateParams(rt: BaseRunType, params: FormatParams_BigInt): void {
        // Check for mutually exclusive lower bound parameters
        const lowerBoundCount = [params.min, params.gt].filter(Boolean).length;
        if (lowerBoundCount > 1) {
            throw new Error(`Cannot specify more than one of min or gt in ${this.printPath(rt)}`);
        }

        // Check for mutually exclusive upper bound parameters
        const upperBoundCount = [params.max, params.lt].filter(Boolean).length;
        if (upperBoundCount > 1) {
            throw new Error(`Cannot specify more than one of max or lt in ${this.printPath(rt)}`);
        }

        // Check for valid ranges
        if (params.min && params.max && paramVal(params.min) > paramVal(params.max)) {
            throw new Error(`min cannot be greater than max in ${this.printPath(rt)}`);
        }

        if (params.gt && params.lt && paramVal(params.gt) >= paramVal(params.lt)) {
            throw new Error(`gt cannot be greater than or equal to lt in ${this.printPath(rt)}`);
        }

        // Check for multipleOf > 0
        if (params.multipleOf !== undefined) {
            const multipleOfVal = paramVal(params.multipleOf);

            if (multipleOfVal <= 0) {
                throw new Error(`multipleOf must be greater than 0 in ${this.printPath(rt)}`);
            }
        }
    }
}

// ############### Register runtypes ###############

export const BIGINT_RUN_TYPE_FORMATTER = registerFormatter(new BigIntRunTypeFormat());

// Define the type for bigint format (optional branding, unbranded by default like StrFormat)
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type BigNumFormat<P extends Partial<FormatParams_BigInt> = {}, BrandName extends string = never> = TypeFormat<
    bigint,
    typeof BigIntRunTypeFormat.id,
    P,
    BrandName
>;
