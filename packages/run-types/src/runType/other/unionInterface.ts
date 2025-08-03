/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {TypeObjectLiteral, TypeClass, TypeIntersection, ReflectionKind, TypeUnion, TypeProperty} from '@deepkit/type';
import type {Mutable, RunTypeChildAccessor, SrcType, jitCode} from '../../types';
import {toLiteral, arrayToArgumentsLiteral} from '../../lib/utils';
import {PropertyRunType} from '../member/property';
import {IndexSignatureRunType} from '../member/indexProperty';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import {InterfaceRunType} from '../collection/interface';
import {BaseRunType, MemberRunType} from '../../lib/baseRunTypes';
import {UnionRunType} from '../collection/union';
import {MethodRunType} from '../member/method';
import {MethodSignatureRunType} from '../member/methodSignature';

type anySrcInterface = TypeObjectLiteral | TypeClass | TypeIntersection;

// TODO: THIS IS A WORK IN PROGRESS, not used atm. need to investigate how to improve union isType and toJsonVal
// https://github.com/orgs/MionKit/projects/3/views/1?pane=issue&itemId=88057141

/** Merges multiple interfaces into one. */
export class UnionInterfaceRunType extends InterfaceRunType<anySrcInterface> {
    mergedInterfaces: InterfaceRunType[] = [];
    mergedProperties: Map<string | number, MemberRunType<any>> = new Map();
    getChildRunTypes = (): BaseRunType[] => {
        return Array.from(this.mergedProperties.values());
    };

    mergeInterface(Irt: InterfaceRunType): void {
        if (!(this as any).src) {
            (this as Mutable<UnionInterfaceRunType>).src = {...Irt.src};
            this.src.types = [];
            (this.src as Mutable<SrcType>)._rt = Irt;
        }
        Irt.getChildRunTypes().forEach((rt) => this.addProperty(rt as MemberRunType<any>));
        this.mergedInterfaces.push(Irt);
    }

    private addProperty(prop: MemberRunType<any>): void {
        const name = prop.src.name;
        const existingProp = this.mergedProperties.get(name);
        if (!existingProp) {
            this.mergedProperties.set(name, prop);
        } else if (existingProp.getTypeID() === prop.getTypeID()) {
            this.mergedProperties.set(name, existingProp);
        } else if (existingProp.src.isMergedProp) {
            const mergedUnion: TypeUnion = existingProp.src.type;
            mergedUnion.types.push(prop.src.type);
        } else {
            const memberA = prop.getMemberType();
            const memberB = existingProp.getMemberType();
            const newProp = this.getNewMergedProp(existingProp);
            const unionSrc = newProp.src.type as TypeUnion;
            unionSrc.types.push(memberA.src, memberB.src);

            this.mergedProperties.set(name, existingProp);
        }
    }

    private getNewMergedProp(prop: RunTypeChildAccessor): MemberRunType<TypeProperty> {
        let newProp: RunTypeChildAccessor | undefined;
        switch (true) {
            case prop instanceof PropertyRunType:
                newProp = new PropertyRunType();
                break;
            case prop instanceof IndexSignatureRunType:
                newProp = new IndexSignatureRunType();
                break;
            case prop instanceof MethodRunType:
                newProp = new MethodRunType();
                break;
            case prop instanceof MethodSignatureRunType:
                newProp = new MethodSignatureRunType();
                break;
            default:
                throw new Error('Unexpected prop type');
        }
        (newProp as Mutable<RunTypeChildAccessor>).src = {
            ...prop.src,
            _rt: newProp,
            isMergedProp: true,
            type: this.getNewUnionType(),
        } as any;
        return newProp as any;
    }

    private getNewUnionType(): TypeUnion {
        const unionRT: Mutable<UnionRunType> = new UnionRunType();
        const unionSrc = {
            isMergedUnion: true,
            kind: ReflectionKind.union,
            types: [],
            _rt: unionRT,
        } as SrcType<TypeUnion>;
        unionRT.src = unionSrc;
        return unionSrc;
    }

    private _compileIsTypeMergedChildren(comp: JitCompiler, rt: InterfaceRunType, skipExtraKeysCheck = false): string {
        const children = rt.getJitChildren(comp);
        if (!children.length) return '';
        const hasIndexProp = children.some((prop) => prop instanceof IndexSignatureRunType);
        const skip = hasIndexProp || skipExtraKeysCheck;
        const childrenNames = skip ? [] : children.map((prop) => (prop.src as TypeProperty).name);
        const keysID = skip ? '' : toLiteral(childrenNames.join(''));
        const noExtraKeys = skip
            ? ''
            : ` && !utl.objectHasExtraKeys(${keysID}, ${comp.vλl}, ${arrayToArgumentsLiteral(childrenNames)})`;
        const childJitCodes = children.map((prop) => prop.compileIsType(comp)).filter(Boolean);
        return `(${childJitCodes.map(c => c!.code).join(' && ')}${noExtraKeys})`;
    }

    // #### collection's jit code ####
    _compileIsType(comp: JitCompiler): jitCode {
        const varName = comp.vλl;
        const childCode = this.mergedInterfaces.length
            ? ` && (${this.mergedInterfaces.map((rt) => this._compileIsTypeMergedChildren(comp, rt)).join(' || ')})`
            : '';
        return {
            code: `(typeof ${varName} === 'object' && ${varName} !== null${childCode})`,
            codeType: 'E',
            skipJit: false
        };
    }
    _compileTypeErrors(comp: JitErrorsCompiler): jitCode {
        const varName = comp.vλl;
        const isTypeCode = this.compileIsType(comp);
        const childrenCode = this.mergedInterfaces.length ? `if (!${isTypeCode?.code}) ${comp.callJitErr(this)};` : '';
        return {
            code: `
                if (typeof ${varName} !== 'object' && ${varName} !== null) {
                    ${comp.callJitErr(this)};
                } else {
                    ${childrenCode}
                }
            `,
            codeType: 'S',
            skipJit: false,
            children: isTypeCode ? [isTypeCode] : []
        };
    }
    _compileToJsonVal(comp: JitCompiler): jitCode {
        const toJsonValMergedList = this.mergedInterfaces.filter((c) => c.compileToJsonVal(comp));
        if (!toJsonValMergedList.length) return undefined;
        const code = toJsonValMergedList
            .map((rt, i) => {
                const childIsType = this._compileIsTypeMergedChildren(comp, rt, true);
                const childCode = rt.compileToJsonVal(comp);
                const iF = i === 0 ? 'if' : 'else if';
                return `${iF} (${childIsType}) {${childCode?.code}}`;
            })
            .join('\n');
        return {
            code,
            codeType: 'S',
            skipJit: false
        };
    }
    _compileFromJsonVal(comp: JitCompiler): jitCode {
        const fromJsonValMergedList = this.mergedInterfaces.filter((c) => c.compileFromJsonVal(comp));
        if (!fromJsonValMergedList.length) return undefined;
        const code = fromJsonValMergedList
            .map((rt, i) => {
                const childIsType = this._compileIsTypeMergedChildren(comp, rt, true);
                const childCode = rt.compileFromJsonVal(comp);
                const iF = i === 0 ? 'if' : 'else if';
                return `${iF} (${childIsType}) {${childCode?.code}}`;
            })
            .join('\n');
        return {
            code,
            codeType: 'S',
            skipJit: false
        };
    }
}
