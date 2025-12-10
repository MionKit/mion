/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {
    BaseRunType,
    JitFnCompiler,
    JitErrorsFnCompiler,
    JitCode,
    jitBinarySerializerArgs,
    JitFunctions,
    BaseFnCompiler,
    jitBinaryDeserializerArgs,
} from '@mionkit/run-types';
// TypeFormat is needed for type definitions even though it's not directly used in this file
// !Important: TypeFormat cant be imported as type for all runType functionality to work
import {TypeFormat, registerFormatter, BaseRunTypeFormat, RunTypeOptions, random} from '@mionkit/run-types';
import {ReflectionKind} from '@deepkit/type';
import {paramVal} from '../utils';

type BinarySerializer = BaseFnCompiler<typeof jitBinarySerializerArgs, typeof JitFunctions.toBinary.id>;
type BinaryDeserializer = BaseFnCompiler<typeof jitBinaryDeserializerArgs, typeof JitFunctions.fromBinary.id>;

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

    emitIsType(comp: JitFnCompiler, rt: BaseRunType): JitCode {
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
            const maxVal = paramVal(params.max);
            conditions.push(`${v} <= ${maxVal}`);
        }
        if (params.min !== undefined) {
            const minVal = paramVal(params.min);
            conditions.push(`${v} >= ${minVal}`);
        }
        if (params.lt !== undefined) {
            const ltVal = paramVal(params.lt);
            conditions.push(`${v} < ${ltVal}`);
        }
        if (params.gt !== undefined) {
            const gtVal = paramVal(params.gt);
            conditions.push(`${v} > ${gtVal}`);
        }

        // Check multipleOf constraint
        if (params.multipleOf !== undefined) {
            const multipleOfVal = paramVal(params.multipleOf);
            // multipleOf is enforced to be an integer in validateParams, so we can use simple modulo
            conditions.push(`(${v} % ${multipleOfVal} === 0)`);
        }

        // Join all conditions with AND operator
        return {code: conditions.join(' && '), type: 'E'};
    }

    emitIsTypeErrors(comp: JitErrorsFnCompiler, rt: BaseRunType): JitCode {
        const params = this.getParams(rt);
        const v = comp.vλl;
        const errFn = this.getCallJitFormatErr(comp, rt, this, false);

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
            const maxVal = paramVal(params.max);
            conditions.push(`if (${v} > ${maxVal}) ${errFn('max', maxVal)}`);
        }
        if (params.min !== undefined) {
            const minVal = paramVal(params.min);
            conditions.push(`if (${v} < ${minVal}) ${errFn('min', minVal)}`);
        }
        if (params.lt !== undefined) {
            const ltVal = paramVal(params.lt);
            conditions.push(`if (${v} >= ${ltVal}) ${errFn('lt', ltVal)}`);
        }
        if (params.gt !== undefined) {
            const gtVal = paramVal(params.gt);
            conditions.push(`if (${v} <= ${gtVal}) ${errFn('gt', gtVal)}`);
        }

        // Check multipleOf constraint
        if (params.multipleOf !== undefined) {
            const multipleOfVal = paramVal(params.multipleOf);
            // multipleOf is enforced to be an integer in validateParams, so we can use simple modulo
            conditions.push(`if ((${v} % ${multipleOfVal} !== 0)) ${errFn('multipleOf', multipleOfVal)}`);
        }

        // Join all error conditions with newlines
        return {code: conditions.join(';'), type: 'S'};
    }

    // No format transformation needed for numbers
    emitFormat(): JitCode {
        // No transformation needed for numbers
        return {code: undefined, type: 'S'};
    }

    emitToBinary(comp: BinarySerializer, rt: BaseRunType): JitCode {
        const type = 'S';
        const sεr = comp.args.sεr;
        const params = this.getParams(rt);
        const isFloat = params.float !== undefined ? paramVal(params.float) : false;
        const floatCode = `${sεr}.view.setFloat64(${sεr}.index,${comp.vλl}, 1, (${sεr}.index += 8))`;
        if (isFloat) return {code: floatCode, type};
        const isInt = params.integer !== undefined ? paramVal(params.integer) : false;
        if (isInt) {
            const {isUint8, isUint16, isUint32, isInt8, isInt16, isInt32} = getIntegerType(params);
            switch (true) {
                case isUint8:
                    return {code: `${sεr}.view.setUint8(${sεr}.index++, ${comp.vλl})`, type};
                case isUint16:
                    return {code: `${sεr}.view.setUint16(${sεr}.index, ${comp.vλl}, 1, ${sεr}.index += 2)`, type};
                case isUint32:
                    return {code: `${sεr}.view.setUint32(${sεr}.index, ${comp.vλl}, 1, ${sεr}.index += 4)`, type};
                case isInt8:
                    return {code: `${sεr}.view.setInt8(${sεr}.index++, ${comp.vλl})`, type};
                case isInt16:
                    return {code: `${sεr}.view.setInt16(${sεr}.index, ${comp.vλl}, 1, ${sεr}.index += 2)`, type};
                case isInt32:
                    return {code: `${sεr}.view.setInt32(${sεr}.index, ${comp.vλl}, 1, ${sεr}.index += 4)`, type};
                default:
                    return {code: floatCode, type};
            }
        }
        return {code: floatCode, type: 'S'};
    }

    emitFromBinary(comp: BinaryDeserializer, rt: BaseRunType): JitCode {
        const type = 'E';
        const dεs = comp.args.dεs;
        const params = this.getParams(rt);
        const isFloat = params.float !== undefined ? paramVal(params.float) : false;
        const floatCode = `${dεs}.view.getFloat64(${dεs}.index, 1, (${dεs}.index += 8))`;
        if (isFloat) return {code: floatCode, type};
        const isInt = params.integer !== undefined ? paramVal(params.integer) : false;
        if (isInt) {
            const {isUint8, isUint16, isUint32, isInt8, isInt16, isInt32} = getIntegerType(params);
            switch (true) {
                case isUint8:
                    return {code: `${dεs}.view.getUint8(${dεs}.index++)`, type};
                case isUint16:
                    return {code: `${dεs}.view.getUint16(${dεs}.index, 1, ${dεs}.index += 2)`, type};
                case isUint32:
                    return {code: `${dεs}.view.getUint32(${dεs}.index, 1, ${dεs}.index += 4)`, type};
                case isInt8:
                    return {code: `${dεs}.view.getInt8(${dεs}.index++)`, type};
                case isInt16:
                    return {code: `${dεs}.view.getInt16(${dεs}.index, 1, ${dεs}.index += 2)`, type};
                case isInt32:
                    return {code: `${dεs}.view.getInt32(${dεs}.index, 1, ${dεs}.index += 4)`, type};
                default:
                    return {code: floatCode, type};
            }
        }
        return {code: floatCode, type};
    }

    _mock(opts: RunTypeOptions, rt: BaseRunType): number {
        const params = this.getParams(rt);
        let min = params.min !== undefined ? paramVal(params.min) : -99999;
        let max = params.max !== undefined ? paramVal(params.max) : 99999;

        // Adjust for exclusive bounds
        if (params.gt !== undefined) {
            const epsilon = params.float ? 0.01 : 1;
            const gtVal = paramVal(params.gt);
            min = Math.max(min, gtVal + epsilon);
        }
        if (params.lt !== undefined) {
            const epsilon = params.float ? 0.01 : 1;
            const ltVal = paramVal(params.lt);
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
            const multipleOfVal = paramVal(params.multipleOf);
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
        if (params.min && params.max && paramVal(params.min) > paramVal(params.max)) {
            throw new Error(`min cannot be greater than max in ${this.printPath(rt)}`);
        }

        if (params.gt && params.lt && paramVal(params.gt) >= paramVal(params.lt)) {
            throw new Error(`gt cannot be greater than or equal to lt in ${this.printPath(rt)}`);
        }

        // Check for multipleOf > 0 and must be integer
        if (params.multipleOf !== undefined) {
            const multipleOfVal = paramVal(params.multipleOf);

            if (multipleOfVal <= 0) {
                throw new Error(`multipleOf must be greater than 0 in ${this.printPath(rt)}`);
            }

            // Enforce that multipleOf must always be an integer to avoid floating-point precision issues
            if (!Number.isInteger(multipleOfVal)) {
                throw new Error(
                    `multipleOf must be an integer to avoid floating-point precision issues in ${this.printPath(rt)}`
                );
            }

            // Check consistency with float parameter
            if (params.float) {
                throw new Error(
                    `multipleOf cannot be used with float constraint as multipleOf must be an integer in ${this.printPath(rt)}`
                );
            }
        }
    }
}

function getIntegerType(params: any) {
    const min = params.min !== undefined ? paramVal(params.min) : Number.MIN_SAFE_INTEGER;
    const max = params.max !== undefined ? paramVal(params.max) : Number.MAX_SAFE_INTEGER;
    const isUint8 = min >= 0 && max !== undefined && max <= 255;
    const isUint16 = min >= 0 && max !== undefined && max <= 65535;
    const isUint32 = min >= 0 && max !== undefined && max <= 4294967295;
    const isInt8 = min >= -128 && max !== undefined && max <= 127;
    const isInt16 = min >= -32768 && max !== undefined && max <= 32767;
    const isInt32 = min >= -2147483648 && max !== undefined && max <= 2147483647;
    return {isUint8, isUint16, isUint32, isInt8, isInt16, isInt32};
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
