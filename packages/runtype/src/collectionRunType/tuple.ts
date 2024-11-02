/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeTuple} from '../_deepkit/src/reflection/type';
import {CollectionRunType} from '../baseRunTypes';
import type {
    JitIsTypeCompiler,
    JitJsonDecodeCompileOperation,
    JitJsonEncodeCompiler,
    JitJsonStringifyCompiler,
    JitTypeErrorCompiler,
} from '../jitCompiler';
import {MockContext} from '../types';
import {getJitErrorPath, getExpected} from '../utils';

export class TupleRunType extends CollectionRunType<TypeTuple> {
    src: TypeTuple = null as any; // will be set after construction
    _compileIsType(cop: JitIsTypeCompiler): string {
        const children = this.getJitChildren();
        const varName = cop.vλl;
        const childrenCode = `&& (${children.map((rt) => rt.compileIsType(cop)).join(' && ')})`;
        return `(Array.isArray(${varName}) && ${varName}.length <= ${children.length} ${childrenCode})`;
    }
    _compileTypeErrors(cop: JitTypeErrorCompiler): string {
        const children = this.getJitChildren();
        const varName = cop.vλl;
        const childrenCode = children.map((rt) => rt.compileTypeErrors(cop)).join(';');
        return `
            if (!Array.isArray(${varName}) || ${varName}.length > ${children.length}) {
                ${cop.args.εrr}.push({path:${getJitErrorPath(cop)},expected:${getExpected(this)}});
            } else {
                ${childrenCode}
            }
        `;
    }
    _compileJsonEncode(cop: JitJsonEncodeCompiler): string {
        const children = this.getJsonEncodeChildren();
        return children
            .map((rt) => rt.compileJsonEncode(cop))
            .filter((c) => !!c)
            .join(';');
    }
    _compileJsonDecode(cop: JitJsonDecodeCompileOperation): string {
        const children = this.getJsonDecodeChildren();
        return children
            .map((rt) => rt.compileJsonDecode(cop))
            .filter((c) => !!c)
            .join(';');
    }
    _compileJsonStringify(cop: JitJsonStringifyCompiler): string {
        const children = this.getJitChildren();
        const childrenCode = children
            .map((rt) => rt.compileJsonStringify(cop))
            .filter((c) => !!c)
            .join(`+','+`);
        return `'['+${childrenCode}+']'`;
    }

    mock(ctx?: Pick<MockContext, 'tupleOptions'>): any[] {
        return this.getChildRunTypes().map((rt, i) => rt.mock(ctx?.tupleOptions?.[i]));
    }
}
