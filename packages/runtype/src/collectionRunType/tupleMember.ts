/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeTupleMember} from '../_deepkit/src/reflection/type';
import {MemberRunType} from '../baseRunTypes';
import {RunType, RunTypeOptions, RunTypeVisitor} from '../types';

export class TupleMemberRunType extends MemberRunType<TypeTupleMember> {
    public readonly memberType: RunType;
    public readonly memberName: string | number;
    public readonly isJsonEncodeRequired: boolean;
    public readonly isJsonDecodeRequired: boolean;
    public readonly jitId: string = '$';

    constructor(
        visitor: RunTypeVisitor,
        public readonly src: TypeTupleMember,
        public readonly parents: RunType[],
        public opts: RunTypeOptions
    ) {
        super(visitor, src, parents, opts);
        parents.push(this);
        this.memberType = visitor(src.type, parents, opts);
        parents.pop();
        this.memberName = src.name || '';
        const optional = this.src.optional ? '?' : '';
        this.jitId = `${this.src.kind}${optional}:${this.memberType.jitId}`;
        this.isJsonDecodeRequired = this.memberType.isJsonDecodeRequired;
        this.isJsonEncodeRequired = this.memberType.isJsonEncodeRequired;
    }

    compileIsType(parents: RunType[], varName: string): string {
        // const compile = () => {};
        if (this.src.optional) {
            return `(${varName} === undefined || ${this.memberType.compileIsType(parents, varName)})`;
        }
        return this.memberType.compileIsType(parents, varName);
    }
    compileTypeErrors(parents: RunType[], varName: string, pathC: (string | number)[]): string {
        // const compile = () => {};
        if (this.src.optional) {
            return `if (${varName} !== undefined) {${this.memberType.compileTypeErrors(parents, varName, pathC)}}`;
        }
        return this.memberType.compileTypeErrors(parents, varName, pathC);
    }
    compileJsonEncode(parents: RunType[], varName: string): string {
        // const compile = () => {};
        if (this.src.optional) {
            const itemCode = this.memberType.compileJsonEncode(parents, varName) || varName;
            return `${varName} = ${varName} === undefined ? null : ${itemCode}`;
        }
        if (!this.opts?.strictJSON && !this.isJsonEncodeRequired) return '';
        return this.memberType.compileJsonEncode(parents, varName);
    }
    compileJsonDecode(parents: RunType[], varName: string): string {
        // const compile = () => {};
        if (this.src.optional) {
            const itemCode = this.memberType.compileJsonDecode(parents, varName) || varName;
            return `${varName} = ${varName} === null ? undefined : ${itemCode}`;
        }
        if (!this.opts?.strictJSON && !this.isJsonDecodeRequired) return '';
        return this.memberType.compileJsonDecode(parents, varName);
    }
    compileJsonStringify(parents: RunType[], varName: string): string {
        // const compile = () => {};
        if (this.src.optional) {
            return `(${varName} === undefined ? null : ${this.memberType.compileJsonStringify(parents, varName)})`;
        }
        return this.memberType.compileJsonStringify(parents, varName);
    }
    mock(...args: any[]): any {
        if (this.src.optional) {
            if (Math.random() < 0.5) {
                return undefined;
            }
        }
        return this.memberType.mock(...args);
    }
}
