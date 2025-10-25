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
import type {JitFnCompiler} from '../../lib/jitFnCompiler';

export class MapRunType extends IterableRunType {
    keyRT = new MapKeyRunType();
    valueRT = new MapValueRunType();
    children = [this.keyRT, this.valueRT];
    constructorName = 'Map';
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
    getCustomVλl(comp: JitFnCompiler) {
        // fromJsonVal is decoding a regular array so no need to use an special case for vλl as other operations
        if (comp.fnID === JitFunctions.fromJsonVal.id)
            return {vλl: `it${comp.getNestLevel(this)}`, isStandalone: false, useArrayAccessor: true};
        // other operations use an special case for vλl where all parents are skipped
        return {vλl: `it${comp.getNestLevel(this)}`, isStandalone: true};
    }
}

export class MapKeyRunType extends GenericMemberRunType<any> {
    index = 0;
    getStaticPathLiteral(comp: JitFnCompiler): string | number {
        const parent = this.getParent()! as MapRunType;
        const custom = parent.getCustomVλl(comp)!;
        return `{key:utl.safeKey(${custom.vλl}[0]),index:${parent.getIndexVarName(comp)},failed:'mapKey'}`;
    }
    getCustomVλl(comp: JitFnCompiler) {
        // temp variable to assign mapKey
        if (comp.fnID === JitFunctions.fromBinary.id)
            return {vλl: getMapKeyName(comp.getNestLevel(this)), isStandalone: true, useArrayAccessor: false};
        return undefined;
    }
}

export class MapValueRunType extends GenericMemberRunType<any> {
    index = 1;
    getStaticPathLiteral(comp: JitFnCompiler): string | number {
        const parent = this.getParent()! as MapRunType;
        const custom = parent.getCustomVλl(comp)!;
        return `{key:utl.safeKey(${custom.vλl}[0]),index:${parent.getIndexVarName(comp)},failed:'mapVal'}`;
    }
    getCustomVλl(comp: JitFnCompiler) {
        // temp variable to assign mapKey
        if (comp.fnID === JitFunctions.fromBinary.id)
            return {vλl: `mpV${comp.getNestLevel(this)}`, isStandalone: true, useArrayAccessor: false};
        return undefined;
    }
    getMapKeyVλl(comp: JitFnCompiler) {
        return getMapKeyName(comp.getNestLevel(this));
    }
}

function getMapKeyName(nestLevel: number) {
    return `mpk${nestLevel}`;
}
