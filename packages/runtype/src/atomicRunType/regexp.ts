/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeRegexp} from '../_deepkit/src/reflection/type';
import type {JitJsonEncoder, MockContext, JitConstants} from '../types';
import {getJitErrorPath, getExpected} from '../utils';
import {mockRegExp} from '../mock';
import {AtomicRunType} from '../baseRunTypes';
import {JitCompileOp, JitTypeErrorCompileOp} from '../jitOperation';

const jitConstants: JitConstants = {
    skipJit: false,
    skipJsonEncode: false,
    skipJsonDecode: false,
    isCircularRef: false,
    jitId: ReflectionKind.regexp,
};

export class RegexpRunType extends AtomicRunType<TypeRegexp> {
    src: TypeRegexp = null as any; // will be set after construction
    getJitConstants = () => jitConstants;
    getName(): string {
        return 'regexp';
    }
    _compileIsType(cop: JitCompileOp): string {
        return `(${cop.args.vλl} instanceof RegExp)`;
    }
    _compileTypeErrors(cop: JitTypeErrorCompileOp): string {
        return `if (!(${cop.args.vλl} instanceof RegExp)) ${cop.args.εrrors}.push({path: ${getJitErrorPath(cop)}, expected: ${getExpected(this)}})`;
    }
    _compileJsonEncode(cop: JitCompileOp): string {
        return RegexpJitJsonEncoder.encodeToJson(cop.args.vλl);
    }
    _compileJsonDecode(cop: JitCompileOp): string {
        return RegexpJitJsonEncoder.decodeFromJson(cop.args.vλl);
    }
    _compileJsonStringify(cop: JitCompileOp): string {
        return RegexpJitJsonEncoder.stringify(cop.args.vλl);
    }
    mock(cop?: Pick<MockContext, 'regexpList'>): RegExp {
        return mockRegExp(cop?.regexpList);
    }
}

const matchRegExpString = '/\\/(.*)\\/(.*)?/';

export const RegexpJitJsonEncoder: JitJsonEncoder = {
    decodeFromJson(vλl: string): string {
        return `${vλl} = (function(){const parts = ${vλl}.match(${matchRegExpString}) ;return new RegExp(parts[1], parts[2] || '')})()`;
    },
    encodeToJson(vλl: string): string {
        return `${vλl} = (${vλl}.toString())`;
    },
    stringify(vλl: string): string {
        return `JSON.stringify(${vλl}.toString())`;
    },
};
