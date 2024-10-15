/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeTuple} from '../_deepkit/src/reflection/type';
import {CollectionRunType} from '../baseRunTypes';
import {JitCompileOp, JitTypeErrorCompileOp} from '../jitOperation';
import {MockContext} from '../types';
import {getJitErrorPath, getExpected} from '../utils';

export class TupleRunType extends CollectionRunType<TypeTuple> {
    src: TypeTuple = null as any; // will be set after construction
    getName(): string {
        throw 'tuple';
    }
    _compileIsType(cop: JitCompileOp): string {
        const children = this.getJitChildren();
        const varName = cop.vλl;
        const childrenCode = `&& (${children.map((rt) => rt.compileIsType(cop)).join(' && ')})`;
        return `(Array.isArray(${varName}) && ${varName}.length <= ${children.length} ${childrenCode})`;
    }
    _compileTypeErrors(cop: JitTypeErrorCompileOp): string {
        const children = this.getJitChildren();
        const varName = cop.vλl;
        const errorsName = cop.args.εrrors;
        const childrenCode = children.map((rt) => rt.compileTypeErrors(cop)).join(';');
        return `
            if (!Array.isArray(${varName}) || ${varName}.length > ${children.length}) {
                ${errorsName}.push({path: ${getJitErrorPath(cop)}, expected: ${getExpected(this)}});
            } else {
                ${childrenCode}
            }
        `;
    }
    _compileJsonEncode(cop: JitCompileOp): string {
        const children = this.getJsonEncodeChildren();
        return children.map((rt) => rt.compileJsonEncode(cop)).join(';');
    }
    _compileJsonDecode(cop: JitCompileOp): string {
        const children = this.getJsonDecodeChildren();
        return children.map((rt) => rt.compileJsonDecode(cop)).join(';');
    }
    _compileJsonStringify(cop: JitCompileOp): string {
        const children = this.getJitChildren();
        const childrenCode = children.map((rt) => rt.compileJsonStringify(cop)).join(`+','+`);
        return `'['+${childrenCode}+']'`;
    }

    mock(ctx?: Pick<MockContext, 'tupleOptions'>): any[] {
        return this.getChildRunTypes().map((rt, i) => rt.mock(ctx?.tupleOptions?.[i]));
    }
}
