/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {SrcType} from '../../types';
import {ReflectionSubKind} from '../../constants.kind';
import {ReflectionKind, type TypeClass} from '@deepkit/type';
import {GenericMemberRunType} from '../member/genericMember';
import {IterableRunType} from './Iterable';
import {JitFunctions} from '../../constants.functions';
import type {JitFnCompiler} from '../../lib/jitFnCompiler';
export class SetRunType extends IterableRunType {
    keyRT = new SetKeyRunType();
    children = [this.keyRT];
    constructorName = 'Set';
    onCreated(src: SrcType<TypeClass>): void {
        const types = src.arguments;
        if (!types || types.length !== 1) throw new Error(`Set expects 1 type argument: ie: Set<number>`);
        super.onCreated(src);
        this.keyRT.onCreated({
            kind: ReflectionKind.parameter,
            parent: src,
            type: types[0],
            subKind: ReflectionSubKind.setItem,
        });
    }
    getCustomVλl(comp: JitFnCompiler) {
        // restoreFromJson is decoding a regular array so no need to use an special case for vλl as other operations
        if (comp.fnID === JitFunctions.restoreFromJson.id)
            return {vλl: `it${comp.getNestLevel(this)}`, isStandalone: false, useArrayAccessor: true};
        // other operations use an special case for vλl where all parents are skipped
        return {vλl: `it${comp.getNestLevel(this)}`, isStandalone: true};
    }
}

export class SetKeyRunType extends GenericMemberRunType<any> {
    index = 0;
    skipSettingAccessor() {
        return true;
    }
    getStaticPathLiteral(comp: JitFnCompiler): string {
        const parent = this.getParent()! as SetRunType;
        const custom = parent.getCustomVλl(comp)!;
        return `{key:utl.safeKey(${custom.vλl}),index:${parent.getIndexVarName(comp)}}`;
    }
    getCustomVλl(comp: JitFnCompiler) {
        if (comp.fnID === JitFunctions.fromBinary.id)
            return {vλl: `sK${comp.getNestLevel(this)}`, isStandalone: true, useArrayAccessor: false};
        // other operations use an special case for vλl where all parents are skipped
        return undefined;
    }
}
