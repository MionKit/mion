/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {MockOperation, SrcType} from '../../types';
import {GenericMemberRunType} from '../member/genericMember';
import {ReflectionSubKind} from '../../constants.kind';
import {ReflectionKind, TypeClass} from '../../lib/_deepkit/src/reflection/type';
import {random} from '../../lib/mock';
import {IterableRunType} from './Iterable';
import {JitCompiler} from '../../lib/jitCompiler';

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
        return `{key:utl.safeMapKey(${custom.vλl}[0]),index:${parent.getIndexVarName()},failed:'mapKey'}`;
    }
}

class MapValueRunType extends GenericMemberRunType<any> {
    index = 1;
    getStaticPathLiteral(comp: JitCompiler): string | number {
        const parent = this.getParent()! as MapRunType;
        const custom = parent.getCustomVλl(comp)!;
        return `{key:utl.safeMapKey(${custom.vλl}[0]),index:${parent.getIndexVarName()},failed:'mapVal'}`;
    }
}

// function getSafeKeyCode(comp: JitCompiler, parent: MapRunType): string {
//     const keyChild = parent.keyRT.getMemberType();
//     const isAtomic = keyChild.getFamily() === 'A';
//     const jitConf = keyChild.getJitConstants();
//     if (isAtomic && jitConf.skipJsonEncode) {
//         return `${custom.vλl}[0]`;
//     }
//     if (keyChild.getFamily() === 'A' && !jitConf.skipJsonEncode) {
//         return keyChild._compileJsonEncode(comp);
//     }
//     const compiledOp = keyChild.getJitCompiledOperation(JitFnIDs.jsonEncode);
//     const code = keyChild.callDependency(comp, compiledOp);
//     comp.updateDependencies(compiledOp);
//     return code;
// }
