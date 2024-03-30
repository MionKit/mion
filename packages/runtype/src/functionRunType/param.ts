import {TypeParameter} from '../_deepkit/src/reflection/type';
import {BaseRunType} from '../baseRunType';
import {RunType, RunTypeOptions, RunTypeVisitor} from '../types';
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
    public readonly argRunType: RunType | RestParamsRunType;
    public readonly name: string;
    public readonly isOptional: boolean;
    public readonly isReadonly: boolean;
    public readonly paramName: string;
    public readonly default: any;
    public readonly isRest: boolean;

    constructor(
        visitor: RunTypeVisitor,
        src: TypeParameter,
        public readonly nestLevel: number,
        public readonly opts: RunTypeOptions
    ) {
        super(visitor, src, nestLevel, opts);
        this.argRunType = visitor(src.type, nestLevel, opts);
        this.isJsonEncodeRequired = this.argRunType.isJsonEncodeRequired;
        this.isJsonDecodeRequired = this.argRunType.isJsonDecodeRequired;
        this.isRest = this.argRunType instanceof RestParamsRunType;
        this.isOptional = !!src.optional || this.isRest;
        this.isReadonly = !!src.readonly && !this.isRest;
        this.paramName = src.name;
        this.name = `${this.isRest ? '...' : ''}${src.name}${this.isOptional ? '?' : ''}:${this.argRunType.name}`;
    }
    JIT_isType(varName: string, itemIndex = 0): string {
        if (this.isRest) return this.argRunType.JIT_isType(varName, itemIndex);
        const argAccessor = `${varName}[${itemIndex}]`;
        if (this.isOptional) return `${argAccessor} === undefined || (${this.argRunType.JIT_isType(argAccessor)})`;
        return this.argRunType.JIT_isType(argAccessor);
    }
    JIT_typeErrors(varName: string, errorsName: string, pathChain: string, itemIndex = 0): string {
        if (this.isRest) return this.argRunType.JIT_typeErrors(varName, errorsName, pathChain, itemIndex);
        const argAccessor = `${varName}[${itemIndex}]`;
        if (this.isOptional)
            return `if (${argAccessor} !== undefined) {${this.argRunType.JIT_typeErrors(
                argAccessor,
                errorsName,
                addToPathChain(pathChain, itemIndex)
            )}}`;
        return this.argRunType.JIT_typeErrors(argAccessor, errorsName, addToPathChain(pathChain, itemIndex));
    }
    JIT_jsonEncode(varName: string, itemIndex = 0): string {
        if (this.isRest) return this.argRunType.JIT_jsonEncode(varName, itemIndex);
        const argAccessor = `${varName}[${itemIndex}]`;
        if (skipJsonEncode(this)) return argAccessor;
        return this.argRunType.JIT_jsonEncode(argAccessor);
    }
    JIT_jsonDecode(varName: string, itemIndex = 0): string {
        if (this.isRest) return this.argRunType.JIT_jsonDecode(varName, itemIndex);
        const argAccessor = `${varName}[${itemIndex}]`;
        if (skipJsonDecode(this)) return argAccessor;
        return this.argRunType.JIT_jsonDecode(argAccessor);
    }
    JIT_jsonStringify(varName: string, itemIndex = 0): string {
        if (this.isRest) return this.argRunType.JIT_jsonStringify(varName, itemIndex);
        const argAccessor = `${varName}[${itemIndex}]`;
        const argCode = this.argRunType.JIT_jsonStringify(argAccessor);
        const sep = itemIndex === 0 ? '' : `','+`;
        if (this.isOptional) {
            return `(${argAccessor} === undefined ? '': ${sep}${argCode})`;
        }
        return `${sep}${argCode}`;
    }
    mock(...args: any[]): any {
        return this.argRunType.mock(...args);
    }
}
