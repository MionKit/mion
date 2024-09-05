import {TypeParameter} from '../_deepkit/src/reflection/type';
import {BaseRunType} from '../baseRunTypes';
import {RunType, RunTypeOptions, RunTypeVisitor} from '../types';
import {shouldSkipJsonEncode} from '../utils';
import {RestParamsRunType} from './restParams';

/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

export class ParameterRunType extends BaseRunType<TypeParameter> {
    public readonly isJsonEncodeRequired: boolean;
    public readonly isJsonDecodeRequired: boolean;
    public readonly argRunType: RunType | RestParamsRunType;
    public readonly default: any;

    get isRest(): boolean {
        return this.argRunType instanceof RestParamsRunType;
    }
    get isOptional(): boolean {
        return !!this.src.optional || this.isRest;
    }
    get paramName(): string {
        return this.src.name;
    }
    get jitId(): string {
        return `${this.argRunType.jitId}${this.isOptional ? '?' : ''}`;
    }

    constructor(
        visitor: RunTypeVisitor,
        public readonly src: TypeParameter,
        public readonly parents: RunType[],
        opts: RunTypeOptions
    ) {
        super(visitor, src, parents, opts);
        parents.push(this);
        this.argRunType = visitor(src.type, [...parents, this], opts);
        parents.pop();
        this.isJsonEncodeRequired = this.argRunType.isJsonEncodeRequired;
        this.isJsonDecodeRequired = this.argRunType.isJsonDecodeRequired;
    }
    getName(): string {
        return `${this.paramName}${this.isOptional ? '?' : ''}:${this.argRunType.getName()}`;
    }
    compileIsType(parents: RunType[], varName: string, paramIndex = 0): string {
        let code: string;
        parents.push(this);
        if (this.isRest) {
            code = this.argRunType.compileIsType(parents, varName, paramIndex);
        } else {
            const argAccessor = `${varName}[${paramIndex}]`;
            code = this.isOptional
                ? `${argAccessor} === undefined || (${this.argRunType.compileIsType(parents, argAccessor)})`
                : this.argRunType.compileIsType(parents, argAccessor);
        }
        parents.pop();
        return code;
    }
    compileTypeErrors(parents: RunType[], varName: string, pathC: (string | number)[], paramIndex = 0): string {
        let code: string;
        parents.push(this);
        if (this.isRest) {
            code = this.argRunType.compileTypeErrors(parents, varName, pathC, paramIndex);
        } else {
            const argAccessor = `${varName}[${paramIndex}]`;
            code = this.isOptional
                ? `if (${argAccessor} !== undefined) {${this.argRunType.compileTypeErrors(parents, argAccessor, [...pathC, paramIndex])}}`
                : this.argRunType.compileTypeErrors(parents, argAccessor, [...pathC, paramIndex]);
        }
        parents.pop();
        return code;
    }
    compileJsonEncode(parents: RunType[], varName: string, paramIndex = 0): string {
        let code: string;
        parents.push(this);
        if (this.isRest) {
            code = this.argRunType.compileJsonEncode(parents, varName, paramIndex);
        } else {
            const argAccessor = `${varName}[${paramIndex}]`;
            code = shouldSkipJsonEncode(this) ? argAccessor : this.argRunType.compileJsonEncode(parents, argAccessor);
        }
        parents.pop();
        return code;
    }
    compileJsonDecode(parents: RunType[], varName: string, paramIndex = 0): string {
        let code: string;
        parents.push(this);
        if (this.isRest) {
            code = this.argRunType.compileJsonDecode(parents, varName, paramIndex);
        } else {
            const argAccessor = `${varName}[${paramIndex}]`;
            code = shouldSkipJsonEncode(this) ? argAccessor : this.argRunType.compileJsonDecode(parents, argAccessor);
        }
        parents.pop();
        return code;
    }
    compileJsonStringify(parents: RunType[], varName: string, paramIndex = 0): string {
        let code: string;
        parents.push(this);
        if (this.isRest) {
            code = this.argRunType.compileJsonStringify(parents, varName, paramIndex);
        } else {
            const argAccessor = `${varName}[${paramIndex}]`;
            const argCode = this.argRunType.compileJsonStringify(parents, argAccessor);
            const sep = paramIndex === 0 ? '' : `','+`;
            code = this.isOptional ? `(${argAccessor} === undefined ? '': ${sep}${argCode})` : `${sep}${argCode}`;
        }
        parents.pop();
        return code;
    }
    mock(...args: any[]): any {
        return this.argRunType.mock(...args);
    }
}
