/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeTuple} from '../../lib/_deepkit/src/reflection/type';
import {CollectionRunType} from '../../lib/baseRunTypes';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import {MockOperation} from '../../types';
import {getJitErrorPath, getExpected} from '../../lib/utils';

export class TupleRunType extends CollectionRunType<TypeTuple> {
    src: TypeTuple = null as any; // will be set after construction
    _compileIsType(comp: JitCompiler): string {
        const children = this.getJitChildren();
        const varName = comp.vλl;
        const childrenCode = `&& (${children.map((rt) => rt.compileIsType(comp)).join(' && ')})`;
        return `(Array.isArray(${varName}) && ${varName}.length <= ${children.length} ${childrenCode})`;
    }
    _compileTypeErrors(comp: JitErrorsCompiler): string {
        const children = this.getJitChildren();
        const varName = comp.vλl;
        const childrenCode = children.map((rt) => rt.compileTypeErrors(comp)).join(';');
        return `
            if (!Array.isArray(${varName}) || ${varName}.length > ${children.length}) {
                utl.err(${comp.args.εrr},${getJitErrorPath(comp)},${getExpected(this)});
            } else {
                ${childrenCode}
            }
        `;
    }
    _compileJsonEncode(comp: JitCompiler): string {
        const children = this.getJsonEncodeChildren();
        return children
            .map((rt) => rt.compileJsonEncode(comp))
            .filter((c) => !!c)
            .join(';');
    }
    _compileJsonDecode(comp: JitCompiler): string {
        const children = this.getJsonDecodeChildren();
        return children
            .map((rt) => rt.compileJsonDecode(comp))
            .filter((c) => !!c)
            .join(';');
    }
    _compileJsonStringify(comp: JitCompiler): string {
        const children = this.getJitChildren();
        const childrenCode = children
            .map((rt) => rt.compileJsonStringify(comp))
            .filter((c) => !!c)
            .join(`+','+`);
        return `'['+${childrenCode}+']'`;
    }

    _mock(ctx: Pick<MockOperation, 'tupleOptions'>): any[] {
        return this.getChildRunTypes().map((rt, i) => rt.mock(ctx.tupleOptions?.[i]));
    }
}
