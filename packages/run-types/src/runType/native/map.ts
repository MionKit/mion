/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {SrcType} from '../../types';
import {GenericMemberRunType} from '../member/genericMember';
import {ReflectionSubKind} from '../../constants.kind';
import {ReflectionKind, TypeClass} from '@deepkit/type';
import {IterableRunType} from './Iterable';
import {JitFunctions} from '../../constants.functions';
import type {JitCompiler} from '../../lib/jitFnCompiler';

export class MapRunType extends IterableRunType {
    keyRT = new MapKeyRunType();
    valueRT = new MapValueRunType();
    children = [this.keyRT, this.valueRT];
    instance = 'Map';
    onCreated(src: SrcType<TypeClass>): void {
        const types = src.arguments;
        if (!types || types.length !== 2) throw new Error(`Map expects 2 type arguments: ie: Map<string, number>`);
        super.onCreated(src);
        this.keyRT.onCreated({
            kind: ReflectionKind.parameter,
            parent: src,
            type: types[0],
            subKind: ReflectionSubKind.mapKey,
        });
        this.valueRT.onCreated({
            kind: ReflectionKind.parameter,
            parent: src,
            type: types[1],
            subKind: ReflectionSubKind.mapValue,
        });
    }
    getCustomVλl(comp: JitCompiler) {
        // fromJsonVal is decoding a regular array so no need to use an special case for vλl as other operations
        if (comp.fnID === JitFunctions.fromJsonVal.id)
            return {vλl: `it${comp.getNestLevel(this)}`, isStandalone: false, useArrayAccessor: true};
        // other operations use an special case for vλl where all parents are skipped
        return {vλl: `it${comp.getNestLevel(this)}`, isStandalone: true};
    }
}

class MapKeyRunType extends GenericMemberRunType<any> {
    index = 0;
    getStaticPathLiteral(comp: JitCompiler): string | number {
        const parent = this.getParent()! as MapRunType;
        const custom = parent.getCustomVλl(comp)!;
        return `{key:utl.safeKey(${custom.vλl}[0]),index:${parent.getIndexVarName(comp)},failed:'mapKey'}`;
    }
}

class MapValueRunType extends GenericMemberRunType<any> {
    index = 1;
    getStaticPathLiteral(comp: JitCompiler): string | number {
        const parent = this.getParent()! as MapRunType;
        const custom = parent.getCustomVλl(comp)!;
        return `{key:utl.safeKey(${custom.vλl}[0]),index:${parent.getIndexVarName(comp)},failed:'mapVal'}`;
    }
}
