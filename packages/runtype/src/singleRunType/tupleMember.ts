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
    public readonly memberRunType: RunType;
    public readonly name: string;
    constructor(
        visitor: RunTypeVisitor,
        public readonly src: TypeTupleMember,
        public readonly nestLevel: number,
        public readonly opts: RunTypeOptions
    ) {
        super(visitor, src, nestLevel, opts);
        this.memberRunType = visitor(src.type, nestLevel, opts);
        this.isJsonEncodeRequired = this.memberRunType.isJsonEncodeRequired;
        this.isJsonDecodeRequired = this.memberRunType.isJsonDecodeRequired;
        this.name = this.memberRunType.name;
    }
    JIT_isType(varName: string): string {
        return this.memberRunType.JIT_isType(varName);
    }
    JIT_typeErrors(varName: string, errorsName: string, pathChain: string): string {
        return this.memberRunType.JIT_typeErrors(varName, errorsName, pathChain);
    }
    JIT_jsonEncode(varName: string): string {
        return this.memberRunType.JIT_jsonEncode(varName);
    }
    JIT_jsonDecode(varName: string): string {
        return this.memberRunType.JIT_jsonDecode(varName);
    }
    JIT_jsonStringify(varName: string): string {
        return this.memberRunType.JIT_jsonStringify(varName);
    }
    mock(...args: any[]): any {
        return this.memberRunType.mock(...args);
    }
}
