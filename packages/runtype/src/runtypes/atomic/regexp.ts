/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeRegexp} from '@deepkit/type';
import type {MockOperation, JitConfig} from '../../types';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import {mockRegExp} from '../../lib/mock';
import {AtomicRunType} from '../../lib/baseRunTypes';

const jitConstants: JitConfig = {
    skipJit: false,
    jitId: ReflectionKind.regexp,
};

export class RegexpRunType extends AtomicRunType<TypeRegexp> {
    _getJitConfig = () => jitConstants;
    _compileIsType(comp: JitCompiler): string {
        return `(${comp.vλl} instanceof RegExp)`;
    }
    _compileTypeErrors(comp: JitErrorsCompiler): string {
        return `if (!(${comp.vλl} instanceof RegExp)) ${comp.callJitErr(this)}`;
    }
    _compileToJsonVal(comp: JitCompiler) {
        return regexpTransformer._compileToJsonVal(comp);
    }
    _compileFromJsonVal(comp: JitCompiler) {
        return regexpTransformer._compileFromJsonVal(comp);
    }
    _compileJsonStringify(comp: JitCompiler) {
        return regexpTransformer._compileJsonStringify(comp);
    }
    _mock(ctx: Pick<MockOperation, 'regexpList'>): RegExp {
        return mockRegExp(ctx.regexpList);
    }
}

// regexpTransformer (used internally only so no need to register in JitUtils)
export const regexpTransformer = {
    _compileFromJsonVal(comp: JitCompiler): string {
        return `(function(){const parts = ${comp.vλl}.match(/\\/(.*)\\/(.*)?/) ;return new RegExp(parts[1], parts[2] || '')})()`;
    },
    _compileToJsonVal(comp: JitCompiler): string {
        return `${comp.vλl}.toString()`;
    },
    _compileJsonStringify(comp: JitCompiler): string {
        return `JSON.stringify(${comp.vλl}.toString())`;
    },
};
