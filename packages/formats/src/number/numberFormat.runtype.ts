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

// ############### Number Format ###############

/**
 * NumberFormat is the base class for number formats.
 * It is used to define the number format and its parameters.
 * Jit code will be generated for each one of the NumberFormat parameters.
 */
export class NumberRunTypeFormat extends BaseRunTypeFormat<NumberValidators> {
    static readonly id = 'numberFormat' as const;
    readonly kind = ReflectionKind.number;
    readonly name = NumberRunTypeFormat.id;

    _compileIsType(comp: JitCompiler, rt: BaseRunType): string {
        const params = this.getParams(rt);
        const v = comp.vλl;

        // Create an array to hold all conditions
        const conditions: string[] = [];

        // Check integer/float constraints
        if (params.integer) {
            conditions.push(`Number.isInteger(${v})`);
        } else if (params.float) {
            conditions.push(`!Number.isInteger(${v})`);
        }

        // Check range constraints
        if (params.max !== undefined) {
            const maxVal = fpVal(params.max);
            conditions.push(`${v} <= ${maxVal}`);
        }
        if (params.min !== undefined) {
            const minVal = fpVal(params.min);
            conditions.push(`${v} >= ${minVal}`);
        }
        if (params.lt !== undefined) {
            const ltVal = fpVal(params.lt);
            conditions.push(`${v} < ${ltVal}`);
        }
        if (params.gt !== undefined) {
            const gtVal = fpVal(params.gt);
            conditions.push(`${v} > ${gtVal}`);
        }

        // Check multipleOf constraint
        if (params.multipleOf !== undefined) {
            const multipleOfVal = fpVal(params.multipleOf);
            conditions.push(`(${v} % ${multipleOfVal} === 0)`);
        }

        // Join all conditions with AND operator
        return conditions.join(' && ');
    }

    _compileTypeErrors(comp: JitErrorsCompiler, rt: BaseRunType): string {
        const params = this.getParams(rt);
        const v = comp.vλl;
        const errFn = this.getCallJitFormatErr(comp, rt, this, true);

        // Create an array to hold all error conditions
        const conditions: string[] = [];

        // Check integer/float constraints
        if (params.integer) {
            conditions.push(`if (!Number.isInteger(${v})) ${errFn('integer', true)}`);
        } else if (params.float) {
            conditions.push(`if (Number.isInteger(${v})) ${errFn('float', true)}`);
        }

        // Check range constraints
        if (params.max !== undefined) {
            const maxVal = fpVal(params.max);
            conditions.push(`if (${v} > ${maxVal}) ${errFn('max', maxVal)}`);
        }
        if (params.min !== undefined) {
            const minVal = fpVal(params.min);
            conditions.push(`if (${v} < ${minVal}) ${errFn('min', minVal)}`);
        }
        if (params.lt !== undefined) {
            const ltVal = fpVal(params.lt);
            conditions.push(`if (${v} >= ${ltVal}) ${errFn('lt', ltVal)}`);
        }
        if (params.gt !== undefined) {
            const gtVal = fpVal(params.gt);
            conditions.push(`if (${v} <= ${gtVal}) ${errFn('gt', gtVal)}`);
        }

        // Check multipleOf constraint
        if (params.multipleOf !== undefined) {
            const multipleOfVal = fpVal(params.multipleOf);
            conditions.push(`if ((${v} % ${multipleOfVal} !== 0)) ${errFn('multipleOf', multipleOfVal)}`);
        }

        // Join all error conditions with newlines
        return conditions.join(';');
    }

    // No format transformation needed for numbers
    _compileFormat(): string | undefined {
        // No transformation needed for numbers
        return undefined;
    }

    _mock(opts: RunTypeOptions, rt: BaseRunType): number {
        const params = this.getParams(rt);
        let min = params.min !== undefined ? fpVal(params.min) : -99999;
        let max = params.max !== undefined ? fpVal(params.max) : 99999;

        // Adjust for exclusive bounds
        if (params.gt !== undefined) {
            const epsilon = params.float ? 0.01 : 1;
            const gtVal = fpVal(params.gt);
            min = Math.max(min, gtVal + epsilon);
        }
        if (params.lt !== undefined) {
            const epsilon = params.float ? 0.01 : 1;
            const ltVal = fpVal(params.lt);
            max = Math.min(max, ltVal - epsilon);
        }

        // Generate a random number within the range
        let result: number;

        if (params.integer) {
            // For integers, ensure we get whole numbers
            min = Math.ceil(min);
            max = Math.floor(max);
            result = random(min, max);
        } else {
            // For floats, generate a random decimal
            result = min + Math.random() * (max - min);
        }

        // Handle multipleOf constraint
        if (params.multipleOf !== undefined) {
            const multipleOfVal = fpVal(params.multipleOf);
            // Find the largest multiple of multipleOfVal that is <= result
            const factor = Math.floor(result / multipleOfVal);
            result = factor * multipleOfVal;
        }

        return result;
    }

    validateParams(rt: BaseRunType, params: NumberValidators): void {
        // Check for conflicting parameters
        if (params.integer && params.float) {
            throw new Error(`Cannot specify both integer and float in ${this.printPath(rt)}`);
        }

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

            // Check consistency with integer/float parameters
            if (params.integer && !Number.isInteger(multipleOfVal)) {
                throw new Error(`When integer is true, multipleOf must be an integer in ${this.printPath(rt)}`);
            }

            if (params.float && Number.isInteger(multipleOfVal)) {
                throw new Error(`When float is true, multipleOf must be a float in ${this.printPath(rt)}`);
            }
        }
    }
}

// ############### Register runtypes ###############

export const NUMBER_RUN_TYPE_FORMATTER = registerFormatter(new NumberRunTypeFormat());

// ############### Number Format Params ###############

type NumberMax =
    | {max?: number | {val: number; errorMessage: string; desc?: string}; gt?: never}
    | {max?: never; gt?: number | {val: number; errorMessage: string; desc?: string}};
type NumberMin =
    | {min?: number | {val: number; errorMessage: string; desc?: string}; lt?: never}
    | {min?: never; lt?: number | {val: number; errorMessage: string; desc?: string}};
type NumberType =
    | {integer?: boolean | {val: boolean; errorMessage: string; desc?: string}; float?: never}
    | {integer?: never; float?: boolean | {val: boolean; errorMessage: string; desc?: string}};

// Define the type for number format parameters
export type NumberValidators = NumberMax &
    NumberMin &
    NumberType & {
        multipleOf?: number | {val: number; errorMessage: string; desc?: string};
    };

// Define the type for number format
export type NumFormat<P extends Partial<NumberValidators>> = TypeFormat<number, typeof NumberRunTypeFormat.id, P>;
