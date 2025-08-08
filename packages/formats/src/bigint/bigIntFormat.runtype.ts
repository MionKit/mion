/* eslint-disable @typescript-eslint/ban-types */
/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {BaseRunType} from '@mionkit/run-types/lib/baseRunTypes';
import type {JitCompiler, JitErrorsCompiler} from '@mionkit/run-types/lib/jitCompiler';
// TypeFormat is needed for type definitions even though it's not directly used in this file
// !Important: TypeFormat cant be imported as type for all runType functionality to work
import {TypeFormat} from '@mionkit/run-types/lib/formats.runtype';
import {registerFormatter} from '@mionkit/run-types/lib/formats';
import {BaseRunTypeFormat} from '@mionkit/run-types/lib/baseRunTypeFormat';
import {ReflectionKind} from '@deepkit/type';
import {RunTypeOptions} from '@mionkit/run-types/types';
import {random} from '@mionkit/run-types/mocking/mockUtils';
import {fpVal} from '@mionkit/run-types/lib/utils';

// ############### BigInt Format ###############

/**
 * BigIntFormat is the base class for bigint formats.
 * It is used to define the bigint format and its parameters.
 * Jit code will be generated for each one of the BigIntFormat parameters.
 */
export class BigIntRunTypeFormat extends BaseRunTypeFormat<FormatParams_BigIntValidators> {
    static readonly id = 'bigintFormat' as const;
    readonly kind = ReflectionKind.bigint;
    readonly name = BigIntRunTypeFormat.id;

    _compileIsType(comp: JitCompiler, rt: BaseRunType): string {
        const params = this.getParams(rt);
        const v = comp.vλl;

        // Create an array to hold all conditions
        const conditions: string[] = [];

        // Check range constraints
        if (params.max !== undefined) {
            const maxVal = fpVal(params.max);
            conditions.push(`${v} <= ${maxVal}n`);
        }
        if (params.min !== undefined) {
            const minVal = fpVal(params.min);
            conditions.push(`${v} >= ${minVal}n`);
        }
        if (params.lt !== undefined) {
            const ltVal = fpVal(params.lt);
            conditions.push(`${v} < ${ltVal}n`);
        }
        if (params.gt !== undefined) {
            const gtVal = fpVal(params.gt);
            conditions.push(`${v} > ${gtVal}n`);
        }

        // Check multipleOf constraint
        if (params.multipleOf !== undefined) {
            const multipleOfVal = fpVal(params.multipleOf);
            conditions.push(`(${v} % ${multipleOfVal}n === 0n)`);
        }

        // Join all conditions with AND operator
        return conditions.length ? conditions.join(' && ') : 'true';
    }

    _compileTypeErrors(comp: JitErrorsCompiler, rt: BaseRunType): string {
        const params = this.getParams(rt);
        const v = comp.vλl;
        const errFn = this.getCallJitFormatErr(comp, rt, this, true); // Use shouldReturn = true for early returns

        // Create an array to hold all error conditions
        const conditions: string[] = [];

        // Check range constraints
        if (params.max !== undefined) {
            const maxVal = fpVal(params.max);
            conditions.push(`if (${v} > ${maxVal}n) ${errFn('max', maxVal)}`);
        }
        if (params.min !== undefined) {
            const minVal = fpVal(params.min);
            conditions.push(`if (${v} < ${minVal}n) ${errFn('min', minVal)}`);
        }
        if (params.lt !== undefined) {
            const ltVal = fpVal(params.lt);
            conditions.push(`if (${v} >= ${ltVal}n) ${errFn('lt', ltVal)}`);
        }
        if (params.gt !== undefined) {
            const gtVal = fpVal(params.gt);
            conditions.push(`if (${v} <= ${gtVal}n) ${errFn('gt', gtVal)}`);
        }

        // Check multipleOf constraint
        if (params.multipleOf !== undefined) {
            const multipleOfVal = fpVal(params.multipleOf);
            conditions.push(`if ((${v} % ${multipleOfVal}n !== 0n)) ${errFn('multipleOf', multipleOfVal)}`);
        }

        // Join all error conditions with newlines
        return conditions.join(';');
    }

    // No format transformation needed for bigints
    _compileFormat(): string | undefined {
        // No transformation needed for bigints
        return undefined;
    }

    _mock(opts: RunTypeOptions, rt: BaseRunType): bigint {
        const params = this.getParams(rt);
        let min = params.min !== undefined ? (fpVal(params.min) as bigint) : -99999n;
        let max = params.max !== undefined ? (fpVal(params.max) as bigint) : 99999n;

        // Adjust for exclusive bounds
        if (params.gt !== undefined) {
            const gtVal = fpVal(params.gt) as bigint;
            min = gtVal + 1n;
        }
        if (params.lt !== undefined) {
            const ltVal = fpVal(params.lt) as bigint;
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
            const multipleOfVal = fpVal(params.multipleOf) as bigint;
            // Find the largest multiple of multipleOfVal that is <= result
            const factor = result / multipleOfVal;
            result = factor * multipleOfVal;
        }

        return result;
    }

    validateParams(rt: BaseRunType, params: FormatParams_BigIntValidators): void {
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
        if (params.min && params.max && fpVal(params.min) > fpVal(params.max)) {
            throw new Error(`min cannot be greater than max in ${this.printPath(rt)}`);
        }

        if (params.gt && params.lt && fpVal(params.gt) >= fpVal(params.lt)) {
            throw new Error(`gt cannot be greater than or equal to lt in ${this.printPath(rt)}`);
        }

        // Check for multipleOf > 0
        if (params.multipleOf !== undefined) {
            const multipleOfVal = fpVal(params.multipleOf);

            if (multipleOfVal <= 0) {
                throw new Error(`multipleOf must be greater than 0 in ${this.printPath(rt)}`);
            }
        }
    }
}

// ############### Register runtypes ###############

export const BIGINT_RUN_TYPE_FORMATTER = registerFormatter(new BigIntRunTypeFormat());

// ############### BigInt Format Params ###############

type BigIntMax =
    | {max?: bigint | {val: bigint; errorMessage: string; desc?: string}; gt?: never}
    | {max?: never; gt?: bigint | {val: bigint; errorMessage: string; desc?: string}};
type BigIntMin =
    | {min?: bigint | {val: bigint; errorMessage: string; desc?: string}; lt?: never}
    | {min?: never; lt?: bigint | {val: bigint; errorMessage: string; desc?: string}};

// Define the type for bigint format parameters
export type FormatParams_BigIntValidators = BigIntMax &
    BigIntMin & {
        multipleOf?: bigint | {val: bigint; errorMessage: string; desc?: string};
    };

// Define the type for bigint format
export type BigNumFormat<P extends Partial<FormatParams_BigIntValidators> = {}> = TypeFormat<
    bigint,
    typeof BigIntRunTypeFormat.id,
    P
>;
