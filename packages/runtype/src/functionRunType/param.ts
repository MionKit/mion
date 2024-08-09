import {TypeParameter} from '../_deepkit/src/reflection/type';
import {BaseRunType} from '../baseRunTypes';
import {JitErrorPath, RunType, RunTypeOptions, RunTypeVisitor} from '../types';
import {addToPathChain, skipJsonDecode, skipJsonEncode} from '../utils';
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
    public readonly hasCircular: boolean;
    public readonly argRunType: RunType | RestParamsRunType;
    public readonly isOptional: boolean;
    public readonly isReadonly: boolean;
    public readonly paramName: string;
    public readonly default: any;
    public readonly isRest: boolean;

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
        this.hasCircular = !!this.argRunType.hasCircular;
        this.isRest = this.argRunType instanceof RestParamsRunType;
        this.isOptional = !!src.optional || this.isRest;
        this.isReadonly = !!src.readonly && !this.isRest;
        this.paramName = src.name;
    }

    getJitId(): string | number {
        // param name is irrelevant (not required) as only position matters
        return `${this.argRunType.getJitId()}${this.isOptional ? '?' : ''}`;
    }
    getName(): string {
        return `${this.paramName}${this.isOptional ? '?' : ''}:${this.argRunType.getName()}`;
    }
    compileIsType(varName: string, paramIndex = 0): string {
        if (this.isRest) return this.argRunType.compileIsType(varName, paramIndex);
        const argAccessor = `${varName}[${paramIndex}]`;
        if (this.isOptional) return `${argAccessor} === undefined || (${this.argRunType.compileIsType(argAccessor)})`;
        return this.argRunType.compileIsType(argAccessor);
    }
    compileTypeErrors(varName: string, errorsName: string, pathChain: JitErrorPath, paramIndex = 0): string {
        if (this.isRest) return this.argRunType.compileTypeErrors(varName, errorsName, pathChain, paramIndex);
        const argAccessor = `${varName}[${paramIndex}]`;
        const paramPath = addToPathChain(pathChain, paramIndex);
        if (this.isOptional)
            return `if (${argAccessor} !== undefined) {${this.argRunType.compileTypeErrors(argAccessor, errorsName, paramPath)}}`;
        return this.argRunType.compileTypeErrors(argAccessor, errorsName, paramPath);
    }
    compileJsonEncode(varName: string, paramIndex = 0): string {
        if (this.isRest) return this.argRunType.compileJsonEncode(varName, paramIndex);
        const argAccessor = `${varName}[${paramIndex}]`;
        if (skipJsonEncode(this)) return argAccessor;
        return this.argRunType.compileJsonEncode(argAccessor);
    }
    compileJsonDecode(varName: string, paramIndex = 0): string {
        if (this.isRest) return this.argRunType.compileJsonDecode(varName, paramIndex);
        const argAccessor = `${varName}[${paramIndex}]`;
        if (skipJsonDecode(this)) return argAccessor;
        return this.argRunType.compileJsonDecode(argAccessor);
    }
    compileJsonStringify(varName: string, paramIndex = 0): string {
        if (this.isRest) return this.argRunType.compileJsonStringify(varName, paramIndex);
        const argAccessor = `${varName}[${paramIndex}]`;
        const argCode = this.argRunType.compileJsonStringify(argAccessor);
        const sep = paramIndex === 0 ? '' : `','+`;
        if (this.isOptional) {
            return `(${argAccessor} === undefined ? '': ${sep}${argCode})`;
        }
        return `${sep}${argCode}`;
    }
    mock(...args: any[]): any {
        return this.argRunType.mock(...args);
    }
}
