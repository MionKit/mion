/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeTupleMember} from '../_deepkit/src/reflection/type';
import {BaseRunType} from '../baseRunTypes';
import {JitErrorPath, RunType, RunTypeOptions, RunTypeVisitor} from '../types';
import {hasCircularRunType} from '../utils';

export class TupleMemberRunType extends BaseRunType<TypeTupleMember> {
    public readonly isJsonEncodeRequired: boolean;
    public readonly isJsonDecodeRequired: boolean;
    public readonly hasCircular: boolean;
    public readonly memberRunType: RunType;
    public readonly isCircular: boolean;
    constructor(
        visitor: RunTypeVisitor,
        public readonly src: TypeTupleMember,
        public readonly parents: RunType[],
        opts: RunTypeOptions
    ) {
        super(visitor, src, parents, opts);
        this.memberRunType = visitor(src.type, [...parents, this], opts);
        this.isJsonEncodeRequired = this.memberRunType.isJsonEncodeRequired;
        this.isJsonDecodeRequired = this.memberRunType.isJsonDecodeRequired;
        this.hasCircular = this.memberRunType.hasCircular || hasCircularRunType(this, this.memberRunType, parents);
        this.isCircular = this.hasCircular;
    }
    getJitId(): string | number {
        return `${this.src.kind}:${this.memberRunType.getJitId()}`;
    }
    compileIsType(varName: string): string {
        return this.memberRunType.compileIsType(varName);
    }
    compileTypeErrors(varName: string, errorsName: string, pathChain: JitErrorPath): string {
        return this.memberRunType.compileTypeErrors(varName, errorsName, pathChain);
    }
    compileJsonEncode(varName: string): string {
        return this.memberRunType.compileJsonEncode(varName);
    }
    compileJsonDecode(varName: string): string {
        return this.memberRunType.compileJsonDecode(varName);
    }
    compileJsonStringify(varName: string): string {
        return this.memberRunType.compileJsonStringify(varName);
    }
    mock(...args: any[]): any {
        return this.memberRunType.mock(...args);
    }
}
