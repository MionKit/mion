/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeRegexp} from '@deepkit/type';
import type {JitConfig, jitCode} from '../../types';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import {AtomicRunType} from '../../lib/baseRunTypes';

const jitConstants: JitConfig = {
    skipJit: false,
    jitId: ReflectionKind.regexp,
};

export class RegexpRunType extends AtomicRunType<TypeRegexp> {
    getJitConfig = () => jitConstants;
    _compileIsType(comp: JitCompiler): jitCode {
        return `(${comp.vλl} instanceof RegExp)`;
    }
    _compileTypeErrors(comp: JitErrorsCompiler): jitCode {
        return `if (!(${comp.vλl} instanceof RegExp)) ${comp.callJitErr(this)}`;
    }
    _compileToJsonVal(comp: JitCompiler): jitCode {
        return regexpTransformer._compileToJsonVal(comp);
    }
    _compileFromJsonVal(comp: JitCompiler): jitCode {
        return regexpTransformer._compileFromJsonVal(comp);
    }
    _compileJsonStringify(comp: JitCompiler): jitCode {
        return regexpTransformer._compileJsonStringify(comp);
    }
}

// regexpTransformer (used internally only so no need to register in JitUtils)
export const regexpTransformer = {
    _compileFromJsonVal(comp: JitCompiler): jitCode {
        return `(function(){const parts = ${comp.vλl}.match(/\\/(.*)\\/(.*)?/) ;return new RegExp(parts[1], parts[2] || '')})()`;
    },
    _compileToJsonVal(comp: JitCompiler): jitCode {
        return `${comp.vλl}.toString()`;
    },
    _compileJsonStringify(comp: JitCompiler): jitCode {
        return `JSON.stringify(${comp.vλl}.toString())`;
    },
};
