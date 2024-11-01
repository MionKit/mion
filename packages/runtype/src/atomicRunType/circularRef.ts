import type {Type} from '../_deepkit/src/reflection/type';
import type {DKwithRT, JitConstants} from '../types';
import {AtomicRunType} from '../baseRunTypes';
import {
    getJITFnId,
    type JitCompileOperation,
    type jitIsTypeCompileOperation,
    type JitJsonDecodeCompileOperation,
    type JitJsonEncodeCompileOperation,
    type JitJsonStringifyCompileOperation,
    type JitTypeErrorCompileOperation,
} from '../jitCompiler';
import {toLiteral} from '../utils';
import {jitNames} from '../constants';

const jitConstants: JitConstants = {
    skipJit: false,
    skipJsonEncode: false,
    skipJsonDecode: false,
    jitId: '$',
};

export class BooleanRunType extends AtomicRunType<Type> {
    src: DKwithRT = null as any;
    getJitConstants = () => jitConstants;
    _compileIsType(cop: jitIsTypeCompileOperation): string {
        return this.getFunctionInvocation(cop);
    }
    _compileTypeErrors(cop: JitTypeErrorCompileOperation): string {
        const pathArgs = cop.getStackStaticPathArgs();
        const pathLength = cop.getStaticPathLength();
        return `${cop.args.pλth}.push(${pathArgs}); ${this.getFunctionInvocation(cop)}; ${cop.args.pλth}.splice(-${pathLength});`;
    }
    _compileJsonEncode(cop: JitJsonEncodeCompileOperation): string {
        return this.getFunctionInvocation(cop);
    }
    _compileJsonDecode(cop: JitJsonDecodeCompileOperation): string {
        return this.getFunctionInvocation(cop);
    }
    _compileJsonStringify(cop: JitJsonStringifyCompileOperation): string {
        return this.getFunctionInvocation(cop);
    }

    private getFunctionInvocation(cop: JitCompileOperation<any>): string {
        const id = toLiteral(getJITFnId(cop.opId, this.src._rt));
        return `${jitNames.utils}.getCachedFn(${id})(${Object.values(cop.args).join(', ')})`;
    }

    mock(): boolean {
        return this.src._rt.mock();
    }
}
