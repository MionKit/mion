/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {SrcType} from '../../types.ts';
import {GenericMemberRunType} from '../member/genericMember.ts';
import {ReflectionSubKind} from '../../constants.kind.ts';
import {ReflectionKind, TypeClass} from '@deepkit/type';
import {IterableRunType} from './Iterable.ts';
import {JitFunctions} from '../../constants.functions.ts';
import type {JitFnCompiler} from '../../lib/jitFnCompiler.ts';
import {safeIterableKey} from '../../run-types-pure-fns.ts';

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
        // restoreFromJson is decoding a regular array so no need to use an special case for vλl as other operations
        if (comp.fnID === JitFunctions.restoreFromJson.id)
            return {vλl: comp.getLocalVarName('it', this), isStandalone: false, useArrayAccessor: true};
        // other operations use an special case for vλl where all parents are skipped
        return {vλl: comp.getLocalVarName('it', this), isStandalone: true};
    }
    getMapKeyVλl(comp: JitFnCompiler) {
        return comp.getLocalVarName('mpk', this);
    }
    getMapValueVλl(comp: JitFnCompiler) {
        return comp.getLocalVarName('mpV', this);
    }
}

class MapKeyRunType extends GenericMemberRunType<any> {
    index = 0;
    getStaticPathLiteral(comp: JitFnCompiler): string | number {
        const parent = this.getParent()! as MapRunType;
        const custom = parent.getCustomVλl(comp)!;
        const safeKeyFn = comp.addPureFunction('mion', safeIterableKey);
        return `{key:${safeKeyFn}(${custom.vλl}[0]),index:${parent.getIndexVarName(comp)},failed:'mapKey'}`;
    }
    getCustomVλl(comp: JitFnCompiler) {
        // temp variable to assign mapKey
        if (comp.fnID === JitFunctions.fromBinary.id)
            return {
                vλl: (this.getParent()! as MapRunType).getMapKeyVλl(comp),
                isStandalone: true,
                useArrayAccessor: false,
            };
        return undefined;
    }
}

class MapValueRunType extends GenericMemberRunType<any> {
    index = 1;
    getStaticPathLiteral(comp: JitFnCompiler): string | number {
        const parent = this.getParent()! as MapRunType;
        const custom = parent.getCustomVλl(comp)!;
        const safeKeyFn = comp.addPureFunction('mion', safeIterableKey);
        return `{key:${safeKeyFn}(${custom.vλl}[0]),index:${parent.getIndexVarName(comp)},failed:'mapVal'}`;
    }
    getCustomVλl(comp: JitFnCompiler) {
        // temp variable to assign mapKey
        if (comp.fnID === JitFunctions.fromBinary.id)
            return {
                vλl: (this.getParent()! as MapRunType).getMapValueVλl(comp),
                isStandalone: true,
                useArrayAccessor: false,
            };
        return undefined;
    }
}
