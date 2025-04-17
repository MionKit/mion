/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {TypeObjectLiteral, TypeClass, TypeIntersection, TypeProperty, ReflectionKind} from '@deepkit/type';
import {RunType, jitCode} from '../../types';
import {memorize, arrayToLiteral} from '../../lib/utils';
import {PropertyRunType} from '../member/property';
import {CollectionRunType, MemberRunType} from '../../lib/baseRunTypes';
import {MethodSignatureRunType} from '../member/methodSignature';
import {IndexSignatureRunType} from '../member/indexProperty';
import {MethodRunType} from '../member/method';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import {CallSignatureRunType} from '../member/callSignature';
import {minKeysForSet} from '../../constants';

export type InterfaceMember =
    | PropertyRunType
    | MethodSignatureRunType
    | IndexSignatureRunType
    | MethodRunType
    | CallSignatureRunType;

export class InterfaceRunType<
    T extends TypeObjectLiteral | TypeClass | TypeIntersection = TypeObjectLiteral,
> extends CollectionRunType<T> {
    areAllChildrenOptional?: boolean;

    getNamedChildren(comp: JitCompiler): InterfaceMember[] {
        return this.getJitChildren(comp).filter((prop) => !!(prop.src as any).name) as InterfaceMember[];
    }

    isCallable(): boolean {
        return this.getCallSignature() !== undefined;
    }

    getCallSignature = memorize((): CallSignatureRunType | undefined => {
        return this.getChildRunTypes().find((prop) => prop.src.kind === ReflectionKind.callSignature) as CallSignatureRunType;
    });

    // #### collection's jit code ####

    _compileIsType(comp: JitCompiler): jitCode {
        const varName = comp.vλl;
        const children = this.getJitChildren(comp);
        const childrenCode = children.length ? `&& ${children.map((prop) => prop.compileIsType(comp)).join(' && ')}` : '';
        if (this.isCallable()) return `${this.getCallSignature()!._compileIsType(comp)} ${childrenCode}`;
        const arrayCheck = this.getArrayCheck(comp);
        return `(typeof ${varName} === 'object' && ${varName} !== null ${childrenCode} ${arrayCheck})`;
    }
    _compileTypeErrors(comp: JitErrorsCompiler): jitCode {
        const varName = comp.vλl;
        const children = this.getJitChildren(comp);
        const childrenCode = children.length ? children.map((prop) => prop.compileTypeErrors(comp)).join(';') : '';
        const arrayCheck = this.getArrayCheck(comp);
        if (this.isCallable()) {
            return `${this.getCallSignature()!._compileTypeErrors(comp)} else {${childrenCode}}`;
        }
        return `
            if (typeof ${varName} !== 'object' || ${varName} === null ${arrayCheck}) {
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
    _compileHasUnknownKeys(comp: JitCompiler): jitCode {
        const allJitChildren = this.getJitChildren(comp);
        const parentCode = this.callCheckUnknownProperties(comp, allJitChildren, false);
        const childrenCode = super._compileHasUnknownKeys(comp);
        return childrenCode ? `${parentCode} || ${childrenCode}` : parentCode;
    }
    _compileUnknownKeyErrors(comp: JitErrorsCompiler): jitCode {
        const allJitChildren = this.getJitChildren(comp);
        const unknownVar = `unk${this.getNestLevel()}`;
        const keyVar = `ky${this.getNestLevel()}`;
        const parentCode = `
            const ${unknownVar} = ${this.callCheckUnknownProperties(comp, allJitChildren, true)};
            if (${unknownVar}) {for (const ${keyVar} of ${unknownVar}) {${comp.callJitErrWithPath('never', keyVar)}}}
        `;
        const childrenCode = super._compileUnknownKeyErrors(comp);
        return childrenCode ? `${parentCode}\n${childrenCode}` : parentCode;
    }
    _compileStripUnknownKeys(comp: JitCompiler): jitCode {
        const allJitChildren = this.getJitChildren(comp);
        const unknownVar = `unk${this.getNestLevel()}`;
        const keyVar = `ky${this.getNestLevel()}`;
        const parentCode = `
            const ${unknownVar} = ${this.callCheckUnknownProperties(comp, allJitChildren, true)};
            if (${unknownVar}) {for (const ${keyVar} of ${unknownVar}){delete ${comp.vλl}[${keyVar}]}}
        `;
        const childrenCode = super._compileStripUnknownKeys(comp);
        return childrenCode ? `${parentCode}\n${childrenCode}` : parentCode;
    }
    _compileUnknownKeysToUndefined(comp: JitCompiler): jitCode {
        const allJitChildren = this.getJitChildren(comp);
        const unknownVar = `unk${this.getNestLevel()}`;
        const keyVar = `ky${this.getNestLevel()}`;
        const parentCode = `
            const ${unknownVar} = ${this.callCheckUnknownProperties(comp, allJitChildren, true)};
            if (${unknownVar}) {for (const ${keyVar} of ${unknownVar}){${comp.vλl}[${keyVar}] = undefined}}
        `;
        const childrenCode = super._compileUnknownKeysToUndefined(comp);
        return childrenCode ? `${parentCode}\n${childrenCode}` : parentCode;
    }

    // In order to json stringify to work properly optional properties must come first
    getJsonStringifyChildren(comp: JitCompiler): MemberRunType<any>[] {
        return this.getJitChildren(comp).sort((a, b) => {
            const aOptional = a instanceof MemberRunType && a.isOptional();
            const bOptional = b instanceof MemberRunType && b.isOptional();
            if (aOptional && !bOptional) return -1;
            if (!aOptional && bOptional) return 1;
            return 0;
        }) as MemberRunType<any>[];
    }

    private callCheckUnknownProperties(comp: JitCompiler, childrenRunTypes: RunType[], returnKeys: boolean): string {
        const childrenNames = childrenRunTypes.filter((prop) => !!(prop.src as any).name).map((prop) => (prop.src as any).name);
        if (childrenNames.length === 0) return '';
        const keysName = `k_${this.getJitHash()}`;
        if (childrenNames.length > minKeysForSet) {
            comp.contextCodeItems.set(keysName, `const ${keysName} = new Set(${arrayToLiteral(childrenNames)})`);
            if (returnKeys) return `utl.getUnknownKeysFromSet(${comp.vλl}, ${keysName})`;
            return `(typeof ${comp.vλl} === 'object' && ${comp.vλl} !== null && utl.hasUnknownKeysFromSet(${comp.vλl}, ${keysName}))`;
        }
        comp.contextCodeItems.set(keysName, `const ${keysName} = ${arrayToLiteral(childrenNames)}`);
        if (returnKeys) return `utl.getUnknownKeysFromArray(${comp.vλl}, ${keysName})`;
        return `(typeof ${comp.vλl} === 'object' && ${comp.vλl} !== null && utl.hasUnknownKeysFromArray(${comp.vλl}, ${keysName}))`;
    }

    // extra check to prevent empty array passing as object where all properties are optional
    // when this check is disabled empty array will pass as object but fail when checking for properties
    private getArrayCheck(comp: JitCompiler): string {
        if (this.areAllChildrenOptional === undefined) {
            this.areAllChildrenOptional = this.getJitChildren(comp).every(
                (prop) =>
                    (prop as MemberRunType<any>)?.isOptional() ||
                    (prop.src as TypeProperty)?.optional ||
                    prop.src.kind === ReflectionKind.indexSignature
            );
        }
        if (!this.areAllChildrenOptional) return '';
        return ` && !Array.isArray(${comp.vλl})`;
    }
}
