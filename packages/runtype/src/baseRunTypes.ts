/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {Type} from './_deepkit/src/reflection/type';
import type {
    JITCompiledFunctions,
    MockContext,
    RunType,
    DKwithRT,
    JitConstants,
    Mutable,
    RunTypeChildAccessor,
    StackCallFlags,
} from './types';
import {buildJITFunctions} from './jitCompiler';
import {getPropIndex, memo} from './utils';
import {maxStackDepth, maxStackErrorMessage} from './constants';
import {getNewAuxFnNameFromIndex, JitCompileOp, JitCompileOperation, JitTypeErrorCompileOp} from './jitOperation';

type DkCollection = Type & {types: Type[]};
type DkMember = Type & {type: Type; optional: boolean};

export abstract class BaseRunType<T extends Type> implements RunType {
    abstract readonly src: T;
    abstract getName(): string;
    abstract getFamily(): 'A' | 'C' | 'M' | 'F'; // Atomic, Collection, Member, Function
    abstract getJitConstants: (stack?: RunType[]) => JitConstants;
    abstract mock(mockContext?: MockContext): any;
    compile = memo((): JITCompiledFunctions => buildJITFunctions(this));
    getJitId = () => this.getJitConstants().jitId;
    getParent = (): RunType | undefined => (this.src.parent as DKwithRT)?._rt;
    getNestLevel = memo((): number => {
        if (this.auxFnName) return 0; // circular references start a new context
        const parent = this.getParent() as BaseRunType<T>;
        if (!parent) return 0;
        return parent.getNestLevel() + 1;
    });

    // ########## Compile Methods ##########

    // child classes must implement these methods that contains the jit generation logic
    abstract _compileIsType(cop: JitCompileOp): string;
    abstract _compileTypeErrors(cop: JitTypeErrorCompileOp): string;
    abstract _compileJsonEncode(cop: JitCompileOp): string;
    abstract _compileJsonDecode(cop: JitCompileOp): string;
    abstract _compileJsonStringify(cop: JitCompileOp): string;

    // these methods handle circular compiling and increase/decrease the stack level
    compileIsType(cop: JitCompileOp): string {
        const callFlags = cop.pushStack(this);
        let code: string | undefined;
        if (callFlags?.shouldCall) {
            code = this.callCircularJitFn(cop);
        } else {
            const codeHasReturn = this.hasReturnCompileIsType();
            code = this._compileIsType(cop);
            code = this.handleReturn(code, cop, codeHasReturn, callFlags);
        }
        cop.popStack();
        return code;
    }
    compileTypeErrors(cop: JitTypeErrorCompileOp): string {
        const callFlags = cop.pushStack(this);
        let code: string | undefined;
        if (callFlags?.shouldCall) {
            const pathArgs = cop.getStackStaticPathArgs();
            const pathLength = cop.getStaticPathLength();
            // increase and decrease the static path before and after calling the circular function
            code = `${cop.args.pλth}.push(${pathArgs}); ${this.callCircularJitFn(cop)}; ${cop.args.pλth}.splice(-${pathLength});`;
        } else {
            const codeHasReturn = this.hasReturnCompileTypeErrors();
            code = this._compileTypeErrors(cop);
            code = this.handleReturn(code, cop, codeHasReturn, callFlags);
        }
        cop.popStack();
        return code;
    }
    compileJsonEncode(cop: JitCompileOp): string {
        const callFlags = cop.pushStack(this);
        let code: string | undefined;
        if (callFlags?.shouldCall) {
            code = this.callCircularJitFn(cop);
        } else {
            const codeHasReturn = this.hasReturnCompileJsonEncode();
            code = this._compileJsonEncode(cop);
            code = this.handleReturn(code, cop, codeHasReturn, callFlags);
        }
        cop.popStack();
        return code;
    }
    compileJsonDecode(cop: JitCompileOp): string {
        const callFlags = cop.pushStack(this);
        let code: string | undefined;
        if (callFlags?.shouldCall) {
            code = this.callCircularJitFn(cop);
        } else {
            const codeHasReturn = this.hasReturnCompileJsonDecode();
            code = this._compileJsonDecode(cop);
            code = this.handleReturn(code, cop, codeHasReturn, callFlags);
        }
        cop.popStack();
        return code;
    }
    compileJsonStringify(cop: JitCompileOp): string {
        const callFlags = cop.pushStack(this);
        let code: string | undefined;
        if (callFlags?.shouldCall) {
            code = this.callCircularJitFn(cop);
        } else {
            const codeHasReturn = this.hasReturnCompileJsonStringify();
            code = this._compileJsonStringify(cop);
            code = this.handleReturn(code, cop, codeHasReturn, callFlags);
        }
        cop.popStack();
        return code;
    }

    // handleReturn must be called before popStack gets called
    private handleReturn(
        code: string,
        jitOp: JitCompileOperation,
        codeHasReturn: boolean,
        callFlags: StackCallFlags | undefined
    ): string {
        const codeWithReturn = this.handleReturnFromType(code, jitOp, codeHasReturn);
        if (callFlags?.shouldGenerate) {
            jitOp.addNewFunction(this.auxFnName as string, codeWithReturn);
        }
        if (jitOp.isRootItem()) {
            return jitOp.getAllCode();
        }
        // if we should generate a new function but we are not in the root of the function, we should also call the new function
        if (callFlags?.shouldGenerate) {
            return this.callCircularJitFn(jitOp);
        }
        return codeWithReturn;
    }

    private handleReturnFromType(code: string, jitOp: JitCompileOperation, codeHasReturn: boolean): string {
        const isRoot = jitOp.length === 1;
        if (!isRoot) {
            // code contains a return and possibly more statements, we need to wrap it in a self invoking function to avoid syntax errors
            if (codeHasReturn && jitOp.codeUnit === 'EXPRESSION') return `(function(){${code}})()`;
            // code is just a statement (i.e: typeof var === 'number'), we can return it directly
            return code;
        }
        // nestLevel === 0 (root of the function)
        if (codeHasReturn) return code; // code already contains a return, we can return it directly
        if (jitOp.codeUnit === 'EXPRESSION' || (this.getFamily() === 'A' && jitOp.codeUnit !== 'BLOCK')) return `return ${code}`; // atomic types should return the value directly
        return `${code}${code ? ';' : ''}return ${jitOp.returnName}`; // code is a block or a composite type, main value must be returned;
    }

    private callCircularJitFn(cop: JitCompileOperation): string {
        return cop.getJitCodeForFnCall(this.auxFnName as string);
    }

    // ########## Return flags ##########
    // any child with different settings should override these methods
    // these flags are used to determine if the compiled code should be wrapped in a self invoking function or not
    // or if the compiled code should contain a return statement or not
    // all atomic types should have these same flags (code should never have a return statement)
    hasReturnCompileIsType(): boolean {
        return false;
    }
    hasReturnCompileTypeErrors(): boolean {
        return false;
    }
    hasReturnCompileJsonEncode(): boolean {
        return false;
    }
    hasReturnCompileJsonDecode(): boolean {
        return false;
    }
    hasReturnCompileJsonStringify(): boolean {
        return false;
    }

    auxFnName?: string;
    isCircular?: boolean;

    getCircularJitConstants(stack: RunType[] = []): JitConstants | undefined {
        const inStackIndex = stack.findIndex((rt) => rt === this); // cant use isSameJitType because it uses getJitId
        const isInStack = inStackIndex >= 0; // recursive reference
        if (isInStack) {
            this.auxFnName = getNewAuxFnNameFromIndex(inStackIndex);
            this.isCircular = true;
            return {
                skipJit: false, // ensures that jit is ran when circular reference is found
                skipJsonEncode: true,
                skipJsonDecode: true,
                jitId: '$',
            };
        }
    }
}

/**
 * RunType that is atomic an does not contains any other child runTypes.
 * ie: string, number, boolean, any, null, undefined, void, never, bigint, etc.
 * */
export abstract class AtomicRunType<T extends Type> extends BaseRunType<T> {
    getFamily(): 'A' {
        return 'A';
    }
}

/**
 * RunType that contains a collection or child runTypes.
 * Collection RunTypes are the only ones that can have circular references. as a child of a collection RunType can be the parent of the collection RunType.
 * i.e: interface, child runTypes are it's properties
 * i.e: tuple, it's child runTypes are the tuple members
 */
export abstract class CollectionRunType<T extends Type> extends BaseRunType<T> {
    getFamily(): 'C' {
        return 'C';
    }
    getChildRunTypes = (): RunType[] => {
        const childTypes = ((this.src as DkCollection).types as DKwithRT[]) || []; // deepkit stores child types in the types property
        return childTypes.map((t) => t._rt);
    };
    getJitChildren(): RunType[] {
        return this.getChildRunTypes().filter((c) => !c.getJitConstants().skipJit);
    }
    getJsonEncodeChildren(): RunType[] {
        return this.getChildRunTypes().filter((c) => !c.getJitConstants().skipJit && !c.getJitConstants().skipJsonEncode);
    }
    getJsonDecodeChildren(): RunType[] {
        return this.getChildRunTypes().filter((c) => !c.getJitConstants().skipJit && !c.getJitConstants().skipJsonDecode);
    }
    getJitConstants = memo((stack: RunType[] = []): JitConstants => {
        if (stack.length > maxStackDepth) throw new Error(maxStackErrorMessage);
        const circularJitConstants = this.getCircularJitConstants(stack);
        if (circularJitConstants) return circularJitConstants;
        stack.push(this);
        const childrenJitIds: (string | number)[] = [];
        const children = this.getChildRunTypes();
        const jitCts: Mutable<JitConstants> = {
            skipJit: true,
            skipJsonEncode: true,
            skipJsonDecode: true,
            jitId: ``,
        };
        for (const child of children) {
            const childConstants = child.getJitConstants(stack);
            jitCts.skipJit &&= childConstants.skipJit;
            jitCts.skipJsonEncode &&= childConstants.skipJsonEncode;
            jitCts.skipJsonDecode &&= childConstants.skipJsonDecode;
            childrenJitIds.push(childConstants.jitId);
        }
        jitCts.jitId = `${this.src.kind}[${childrenJitIds.join(',')}]`;
        stack.pop();

        return jitCts;
    });
}

/**
 * RunType that contains a single member or child RunType. usually part of a collection RunType.
 * i.e object properties, {prop: memberType} where memberType is the child RunType
 */
export abstract class MemberRunType<T extends Type> extends BaseRunType<T> implements RunTypeChildAccessor {
    abstract isOptional(): boolean;
    abstract getChildVarName(): string | number;
    abstract getChildLiteral(): string | number;
    abstract useArrayAccessor(): boolean;
    getFamily(): 'M' {
        return 'M';
    }
    getMemberType = (): RunType => {
        const memberType = (this.src as DkMember).type as DKwithRT; // deepkit stores member types in the type property
        return memberType._rt;
    };
    getChildIndex(): number {
        return getPropIndex(this.src);
    }
    getJitChild(): RunType | undefined {
        let member: RunType | undefined = this.getMemberType();
        if (member.getJitConstants().skipJit) member = undefined;
        return member;
    }
    getJsonEncodeChild(): RunType | undefined {
        const child = this.getJitChild();
        if (!child || child.getJitConstants().skipJsonEncode) return undefined;
        return child;
    }
    getJsonDecodeChild(): RunType | undefined {
        const child = this.getJitChild();
        if (!child || child.getJitConstants().skipJsonDecode) return undefined;
        return child;
    }
    getJitConstants = memo((stack: RunType[] = []): JitConstants => {
        if (stack.length > maxStackDepth) throw new Error(maxStackErrorMessage);
        const circularJitConstants = this.getCircularJitConstants(stack);
        if (circularJitConstants) return circularJitConstants;
        stack.push(this);
        const member = this.getMemberType();
        const memberValues = member.getJitConstants(stack);
        const optional = this.isOptional() ? '?' : '';
        const jitCts: JitConstants = {
            ...memberValues,
            jitId: `${this.src.kind}${optional}:${memberValues.jitId}`,
        };
        stack.pop();
        return jitCts;
    });
}
