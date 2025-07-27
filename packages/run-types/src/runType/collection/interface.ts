/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {TypeObjectLiteral, TypeClass, TypeIntersection, ReflectionKind} from '@deepkit/type';
import type {jitCode} from '../../types';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import {arrayToLiteral, getJitFnArgCallVarName, memorize, sortDiscriminatorsFirst} from '../../lib/utils';
import {PropertyRunType} from '../member/property';
import {BaseRunType, CollectionRunType, MemberRunType} from '../../lib/baseRunTypes';
import {MethodSignatureRunType} from '../member/methodSignature';
import {IndexSignatureRunType} from '../member/indexProperty';
import {MethodRunType} from '../member/method';
import {CallSignatureRunType} from '../member/callSignature';
import {JitFunctions} from '@mionkit/run-types/src/constants.functions';

export type InterfaceMember =
    | PropertyRunType
    | MethodSignatureRunType
    | IndexSignatureRunType
    | MethodRunType
    | CallSignatureRunType;

export class InterfaceRunType<
    T extends TypeObjectLiteral | TypeClass | TypeIntersection = TypeObjectLiteral,
> extends CollectionRunType<T> {
    getNamedChildren(comp: JitCompiler): InterfaceMember[] {
        return this.getJitChildren(comp).filter((prop) => !!(prop.src as any).name) as InterfaceMember[];
    }

    isCallable(): boolean {
        return this.getCallSignature() !== undefined;
    }

    getCallSignature = memorize((): CallSignatureRunType | undefined => {
        return this.getChildRunTypes().find((prop) => prop.src.kind === ReflectionKind.callSignature) as CallSignatureRunType;
    });

    getJitChildren(comp: JitCompiler): InterfaceMember[] {
        const children = super.getJitChildren(comp) as InterfaceMember[];
        return children.toSorted((a, b) => sortDiscriminatorsFirst(a, b)) as InterfaceMember[];
    }
    isPartOfUnion(): boolean {
        return this.getParent()?.src.kind === ReflectionKind.union;
    }

    // #### collection's jit code ####

    _compileIsType(comp: JitCompiler): jitCode {
        const varName = comp.vλl;
        const children = this.getJitChildren(comp);
        const childrenCode = children
            .map((prop) => prop.compileIsType(comp))
            .filter(Boolean)
            .join(' && ');
        if (this.isCallable()) return [this.getCallSignature()!._compileIsType(comp), childrenCode].filter(Boolean).join(' && ');
        const objectCheck = this.isPartOfUnion() ? '' : `typeof ${varName} === 'object' && ${varName} !== null`;
        const itemsCode = [objectCheck, this.allOptionalCode(comp), childrenCode].filter(Boolean).join(' && ');
        return `(${itemsCode})`;
    }

    _compileTypeErrors(comp: JitErrorsCompiler): jitCode {
        const varName = comp.vλl;
        const children = this.getJitChildren(comp);
        const childrenCode = children
            .map((prop) => prop.compileTypeErrors(comp))
            .filter(Boolean)
            .join(';');
        if (this.isCallable()) {
            return `${this.getCallSignature()!._compileTypeErrors(comp)} else {${childrenCode}}`;
        }
        const objectCheck = this.isPartOfUnion() ? '' : `typeof ${varName} === 'object' && ${varName} !== null`;
        const isObjectCode = [objectCheck, this.allOptionalCode(comp)].filter(Boolean).join(' && ');
        return `
            if (!(${isObjectCode})) {
                ${comp.callJitErr(this)};
            } else {
                ${childrenCode}
            }
        `;
    }
    _compileToJsonVal(comp: JitCompiler): jitCode {
        if (this.isCallable()) return this.getCallSignature()!._compileToJsonVal();
        const children = this.getJitChildren(comp);
        const childrenCode = children
            .map((prop) => prop.compileToJsonVal(comp))
            .filter(Boolean)
            .join(';');
        return childrenCode || undefined;
    }
    _compileFromJsonVal(comp: JitCompiler): jitCode {
        if (this.isCallable()) return this.getCallSignature()!._compileFromJsonVal();
        const children = this.getJitChildren(comp);
        const childrenCode = children
            .map((prop) => prop.compileFromJsonVal(comp))
            .filter(Boolean)
            .join(';');
        return childrenCode || undefined;
    }
    _compileHasUnknownKeys(comp: JitCompiler, children?: BaseRunType[]): jitCode {
        const jitChildren = children || this.getJitChildren(comp);
        const allChildren = this.getChildRunTypes().filter((prop) => prop.src.kind !== ReflectionKind.indexSignature);
        const parentCode = callCheckUnknownProperties(this, comp, jitChildren, false, !this.isPartOfUnion(), allChildren);
        const childrenCode = super._compileHasUnknownKeys(comp);
        return [parentCode, childrenCode].filter(Boolean).join(' || ');
    }
    _compileUnknownKeyErrors(comp: JitErrorsCompiler): jitCode {
        const jitChildren = this.getJitChildren(comp);
        const allChildren = this.getChildRunTypes().filter((prop) => prop.src.kind !== ReflectionKind.indexSignature);
        const unknownVar = `unk${comp.getNestLevel(this)}`;
        const keyVar = `ky${comp.getNestLevel(this)}`;
        const unknownValue = callCheckUnknownProperties(this, comp, jitChildren, true, !this.isPartOfUnion(), allChildren);
        const parentCode = `
            const ${unknownVar} = ${unknownValue};
            if (${unknownVar}) {for (const ${keyVar} of ${unknownVar}) {${comp.callJitErrWithPath('never', keyVar)}}}
        `;
        const childrenCode = super._compileUnknownKeyErrors(comp);
        return [unknownValue ? parentCode : '', childrenCode].filter(Boolean).join('\n');
    }
    _compileStripUnknownKeys(comp: JitCompiler): jitCode {
        const jitChildren = this.getJitChildren(comp);
        const unknownVar = `unk${comp.getNestLevel(this)}`;
        const keyVar = `ky${comp.getNestLevel(this)}`;
        const unknownValue = callCheckUnknownProperties(this, comp, jitChildren, true, !this.isPartOfUnion());
        const parentCode = `
            const ${unknownVar} = ${unknownValue};
            if (${unknownVar}) {for (const ${keyVar} of ${unknownVar}){delete ${comp.vλl}[${keyVar}]}}
        `;
        const childrenCode = super._compileStripUnknownKeys(comp);
        return [unknownValue ? parentCode : '', childrenCode].filter(Boolean).join('\n');
    }
    _compileUnknownKeysToUndefined(comp: JitCompiler): jitCode {
        const jitChildren = this.getJitChildren(comp);
        const unknownVar = `unk${comp.getNestLevel(this)}`;
        const keyVar = `ky${comp.getNestLevel(this)}`;
        const unknownValue = callCheckUnknownProperties(this, comp, jitChildren, true, !this.isPartOfUnion());
        const parentCode = `
            const ${unknownVar} = ${unknownValue};
            if (${unknownVar}) {for (const ${keyVar} of ${unknownVar}){${comp.vλl}[${keyVar}] = undefined}}
        `;
        const childrenCode = super._compileUnknownKeysToUndefined(comp);
        return [unknownValue ? parentCode : '', childrenCode].filter(Boolean).join('\n');
    }

    // In order to json stringify to work properly optional properties must come first
    getJsonStringifySortedChildren(comp: JitCompiler): MemberRunType<any>[] {
        return this.getJitChildren(comp).toSorted((a, b) => {
            const aOptional = a instanceof MemberRunType && a.isOptional();
            const bOptional = b instanceof MemberRunType && b.isOptional();
            if (aOptional && !bOptional) return -1;
            if (!aOptional && bOptional) return 1;
            return 0;
        }) as MemberRunType<any>[];
    }

    // extra check to prevent empty array passing as object where all properties are optional
    // when this check is disabled empty array will pass as object but fail when checking for properties
    allOptionalCode(comp: JitCompiler): string {
        const children = this.getJitChildren(comp);
        if (children.length !== 0 && !this.areAllChildrenOptional(children)) return '';
        const isNotArray = `!Array.isArray(${comp.vλl})`;
        const ifNoNative = `Object.prototype.toString.call(${comp.vλl}) === '[object Object]'`;
        return `(${isNotArray} && ${ifNoNative})`;
    }
}

export function callCheckUnknownProperties(
    rt: InterfaceRunType<any>,
    comp: JitCompiler,
    jitChildrenRunTypes: BaseRunType[],
    returnKeys: boolean,
    checkObject = true,
    allChildrenRuntypes?: BaseRunType[]
): string {
    const jitArrNames = jitChildrenRunTypes.filter((prop) => !!(prop.src as any).name).map((prop) => (prop.src as any).name);
    const AllArrNames = allChildrenRuntypes?.filter((prop) => !!(prop.src as any).name).map((prop) => (prop.src as any).name);
    const jitChildrenNames = Array.from(new Set(jitArrNames));
    const allChildrenNames = Array.from(new Set(AllArrNames));
    const isSameLength = jitChildrenNames.length === allChildrenNames.length;
    const isSameSet = isSameLength && jitChildrenNames.every((v) => allChildrenNames.includes(v));
    const hasNonJitChildren = !(isSameLength && isSameSet);
    if (jitChildrenNames.length === 0 && allChildrenNames.length === 0) return '';
    const keysName = `k_${rt.getJitHash(comp.opts)}`;
    const allKeysName = `kA_${rt.getJitHash(comp.opts)}`;
    const objectCheckCode = checkObject ? [`typeof ${comp.vλl} === 'object'`, `${comp.vλl} !== null`] : [];

    comp.setContextItem(keysName, `const ${keysName} = ${arrayToLiteral(jitChildrenNames)}`);
    if (hasNonJitChildren) comp.setContextItem(allKeysName, `const ${allKeysName} = ${arrayToLiteral(allChildrenNames)}`);
    const checkPropName = JitFunctions.hasUnknownKeys.runTimeOptions.checkNonJitProps.keyName;
    const optsVarName = getJitFnArgCallVarName(comp, rt, JitFunctions.hasUnknownKeys.id, 'θpts');
    const conditional =
        allChildrenRuntypes?.length && hasNonJitChildren
            ? `${optsVarName}.${checkPropName} ? ${allKeysName} : ${keysName}`
            : keysName;
    if (returnKeys) return `utl.getUnknownKeysFromArray(${comp.vλl}, ${conditional})`;
    objectCheckCode.push(`utl.hasUnknownKeysFromArray(${comp.vλl}, ${conditional})`);
    const filtered = objectCheckCode.filter(Boolean);
    if (filtered.length > 1) return `(${filtered.join(' && ')})`;
    return filtered[0];
}
