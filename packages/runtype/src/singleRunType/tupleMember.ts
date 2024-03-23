/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeTupleMember} from '../_deepkit/src/reflection/type';
import {BaseRunType} from '../baseRunType';
import {RunType, RunTypeOptions, RunTypeVisitor} from '../types';

export class TupleMemberRunType extends BaseRunType<TypeTupleMember> {
    public readonly isJsonEncodeRequired: boolean;
    public readonly isJsonDecodeRequired: boolean;
    public readonly memberType: RunType;
    public readonly name: string;
    constructor(
        visitor: RunTypeVisitor,
        src: TypeTupleMember,
        public readonly nestLevel: number,
        public readonly opts: RunTypeOptions
    ) {
        super(visitor, src, nestLevel, opts);
        this.memberType = visitor(src.type, nestLevel, opts);
        this.isJsonEncodeRequired = this.memberType.isJsonEncodeRequired;
        this.isJsonDecodeRequired = this.memberType.isJsonDecodeRequired;
        this.name = this.memberType.name;
    }
    JIT_isType(varName: string): string {
        return this.memberType.JIT_isType(varName);
    }
    JIT_typeErrors(varName: string, errorsName: string, pathChain: string): string {
        return this.memberType.JIT_typeErrors(varName, errorsName, pathChain);
    }
    JIT_jsonEncode(varName: string): string {
        return this.memberType.JIT_jsonEncode(varName);
    }
    JIT_jsonDecode(varName: string): string {
        return this.memberType.JIT_jsonDecode(varName);
    }
    JIT_jsonStringify(varName: string): string {
        return this.memberType.JIT_jsonStringify(varName);
    }
    mock(...args: any[]): any {
        return this.memberType.mock(...args);
    }
}
