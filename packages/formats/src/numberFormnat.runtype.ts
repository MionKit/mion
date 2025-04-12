/* eslint-disable @typescript-eslint/ban-types */
/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {BaseRunType} from '@mionkit/runtype/src/lib/baseRunTypes';
import type {JitCompiler, JitErrorsCompiler} from '@mionkit/runtype/src/lib/jitCompiler';
// TypeFormat is needed for type definitions even though it's not directly used in this file
// !Important: TypeFormat cant be imported as type for all runType functionality to work
import {TypeFormat} from '@mionkit/runtype/src/lib/formats.runtype';
import {registerFormatter} from '@mionkit/runtype/src/lib/formats';
import {BaseRunTypeFormat} from '@mionkit/runtype/src/lib/baseRunTypeFormat';
import {ReflectionKind} from '@deepkit/type';
import {MockOperation} from '@mionkit/runtype/src/types';
import {random} from '@mionkit/runtype/src/lib/mock';
import {fpVal} from '@mionkit/runtype/src/lib/utils';

// ############### Number Format ###############

/**
 * NumberFormat is the base class for number formats.
 * It is used to define the number format and its parameters.
 * Jit code will be generated for each one of the NumberFormat parameters.
 */
export class NumberRunTypeFormat extends BaseRunTypeFormat<FormatParams_NumberValidators> {
    static readonly id = 'numberFormat' as const;
    readonly kind = ReflectionKind.number;
    readonly name = NumberRunTypeFormat.id;

    _compileIsType(comp: JitCompiler, rt: BaseRunType): string {
        const params = this.getParams(rt);
        const v = comp.vλl;

        let code = '';

        // Check integer/float constraints
        if (params.integer) {
            code += ` && Number.isInteger(${v})`;
        } else if (params.float) {
            code += ` && !Number.isInteger(${v})`;
        }

        // Check range constraints
        if (params.max) {
            const maxVal = fpVal(params.max);
            code += ` && ${v} <= ${maxVal}`;
        }
        if (params.min) {
            const minVal = fpVal(params.min);
            code += ` && ${v} >= ${minVal}`;
        }
        if (params.lt) {
            const ltVal = fpVal(params.lt);
            code += ` && ${v} < ${ltVal}`;
        }
        if (params.gt) {
            const gtVal = fpVal(params.gt);
            code += ` && ${v} > ${gtVal}`;
        }
        if (params.lte) {
            const lteVal = fpVal(params.lte);
            code += ` && ${v} <= ${lteVal}`;
        }
        if (params.gte) {
            const gteVal = fpVal(params.gte);
            code += ` && ${v} >= ${gteVal}`;
        }

        // Check multipleOf constraint
        if (params.multipleOf) {
            const multipleOfVal = fpVal(params.multipleOf);
            code += ` && (${v} % ${multipleOfVal} === 0)`;
        }

        return code;
    }

    _compileTypeErrors(comp: JitErrorsCompiler, rt: BaseRunType): string {
        const params = this.getParams(rt);
        const v = comp.vλl;
        const errFn = this.getCallJitFormatErr(comp, rt, this);

        // Start with basic number check
        let code = `if (!Number.isFinite(${v})) ${comp.callJitErr(rt)}`;

        // Check integer/float constraints
        if (params.integer) {
            code += `\nif (Number.isFinite(${v}) && !Number.isInteger(${v})) ${errFn('integer', 'true')}`;
        } else if (params.float) {
            code += `\nif (Number.isFinite(${v}) && Number.isInteger(${v})) ${errFn('float', 'true')}`;
        }

        // Check range constraints
        if (params.max) {
            const maxVal = fpVal(params.max);
            code += `\nif (Number.isFinite(${v}) && ${v} > ${maxVal}) ${errFn('max', maxVal.toString())}`;
        }
        if (params.min) {
            const minVal = fpVal(params.min);
            code += `\nif (Number.isFinite(${v}) && ${v} < ${minVal}) ${errFn('min', minVal.toString())}`;
        }
        if (params.lt) {
            const ltVal = fpVal(params.lt);
            code += `\nif (Number.isFinite(${v}) && ${v} >= ${ltVal}) ${errFn('lt', ltVal.toString())}`;
        }
        if (params.gt) {
            const gtVal = fpVal(params.gt);
            code += `\nif (Number.isFinite(${v}) && ${v} <= ${gtVal}) ${errFn('gt', gtVal.toString())}`;
        }
        if (params.lte) {
            const lteVal = fpVal(params.lte);
            code += `\nif (Number.isFinite(${v}) && ${v} > ${lteVal}) ${errFn('lte', lteVal.toString())}`;
        }
        if (params.gte) {
            const gteVal = fpVal(params.gte);
            code += `\nif (Number.isFinite(${v}) && ${v} < ${gteVal}) ${errFn('gte', gteVal.toString())}`;
        }

        // Check multipleOf constraint
        if (params.multipleOf) {
            const multipleOfVal = fpVal(params.multipleOf);
            code += `\nif (Number.isFinite(${v}) && (${v} % ${multipleOfVal} !== 0)) ${errFn('multipleOf', multipleOfVal.toString())}`;
        }

        return code;
    }

    // No format transformation needed for numbers
    _compileFormat(): string | undefined {
        // No transformation needed for numbers
        return undefined;
    }

    _mock(_mockContext: MockOperation, rt: BaseRunType): number {
        const params = this.getParams(rt);
        let min = params.min ? fpVal(params.min) : params.gte ? fpVal(params.gte) : -1000;
        let max = params.max ? fpVal(params.max) : params.lte ? fpVal(params.lte) : 1000;

        // Adjust for exclusive bounds
        if (params.gt) {
            const gtVal = fpVal(params.gt);
            min = Math.max(min, gtVal + 0.000001);
        }
        if (params.lt) {
            const ltVal = fpVal(params.lt);
            max = Math.min(max, ltVal - 0.000001);
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
        if (params.multipleOf) {
            const multipleOfVal = fpVal(params.multipleOf);
            // Find the largest multiple of multipleOfVal that is <= result
            const factor = Math.floor(result / multipleOfVal);
            result = factor * multipleOfVal;
        }

        return result;
    }

    validateParams(rt: BaseRunType, params: FormatParams_NumberValidators): void {
        // Check for conflicting parameters
        if (params.integer && params.float) {
            throw new Error(`Cannot specify both integer and float in ${this.printPath(rt)}`);
        }

        // Check for valid ranges
        if (params.min && params.max && fpVal(params.min) > fpVal(params.max)) {
            throw new Error(`min cannot be greater than max in ${this.printPath(rt)}`);
        }

        if (params.gt && params.lt && fpVal(params.gt) >= fpVal(params.lt)) {
            throw new Error(`gt cannot be greater than or equal to lt in ${this.printPath(rt)}`);
        }

        if (params.gte && params.lte && fpVal(params.gte) > fpVal(params.lte)) {
            throw new Error(`gte cannot be greater than lte in ${this.printPath(rt)}`);
        }

        // Check for multipleOf > 0
        if (params.multipleOf && fpVal(params.multipleOf) <= 0) {
            throw new Error(`multipleOf must be greater than 0 in ${this.printPath(rt)}`);
        }
    }
}

// ############### Register runtypes ###############

export const NUMBER_RUN_TYPE_FORMATTER = registerFormatter(new NumberRunTypeFormat());

// ############### Number Format Params ###############

// Define the type for number format
export type NumberFormat<P extends Partial<FormatParams_NumberValidators> = {}> = TypeFormat<
    number,
    typeof NumberRunTypeFormat.id,
    P
>;

// Define the type for number format parameters
export type FormatParams_NumberValidators = {
    // validators
    max?: number | {val: number; reason: string; desc?: string};
    min?: number | {val: number; reason: string; desc?: string};
    lt?: number | {val: number; reason: string; desc?: string};
    gt?: number | {val: number; reason: string; desc?: string};
    lte?: number | {val: number; reason: string; desc?: string};
    gte?: number | {val: number; reason: string; desc?: string};
    multipleOf?: number | {val: number; reason: string; desc?: string};
    integer?: boolean | {val: boolean; reason: string; desc?: string};
    float?: boolean | {val: boolean; reason: string; desc?: string};
};
