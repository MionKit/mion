/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeRegexp} from '../../lib/_deepkit/src/reflection/type';
import type {JitJsonEncoder, MockOperation, JitConstants} from '../../types';
import {getJitErrorPath, getExpected} from '../../lib/utils';
import {mockRegExp} from '../../lib/mock';
import {AtomicRunType} from '../../lib/baseRunTypes';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';

const jitConstants: JitConstants = {
    skipJit: false,
    skipJsonEncode: false,
    skipJsonDecode: false,
    jitId: ReflectionKind.regexp,
};

export class RegexpRunType extends AtomicRunType<TypeRegexp> {
    src: TypeRegexp = null as any; // will be set after construction
    getJitConstants = () => jitConstants;
    _compileIsType(comp: JitCompiler): string {
        return `(${comp.vλl} instanceof RegExp)`;
    }
    _compileTypeErrors(comp: JitErrorsCompiler): string {
        return `if (!(${comp.vλl} instanceof RegExp)) utl.err(${comp.args.εrr},${getJitErrorPath(comp)},${getExpected(this)})`;
    }
    _compileJsonEncode(comp: JitCompiler): string {
        return RegexpJitJsonEncoder.encodeToJson(comp.vλl);
    }
    _compileJsonDecode(comp: JitCompiler): string {
        return RegexpJitJsonEncoder.decodeFromJson(comp.vλl);
    }
    _compileJsonStringify(comp: JitCompiler): string {
        return RegexpJitJsonEncoder.stringify(comp.vλl);
    }
    _mock(ctx: Pick<MockOperation, 'regexpList'>): RegExp {
        return mockRegExp(ctx.regexpList);
    }
}

const matchRegExpString = '/\\/(.*)\\/(.*)?/';

export const RegexpJitJsonEncoder: JitJsonEncoder = {
    decodeFromJson(vλl: string): string {
        return `(function(){const parts = ${vλl}.match(${matchRegExpString}) ;return new RegExp(parts[1], parts[2] || '')})()`;
    },
    encodeToJson(vλl: string): string {
        return `${vλl}.toString()`;
    },
    stringify(vλl: string): string {
        return `JSON.stringify(${vλl}.toString())`;
    },
};
