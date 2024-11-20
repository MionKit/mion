/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {TypeObjectLiteral, TypeClass, TypeIntersection, TypeProperty, ReflectionKind} from '../_deepkit/src/reflection/type';
import {MockOperation, RunType} from '../types';
import {getJitErrorPath, getExpected, memorize, arrayToLiteral} from '../utils';
import {PropertyRunType} from '../memberRunType/property';
import {CollectionRunType, MemberRunType} from '../baseRunTypes';
import {MethodSignatureRunType} from '../memberRunType/methodSignature';
import {IndexSignatureRunType} from '../memberRunType/indexProperty';
import {MethodRunType} from '../memberRunType/method';
import type {JitCompiler, JitErrorsCompiler} from '../jitCompiler';
import {CallSignatureRunType} from '../memberRunType/callSignature';
import {minKeysForSet} from '../constants';

export type InterfaceMember =
    | PropertyRunType
    | MethodSignatureRunType
    | IndexSignatureRunType
    | MethodRunType
    | CallSignatureRunType;

export class InterfaceRunType<
    T extends TypeObjectLiteral | TypeClass | TypeIntersection = TypeObjectLiteral,
> extends CollectionRunType<T> {
    src: T = null as any; // will be set after construction
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

    _compileIsType(cop: JitCompiler): string {
        const varName = cop.vλl;
        const children = this.getJitChildren();
        const childrenCode = children.length ? `&& ${children.map((prop) => prop.compileIsType(cop)).join(' && ')}` : '';
        if (this.isCallable()) return `${this.getCallSignature()!._compileIsType(cop)} ${childrenCode}`;
        const arrayCheck = this.getArrayCheck(cop);
        return `(typeof ${varName} === 'object' && ${varName} !== null ${childrenCode} ${arrayCheck})`;
    }
    _compileTypeErrors(cop: JitErrorsCompiler): string {
        const varName = cop.vλl;
        const children = this.getJitChildren();
        const childrenCode = children.length ? children.map((prop) => prop.compileTypeErrors(cop)).join(';') : '';
        const arrayCheck = this.getArrayCheck(cop);
        if (this.isCallable()) {
            return `${this.getCallSignature()!._compileTypeErrors(cop)} else {${childrenCode}}`;
        }
        return `
            if (typeof ${varName} !== 'object' || ${varName} === null ${arrayCheck}) {
                utl.err(${cop.args.εrr},${getJitErrorPath(cop)},${getExpected(this)});
            } else {
                ${childrenCode}
            }
        `;
    }
    _compileJsonEncode(cop: JitCompiler): string {
        if (this.isCallable()) return this.getCallSignature()!._compileJsonEncode();
        const children = this.getJsonEncodeChildren();
        return children
            .map((prop) => prop.compileJsonEncode(cop))
            .filter((c) => !!c)
            .join(';');
    }
    _compileJsonDecode(cop: JitCompiler): string {
        if (this.isCallable()) return this.getCallSignature()!._compileJsonDecode();
        const children = this.getJsonDecodeChildren();
        const childrenCode = children
            .map((prop) => prop.compileJsonDecode(cop))
            .filter((c) => !!c)
            .join(';');
        return childrenCode;
    }
    _compileJsonStringify(cop: JitCompiler): string {
        if (this.isCallable()) return this.getCallSignature()!._compileJsonStringify();
        const children = this.getJsonStringifyChildren() as MemberRunType<any>[];
        if (children.length === 0) return `''`;
        const allOptional = children.every((prop) => (prop as MemberRunType<any>).isOptional());
        // if all properties are optional,  we can not optimize and use JSON.stringify
        if (allOptional) return this._compileJsonStringifyIntoArray(cop, children);
        const childrenCode = children
            .map((prop, i) => {
                const nexChild = children[i + 1];
                const isLast = !nexChild;
                prop.skipCommas = isLast;
                return prop.compileJsonStringify(cop);
            })
            .filter((c) => !!c)
            .join('+');
        return `'{'+${childrenCode}+'}'`;
    }
    private _compileJsonStringifyIntoArray(cop: JitCompiler, children: MemberRunType<any>[]): string {
        const arrName = `ns${this.getNestLevel()}`;
        const childrenCode = children
            .map((prop) => {
                prop.skipCommas = true;
                const childCode = prop.compileJsonStringify(cop);
                if (!childCode) return '';
                const code = `${arrName}.push(${childCode})`;
                // makes an extra check to avoid pushing empty strings to the array (childCode also makes the same check but is better than having to filter the array after)
                return prop.isOptional() ? `if (${prop.tempChildVλl} !== undefined){${code}}` : `${code};`;
            })
            .filter((c) => !!c)
            .join('');

        return `(function(){const ${arrName} = [];${childrenCode};return '{'+${arrName}.join(',')+'}'})()`;
    }
    _compileHasUnknownKeys = (cop: JitCompiler): string => {
        const allJitChildren = this.getJitChildren();
        const parentCode = this.callCheckUnknownProperties(cop, allJitChildren, false);
        const childrenCode = super._compileHasUnknownKeys(cop);
        return childrenCode ? `${parentCode} || ${childrenCode}` : parentCode;
    };
    _compileUnknownKeyErrors = (cop: JitErrorsCompiler): string => {
        const allJitChildren = this.getJitChildren();
        const unknownVar = `µnkps${this.getNestLevel()}`;
        const keyVar = `kεy${this.getNestLevel()}`;
        const parentCode = `
            const ${unknownVar} = ${this.callCheckUnknownProperties(cop, allJitChildren, true)};
            if (${unknownVar}) {
                for (const ${keyVar} of ${unknownVar}) {
                    utl.err(${cop.args.εrr},${getJitErrorPath(cop, keyVar)},${getExpected(this)})
                delete ${cop.vλl}[${keyVar}];
                }
            }
        `;
        const childrenCode = super._compileUnknownKeyErrors(cop);
        return childrenCode ? `${parentCode}\n${childrenCode}` : parentCode;
    };
    _compileStripUnknownKeys = (cop: JitCompiler): string => {
        const allJitChildren = this.getJitChildren();
        const unknownVar = `µnkps${this.getNestLevel()}`;
        const keyVar = `kεy${this.getNestLevel()}`;
        const parentCode = `
            const ${unknownVar} = ${this.callCheckUnknownProperties(cop, allJitChildren, true)};
            if (${unknownVar}) {
                for (const ${keyVar} of ${unknownVar}) { delete ${cop.vλl}[${keyVar}]; }
            }
        `;
        const childrenCode = super._compileStripUnknownKeys(cop);
        return childrenCode ? `${parentCode}\n${childrenCode}` : parentCode;
    };
    _compileUnknownKeysToUndefined = (cop: JitCompiler): string => {
        const allJitChildren = this.getJitChildren();
        const unknownVar = `µnkps${this.getNestLevel()}`;
        const keyVar = `kεy${this.getNestLevel()}`;
        const parentCode = `
            const ${unknownVar} = ${this.callCheckUnknownProperties(cop, allJitChildren, true)};
            if (${unknownVar}) {
                for (const ${keyVar} of ${unknownVar}) { ${cop.vλl}[${keyVar}] = undefined; }
            }
        `;
        const childrenCode = super._compileUnknownKeysToUndefined(cop);
        return childrenCode ? `${parentCode}\n${childrenCode}` : parentCode;
    };

    _mock(ctx: Pick<MockOperation, 'parentObj'>): Record<string | number, any> {
        if (this.isCallable()) return this.getCallSignature()!.mock(ctx as MockOperation);
        let obj: Record<string | number, any> = ctx.parentObj || {};
        this.getChildRunTypes().forEach((prop) => {
            const name = (prop as PropertyRunType).getChildVarName();
            if (prop instanceof IndexSignatureRunType) obj = {...obj, ...prop.mock(ctx as MockOperation)};
            else obj[name] = prop.mock(ctx as MockOperation);
        });
        return obj;
    }

    private callCheckUnknownProperties(cop: JitCompiler, childrenRunTypes: RunType[], returnKeys: boolean): string {
        const childrenNames = childrenRunTypes.filter((prop) => !!(prop.src as any).name).map((prop) => (prop.src as any).name);
        if (childrenNames.length === 0) return '';
        const keysName = `k_${this.getJitHash()}`;
        if (childrenNames.length > minKeysForSet) {
            cop.contextCodeItems.set(keysName, `const ${keysName} = new Set(${arrayToLiteral(childrenNames)})`);
            if (returnKeys) return `utl.getUnknownKeysFromSet(${cop.vλl}, ${keysName})`;
            return `(typeof ${cop.vλl} === 'object' && ${cop.vλl} !== null && utl.hasUnknownKeysFromSet(${cop.vλl}, ${keysName}))`;
        }
        cop.contextCodeItems.set(keysName, `const ${keysName} = ${arrayToLiteral(childrenNames)}`);
        if (returnKeys) return `utl.getUnknownKeysFromArray(${cop.vλl}, ${keysName})`;
        return `(typeof ${cop.vλl} === 'object' && ${cop.vλl} !== null && utl.hasUnknownKeysFromArray(${cop.vλl}, ${keysName}))`;
    }

    // extra check to prevent empty array passing as object where all properties are optional
    // when this check is disabled empty array will pass as object but fail when checking for properties
    private getArrayCheck(cop: JitCompiler): string {
        if (this.areAllChildrenOptional === undefined) {
            this.areAllChildrenOptional = this.getJitChildren().every(
                (prop) =>
                    (prop as MemberRunType<any>)?.isOptional() ||
                    (prop.src as TypeProperty)?.optional ||
                    prop.src.kind === ReflectionKind.indexSignature
            );
        }
        if (!this.areAllChildrenOptional) return '';
        return ` && !Array.isArray(${cop.vλl})`;
    }
}
