/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {TypeObjectLiteral, TypeClass, TypeIntersection} from '../_deepkit/src/reflection/type';
import {MockContext} from '../types';
import {getJitErrorPath, getExpected} from '../utils';
import {PropertyRunType} from '../memberRunType/property';
import {CollectionRunType} from '../baseRunTypes';
import {MethodSignatureRunType} from '../memberRunType/methodSignature';
import {IndexSignatureRunType} from '../memberRunType/indexProperty';
import {MethodRunType} from '../memberRunType/method';
import {JitCompileOp, JitTypeErrorCompileOp} from '../jitOperation';

export type InterfaceMember = PropertyRunType | MethodSignatureRunType | IndexSignatureRunType | MethodRunType;

export class InterfaceRunType<
    T extends TypeObjectLiteral | TypeClass | TypeIntersection = TypeObjectLiteral,
> extends CollectionRunType<T> {
    src: T = null as any; // will be set after construction
    getName(): string {
        const iName = (this.src.kind as any).typeName as string | undefined;
        return `interface${iName ? ` ${iName}` : ''}`;
    }
    // #### collection's jit code ####
    _compileIsType(cop: JitCompileOp): string {
        const varName = cop.vλl;
        const children = this.getJitChildren();
        const childrenCode = `  && ${children.map((prop) => prop.compileIsType(cop)).join(' && ')}`;
        return `(typeof ${varName} === 'object' && ${varName} !== null ${childrenCode})`;
    }
    _compileTypeErrors(cop: JitTypeErrorCompileOp): string {
        const varName = cop.vλl;
        const errorsName = cop.args.εrrors;
        const children = this.getJitChildren();
        const childrenCode = children.map((prop) => prop.compileTypeErrors(cop)).join(';');
        return `
            if (typeof ${varName} !== 'object' && ${varName} !== null) {
                ${errorsName}.push({path: ${getJitErrorPath(cop)}, expected: ${getExpected(this)}});
            } else {
                ${childrenCode}
            }
        `;
    }
    _compileJsonEncode(cop: JitCompileOp): string {
        const children = this.getJsonEncodeChildren();
        return children.map((prop) => prop.compileJsonEncode(cop)).join(';');
    }
    _compileJsonDecode(cop: JitCompileOp): string {
        const children = this.getJsonDecodeChildren();
        return children.map((prop) => prop.compileJsonDecode(cop)).join(';');
    }
    _compileJsonStringify(cop: JitCompileOp): string {
        const children = this.getJitChildren();
        const childrenCode = children.map((prop) => prop.compileJsonStringify(cop)).join('+');
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
