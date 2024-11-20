/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeTuple} from '../_deepkit/src/reflection/type';
import {CollectionRunType} from '../baseRunTypes';
import type {JitCompiler, JitErrorsCompiler} from '../jitCompiler';
import {MockOperation} from '../types';
import {getJitErrorPath, getExpected} from '../utils';

export class TupleRunType extends CollectionRunType<TypeTuple> {
    src: TypeTuple = null as any; // will be set after construction
    _compileIsType(cop: JitCompiler): string {
        const children = this.getJitChildren();
        const varName = cop.vλl;
        const childrenCode = `&& (${children.map((rt) => rt.compileIsType(cop)).join(' && ')})`;
        return `(Array.isArray(${varName}) && ${varName}.length <= ${children.length} ${childrenCode})`;
    }
    _compileTypeErrors(cop: JitErrorsCompiler): string {
        const children = this.getJitChildren();
        const varName = cop.vλl;
        const childrenCode = children.map((rt) => rt.compileTypeErrors(cop)).join(';');
        return `
            if (!Array.isArray(${varName}) || ${varName}.length > ${children.length}) {
                utl.err(${cop.args.εrr},${getJitErrorPath(cop)},${getExpected(this)});
            } else {
                ${childrenCode}
            }
        `;
    }
    _compileJsonEncode(cop: JitCompiler): string {
        const children = this.getJsonEncodeChildren();
        return children
            .map((rt) => rt.compileJsonEncode(cop))
            .filter((c) => !!c)
            .join(';');
    }
    _compileJsonDecode(cop: JitCompiler): string {
        const children = this.getJsonDecodeChildren();
        return children
            .map((rt) => rt.compileJsonDecode(cop))
            .filter((c) => !!c)
            .join(';');
    }
    _compileJsonStringify(cop: JitCompiler): string {
        const children = this.getJitChildren();
        const childrenCode = children
            .map((rt) => rt.compileJsonStringify(cop))
            .filter((c) => !!c)
            .join(`+','+`);
        return `'['+${childrenCode}+']'`;
    }

    _mock(ctx: Pick<MockOperation, 'tupleOptions'>): any[] {
        return this.getChildRunTypes().map((rt, i) => rt.mock(ctx.tupleOptions?.[i]));
    }
}
