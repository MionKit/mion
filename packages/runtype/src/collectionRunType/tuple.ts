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
    protected _compileIsType(op: JitOperation): string {
        const children = this.getJitChildren();
        const varName = op.args.vλl;
        const compNext = (nextOp: JitOperation): string => {
            return children.map((rt) => rt.compileIsType(nextOp)).join(' && ');
        };
        return `(Array.isArray(${varName}) && ${varName}.length <= ${children.length} && (${this.compileChildren(compNext, op)}))`;
    }
    protected _compileTypeErrors(op: JitTypeErrorOperation): string {
        const children = this.getJitChildren();
        const varName = op.args.vλl;
        const errorsName = op.args.εrrors;
        const compNext = (nextOp: JitTypeErrorOperation): string => {
            return children.map((rt) => rt.compileTypeErrors(nextOp)).join(';');
        };
        return `
                if (!Array.isArray(${varName}) || ${varName}.length > ${children.length}) {
                    ${errorsName}.push({path: ${getJitErrorPath(op)}, expected: ${getExpected(this)}});
                } else {
                    ${this.compileChildren(compNext, op)}
                }
            `;
    }
    protected _compileJsonEncode(op: JitOperation): string {
        const children = this.getJsonEncodeChildren();
        const compNext = (nextOp: JitOperation): string => {
            const childrenCode = children.map((rt) => rt.compileJsonEncode(nextOp));
            return childrenCode.filter((code) => !!code).join(';');
        };
        return this.compileChildren(compNext, op);
    }
    protected _compileJsonDecode(op: JitOperation): string {
        const children = this.getJsonDecodeChildren();
        const compNext = (nextOp: JitOperation): string => {
            const decodeCodes = children.map((rt) => rt.compileJsonDecode(nextOp));
            return decodeCodes.filter((code) => !!code).join(';');
        };
        return this.compileChildren(compNext, op);
    }
    protected _compileJsonStringify(op: JitOperation): string {
        const children = this.getJitChildren();
        const compNext = (nextOp: JitOperation): string => {
            const jsonStrings = children.map((rt) => rt.compileJsonStringify(nextOp));
            return jsonStrings.join(`+','+`);
        };
        return `'['+${this.compileChildren(compNext, op)}+']'`;
    }

    mock(ctx?: Pick<MockContext, 'tupleOptions'>): any[] {
        return this.getChildRunTypes().map((rt, i) => rt.mock(ctx?.tupleOptions?.[i]));
    }
}
