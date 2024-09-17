/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {TypeObjectLiteral, TypeClass, TypeIntersection} from '../_deepkit/src/reflection/type';
import {JitOperation, MockContext, JitTypeErrorOperation} from '../types';
import {getJitErrorPath, getExpected} from '../utils';
import {PropertyRunType} from '../memberRunType/property';
import {ObjectCollectionRunType} from '../baseRunTypes';
import {MethodSignatureRunType} from '../functionRunType/methodSignature';
import {CallSignatureRunType} from '../functionRunType/call';
import {IndexSignatureRunType} from '../memberRunType/indexProperty';
import {MethodRunType} from '../functionRunType/method';

export type InterfaceMember =
    | PropertyRunType
    | MethodSignatureRunType
    | CallSignatureRunType
    | IndexSignatureRunType
    | MethodRunType;

export class InterfaceRunType<
    T extends TypeObjectLiteral | TypeClass | TypeIntersection = TypeObjectLiteral,
> extends ObjectCollectionRunType<T> {
    src: T = null as any; // will be set after construction
    getName(): string {
        const iName = (this.src.kind as any).typeName as string | undefined;
        return `interface${iName ? ` ${iName}` : ''}`;
    }
    protected getPathItem(): null {
        return null;
    }
    // #### collection's jit code ####
    protected _compileIsType(op: JitOperation): string {
        const varName = op.args.vλl;
        const children = this.getJitChildren();
        const childrenCode = `  && ${children.map((prop) => prop.compileIsType(op)).join(' && ')}`;
        return `(typeof ${varName} === 'object' && ${varName} !== null && !Array.isArray(${varName}) ${childrenCode})`;
    }
    protected _compileTypeErrors(op: JitTypeErrorOperation): string {
        const varName = op.args.vλl;
        const errorsName = op.args.εrrors;
        const children = this.getJitChildren();
        const childrenCode = children.map((prop) => prop.compileTypeErrors(op)).join(';');
        return `
            if (typeof ${varName} !== 'object' && ${varName} !== null && !Array.isArray(${varName})) {
                ${errorsName}.push({path: ${getJitErrorPath(op)}, expected: ${getExpected(this)}});
            } else {
                ${childrenCode}
            }
        `;
    }
    protected _compileJsonEncode(op: JitOperation): string {
        const children = this.getJsonEncodeChildren();
        return children.map((prop) => prop.compileJsonEncode(op)).join(';');
    }
    protected _compileJsonDecode(op: JitOperation): string {
        const children = this.getJsonDecodeChildren();
        return children.map((prop) => prop.compileJsonDecode(op)).join(';');
    }
    protected _compileJsonStringify(op: JitOperation): string {
        const children = this.getJitChildren();
        const childrenCode = children.map((prop) => prop.compileJsonStringify(op)).join('+');
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
