/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeTupleMember} from '@deepkit/type';
import {RunType, RunTypeVisitor} from '../types';

export class TupleMemberRunType implements RunType<TypeTupleMember> {
    public readonly isJsonEncodeRequired: boolean;
    public readonly isJsonDecodeRequired: boolean;
    public readonly memberType: RunType;
    public readonly name: string;
    constructor(
        public readonly src: TypeTupleMember,
        public readonly visitor: RunTypeVisitor,
        public readonly nestLevel: number
    ) {
        this.memberType = visitor(src.type, nestLevel);
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
    jsonEncodeJIT(varName: string, isStrict?: boolean): string {
        return this.memberType.jsonEncodeJIT(varName, isStrict);
    }
    jsonStringifyJIT(varName: string): string {
        return this.memberType.jsonStringifyJIT(varName);
    }
    jsonDecodeJIT(varName: string, isStrict?: boolean): string {
        return this.memberType.jsonDecodeJIT(varName, isStrict);
    }
    mock(...args: any[]): any {
        return this.memberType.mock(...args);
    }
}
