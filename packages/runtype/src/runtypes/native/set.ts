/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {JitConstants, MockOperation, Mutable, SrcType} from '../../types';
import {ReflectionSubKind} from '../../constants.kind';
import {ReflectionKind, type TypeClass} from '../../lib/_deepkit/src/reflection/type';
import {random} from '../../lib/mock';
import {GenericMemberRunType} from '../member/genericMember';
import {IterableRunType} from './Iterable';
import {JitCompiler} from '../../lib/jitCompiler';
import {JitFnIDs} from '../../constants';
import {BaseRunType} from '../../lib/baseRunTypes';

class SetKeyRunType extends GenericMemberRunType<any> {
    index = 0;
    skipSettingAccessor() {
        return true;
    }
    getStaticPathLiteral(comp: JitCompiler): string {
        const parent = this.getParent()! as SetRunType;
        const custom = parent.getCustomVλl(comp)!;
        return `{key:utl.safeKey(${custom.vλl}),index:${parent.getIndexVarName()}}`;
    }
}

export class SetRunType extends IterableRunType {
    keyRT = new SetKeyRunType();
    children = [this.keyRT];
    instance = 'Set';
    linkSrc(src: SrcType<TypeClass>): void {
        const types = src.arguments;
        if (!types || types.length !== 1) throw new Error(`Set expects 1 type argument: ie: Set<number>`);
        super.linkSrc(src);
        this.keyRT.linkSrc({
            kind: ReflectionKind.parameter,
            parent: src,
            type: types[0],
            subKind: ReflectionSubKind.setItem,
        });
    }
    getCustomVλl(comp: JitCompiler) {
        // jsonDecode is decoding a regular array so no need to use an special case for vλl as other operations
        if (comp.fnId === JitFnIDs.jsonDecode)
            return {vλl: `it${this.getNestLevel()}`, isStandalone: false, useArrayAccessor: true};
        // other operations use an special case for vλl where all parents are skipped
        return {vλl: `it${this.getNestLevel()}`, isStandalone: true};
    }
    getJitConstants(stack: BaseRunType[] = []): JitConstants {
        return {
            ...(super.getJitConstants(stack) as Mutable<JitConstants>),
            skipJsonEncode: false, // we always need to transform the map/set into to an array when encoding
            skipJsonDecode: false, // we always need to transform the array to a map/set when decoding
        };
    }

    _mock(ctx: MockOperation): Set<any> {
        const mockSet = new Set();
        const length = ctx.arrayLength ?? random(0, ctx.maxRandomItemsLength);
        for (let i = 0; i < length; i++) {
            const value = this.keyRT.mock(ctx);
            mockSet.add(value);
        }
        return mockSet;
    }
}
