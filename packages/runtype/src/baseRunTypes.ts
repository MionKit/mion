/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {Type} from './_deepkit/src/reflection/type';
import type {
    JitOperation,
    JITCompiledFunctions,
    MockContext,
    RunType,
    DKwithRT,
    JitTypeErrorOperation,
    JitConstants,
    JitPathItem,
    Mutable,
} from './types';
import {addReturnCode, buildJITFunctions} from './jitCompiler';
import {getExpected, getJitErrorPath, memo} from './utils';
import {
    addReturnCodeAndHandleCompileCache,
    handleCircularStackAndJitCacheCompiling,
    shouldCallJitCache,
    shouldSkiJsonEncode,
    shouldSkipJit,
    shouldSkipJsonDecode,
} from './jitCircular';
import {maxStackDepth, maxStackErrorMessage} from './constants';

type DkCollection = Type & {types: Type[]};
type DkMember = Type & {type: Type; optional: boolean};

export abstract class BaseRunType<T extends Type> implements RunType {
    abstract readonly src: T;
    abstract getName(): string;
    abstract getFamily(): 'A' | 'C' | 'M' | 'F'; // Atomic, Collection, Member, Function
    abstract compileIsType(op: JitOperation): string;
    abstract compileTypeErrors(op: JitTypeErrorOperation): string;
    abstract compileJsonEncode(op: JitOperation): string;
    abstract compileJsonDecode(op: JitOperation): string;
    abstract compileJsonStringify(op: JitOperation): string;
    abstract constants: (stack: RunType[]) => JitConstants;
    abstract mock(mockContext?: MockContext): any;
    compile = memo((): JITCompiledFunctions => buildJITFunctions(this));
    getJitId = () => this.constants([]).jitId;
}

/**
 * RunType that is atomic an does not contains any other child runTypes.
 * ie: string, number, boolean, any, null, undefined, void, never, bigint, etc.
 * */
export abstract class AtomicRunType<T extends Type> extends BaseRunType<T> {
    getFamily(): 'A' {
        return 'A';
    }
    abstract constants: () => JitConstants;

    compileIsType(op: JitOperation): string {
        const compiled = this._compileIsType(op);
        return op.stack.length > 0 ? compiled : `return ${compiled}`;
    }
    compileTypeErrors(op: JitTypeErrorOperation): string {
        return this._compileTypeErrors(op);
    }
    compileJsonEncode(op: JitOperation): string {
        const compiled = this._compileJsonEncode(op);
        return op.stack.length > 0 ? compiled : `return ${compiled}`;
    }
    compileJsonDecode(op: JitOperation): string {
        const compiled = this._compileJsonDecode(op);
        return op.stack.length > 0 ? compiled : `return ${compiled}`;
    }
    compileJsonStringify(op: JitOperation): string {
        const compiled = this._compileJsonStringify(op);
        return op.stack.length > 0 ? compiled : `return ${compiled}`;
    }

    protected abstract _compileIsType(op: JitOperation): string;
    protected abstract _compileTypeErrors(op: JitTypeErrorOperation): string;
    protected abstract _compileJsonEncode(op: JitOperation): string;
    protected abstract _compileJsonDecode(op: JitOperation): string;
    protected abstract _compileJsonStringify(op: JitOperation): string;
}

export abstract class NonAtomicBaseRunType<T extends Type> extends BaseRunType<T> {
    compileIsType(op: JitOperation): string {
        if (shouldSkipJit(this)) return addReturnCode(this._compileIsTypeNoChildren(op), op, false);
        const codeContainsReturn = this.hasReturnCompileIsType();
        const compNext = () => {
            const oldArgs = this.pushStack(op);
            const code = this._compileIsType(op);
            this.popStack(op, oldArgs);
            return code;
        };
        return addReturnCodeAndHandleCompileCache(compNext, this, op, codeContainsReturn, 'isT');
    }
    compileTypeErrors(op: JitTypeErrorOperation): string {
        const codeContainsReturn = false;
        if (shouldSkipJit(this)) return addReturnCode(this._compileTypeErrorsNoChildren(op), op, codeContainsReturn);
        const compNext = () => {
            const oldArgs = this.pushStack(op);
            const code = this._compileTypeErrors(op);
            this.popStack(op, oldArgs);
            return code;
        };
        const typeErrorsCode = handleCircularStackAndJitCacheCompiling(compNext as any, this, op, codeContainsReturn, 'TErr');
        const pathLength = op.stack.length;
        if (shouldCallJitCache(this) && pathLength > 0) {
            const updatePathArgs = op.path
                .filter((i) => !!i)
                .map((item) => item.literal)
                .join(',');
            return `
            ${op.args.pλth}.push(${updatePathArgs});
            ${typeErrorsCode}
            ${op.args.pλth}.splice(-${pathLength});
        `;
        }
        return typeErrorsCode;
    }
    compileJsonEncode(op: JitOperation): string {
        const codeContainsReturn = false;
        if (shouldSkiJsonEncode(this)) return addReturnCode(this._compileJsonEncodeNoChildren(op), op, codeContainsReturn);
        const compNext = () => {
            const oldArgs = this.pushStack(op);
            const code = this._compileJsonEncode(op);
            this.popStack(op, oldArgs);
            return code;
        };
        const compiled = handleCircularStackAndJitCacheCompiling(compNext, this, op, codeContainsReturn, 'jsonE');
        return op.stack.length > 0 ? compiled : `${compiled}; return ${op.args.vλl}`;
    }
    compileJsonDecode(op: JitOperation): string {
        const codeContainsReturn = false;
        if (shouldSkipJsonDecode(this)) return addReturnCode(this._compileJsonDecodeNoChildren(op), op, codeContainsReturn);
        const compNext = () => {
            const oldArgs = this.pushStack(op);
            const code = this._compileJsonDecode(op);
            this.popStack(op, oldArgs);
            return code;
        };
        const compiled = handleCircularStackAndJitCacheCompiling(compNext, this, op, codeContainsReturn, 'jsonD');
        return op.stack.length > 0 ? compiled : `${compiled}; return ${op.args.vλl}`;
    }
    compileJsonStringify(op: JitOperation): string {
        if (shouldSkipJit(this)) return addReturnCode(this._compileJsonStringifyNoChildren(op), op, false);
        const codeContainsReturn = this.hasReturnCompileJsonStringify();
        const compNext = () => {
            const oldArgs = this.pushStack(op);
            const code = this._compileJsonStringify(op);
            this.popStack(op, oldArgs);
            return code;
        };
        return addReturnCodeAndHandleCompileCache(compNext, this, op, codeContainsReturn, 'jsonS');
    }

    private pushStack(op: JitOperation | JitTypeErrorOperation): JitOperation['args'] {
        if (op.stack.length > maxStackDepth) throw new Error(maxStackErrorMessage);
        // updates the context by updating parents, path and args
        const pathItem = this.getPathItem(op);
        const args = {...op.args}; // copy args to ensure child operations don't affect parent operations
        op.stack.push(this);
        op.path.push(pathItem);
        if (pathItem) {
            const useArray = pathItem.useArrayAccessor ?? typeof pathItem.vλl === 'number';
            const childAccessor = useArray ? `[${pathItem.literal}]` : `.${pathItem.vλl}`;
            op.args.vλl = `${op.args.vλl}${childAccessor}`;
        }
        return args;
    }

    private popStack(op: JitOperation | JitTypeErrorOperation, oldOrgs: JitOperation['args']) {
        op.path.pop();
        op.stack.pop();
        op.args = oldOrgs;
    }

    protected abstract _compileIsType(op: JitOperation): string;
    protected abstract _compileTypeErrors(op: JitTypeErrorOperation): string;
    protected abstract _compileJsonEncode(op: JitOperation): string;
    protected abstract _compileJsonDecode(op: JitOperation): string;
    protected abstract _compileJsonStringify(op: JitOperation): string;

    // scenario where the runType has no children
    protected abstract _compileIsTypeNoChildren(op: JitOperation): string;
    protected abstract _compileTypeErrorsNoChildren(op: JitTypeErrorOperation): string;
    protected abstract _compileJsonEncodeNoChildren(op: JitOperation): string;
    protected abstract _compileJsonDecodeNoChildren(op: JitOperation): string;
    protected abstract _compileJsonStringifyNoChildren(op: JitOperation): string;

    protected abstract hasReturnCompileIsType(): boolean;
    protected abstract hasReturnCompileJsonStringify(): boolean;
    protected abstract getPathItem(op: JitOperation): JitPathItem | null;
}

/**
 * RunType that contains a collection or child runTypes.
 * Collection RunTypes are the only ones that can have circular references. as a child of a collection RunType can be the parent of the collection RunType.
 * i.e: interface, child runTypes are it's properties
 * i.e: tuple, it's child runTypes are the tuple members
 */
export abstract class CollectionRunType<T extends Type> extends NonAtomicBaseRunType<T> {
    getFamily(): 'C' {
        return 'C';
    }
    getChildRunTypes = (): RunType[] => {
        const childTypes = ((this.src as DkCollection).types as DKwithRT[]) || []; // deepkit stores child types in the types property
        return childTypes.map((t) => t._rt);
    };
    getJitChildren(): RunType[] {
        return this.getChildRunTypes().filter((c) => !c.constants().skipJit);
    }
    getJsonEncodeChildren(): RunType[] {
        return this.getChildRunTypes().filter((c) => !c.constants().skipJit && !c.constants().skipJsonEncode);
    }
    getJsonDecodeChildren(): RunType[] {
        return this.getChildRunTypes().filter((c) => !c.constants().skipJit && !c.constants().skipJsonDecode);
    }
    constants = memo((stack: RunType[] = []): JitConstants => {
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
            const childConstants = child.constants(stack);
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
export abstract class MemberRunType<T extends Type> extends NonAtomicBaseRunType<T> {
    abstract useArrayAccessor(): boolean;
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
        if (member.constants().skipJit) member = undefined;
        return member;
    }
    getJsonEncodeChild(): RunType | undefined {
        const child = this.getJitChild();
        if (!child || child.constants().skipJsonEncode) return undefined;
        return child;
    }
    getJsonDecodeChild(): RunType | undefined {
        const child = this.getJitChild();
        if (!child || child.constants().skipJsonDecode) return undefined;
        return child;
    }
    constants = memo((stack: RunType[] = []): JitConstants => {
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
        const memberValues = member.constants(stack);
        const optional = this.isOptional() ? '?' : '';
        const jitCts: JitConstants = {
            ...memberValues,
            jitId: `${this.src.kind}${optional}:${memberValues.jitId}`,
        };
        stack.pop();
        console.log('jitCts', jitCts);
        return jitCts;
    });
}

export abstract class SingleItemMemberRunType<T extends Type> extends MemberRunType<T> {
    // #### no children jit methods ####
    protected _compileIsTypeNoChildren(): string {
        return 'true';
    }
    protected _compileTypeErrorsNoChildren(): string {
        return '';
    }
    protected _compileJsonEncodeNoChildren(): string {
        return '';
    }
    protected _compileJsonDecodeNoChildren(): string {
        return '';
    }
    protected _compileJsonStringifyNoChildren(): string {
        return `''`;
    }
}

export abstract class ArrayMemberRunType<T extends Type> extends MemberRunType<T> {}

export abstract class ArrayCollectionRunType<T extends Type> extends CollectionRunType<T> {
    protected hasReturnCompileIsType(): boolean {
        return true;
    }
    protected hasReturnCompileJsonStringify(): boolean {
        return true;
    }
    protected _compileIsTypeNoChildren(op: JitOperation): string {
        return `Array.isArray(${op.args.vλl})`;
    }
    protected _compileTypeErrorsNoChildren(op: JitTypeErrorOperation): string {
        return `
            if (!Array.isArray(${op.args.vλl})) ${op.args.εrrors}.push({path: ${getJitErrorPath(op)}, expected: ${getExpected(this)}});
        `;
    }
    protected _compileJsonEncodeNoChildren(): string {
        return '';
    }
    protected _compileJsonDecodeNoChildren(): string {
        return '';
    }
    protected _compileJsonStringifyNoChildren(): string {
        return '[]';
    }
}

export abstract class ObjectCollectionRunType<T extends Type> extends CollectionRunType<T> {
    protected hasReturnCompileIsType(): boolean {
        return true;
    }
    protected hasReturnCompileJsonStringify(): boolean {
        return true;
    }
    protected _compileIsTypeNoChildren(op: JitOperation): string {
        return `typeof ${op.args.vλl} === 'object' && ${op.args.vλl} !== null && !Array.isArray(${op.args.vλl})`;
    }
    protected _compileTypeErrorsNoChildren(op: JitTypeErrorOperation): string {
        return `
            if (typeof ${op.args.vλl} !== 'object' && ${op.args.vλl} !== null && !Array.isArray(${op.args.vλl})) {
                ${op.args.εrrors}.push({path: ${getJitErrorPath(op)}, expected: ${getExpected(this)}});
            }
        `;
    }
    protected _compileJsonEncodeNoChildren(): string {
        return '';
    }
    protected _compileJsonDecodeNoChildren(): string {
        return '';
    }
    protected _compileJsonStringifyNoChildren(): string {
        return '{}';
    }
}

export abstract class SingleItemCollectionRunType<T extends Type> extends CollectionRunType<T> {
    protected hasReturnCompileIsType(): boolean {
        return true;
    }
    protected hasReturnCompileJsonStringify(): boolean {
        return true;
    }
    protected _compileIsTypeNoChildren(): string {
        return 'true';
    }
    protected _compileTypeErrorsNoChildren(): string {
        return '';
    }
    protected _compileJsonEncodeNoChildren(): string {
        return '';
    }
    protected _compileJsonDecodeNoChildren(): string {
        return '';
    }
    protected _compileJsonStringifyNoChildren(): string {
        return `''`;
    }
}
