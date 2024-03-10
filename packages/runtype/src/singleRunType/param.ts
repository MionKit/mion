import {TypeParameter} from '../_deepkit/src/reflection/type';
import {RunType, RunTypeVisitor} from '../types';
import {addToPathChain} from '../utils';

/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

export class ParameterRunType implements RunType<TypeParameter> {
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
        public readonly nestLevel: number
    ) {
        this.memberType = visitor(src.type, nestLevel);
        this.isJsonEncodeRequired = this.memberType.isJsonEncodeRequired;
        this.isJsonDecodeRequired = this.memberType.isJsonDecodeRequired;
        this.name = this.memberType.name;
        this.isOptional = !!src.optional;
        this.isReadonly = !!src.readonly;
        this.paramName = src.name;
    }
    isTypeJIT(varName: string): string {
        if (this.isOptional) return `${varName} === undefined || (${this.memberType.isTypeJIT(varName)})`;
        return this.memberType.isTypeJIT(varName);
    }
    typeErrorsJIT(varName: string, errorsName: string, pathChain: string): string {
        if (this.isOptional)
            return `if (${varName} !== undefined) {${this.memberType.typeErrorsJIT(
                varName,
                errorsName,
                addToPathChain(pathChain, this.paramName)
            )}}`;
        return this.memberType.typeErrorsJIT(varName, errorsName, addToPathChain(pathChain, this.paramName));
    }
    jsonEncodeJIT(varName: string, isStrict?: boolean): string {
        if (!isStrict && !this.isJsonEncodeRequired) return varName;
        return this.memberType.jsonEncodeJIT(varName, isStrict);
    }
    jsonStringifyJIT(varName: string, isFirst = false): string {
        const valCode = this.memberType.jsonStringifyJIT(varName);
        if (this.isOptional) {
            return `${isFirst ? '' : '+'}(${varName} === undefined ?'':${isFirst ? '' : `(','+`}${valCode}))`;
        }
        return `${isFirst ? '' : `+','+`}${valCode}`;
    }
    jsonDecodeJIT(varName: string, isStrict?: boolean): string {
        if (!isStrict && !this.isJsonDecodeRequired) return varName;
        return this.memberType.jsonDecodeJIT(varName, isStrict);
    }
    mock(...args: any[]): any {
        return this.memberType.mock(...args);
    }
}
