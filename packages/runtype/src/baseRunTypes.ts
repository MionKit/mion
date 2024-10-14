/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {Type} from './_deepkit/src/reflection/type';
import type {JITCompiledFunctions, MockContext, RunType, DKwithRT, JitConstants, Mutable, PathItem} from './types';
import {buildJITFunctions} from './jitCompiler';
import {memo} from './utils';
import {maxStackDepth, maxStackErrorMessage} from './constants';
import {JitCompileOp, JitCompileOperation, JitTypeErrorCompileOp} from './jitOperation';

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

    // ########## Compile Methods ##########

    // child classes must implement these methods that contains the jit generation logic
    protected abstract _compileIsType(cop: JitCompileOp): string;
    protected abstract _compileTypeErrors(cop: JitTypeErrorCompileOp): string;
    protected abstract _compileJsonEncode(cop: JitCompileOp): string;
    protected abstract _compileJsonDecode(cop: JitCompileOp): string;
    protected abstract _compileJsonStringify(cop: JitCompileOp): string;

    // these methods handle circular compiling and increase/decrease the stack level
    compileIsType(cop: JitCompileOp): string {
        let code: string | undefined;
        cop.pushStack(this);
        if (this.getJitConstants().isCircularRef) {
            code = this.handleReturn(this.callCircularJitFn(cop), cop, false);
        } else {
            const codeHasReturn = this.hasReturnCompileIsType();
            code = this._compileIsType(cop);
            code = this.handleReturn(code, cop, codeHasReturn);
        }
        cop.popStack();
        return code;
    }
    compileTypeErrors(cop: JitTypeErrorCompileOp): string {
        let code: string | undefined;
        cop.pushStack(this);
        if (this.getJitConstants().isCircularRef) {
            code = this.callCircularJitFn(cop);
            const pathLength = cop.length - 1;
            if (pathLength > 0) {
                code = `
                    ${cop.args.pλth}.push(${cop.getStaticPathArgs()});
                    ${code}
                    ${cop.args.pλth}.splice(-${pathLength});
                `;
                code = this.handleReturn(code, cop, false);
            }
        } else {
            const codeHasReturn = this.hasReturnCompileTypeErrors();
            code = this._compileTypeErrors(cop);
            code = this.handleReturn(code, cop, codeHasReturn);
        }
        cop.popStack();
        return code;
    }
    compileJsonEncode(cop: JitCompileOp): string {
        let code: string | undefined;
        cop.pushStack(this);
        if (this.getJitConstants().isCircularRef) {
            code = this.handleReturn(this.callCircularJitFn(cop), cop, false);
        } else {
            const codeHasReturn = this.hasReturnCompileJsonEncode();
            code = this._compileJsonEncode(cop);
            code = this.handleReturn(code, cop, codeHasReturn);
        }
        cop.popStack();
        return code;
    }
    compileJsonDecode(cop: JitCompileOp): string {
        let code: string | undefined;
        cop.pushStack(this);
        if (this.getJitConstants().isCircularRef) {
            code = this.handleReturn(this.callCircularJitFn(cop), cop, false);
        } else {
            const codeHasReturn = this.hasReturnCompileJsonDecode();
            code = this._compileJsonDecode(cop);
            code = this.handleReturn(code, cop, codeHasReturn);
        }
        cop.popStack();
        return code;
    }
    compileJsonStringify(cop: JitCompileOp): string {
        let code: string | undefined;
        cop.pushStack(this);
        if (this.getJitConstants().isCircularRef) {
            code = this.handleReturn(this.callCircularJitFn(cop), cop, false);
        } else {
            const codeHasReturn = this.hasReturnCompileJsonStringify();
            code = this._compileJsonStringify(cop);
            code = this.handleReturn(code, cop, codeHasReturn);
        }
        cop.popStack();
        return code;
    }

    // ########## Other Methods ##########
    // handleReturn must be called before popStack gets called
    private handleReturn(code: string, jitOp: JitCompileOperation, codeHasReturn: boolean): string {
        if (jitOp.length > 1) {
            // code contains a return and possibly more statements, we need to wrap it in a self invoking function to avoid syntax errors
            if (codeHasReturn && jitOp.codeUnit === 'EXPRESSION') return `(function(){${code}})()`;
            // code is just a statement (i.e: typeof var === 'number'), we can return it directly
            return code;
        }
        // nestLevel === 0 (root of the function)
        if (codeHasReturn) return code; // code already contains a return, we can return it directly
        if (this.getFamily() === 'A' && jitOp.codeUnit !== 'BLOCK') return `return ${code}`; // atomic types should return the value directly
        return `${code}${code ? ';' : ''}return ${jitOp.returnName}`; // code is a block or a composite type, main value must be returned;
    }
    private callCircularJitFn(cop: JitCompileOperation): string {
        return `${cop.name}(${Object.values(cop.args).join(', ')})`;
    }

    // ########## Return flags ##########
    // any child with different settings should override these methods
    // these flags are used to determine if the compiled code should be wrapped in a self invoking function or not
    // or if the compiled code should contain a return statement or not
    // all atomic types should have these same flags (code should never have a return statement)
    protected hasReturnCompileIsType(): boolean {
        return false;
    }
    protected hasReturnCompileTypeErrors(): boolean {
        return false;
    }
    protected hasReturnCompileJsonEncode(): boolean {
        return false;
    }
    protected hasReturnCompileJsonDecode(): boolean {
        return false;
    }
    protected hasReturnCompileJsonStringify(): boolean {
        return false;
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
    abstract getJitChildrenPath(cop: JitCompileOp): PathItem | null;
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
        const isInStack = stack.some((rt) => rt === this); // recursive reference
        if (isInStack) {
            return {
                skipJit: false, // ensures that jit is ran when circular reference is found
                skipJsonEncode: true,
                skipJsonDecode: true,
                jitId: '$elf',
                isCircularRef: true,
            };
        }
        stack.push(this);
        const childrenJitIds: (string | number)[] = [];
        const children = this.getChildRunTypes();
        const jitCts: Mutable<JitConstants> = {
            skipJit: true,
            skipJsonEncode: true,
            skipJsonDecode: true,
            isCircularRef: true,
            jitId: ``,
        };
        for (const child of children) {
            const childConstants = child.getJitConstants(stack);
            jitCts.skipJit &&= childConstants.skipJit;
            jitCts.skipJsonEncode &&= childConstants.skipJsonEncode;
            jitCts.skipJsonDecode &&= childConstants.skipJsonDecode;
            jitCts.isCircularRef &&= childConstants.isCircularRef;
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
export abstract class MemberRunType<T extends Type> extends BaseRunType<T> {
    abstract getJitChildrenPath(cop: JitCompileOp): PathItem | null;
    abstract isOptional(): boolean;
    abstract getMemberName(): string | number;
    getFamily(): 'M' {
        return 'M';
    }
    getMemberType = (): RunType => {
        const memberType = (this.src as DkMember).type as DKwithRT; // deepkit stores member types in the type property
        return memberType._rt;
    };
    getMemberIndex(): number {
        const parent = this.src.parent;
        if (!parent) return -1;
        const types = (parent as DkCollection).types;
        if (types) return types.indexOf(this.src);
        return 0;
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
        const isInStack = stack.some((rt) => rt === this); // recursive reference
        if (isInStack) {
            return {
                jitId: '$',
                skipJit: false,
                skipJsonEncode: false,
                skipJsonDecode: false,
                isCircularRef: true,
            };
        }
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
