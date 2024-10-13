/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {TypeObjectLiteral, TypeClass, TypeIntersection} from '../_deepkit/src/reflection/type';
import {MockContext, PathItem} from '../types';
import {getJitErrorPath, getExpected} from '../utils';
import {PropertyRunType} from '../memberRunType/property';
import {CollectionRunType} from '../baseRunTypes';
import {MethodSignatureRunType} from '../functionRunType/methodSignature';
import {CallSignatureRunType} from '../functionRunType/call';
import {IndexSignatureRunType} from '../memberRunType/indexProperty';
import {MethodRunType} from '../functionRunType/method';
import {JitCompileOp, JitTypeErrorCompileOp} from '../jitOperation';

export type InterfaceMember =
    | PropertyRunType
    | MethodSignatureRunType
    | CallSignatureRunType
    | IndexSignatureRunType
    | MethodRunType;

export class InterfaceRunType<
    T extends TypeObjectLiteral | TypeClass | TypeIntersection = TypeObjectLiteral,
> extends CollectionRunType<T> {
    src: T = null as any; // will be set after construction
    getName(): string {
        const iName = (this.src.kind as any).typeName as string | undefined;
        return `interface${iName ? ` ${iName}` : ''}`;
    }
    getJitChildrenPath(): PathItem | null {
        throw new Error('Method not implemented.');
    }
    // #### collection's jit code ####
    protected _compileIsType(cop: JitCompileOp): string {
        const varName = cop.vλl;
        const children = this.getJitChildren();
        const childrenCode = `  && ${children.map((prop) => prop.compileIsType(cop)).join(' && ')}`;
        return `(typeof ${varName} === 'object' && ${varName} !== null && !Array.isArray(${varName}) ${childrenCode})`;
    }
    protected _compileTypeErrors(cop: JitTypeErrorCompileOp): string {
        const varName = cop.vλl;
        const errorsName = cop.args.εrrors;
        const children = this.getJitChildren();
        const childrenCode = children.map((prop) => prop.compileTypeErrors(cop)).join(';');
        return `
            if (typeof ${varName} !== 'object' && ${varName} !== null && !Array.isArray(${varName})) {
                ${errorsName}.push({path: ${getJitErrorPath(cop)}, expected: ${getExpected(this)}});
            } else {
                ${childrenCode}
            }
        `;
    }
    protected _compileJsonEncode(cop: JitCompileOp): string {
        const children = this.getJsonEncodeChildren();
        return children.map((prop) => prop.compileJsonEncode(cop)).join(';');
    }
    protected _compileJsonDecode(cop: JitCompileOp): string {
        const children = this.getJsonDecodeChildren();
        return children.map((prop) => prop.compileJsonDecode(cop)).join(';');
    }
    protected _compileJsonStringify(cop: JitCompileOp): string {
        const children = this.getJitChildren();
        const childrenCode = children.map((prop) => prop.compileJsonStringify(cop)).join('+');
        return `'{'+${childrenCode}+'}'`;
    }

    mock(ctx?: Pick<MockContext, 'parentObj'>): Record<string | number, any> {
        const obj: Record<string | number, any> = ctx?.parentObj || {};
        this.getChildRunTypes().forEach((prop) => {
            const name = (prop as PropertyRunType).getMemberName();
            if (prop instanceof IndexSignatureRunType) prop.mock(ctx);
            else obj[name] = prop.mock(ctx as MockContext);
        });
        return obj;
    }
}
