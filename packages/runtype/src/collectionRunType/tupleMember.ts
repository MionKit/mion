/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeTupleMember} from '../_deepkit/src/reflection/type';
import {BaseRunType} from '../baseRunTypes';
import {RunType, RunTypeOptions, RunTypeVisitor} from '../types';
import {hasCircularRunType} from '../utils';

export class TupleMemberRunType extends BaseRunType<TypeTupleMember> {
    public readonly isJsonEncodeRequired: boolean;
    public readonly isJsonDecodeRequired: boolean;
    public readonly hasCircular: boolean;
    public readonly memberRunType: RunType;
    public readonly slug: string;
    constructor(
        visitor: RunTypeVisitor,
        public readonly src: TypeTupleMember,
        public readonly parents: RunType[],
        public readonly opts: RunTypeOptions
    ) {
        super(visitor, src, parents, opts);
        this.memberRunType = visitor(src.type, [...parents, this], opts);
        this.isJsonEncodeRequired = this.memberRunType.isJsonEncodeRequired;
        this.isJsonDecodeRequired = this.memberRunType.isJsonDecodeRequired;
        this.slug = this.memberRunType.slug;
        this.hasCircular = this.memberRunType.hasCircular || hasCircularRunType(this.memberRunType, parents);
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
