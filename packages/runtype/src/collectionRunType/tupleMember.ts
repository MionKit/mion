/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeTupleMember} from '../_deepkit/src/reflection/type';
import {BaseRunType} from '../baseRunTypes';
import {RunType, RunTypeOptions, RunTypeVisitor} from '../types';

export class TupleMemberRunType extends BaseRunType<TypeTupleMember> {
    public readonly isJsonEncodeRequired: boolean;
    public readonly isJsonDecodeRequired: boolean;
    public readonly memberRunType: RunType;
    public readonly jitId: string;
    constructor(
        visitor: RunTypeVisitor,
        public readonly src: TypeTupleMember,
        public readonly parents: RunType[],
        opts: RunTypeOptions
    ) {
        super(visitor, src, parents, opts);
        parents.push(this);
        this.memberRunType = visitor(src.type, parents, opts);
        parents.pop();
        this.isJsonEncodeRequired = this.memberRunType.isJsonEncodeRequired;
        this.isJsonDecodeRequired = this.memberRunType.isJsonDecodeRequired;
        this.jitId = `${this.src.kind}:${this.memberRunType.jitId}`;
    }
    compileIsType(parents: RunType[], varName: string): string {
        return this.memberRunType.compileIsType(parents, varName);
    }
    compileTypeErrors(parents: RunType[], varName: string, pathC: string[]): string {
        return this.memberRunType.compileTypeErrors(parents, varName, pathC);
    }
    compileJsonEncode(parents: RunType[], varName: string): string {
        return this.memberRunType.compileJsonEncode(parents, varName);
    }
    compileJsonDecode(parents: RunType[], varName: string): string {
        return this.memberRunType.compileJsonDecode(parents, varName);
    }
    compileJsonStringify(parents: RunType[], varName: string): string {
        return this.memberRunType.compileJsonStringify(parents, varName);
    }
    mock(...args: any[]): any {
        return this.memberRunType.mock(...args);
    }
}
