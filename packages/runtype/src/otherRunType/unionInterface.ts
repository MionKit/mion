/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {
    TypeObjectLiteral,
    TypeClass,
    TypeIntersection,
    ReflectionKind,
    TypeUnion,
    TypeProperty,
} from '../_deepkit/src/reflection/type';
import {DKwithRT, MockOperation, Mutable, RunTypeChildAccessor} from '../types';
import {getJitErrorPath, getExpected, toLiteral, arrayToArgumentsLiteral} from '../utils';
import {PropertyRunType} from '../memberRunType/property';
import {IndexSignatureRunType} from '../memberRunType/indexProperty';
import type {JitCompiler, JitErrorsCompiler} from '../jitCompiler';
import {InterfaceRunType} from '../collectionRunType/interface';
import {BaseRunType, MemberRunType} from '../baseRunTypes';
import {UnionRunType} from '../collectionRunType/union';
import {MethodRunType} from '../memberRunType/method';
import {MethodSignatureRunType} from '../memberRunType/methodSignature';

type anySrcInterface = TypeObjectLiteral | TypeClass | TypeIntersection;

/** Merges multiple interfaces into one. */
export class UnionInterfaceRunType extends InterfaceRunType<anySrcInterface> {
    src = null as any; // will be set after construction

    mergedInterfaces: InterfaceRunType[] = [];
    mergedProperties: Map<string | number, MemberRunType<any>> = new Map();
    getChildRunTypes = (): BaseRunType[] => {
        return Array.from(this.mergedProperties.values());
    };

    mergeInterface(Irt: InterfaceRunType): void {
        if (!this.src) {
            this.src = {...Irt.src} as TypeObjectLiteral;
            this.src.types = [];
            (this.src as DKwithRT)._rt = Irt;
        }
        Irt.getChildRunTypes().forEach((rt) => this.addProperty(rt as MemberRunType<any>));
        this.mergedInterfaces.push(Irt);
    }

    private addProperty(prop: MemberRunType<any>): void {
        const name = prop.src.name;
        const existingProp = this.mergedProperties.get(name);
        if (!existingProp) {
            this.mergedProperties.set(name, prop);
        } else if (existingProp.getJitId() === prop.getJitId()) {
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
        const unionRT = new UnionRunType();
        const unionSrc = {
            isMergedUnion: true,
            kind: ReflectionKind.union,
            types: [],
            _rt: unionRT,
        } as TypeUnion;
        unionRT.src = unionSrc;
        return unionSrc;
    }

    private _compileIsTypeMergedChildren(comp: JitCompiler, rt: InterfaceRunType, skipExtraKeysCheck = false): string {
        const children = rt.getJitChildren();
        if (!children.length) return '';
        const hasIndexProp = children.some((prop) => prop instanceof IndexSignatureRunType);
        const skip = hasIndexProp || skipExtraKeysCheck;
        const childrenNames = skip ? [] : children.map((prop) => (prop.src as TypeProperty).name);
        const keysID = skip ? '' : toLiteral(childrenNames.join(''));
        const noExtraKeys = skip
            ? ''
            : ` && !utl.objectHasExtraKeys(${keysID}, ${comp.vλl}, ${arrayToArgumentsLiteral(childrenNames)})`;
        return `(${children.map((prop) => prop.compileIsType(comp)).join(' && ')}${noExtraKeys})`;
    }

    // #### collection's jit code ####
    _compileIsType(comp: JitCompiler): string {
        const varName = comp.vλl;
        const childCode = this.mergedInterfaces.length
            ? ` && (${this.mergedInterfaces.map((rt) => this._compileIsTypeMergedChildren(comp, rt)).join(' || ')})`
            : '';
        return `(typeof ${varName} === 'object' && ${varName} !== null${childCode})`;
    }
    _compileTypeErrors(comp: JitErrorsCompiler): string {
        const varName = comp.vλl;
        const parentPath = getJitErrorPath(comp);
        const childrenCode = this.mergedInterfaces.length
            ? `if (!${this.compileIsType(comp)}) utl.err(${comp.args.εrr},${parentPath},${getExpected(this)});`
            : '';
        return `
            if (typeof ${varName} !== 'object' && ${varName} !== null) {
                utl.err(${comp.args.εrr},${parentPath},${getExpected(this)});
            } else {
                ${childrenCode}
            }
        `;
    }
    _compileJsonEncode(comp: JitCompiler): string {
        const jsonEncodedMergedList = this.mergedInterfaces.filter(
            (c) => !c.getJitConstants().skipJit && !c.getJitConstants().skipJsonEncode
        );
        return jsonEncodedMergedList.length
            ? jsonEncodedMergedList
                  .map((rt, i) => {
                      const childIsType = this._compileIsTypeMergedChildren(comp, rt, true);
                      const childCode = rt.compileJsonEncode(comp);
                      const iF = i === 0 ? 'if' : 'else if';
                      return `${iF} (${childIsType}) {${childCode}}`;
                  })
                  .join('\n')
            : '';
    }
    _compileJsonDecode(comp: JitCompiler): string {
        const jsonDecodedMergedList = this.mergedInterfaces.filter(
            (c) => !c.getJitConstants().skipJit && !c.getJitConstants().skipJsonDecode
        );
        return jsonDecodedMergedList.length
            ? jsonDecodedMergedList
                  .map((rt, i) => {
                      const childIsType = this._compileIsTypeMergedChildren(comp, rt, true);
                      const childCode = rt.compileJsonDecode(comp);
                      const iF = i === 0 ? 'if' : 'else if';
                      return `${iF} (${childIsType}) {${childCode}}`;
                  })
                  .join('\n')
            : '';
    }
    _compileJsonStringify(comp: JitCompiler): string {
        const children = this.getJitChildren();
        const childrenCode = children.map((prop) => prop.compileJsonStringify(comp)).join('+');
        return `'{'+${childrenCode}+'}'`;

        // const jsonEncodedMergedList = this.mergedInterfaces.filter(
        //     (c) => !c.getJitConstants().skipJit && !c.getJitConstants().skipJsonEncode
        // );
        // return jsonEncodedMergedList.length
        //     ? jsonEncodedMergedList
        //           .map((rt, i) => {
        //               const childIsType = this._compileIsTypeMergedChildren(comp, rt, true);
        //               const childCode = rt.compileJsonEncode(comp);
        //               const iF = i === 0 ? 'if' : 'else if';
        //               return `${iF} (${childIsType}) {${childCode}}`;
        //           })
        //           .join('\n')
        //     : '';
    }

    _mock(ctx: Pick<MockOperation, 'parentObj'>): Record<string | number, any> {
        const obj: Record<string | number, any> = ctx?.parentObj || {};
        this.getChildRunTypes().forEach((prop) => {
            const name = (prop as PropertyRunType).getChildVarName();
            if (prop instanceof IndexSignatureRunType) prop.mock(ctx);
            else obj[name] = prop.mock(ctx as MockOperation);
        });
        return obj;
    }
}
