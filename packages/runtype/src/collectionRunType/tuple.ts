/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeTuple} from '../_deepkit/src/reflection/type';
import {ArrayCollectionRunType} from '../baseRunTypes';
import {JitOperation, MockContext, JitTypeErrorOperation} from '../types';
import {getJitErrorPath, getExpected} from '../utils';

export class TupleRunType extends ArrayCollectionRunType<TypeTuple> {
    src: TypeTuple = null as any; // will be set after construction
    getName(): string {
        throw 'tuple';
    }
    protected getPathItem(): null {
        return null;
    }
    protected _compileIsType(op: JitOperation): string {
        const children = this.getJitChildren();
        const varName = op.args.vλl;
        const childrenCode = `&& (${children.map((rt) => rt.compileIsType(op)).join(' && ')})`;
        return `(Array.isArray(${varName}) && ${varName}.length <= ${children.length} ${childrenCode})`;
    }
    protected _compileTypeErrors(op: JitTypeErrorOperation): string {
        const children = this.getJitChildren();
        const varName = op.args.vλl;
        const errorsName = op.args.εrrors;
        const childrenCode = children.map((rt) => rt.compileTypeErrors(op)).join(';');
        return `
            if (!Array.isArray(${varName}) || ${varName}.length > ${children.length}) {
                ${errorsName}.push({path: ${getJitErrorPath(op)}, expected: ${getExpected(this)}});
            } else {
                ${childrenCode}
            }
        `;
    }
    protected _compileJsonEncode(op: JitOperation): string {
        const children = this.getJsonEncodeChildren();
        return children.map((rt) => rt.compileJsonEncode(op)).join(';');
    }
    protected _compileJsonDecode(op: JitOperation): string {
        const children = this.getJsonDecodeChildren();
        return children.map((rt) => rt.compileJsonDecode(op)).join(';');
    }
    protected _compileJsonStringify(op: JitOperation): string {
        const children = this.getJitChildren();
        const childrenCode = children.map((rt) => rt.compileJsonStringify(op)).join(`+','+`);
        return `'['+${childrenCode}+']'`;
    }

    mock(ctx?: Pick<MockContext, 'tupleOptions'>): any[] {
        return this.getChildRunTypes().map((rt, i) => rt.mock(ctx?.tupleOptions?.[i]));
    }
}
