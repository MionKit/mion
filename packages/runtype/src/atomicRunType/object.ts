/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeAny, type TypeUnknown} from '../_deepkit/src/reflection/type';
import type {MockContext, JitConstants} from '../types';
import {random} from '../mock';
import {getJitErrorPath, getExpected} from '../utils';
import {mockObjectList} from '../constants';
import {AtomicRunType} from '../baseRunTypes';
import {JitCompileOp, JitTypeErrorCompileOp} from '../jitOperation';

const jitConstants: JitConstants = {
    skipJit: false,
    skipJsonEncode: true,
    skipJsonDecode: true,
    isCircularRef: false,
    jitId: ReflectionKind.object,
};

export class ObjectRunType extends AtomicRunType<TypeAny | TypeUnknown> {
    src: TypeAny | TypeUnknown = null as any; // will be set after construction
    getJitConstants = () => jitConstants;
    getName(): string {
        return 'object';
    }
    _compileIsType(cop: JitCompileOp): string {
        return `(typeof ${cop.args.vλl} === 'object' && ${cop.args.vλl} !== null)`;
    }
    _compileTypeErrors(cop: JitTypeErrorCompileOp): string {
        return `if (!(${this._compileIsType(cop)})) ${cop.args.εrrors}.push({path: ${getJitErrorPath(cop)}, expected: ${getExpected(this)}})`;
    }
    _compileJsonEncode(cop: JitCompileOp): string {
        return cop.vλl;
    }
    _compileJsonDecode(cop: JitCompileOp): string {
        return cop.vλl;
    }
    _compileJsonStringify(cop: JitCompileOp): string {
        return `JSON.stringify(${cop.args.vλl})`;
    }
    mock(cop?: Pick<MockContext, 'objectList'>): object {
        const objectList = cop?.objectList || mockObjectList;
        return objectList[random(0, objectList.length - 1)];
    }
}
