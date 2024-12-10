/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {JitConfig, MockOperation, Mutable, SrcType} from '../../types';
import {GenericMemberRunType} from '../member/genericMember';
import {ReflectionSubKind} from '../../constants.kind';
import {ReflectionKind, TypeClass} from '../../lib/_deepkit/src/reflection/type';
import {random} from '../../lib/mock';
import {IterableRunType} from './Iterable';
import {JitCompiler} from '../../lib/jitCompiler';
import {JitFnIDs} from '../../constants';
import {BaseRunType} from '../../lib/baseRunTypes';

export class MapRunType extends IterableRunType {
    keyRT = new MapKeyRunType();
    valueRT = new MapValueRunType();
    children = [this.keyRT, this.valueRT];
    instance = 'Map';
    linkSrc(src: SrcType<TypeClass>): void {
        const types = src.arguments;
        if (!types || types.length !== 2) throw new Error(`Map expects 2 type arguments: ie: Map<string, number>`);
        super.linkSrc(src);
        this.keyRT.linkSrc({
            kind: ReflectionKind.parameter,
            parent: src,
            type: types[0],
            subKind: ReflectionSubKind.mapKey,
        });
        this.valueRT.linkSrc({
            kind: ReflectionKind.parameter,
            parent: src,
            type: types[1],
            subKind: ReflectionSubKind.mapValue,
        });
    }
    getCustomVλl(comp: JitCompiler) {
        // fromJsonVal is decoding a regular array so no need to use an special case for vλl as other operations
        if (comp.fnId === JitFnIDs.fromJsonVal)
            return {vλl: `it${this.getNestLevel()}`, isStandalone: false, useArrayAccessor: true};
        // other operations use an special case for vλl where all parents are skipped
        return {vλl: `it${this.getNestLevel()}`, isStandalone: true};
    }
    getJitConfig(stack: BaseRunType[] = []): JitConfig {
        return {
            ...(super.getJitConfig(stack) as Mutable<JitConfig>),
            skipToJsonVal: false, // we always need to transform the map/set into to an array when encoding
            skipFromJsonVal: false, // we always need to transform the array to a map/set when decoding
        };
    }

    _mock(ctx: MockOperation): Map<any, any> | any {
        const mockMap = new Map();
        const length = ctx.arrayLength ?? random(0, ctx.maxRandomItemsLength);
        for (let i = 0; i < length; i++) {
            const keyType = this.keyRT.mock(ctx);
            const valueType = this.valueRT.mock(ctx);
            mockMap.set(keyType, valueType);
        }
        return mockMap;
    }
}

class MapKeyRunType extends GenericMemberRunType<any> {
    index = 0;
    getStaticPathLiteral(comp: JitCompiler): string | number {
        const parent = this.getParent()! as MapRunType;
        const custom = parent.getCustomVλl(comp)!;
        return `{key:utl.safeKey(${custom.vλl}[0]),index:${parent.getIndexVarName()},failed:'mapKey'}`;
    }
}

class MapValueRunType extends GenericMemberRunType<any> {
    index = 1;
    getStaticPathLiteral(comp: JitCompiler): string | number {
        const parent = this.getParent()! as MapRunType;
        const custom = parent.getCustomVλl(comp)!;
        return `{key:utl.safeKey(${custom.vλl}[0]),index:${parent.getIndexVarName()},failed:'mapVal'}`;
    }
}
