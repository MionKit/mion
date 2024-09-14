/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeSymbol} from '../_deepkit/src/reflection/type';
import type {JitOperation, JitJsonEncoder, MockContext, JitTypeErrorOperation, JitConstants} from '../types';
import {getJitErrorPath, getExpected} from '../utils';
import {mockSymbol} from '../mock';
import {AtomicRunType} from '../baseRunTypes';

const jitConstants: JitConstants = {
    skipJit: true,
    skipJsonEncode: true,
    skipJsonDecode: true,
    isCircularRef: false,
    jitId: ReflectionKind.symbol,
};

export class SymbolRunType extends AtomicRunType<TypeSymbol> {
    src: TypeSymbol = null as any; // will be set after construction
    constants = () => jitConstants;
    getName(): string {
        return 'symbol';
    }
    _compileIsType(stack: JitOperation): string {
        return `typeof ${stack.args.vλl} === 'symbol'`;
    }
    _compileTypeErrors(stack: JitTypeErrorOperation): string {
        return `if (typeof ${stack.args.vλl} !== 'symbol') ${stack.args.εrrors}.push({path: ${getJitErrorPath(stack)}, expected: ${getExpected(this)}})`;
    }
    _compileJsonEncode(stack: JitOperation): string {
        return SymbolJitJsonEncoder.encodeToJson(stack.args.vλl);
    }
    _compileJsonDecode(stack: JitOperation): string {
        return SymbolJitJsonEncoder.decodeFromJson(stack.args.vλl);
    }
    _compileJsonStringify(stack: JitOperation): string {
        return SymbolJitJsonEncoder.stringify(stack.args.vλl);
    }
    mock(stack?: Pick<MockContext, 'symbolLength' | 'symbolCharSet' | 'symbolName'>): symbol {
        return mockSymbol(stack?.symbolName, stack?.symbolLength, stack?.symbolCharSet);
    }
}

export const SymbolJitJsonEncoder: JitJsonEncoder = {
    decodeFromJson(vλl: string): string {
        return `${vλl} = Symbol(${vλl}.substring(7))`;
    },
    encodeToJson(vλl: string): string {
        return `${vλl} =  'Symbol:' + (${vλl}.description || '')`;
    },
    stringify(vλl: string): string {
        return `JSON.stringify('Symbol:' + (${vλl}.description || ''))`;
    },
};
