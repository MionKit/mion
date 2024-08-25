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
    public readonly isOptional: boolean;
    public readonly isReadonly: boolean;
    public readonly paramName: string;
    public readonly default: any;
    public readonly isRest: boolean;
    public readonly jitId: string;

    constructor(
        visitor: RunTypeVisitor,
        public readonly src: TypeParameter,
        public readonly parents: RunType[],
        opts: RunTypeOptions
    ) {
        super(visitor, src, parents, opts);
        this.argRunType = visitor(src.type, [...parents, this], opts);
        this.isJsonEncodeRequired = this.argRunType.isJsonEncodeRequired;
        this.isJsonDecodeRequired = this.argRunType.isJsonDecodeRequired;
        this.isRest = this.argRunType instanceof RestParamsRunType;
        this.isOptional = !!src.optional || this.isRest;
        this.isReadonly = !!src.readonly && !this.isRest;
        this.paramName = src.name;
        this.jitId = 'param'; // will be overridden later
    }

    getJitId(): string | number {
        // param name is irrelevant (not required) as only position matters
        return `${this.argRunType.jitId}${this.isOptional ? '?' : ''}`;
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
    compileTypeErrors(parents: RunType[], varName: string, paramIndex = 0): string {
        let code: string;
        parents.push(this);
        if (this.isRest) {
            code = this.argRunType.compileTypeErrors(parents, varName, paramIndex);
        } else {
            const argAccessor = `${varName}[${paramIndex}]`;
            code = this.isOptional
                ? `if (${argAccessor} !== undefined) {${this.argRunType.compileTypeErrors(parents, argAccessor)}}`
                : this.argRunType.compileTypeErrors(parents, argAccessor);
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
