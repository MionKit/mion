/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {TypeObjectLiteral, TypeClass, TypeIntersection, ReflectionKind} from '@deepkit/type';
import type {JitCode} from '../../types';
import type {JitFnCompiler, JitErrorsFnCompiler} from '../../lib/jitFnCompiler';
import {arrayToLiteral, getJitFnArgCallVarName, memorize, sortDiscriminatorsFirst} from '../../lib/utils';
import {PropertyRunType} from '../member/property';
import {BaseRunType, CollectionRunType, MemberRunType} from '../../lib/baseRunTypes';
import {MethodSignatureRunType} from '../member/methodSignature';
import {IndexSignatureRunType} from '../member/indexProperty';
import {MethodRunType} from '../member/method';
import {CallSignatureRunType} from '../member/callSignature';
import {JitFunctions} from '../../constants.functions';
import {isIndexSignatureRunType} from '../../lib/guards';

export type InterfaceMember =
    | PropertyRunType
    | MethodSignatureRunType
    | IndexSignatureRunType
    | MethodRunType
    | CallSignatureRunType;

export class InterfaceRunType<
    T extends TypeObjectLiteral | TypeClass | TypeIntersection = TypeObjectLiteral,
> extends CollectionRunType<T> {
    getNamedChildren(comp: JitFnCompiler): InterfaceMember[] {
        return this.getJitChildren(comp).filter((prop) => !!(prop.src as any).name) as InterfaceMember[];
    }

    isCallable(): boolean {
        return this.getCallSignature() !== undefined;
    }

    getCallSignature = memorize((): CallSignatureRunType | undefined => {
        return this.getChildRunTypes().find((prop) => prop.src.kind === ReflectionKind.callSignature) as CallSignatureRunType;
    });

    getJitChildren(comp: JitFnCompiler): InterfaceMember[] {
        const children = super.getJitChildren(comp) as InterfaceMember[];
        return children.toSorted((a, b) => sortDiscriminatorsFirst(a, b)) as InterfaceMember[];
    }
    /** Split children in two groups: required and optional */
    splitJitSplitChildren(comp: JitFnCompiler): {
        /** all required properties */
        required: PropertyRunType[];
        /** all optional properties */
        optional: PropertyRunType[];
        /** all index signatures */
        indexSignatures: IndexSignatureRunType[];
    } {
        const children = super.getJitChildren(comp) as InterfaceMember[];
        const required = children.filter((prop) => !prop.isOptional()) as PropertyRunType[];
        const optional = children.filter((prop) => prop.isOptional() && !isIndexSignatureRunType(prop)) as PropertyRunType[];
        const indexSignatures = children.filter((prop) => isIndexSignatureRunType(prop)) as IndexSignatureRunType[];
        return {required, optional, indexSignatures};
    }
    isPartOfUnion(): boolean {
        return this.getParent()?.src.kind === ReflectionKind.union;
    }
    hasIndexSignature(comp: JitFnCompiler): boolean {
        return this.getJitChildren(comp).some((prop) => isIndexSignatureRunType(prop));
    }

    // #### collection's jit code ####

    emitIsType(comp: JitFnCompiler): JitCode {
        const varName = comp.vλl;
        const children = this.getJitChildren(comp);
        const childrenCode = children
            .map((prop) => comp.compileIsType(prop, 'E').code)
            .filter(Boolean)
            .join(' && ');
        if (this.isCallable())
            return {
                code: [this.getCallSignature()!.emitIsType(comp).code, childrenCode].filter(Boolean).join(' && '),
                type: 'E',
            };
        const objectCheck = this.isPartOfUnion() ? '' : `typeof ${varName} === 'object' && ${varName} !== null`;
        const itemsCode = [objectCheck, this.allOptionalCode(comp), childrenCode].filter(Boolean).join(' && ');
        return {code: `(${itemsCode})`, type: 'E'};
    }

    emitTypeErrors(comp: JitErrorsFnCompiler): JitCode {
        const varName = comp.vλl;
        const children = this.getJitChildren(comp);
        const childrenCode = children
            .map((prop) => comp.compileTypeErrors(prop, 'S').code)
            .filter(Boolean)
            .join(';');
        if (this.isCallable()) {
            return {code: `${this.getCallSignature()!.emitTypeErrors(comp).code} else {${childrenCode}}`, type: 'S'};
        }
        const objectCheck = this.isPartOfUnion() ? '' : `typeof ${varName} === 'object' && ${varName} !== null`;
        const isObjectCode = [objectCheck, this.allOptionalCode(comp)].filter(Boolean).join(' && ');
        return {
            code: `
            if (!(${isObjectCode})) {
                ${comp.callJitErr(this)};
            } else {
                ${childrenCode}
            }
        `,
            type: 'S',
        };
    }
    emitPrepareForJson(comp: JitFnCompiler): JitCode {
        if (this.isCallable()) return this.getCallSignature()!.emitPrepareForJson();
        const children = this.getJitChildren(comp);
        const childrenCode = children
            .map((prop) => comp.compilePrepareForJson(prop, 'S').code)
            .filter(Boolean)
            .join(';');
        return {code: childrenCode, type: 'S'};
    }
    emitRestoreFromJson(comp: JitFnCompiler): JitCode {
        if (this.isCallable()) return this.getCallSignature()!.emitRestoreFromJson();
        const children = this.getJitChildren(comp);
        const childrenCode = children
            .map((prop) => comp.compileRestoreFromJson(prop, 'S').code)
            .filter(Boolean)
            .join(';');
        return {code: childrenCode, type: 'S'};
    }
    emitHasUnknownKeys(comp: JitFnCompiler): JitCode {
        const children = this.getJitChildren(comp);
        const allChildren = this.getChildRunTypes().filter((prop) => !isIndexSignatureRunType(prop));
        const hasIndexProp = children.some((prop) => isIndexSignatureRunType(prop));
        const parentCode = hasIndexProp
            ? ''
            : callCheckUnknownProperties(this, comp, children, false, !this.isPartOfUnion(), allChildren);
        const childrenCode = super.emitHasUnknownKeys(comp).code;
        return {code: [parentCode, childrenCode].filter(Boolean).join(' || '), type: 'E'};
    }
    emitUnknownKeyErrors(comp: JitErrorsFnCompiler): JitCode {
        const children = this.getJitChildren(comp);
        const allChildren = this.getChildRunTypes().filter((prop) => !isIndexSignatureRunType(prop));
        const hasIndexProp = children.some((prop) => isIndexSignatureRunType(prop));
        const unknownVar = `unk${comp.getNestLevel(this)}`;
        const keyVar = `ky${comp.getNestLevel(this)}`;
        const unknownValue = hasIndexProp
            ? undefined
            : callCheckUnknownProperties(this, comp, children, true, !this.isPartOfUnion(), allChildren);
        const parentCode = `
            const ${unknownVar} = ${unknownValue};
            if (${unknownVar}) {for (const ${keyVar} of ${unknownVar}) {${comp.callJitErrWithPath('never', keyVar)}}}
        `;
        const childrenCode = super.emitUnknownKeyErrors(comp).code;
        return {code: [unknownValue ? parentCode : '', childrenCode].filter(Boolean).join('\n'), type: 'S'};
    }
    emitStripUnknownKeys(comp: JitFnCompiler): JitCode {
        const children = this.getJitChildren(comp);
        const unknownVar = `unk${comp.getNestLevel(this)}`;
        const keyVar = `ky${comp.getNestLevel(this)}`;
        const hasIndexProp = children.some((prop) => isIndexSignatureRunType(prop));
        const unknownValue = hasIndexProp
            ? undefined
            : callCheckUnknownProperties(this, comp, children, true, !this.isPartOfUnion());
        const parentCode = `
            const ${unknownVar} = ${unknownValue};
            if (${unknownVar}) {for (const ${keyVar} of ${unknownVar}){delete ${comp.vλl}[${keyVar}]}}
        `;
        const childrenCode = super.emitStripUnknownKeys(comp).code;
        return {code: [unknownValue ? parentCode : '', childrenCode].filter(Boolean).join('\n'), type: 'S'};
    }
    emitUnknownKeysToUndefined(comp: JitFnCompiler): JitCode {
        const children = this.getJitChildren(comp);
        const unknownVar = `unk${comp.getNestLevel(this)}`;
        const keyVar = `ky${comp.getNestLevel(this)}`;
        const hasIndexProp = children.some((prop) => isIndexSignatureRunType(prop));
        const unknownValue = hasIndexProp
            ? undefined
            : callCheckUnknownProperties(this, comp, children, true, !this.isPartOfUnion());
        const parentCode = `
            const ${unknownVar} = ${unknownValue};
            if (${unknownVar}) {for (const ${keyVar} of ${unknownVar}){${comp.vλl}[${keyVar}] = undefined}}
        `;
        const childrenCode = super.emitUnknownKeysToUndefined(comp).code;
        return {code: [unknownValue ? parentCode : '', childrenCode].filter(Boolean).join('\n'), type: 'S'};
    }

    // In order to json stringify to work properly optional properties must come first
    getJsonStringifySortedChildren(comp: JitFnCompiler): MemberRunType<any>[] {
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
    allOptionalCode(comp: JitFnCompiler): string {
        const children = this.getJitChildren(comp);
        if (children.length !== 0 && !this.areAllChildrenOptional(children)) return '';
        const isNotArray = `!Array.isArray(${comp.vλl})`;
        const ifNoNative = `Object.prototype.toString.call(${comp.vλl}) === '[object Object]'`;
        return `(${isNotArray} && ${ifNoNative})`;
    }

    addObjectPropsToContext(comp: JitFnCompiler, jitChildrenRunTypes?: BaseRunType[], allChildrenRuntypes?: BaseRunType[]) {
        const children = jitChildrenRunTypes || this.getJitChildren(comp);
        const allChildren = allChildrenRuntypes || this.getChildRunTypes();
        return addObjectPropsToContext(this, comp, children, allChildren);
    }
}

export interface ObjectPropsContextResult {
    keysName: string;
    allKeysName: string;
    hasNonJitChildren: boolean;
    jitChildrenNames: string[];
    allChildrenNames: string[];
}

/**
 * Extracts object property names and adds them to the JIT compiler context.
 */
function addObjectPropsToContext(
    rt: InterfaceRunType<any>,
    comp: JitFnCompiler,
    jitChildrenRunTypes: BaseRunType[],
    allChildrenRuntypes?: BaseRunType[]
): ObjectPropsContextResult {
    const jitArrNames = jitChildrenRunTypes.filter((prop) => !!(prop.src as any).name).map((prop) => (prop.src as any).name);
    const AllArrNames = allChildrenRuntypes?.filter((prop) => !!(prop.src as any).name).map((prop) => (prop.src as any).name);
    const jitChildrenNames = Array.from(new Set(jitArrNames));
    const allChildrenNames = Array.from(new Set(AllArrNames));
    const isSameLength = jitChildrenNames.length === allChildrenNames.length;
    const isSameSet = isSameLength && jitChildrenNames.every((v) => allChildrenNames.includes(v));
    const hasNonJitChildren = !(isSameLength && isSameSet);
    const keysName = `k_${rt.getJitHash(comp.opts)}`;
    const allKeysName = `kA_${rt.getJitHash(comp.opts)}`;

    comp.setContextItem(keysName, `const ${keysName} = ${arrayToLiteral(jitChildrenNames)}`);
    if (hasNonJitChildren) comp.setContextItem(allKeysName, `const ${allKeysName} = ${arrayToLiteral(allChildrenNames)}`);

    return {
        keysName,
        allKeysName,
        hasNonJitChildren,
        jitChildrenNames,
        allChildrenNames,
    };
}

// TODO: look like some of this logic should be moved to index prop ? Also the runtime
function callCheckUnknownProperties(
    rt: InterfaceRunType<any>,
    comp: JitFnCompiler,
    jitChildrenRunTypes: BaseRunType[],
    returnKeys: boolean,
    checkObject = true,
    allChildrenRuntypes?: BaseRunType[]
): string {
    const result = addObjectPropsToContext(rt, comp, jitChildrenRunTypes, allChildrenRuntypes);

    if (result.jitChildrenNames.length === 0 && result.allChildrenNames.length === 0) return '';

    const objectCheckCode = checkObject ? [`typeof ${comp.vλl} === 'object'`, `${comp.vλl} !== null`] : [];
    const checkPropName = JitFunctions.hasUnknownKeys.runTimeOptions.checkNonJitProps.keyName;
    const optsVarName = getJitFnArgCallVarName(comp, rt, JitFunctions.hasUnknownKeys.id, 'θpts');
    const conditional =
        allChildrenRuntypes?.length && result.hasNonJitChildren
            ? `${optsVarName}.${checkPropName} ? ${result.allKeysName} : ${result.keysName}`
            : result.keysName;
    if (returnKeys) return `utl.getUnknownKeysFromArray(${comp.vλl}, ${conditional})`;
    objectCheckCode.push(`utl.hasUnknownKeysFromArray(${comp.vλl}, ${conditional})`);
    const filtered = objectCheckCode.filter(Boolean);
    if (filtered.length > 1) return `(${filtered.join(' && ')})`;
    return filtered[0];
}
