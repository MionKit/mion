/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeTupleMember} from '../_deepkit/src/reflection/type';
import {MemberRunType} from '../baseRunTypes';
import {JitCompileOp, JitTypeErrorCompileOp} from '../jitOperation';
import {PathItem, MockContext} from '../types';

export class TupleMemberRunType extends MemberRunType<TypeTupleMember> {
    src: TypeTupleMember = null as any; // will be set after construction
    getName() {
        return 'string';
    }
    getMemberName() {
        return 'tupleMember';
    }
    isOptional(): boolean {
        return !!this.src.optional;
    }
    getMemberIndex(): number {
        return this.src.parent.types.indexOf(this.src);
    }
    getJitChildrenPath(cop: JitCompileOp): PathItem {
        const index = this.getMemberIndex();
        return cop.newPathItem(index, index, true);
    }
    protected hasReturnCompileIsType(): boolean {
        return false;
    }
    protected _compileIsType(cop: JitCompileOp): string {
        const itemCode = this.getMemberType().compileIsType(cop);
        return this.src.optional ? `(${cop.vλl} === undefined || ${itemCode})` : itemCode;
    }
    protected _compileTypeErrors(cop: JitTypeErrorCompileOp): string {
        const itemCode = this.getMemberType().compileTypeErrors(cop);
        return this.src.optional ? `if (${cop.vλl} !== undefined) {${itemCode}}` : itemCode;
    }
    protected _compileJsonEncode(cop: JitCompileOp): string {
        const itemCode = this.getMemberType().compileJsonEncode(cop);
        return this.src.optional ? `${cop.vλl} === undefined ? null : ${itemCode}` : itemCode;
    }
    protected _compileJsonDecode(cop: JitCompileOp): string {
        const itemCode = this.getMemberType().compileJsonDecode(cop);
        return this.src.optional ? `${cop.vλl} === null ? undefined : ${itemCode}` : itemCode;
    }
    protected _compileJsonStringify(cop: JitCompileOp): string {
        const itemCode = this.getMemberType().compileJsonStringify(cop);
        return this.src.optional ? `(${cop.vλl} === undefined ? null : ${itemCode})` : itemCode;
    }
    mock(ctx?: Pick<MockContext, 'optionalProbability'>): any {
        if (this.src.optional) {
            const probability = ctx?.optionalProbability || 0.5;
            if (probability < 0 || probability > 1) throw new Error('optionalProbability must be between 0 and 1');
            if (Math.random() < probability) {
                return undefined;
            }
        }
        return this.getMemberType().mock(ctx);
    }
}
