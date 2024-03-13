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
    public readonly memberType: RunType;
    public readonly name: string;
    public readonly isOptional: boolean;
    public readonly isReadonly: boolean;
    public readonly paramName: string | number;
    public readonly default: any;

    constructor(
        visitor: RunTypeVisitor,
        public readonly src: TypeParameter,
        public readonly nestLevel: number,
        public readonly opts: RunTypeOptions
    ) {
        super(visitor, src, nestLevel, opts);
        this.memberType = visitor(src.type, nestLevel, opts);
        this.isJsonEncodeRequired = this.memberType.isJsonEncodeRequired;
        this.isJsonDecodeRequired = this.memberType.isJsonDecodeRequired;
        this.isOptional = !!src.optional;
        this.isReadonly = !!src.readonly;
        this.paramName = src.name;
        this.name = `${src.name}${this.isOptional ? '?' : ''}:${this.memberType.name}`;
    }
    JIT_isType(varName: string): string {
        if (this.isOptional) return `${varName} === undefined || (${this.memberType.JIT_isType(varName)})`;
        return this.memberType.JIT_isType(varName);
    }
    JIT_typeErrors(varName: string, errorsName: string, pathChain: string): string {
        if (this.isOptional)
            return `if (${varName} !== undefined) {${this.memberType.JIT_typeErrors(
                varName,
                errorsName,
                addToPathChain(pathChain, this.paramName)
            )}}`;
        return this.memberType.JIT_typeErrors(varName, errorsName, addToPathChain(pathChain, this.paramName));
    }
    JIT_jsonEncode(varName: string): string {
        if (skipJsonEncode(this)) return varName;
        return this.memberType.JIT_jsonEncode(varName);
    }
    JIT_jsonStringify(varName: string, isFirst = false): string {
        const valCode = this.memberType.JIT_jsonStringify(varName);
        if (this.isOptional) {
            return `${isFirst ? '' : '+'}(${varName} === undefined ?'':${isFirst ? '' : `(','+`}${valCode}))`;
        }
        return `${isFirst ? '' : `+','+`}${valCode}`;
    }
    JIT_jsonDecode(varName: string): string {
        if (skipJsonDecode(this)) return varName;
        return this.memberType.JIT_jsonDecode(varName);
    }
    mock(...args: any[]): any {
        return this.memberType.mock(...args);
    }
}
