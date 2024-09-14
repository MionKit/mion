/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeRegexp} from '../_deepkit/src/reflection/type';
import type {JitOperation, JitJsonEncoder, MockContext, JitTypeErrorOperation, JitConstants} from '../types';
import {getJitErrorPath, getExpected} from '../utils';
import {mockRegExp} from '../mock';
import {AtomicRunType} from '../baseRunTypes';

const jitConstants: JitConstants = {
    skipJit: false,
    skipJsonEncode: false,
    skipJsonDecode: false,
    isCircularRef: false,
    jitId: ReflectionKind.regexp,
};

export class RegexpRunType extends AtomicRunType<TypeRegexp> {
    src: TypeRegexp = null as any; // will be set after construction
    constants = () => jitConstants;
    getName(): string {
        return 'regexp';
    }
    _compileIsType(stack: JitOperation): string {
        return `(${stack.args.vλl} instanceof RegExp)`;
    }
    _compileTypeErrors(stack: JitTypeErrorOperation): string {
        return `if (!(${stack.args.vλl} instanceof RegExp)) ${stack.args.εrrors}.push({path: ${getJitErrorPath(stack)}, expected: ${getExpected(this)}})`;
    }
    _compileJsonEncode(stack: JitOperation): string {
        return RegexpJitJsonEncoder.encodeToJson(stack.args.vλl);
    }
    _compileJsonDecode(stack: JitOperation): string {
        return RegexpJitJsonEncoder.decodeFromJson(stack.args.vλl);
    }
    _compileJsonStringify(stack: JitOperation): string {
        return RegexpJitJsonEncoder.stringify(stack.args.vλl);
    }
    mock(stack?: Pick<MockContext, 'regexpList'>): RegExp {
        return mockRegExp(stack?.regexpList);
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
