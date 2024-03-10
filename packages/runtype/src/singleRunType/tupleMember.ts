/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeTupleMember} from '../_deepkit/src/reflection/type';
import {RunType, RunTypeOptions, RunTypeVisitor} from '../types';

export class TupleMemberRunType implements RunType<TypeTupleMember> {
    public readonly isJsonEncodeRequired: boolean;
    public readonly isJsonDecodeRequired: boolean;
    public readonly memberType: RunType;
    public readonly name: string;
    constructor(
        visitor: RunTypeVisitor,
        public readonly src: TypeTupleMember,
        public readonly nestLevel: number,
        public readonly opts: RunTypeOptions
    ) {
        this.memberType = visitor(src.type, nestLevel, opts);
        this.isJsonEncodeRequired = this.memberType.isJsonEncodeRequired;
        this.isJsonDecodeRequired = this.memberType.isJsonDecodeRequired;
        this.name = this.memberType.name;
    }
    isTypeJIT(varName: string): string {
        return this.memberType.isTypeJIT(varName);
    }
    typeErrorsJIT(varName: string, errorsName: string, pathChain: string): string {
        return this.memberType.typeErrorsJIT(varName, errorsName, pathChain);
    }
    jsonEncodeJIT(varName: string): string {
        return this.memberType.jsonEncodeJIT(varName);
    }
    jsonDecodeJIT(varName: string): string {
        return this.memberType.jsonDecodeJIT(varName);
    }
    jsonStringifyJIT(varName: string): string {
        return this.memberType.jsonStringifyJIT(varName);
    }
    mock(...args: any[]): any {
        return this.memberType.mock(...args);
    }
}
