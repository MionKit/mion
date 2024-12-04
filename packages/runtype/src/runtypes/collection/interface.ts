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
    TypeProperty,
    ReflectionKind,
} from '../../lib/_deepkit/src/reflection/type';
import {MockOperation, RunType} from '../../types';
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

    getNamedChildren(): InterfaceMember[] {
        return this.getJitChildren().filter((prop) => !!(prop.src as any).name) as InterfaceMember[];
    }

    isCallable(): boolean {
        return this.getCallSignature() !== undefined;
    }

    getCallSignature = memorize((): CallSignatureRunType | undefined => {
        return this.getChildRunTypes().find((prop) => prop.src.kind === ReflectionKind.callSignature) as CallSignatureRunType;
    });

    // #### collection's jit code ####

    _compileIsType(comp: JitCompiler): string {
        const varName = comp.vλl;
        const children = this.getJitChildren();
        const childrenCode = children.length ? `&& ${children.map((prop) => prop.compileIsType(comp)).join(' && ')}` : '';
        if (this.isCallable()) return `${this.getCallSignature()!._compileIsType(comp)} ${childrenCode}`;
        const arrayCheck = this.getArrayCheck(comp);
        return `(typeof ${varName} === 'object' && ${varName} !== null ${childrenCode} ${arrayCheck})`;
    }
    _compileTypeErrors(comp: JitErrorsCompiler): string {
        const varName = comp.vλl;
        const children = this.getJitChildren();
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
    _compileJsonEncode(comp: JitCompiler) {
        if (this.isCallable()) return this.getCallSignature()!._compileJsonEncode();
        const children = this.getJsonEncodeChildren();
        const childrenCode = children
            .map((prop) => prop.compileJsonEncode(comp))
            .filter(Boolean)
            .join(';');
        return childrenCode || undefined;
    }
    _compileJsonDecode(comp: JitCompiler) {
        if (this.isCallable()) return this.getCallSignature()!._compileJsonDecode();
        const children = this.getJsonDecodeChildren();
        const childrenCode = children
            .map((prop) => prop.compileJsonDecode(comp))
            .filter(Boolean)
            .join(';');
        return childrenCode || undefined;
    }
    _compileJsonStringify(comp: JitCompiler): string {
        if (this.isCallable()) return this.getCallSignature()!._compileJsonStringify();
        const children = this.getJsonStringifyChildren();
        if (children.length === 0) return `''`;
        const allOptional = children.every((prop) => (prop as MemberRunType<any>).isOptional());
        // if all properties are optional,  we can not optimize and use JSON.stringify
        if (allOptional) return this._compileJsonStringifyIntoArray(comp, children);
        const childrenCode = children
            .map((prop, i) => {
                const nexChild = children[i + 1];
                const isLast = !nexChild;
                prop.skipCommas = isLast;
                return prop.compileJsonStringify(comp);
            })
            .filter(Boolean)
            .join('+');
        return `'{'+${childrenCode}+'}'`;
    }
    private _compileJsonStringifyIntoArray(comp: JitCompiler, children: MemberRunType<any>[]): string {
        const arrName = `ns${this.getNestLevel()}`;
        const childrenCode = children
            .map((prop) => {
                prop.skipCommas = true;
                const childCode = prop.compileJsonStringify(comp);
                if (!childCode) return '';
                const code = `${arrName}.push(${childCode})`;
                // makes an extra check to avoid pushing empty strings to the array (childCode also makes the same check but is better than having to filter the array after)
                return prop.isOptional() ? `if (${prop.tempChildVλl} !== undefined){${code}}` : `${code};`;
            })
            .filter(Boolean)
            .join('');

        return `(function(){const ${arrName} = [];${childrenCode};return '{'+${arrName}.join(',')+'}'})()`;
    }
    _compileHasUnknownKeys(comp: JitCompiler): string {
        const allJitChildren = this.getJitChildren();
        const parentCode = this.callCheckUnknownProperties(comp, allJitChildren, false);
        const childrenCode = super._compileHasUnknownKeys(comp);
        return childrenCode ? `${parentCode} || ${childrenCode}` : parentCode;
    }
    _compileUnknownKeyErrors(comp: JitErrorsCompiler): string {
        const allJitChildren = this.getJitChildren();
        const unknownVar = `unk${this.getNestLevel()}`;
        const keyVar = `ky${this.getNestLevel()}`;
        const parentCode = `
            const ${unknownVar} = ${this.callCheckUnknownProperties(comp, allJitChildren, true)};
            if (${unknownVar}) {for (const ${keyVar} of ${unknownVar}) {${comp.callJitErr('never', keyVar)}}}
        `;
        const childrenCode = super._compileUnknownKeyErrors(comp);
        return childrenCode ? `${parentCode}\n${childrenCode}` : parentCode;
    }
    _compileStripUnknownKeys(comp: JitCompiler): string {
        const allJitChildren = this.getJitChildren();
        const unknownVar = `unk${this.getNestLevel()}`;
        const keyVar = `ky${this.getNestLevel()}`;
        const parentCode = `
            const ${unknownVar} = ${this.callCheckUnknownProperties(comp, allJitChildren, true)};
            if (${unknownVar}) {for (const ${keyVar} of ${unknownVar}){delete ${comp.vλl}[${keyVar}]}}
        `;
        const childrenCode = super._compileStripUnknownKeys(comp);
        return childrenCode ? `${parentCode}\n${childrenCode}` : parentCode;
    }
    _compileUnknownKeysToUndefined(comp: JitCompiler): string {
        const allJitChildren = this.getJitChildren();
        const unknownVar = `unk${this.getNestLevel()}`;
        const keyVar = `ky${this.getNestLevel()}`;
        const parentCode = `
            const ${unknownVar} = ${this.callCheckUnknownProperties(comp, allJitChildren, true)};
            if (${unknownVar}) {for (const ${keyVar} of ${unknownVar}){${comp.vλl}[${keyVar}] = undefined}}
        `;
        const childrenCode = super._compileUnknownKeysToUndefined(comp);
        return childrenCode ? `${parentCode}\n${childrenCode}` : parentCode;
    }

    _mock(ctx: MockOperation): Record<string | number, any> {
        if (this.isCallable()) return this.getCallSignature()!.mock(ctx as MockOperation);
        let obj: Record<string | number, any> = ctx.parentObj || {};
        this.getChildRunTypes().forEach((prop) => {
            const name = (prop as PropertyRunType).getChildVarName();
            if (prop instanceof IndexSignatureRunType) obj = {...obj, ...prop.mock(ctx as MockOperation)};
            else obj[name] = prop.mock(ctx as MockOperation);
        });
        return obj;
    }

    // In order to json stringify to work properly optional properties must come first
    getJsonStringifyChildren(): MemberRunType<any>[] {
        return this.getJitChildren().sort((a, b) => {
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
            this.areAllChildrenOptional = this.getJitChildren().every(
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
