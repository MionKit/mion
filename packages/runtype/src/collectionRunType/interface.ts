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
import type {
    JitIsTypeCompiler,
    JitJsonDecodeCompileOperation,
    JitJsonEncodeCompiler,
    JitJsonStringifyCompiler,
    JitTypeErrorCompiler,
} from '../jitCompiler';
import {jitNames} from '../constants';

export type InterfaceMember = PropertyRunType | MethodSignatureRunType | IndexSignatureRunType | MethodRunType;

export class InterfaceRunType<
    T extends TypeObjectLiteral | TypeClass | TypeIntersection = TypeObjectLiteral,
> extends CollectionRunType<T> {
    src: T = null as any; // will be set after construction

    callCheckUnknownProperties(cop: JitIsTypeCompiler, childrenRunTypes: RunType[], returnKeys: boolean): string {
        const childrenNames = childrenRunTypes.filter((prop) => !!(prop.src as any).name).map((prop) => (prop.src as any).name);
        if (childrenNames.length === 0) return '';
        const keysID = toLiteral(childrenNames.join(':'));
        const keysArgs = childrenNames.length === 1 ? keysID : `${keysID}, ${arrayToArgumentsLiteral(childrenNames)}`;
        return `${jitNames.utils}.getObjectUnknownKeys(${toLiteral(returnKeys)}, ${cop.vλl}, ${keysArgs})`;
    }

    // #### collection's jit code ####
    _compileIsType(cop: JitIsTypeCompiler): string {
        const varName = cop.vλl;
        const children = this.getJitChildren();
        const childrenCode = `  && ${children.map((prop) => prop.compileIsType(cop)).join(' && ')}`;
        // adding strictCheck at the end improves performance when property checks fail and in union types
        return `(typeof ${varName} === 'object' && ${varName} !== null${childrenCode})`;
    }
    _compileTypeErrors(cop: JitTypeErrorCompiler): string {
        const varName = cop.vλl;
        const children = this.getJitChildren();
        const childrenCode = children.map((prop) => prop.compileTypeErrors(cop)).join(';');
        return `
            if (typeof ${varName} !== 'object' && ${varName} !== null) {
                ${cop.args.εrr}.push({path:${getJitErrorPath(cop)},expected:${getExpected(this)}});
            } else {
                ${childrenCode}
            }
        `;
    }
    _compileJsonEncode(cop: JitJsonEncodeCompiler): string {
        const children = this.getJsonEncodeChildren();
        return children
            .map((prop) => prop.compileJsonEncode(cop))
            .filter((c) => !!c)
            .join(';');
    }
    _compileJsonDecode(cop: JitJsonDecodeCompileOperation): string {
        const children = this.getJsonDecodeChildren();
        // const allJitChildren = this.getJitChildren();
        // const unknownVar = `µnkPrΦps${this.getNestLevel()}`;
        // const keyVar = `kεy${this.getNestLevel()}`;
        // let unknownCode = '';
        // switch (cop.compileOptions.safeJSON) {
        //     case 'undefined':
        //         unknownCode = `
        //             const ${unknownVar} = ${this.callCheckUnknownProperties(cop, allJitChildren, true)};
        //             if (${unknownVar}) {
        //                 for (const ${keyVar} of ${unknownVar}) { ${cop.vλl}[${keyVar}] = undefined; }
        //             }
        //         `;
        //         break;
        //     case 'strip':
        //         unknownCode = `
        //             const ${unknownVar} = ${this.callCheckUnknownProperties(cop, allJitChildren, true)};
        //             if (${unknownVar}) {
        //                 for (const ${keyVar} of ${unknownVar}) { delete ${cop.vλl}[${keyVar}]; }
        //             }
        //         `;
        //         break;
        //     case 'throw':
        //         unknownCode = `
        //             const ${unknownVar} = ${this.callCheckUnknownProperties(cop, allJitChildren, false)};
        //             if (${unknownVar}) throw new Error('Unknown properties in JSON');
        //         `;
        //         break;
        // }
        const childrenCode = children
            .map((prop) => prop.compileJsonDecode(cop))
            .filter((c) => !!c)
            .join(';');
        return childrenCode;
    }
    _compileJsonStringify(cop: JitJsonStringifyCompiler): string {
        const children = this.getJitChildren();
        const childrenCode = children
            .map((prop) => prop.compileJsonStringify(cop))
            .filter((c) => !!c)
            .join('+');
        return `'{'+${childrenCode}+'}'`;
    }

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
