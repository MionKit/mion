import {TypeParameter} from '../_deepkit/src/reflection/type';
import {BaseRunType} from '../baseRunType';
import {RunType, RunTypeOptions, RunTypeVisitor} from '../types';
import {addToPathChain, skipJsonDecode, skipJsonEncode} from '../utils';

/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

export class ParameterRunType extends BaseRunType<TypeParameter> {
    public readonly isJsonEncodeRequired: boolean;
    public readonly isJsonDecodeRequired: boolean;
    public readonly memberRunType: RunType;
    public readonly name: string;
    public readonly isOptional: boolean;
    public readonly isReadonly: boolean;
    public readonly paramName: string;
    public readonly default: any;

    constructor(
        visitor: RunTypeVisitor,
        src: TypeParameter,
        public readonly nestLevel: number,
        public readonly opts: RunTypeOptions
    ) {
        super(visitor, src, nestLevel, opts);
        this.memberRunType = visitor(src.type, nestLevel, opts);
        this.isJsonEncodeRequired = this.memberRunType.isJsonEncodeRequired;
        this.isJsonDecodeRequired = this.memberRunType.isJsonDecodeRequired;
        this.isOptional = !!src.optional;
        this.isReadonly = !!src.readonly;
        this.paramName = src.name;
        this.name = `${src.name}${this.isOptional ? '?' : ''}:${this.memberRunType.name}`;
    }
    JIT_isType(varName: string): string {
        if (this.isOptional) return `${varName} === undefined || (${this.memberRunType.JIT_isType(varName)})`;
        return this.memberRunType.JIT_isType(varName);
    }
    JIT_typeErrors(varName: string, errorsName: string, pathChain: string): string {
        if (this.isOptional)
            return `if (${varName} !== undefined) {${this.memberRunType.JIT_typeErrors(
                varName,
                errorsName,
                addToPathChain(pathChain, this.paramName)
            )}}`;
        return this.memberRunType.JIT_typeErrors(varName, errorsName, addToPathChain(pathChain, this.paramName));
    }
    JIT_jsonEncode(varName: string): string {
        if (skipJsonEncode(this)) return varName;
        return this.memberRunType.JIT_jsonEncode(varName);
    }
    JIT_jsonStringify(varName: string, isFirst = false): string {
        const argCode = this.memberRunType.JIT_jsonStringify(varName);
        const sep = isFirst ? '' : `','+`;
        if (this.isOptional) {
            return `(${varName} === undefined ? '': ${sep}${argCode})`;
        }
        return `${sep}${argCode}`;
    }
    JIT_jsonDecode(varName: string): string {
        if (skipJsonDecode(this)) return varName;
        return this.memberRunType.JIT_jsonDecode(varName);
    }
    mock(...args: any[]): any {
        return this.memberRunType.mock(...args);
    }
}
