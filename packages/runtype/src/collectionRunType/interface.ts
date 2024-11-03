/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {TypeObjectLiteral, TypeClass, TypeIntersection} from '../_deepkit/src/reflection/type';
import {MockContext, RunType} from '../types';
import {getJitErrorPath, getExpected, toLiteral, arrayToArgumentsLiteral} from '../utils';
import {PropertyRunType} from '../memberRunType/property';
import {CollectionRunType} from '../baseRunTypes';
import {MethodSignatureRunType} from '../memberRunType/methodSignature';
import {IndexSignatureRunType} from '../memberRunType/indexProperty';
import {MethodRunType} from '../memberRunType/method';
import type {JitCompiler, JitErrorsCompiler} from '../jitCompiler';

export type InterfaceMember = PropertyRunType | MethodSignatureRunType | IndexSignatureRunType | MethodRunType;

export class InterfaceRunType<
    T extends TypeObjectLiteral | TypeClass | TypeIntersection = TypeObjectLiteral,
> extends CollectionRunType<T> {
    src: T = null as any; // will be set after construction

    callCheckUnknownProperties(cop: JitCompiler, childrenRunTypes: RunType[], returnKeys: boolean): string {
        const childrenNames = childrenRunTypes.filter((prop) => !!(prop.src as any).name).map((prop) => (prop.src as any).name);
        if (childrenNames.length === 0) return '';
        const keysID = toLiteral(childrenNames.join(':'));
        const keysArgs = childrenNames.length === 1 ? keysID : `${keysID}, ${arrayToArgumentsLiteral(childrenNames)}`;
        if (returnKeys) return `µTils.getObjectUnknownKeys(${cop.vλl}, ${keysArgs})`;
        return `µTils.objectHasUnknownKeys(${cop.vλl}, ${keysArgs})`;
    }

    // #### collection's jit code ####
    _compileIsType(cop: JitCompiler): string {
        const varName = cop.vλl;
        const children = this.getJitChildren();
        const childrenCode = `  && ${children.map((prop) => prop.compileIsType(cop)).join(' && ')}`;
        // adding strictCheck at the end improves performance when property checks fail and in union types
        return `(typeof ${varName} === 'object' && ${varName} !== null${childrenCode})`;
    }
    _compileTypeErrors(cop: JitErrorsCompiler): string {
        const varName = cop.vλl;
        const children = this.getJitChildren();
        const childrenCode = children.map((prop) => prop.compileTypeErrors(cop)).join(';');
        return `
            if (typeof ${varName} !== 'object' && ${varName} !== null) {
                µTils.errPush(${cop.args.εrr},${getJitErrorPath(cop)},${getExpected(this)});
            } else {
                ${childrenCode}
            }
        `;
    }
    _compileJsonEncode(cop: JitCompiler): string {
        const children = this.getJsonEncodeChildren();
        return children
            .map((prop) => prop.compileJsonEncode(cop))
            .filter((c) => !!c)
            .join(';');
    }
    _compileJsonDecode(cop: JitCompiler): string {
        const children = this.getJsonDecodeChildren();
        const childrenCode = children
            .map((prop) => prop.compileJsonDecode(cop))
            .filter((c) => !!c)
            .join(';');
        return childrenCode;
    }
    _compileJsonStringify(cop: JitCompiler): string {
        const children = this.getJitChildren();
        const childrenCode = children
            .map((prop) => prop.compileJsonStringify(cop))
            .filter((c) => !!c)
            .join('+');
        return `'{'+${childrenCode}+'}'`;
    }
    _compileHasUnknownKeys = (cop: JitCompiler): string => {
        const allJitChildren = this.getJitChildren();
        const parentCode = this.callCheckUnknownProperties(cop, allJitChildren, false);
        const childrenCode = super._compileHasUnknownKeys(cop);
        return childrenCode ? `${parentCode} || ${childrenCode}` : parentCode;
    };
    _compileUnknownKeyErrors = (cop: JitErrorsCompiler): string => {
        const allJitChildren = this.getJitChildren();
        const unknownVar = `µnkPrΦps${this.getNestLevel()}`;
        const keyVar = `kεy${this.getNestLevel()}`;
        const parentCode = `
            const ${unknownVar} = ${this.callCheckUnknownProperties(cop, allJitChildren, true)};
            if (${unknownVar}) {
                for (const ${keyVar} of ${unknownVar}) {
                    µTils.errPush(${cop.args.εrr},${getJitErrorPath(cop, keyVar)},${getExpected(this)})
                delete ${cop.vλl}[${keyVar}];
                }
            }
        `;
        const childrenCode = super._compileUnknownKeyErrors(cop);
        return childrenCode ? `${parentCode}\n${childrenCode}` : parentCode;
    };
    _compileStripUnknownKeys = (cop: JitCompiler): string => {
        const allJitChildren = this.getJitChildren();
        const unknownVar = `µnkPrΦps${this.getNestLevel()}`;
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
        const unknownVar = `µnkPrΦps${this.getNestLevel()}`;
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

    mock(ctx?: Pick<MockContext, 'parentObj'>): Record<string | number, any> {
        const obj: Record<string | number, any> = ctx?.parentObj || {};
        this.getChildRunTypes().forEach((prop) => {
            const name = (prop as PropertyRunType).getChildVarName();
            if (prop instanceof IndexSignatureRunType) prop.mock(ctx);
            else obj[name] = prop.mock(ctx as MockContext);
        });
        return obj;
    }
}
