import type {Type} from '../_deepkit/src/reflection/type';
import type {DKwithRT, JitConstants} from '../types';
import {AtomicRunType} from '../baseRunTypes';
import {getJITFnHash, type JitCompiler, type JitErrorsCompiler} from '../jitCompiler';
import {toLiteral} from '../utils';

const jitConstants: JitConstants = {
    skipJit: false,
    skipJsonEncode: false,
    skipJsonDecode: false,
    jitId: '$',
};

export class BooleanRunType extends AtomicRunType<Type> {
    src: DKwithRT = null as any;
    getJitConstants = () => jitConstants;
    _compileIsType(cop: JitCompiler): string {
        return this.getFunctionInvocation(cop);
    }
    _compileTypeErrors(cop: JitErrorsCompiler): string {
        const pathArgs = cop.getStackStaticPathArgs();
        const pathLength = cop.getStaticPathLength();
        return `${cop.args.pλth}.push(${pathArgs}); ${this.getFunctionInvocation(cop)}; ${cop.args.pλth}.splice(-${pathLength});`;
    }
    _compileJsonEncode(cop: JitCompiler): string {
        return this.getFunctionInvocation(cop);
    }
    _compileJsonDecode(cop: JitCompiler): string {
        return this.getFunctionInvocation(cop);
    }
    _compileJsonStringify(cop: JitCompiler): string {
        return this.getFunctionInvocation(cop);
    }

    private getFunctionInvocation(cop: JitCompiler<any>): string {
        const id = toLiteral(getJITFnHash(cop.opId, this.src._rt));
        return `µTils.getCachedFn(${id})(${Object.values(cop.args).join(', ')})`;
    }

    mock(): boolean {
        return this.src._rt.mock();
    }
}
