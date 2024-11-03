/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {JitFnArgs, RunType, Mutable, CompiledOperation, JitFnID} from './types';
import {JitFnNames, jitNames, maxStackDepth, maxStackErrorMessage} from './constants';
import {isChildAccessorType} from './guards';
import {isSameJitType, toLiteral} from './utils';
import {BaseRunType} from './baseRunTypes';
import {getJitIDHash, jitUtils} from './jitUtils';

export type StackItem = {
    /** current compile stack full variable accessor */
    vλl: string;
    /** current compile stack variable accessor */
    rt: RunType;
    /** if should call a dependency instead inline code, then this would contain the id of the dependency to call */
    dependencyId?: string;
};

export type JitCompilerLike = BaseCompiler | CompiledOperation;
export type JitDependencies = Map<string, JitCompilerLike>;

export class BaseCompiler<FnArgsNames extends JitFnArgs = JitFnArgs, ID extends JitFnID = any> {
    constructor(
        public readonly rootType: RunType,
        public readonly opId: ID,
        public readonly args: FnArgsNames,
        /** when creating the function it might have default values */
        public readonly defaultParamValues: Record<keyof FnArgsNames, string | null>,
        public readonly returnName: string,
        public readonly dependencies: JitDependencies = new Map()
    ) {
        this.jitFnHash = getJITFnHash(this.opId, this.rootType);
        this.jitId = this.rootType.getJitId();
        this.addDependency(this);
    }
    readonly jitId: string | number;
    readonly jitFnHash: string;
    readonly jitFn: ((...args: any[]) => any) | undefined;
    readonly code: string = '';
    /** The list of types being compiled.
     * each time there is a circular type a new substack is created.
     */
    readonly stack: StackItem[] = [];
    popItem: StackItem | undefined;

    /** current runType accessor in source code */
    get vλl(): string {
        return this._stackVλl;
    }
    /** shorthand for  this.length */
    get length() {
        return this.stack.length;
    }
    get totalLength() {
        let length = 0;
        this.dependencies.forEach((dep) => (length += dep instanceof BaseCompiler ? dep.length : 0));
        return length;
    }
    private _stackVλl: string = '';
    private _stackStaticPath: (string | number)[] = [];
    /** push new item to the stack, returns true if new child is already in the stack (is circular type) */
    pushStack(newChild: RunType): void {
        const totalLength = this.stack.length + this.totalLength;
        if (totalLength > maxStackDepth) throw new Error(maxStackErrorMessage);
        if (this.stack.length === 0) {
            if (newChild !== this.rootType) throw new Error('rootType should be the first item in the stack');
            newChild.getJitConstants(); // ensures the constants are generated in correct order
        }
        this._stackVλl = getStackVλl(this);
        this._stackStaticPath = getStackStaticPath(this);
        const newStackItem: StackItem = {vλl: this._stackVλl, rt: newChild};
        if (shouldCreateDependency(this, newChild)) {
            newStackItem.dependencyId = getJITFnHash(this.opId, newChild);
        }
        this.stack.push(newStackItem);
    }
    popStack(resultCode: string): void | ((...args: any[]) => any) {
        (this as Mutable<BaseCompiler>).code = resultCode;
        this.popItem = this.stack.pop();
        this._stackVλl = this.popItem?.vλl || this.args.vλl;
        this._stackStaticPath = getStackStaticPath(this);
        if (this.stack.length === 0) {
            try {
                return compiledFunction(this); // add the compiled function to jit cache
            } catch (e: any) {
                const fnCode = ` Code:\nfunction ${this.opId}(){${this.code}}`;
                const name = `(${this.rootType.getName()}:${this.rootType.getJitId()})`;
                throw new Error(`Error building ${this.opId} JIT function for type ${name}: ${e?.message} \n${fnCode}`);
            }
        }
    }
    getStackStaticPathArgs(): string {
        return this._stackStaticPath.join(',');
    }
    getStaticPathLength(): number {
        return this._stackStaticPath.length;
    }
    getStaticPathArgsForFnCall(): {args: string; length: number} {
        return {args: this.getStackStaticPathArgs(), length: this.getStaticPathLength()};
    }
    getCurrentStackItem(): StackItem {
        return this.stack[this.stack.length - 1];
    }
    getChildVλl(): string {
        const parent = this.getCurrentStackItem();
        if (!parent) return this.args.vλl;
        const rt = parent.rt;
        if (!isChildAccessorType(rt)) throw new Error(`cant get child var name from ${rt.getName()}`);
        return parent.vλl + (rt.useArrayAccessor() ? `[${rt.getChildLiteral()}]` : `.${rt.getChildVarName()}`);
    }
    getCodeFromCache(): string | undefined {
        return jitUtils.getCachedCompiledOperation(this.jitFnHash)?.code;
    }
    shouldCreateDependency(opId: JitFnID): boolean {
        const stackItem = this.getCurrentStackItem();
        const existingJitCompiler = this.getDependency(opId, stackItem.rt);
        return !!stackItem.dependencyId && this.stack.length > 1 && !existingJitCompiler;
    }
    shouldCallDependency(): boolean {
        const stackItem = this.getCurrentStackItem();
        return !!stackItem.dependencyId && this.stack.length > 1;
    }
    getDependencyCallCode(opId: JitFnID, fnID?: string): string {
        const stackItem = this.getCurrentStackItem();
        if (!stackItem.dependencyId) throw new Error('Current stack item is already a dependency');
        const fnId = fnID ?? getJITFnHash(opId, stackItem.rt);
        const id = toLiteral(fnId);
        const args = Object.entries(this.args)
            .map(([key, name]) => (key === 'vλl' ? stackItem.vλl : name))
            .join(',');
        return `µTils.getJitFn(${id})(${args})`;
    }
    getCompiledFunction(): (...args: any[]) => any {
        if (!this.jitFn) throw new Error('Can not get compiled function before the compile operation is finished');
        return this.jitFn;
    }
    hasDependency(opId: JitFnID, rootType: RunType): boolean {
        const id = `${opId}:${rootType.getJitId()}`;
        return this.dependencies.has(id);
    }
    getDependency(opId: JitFnID, rootType: RunType): JitCompilerLike | undefined {
        const id = `${opId}:${rootType.getJitId()}`;
        return this.dependencies.get(id);
    }
    addDependency(cop: JitCompilerLike) {
        const id = `${this.opId}:${cop.jitId}`;
        this.dependencies.set(id, this);
    }
}

// ################### Compile Operations ###################

export class JitCompiler<ID extends JitFnID = any> extends BaseCompiler<{vλl: 'vλl'}, ID> {
    constructor(rt: RunType, id: ID, dependencies?: JitDependencies) {
        super(rt, id, {vλl: 'vλl'}, {vλl: null}, 'vλl', dependencies);
    }
}

export class JitErrorsCompiler<ID extends JitFnID = any> extends BaseCompiler<{vλl: 'vλl'; pλth: 'pλth'; εrr: 'εrr'}, ID> {
    constructor(rt: RunType, id: ID, dependencies?: JitDependencies) {
        const args = {vλl: 'vλl', pλth: 'pλth', εrr: 'εrr'} as const;
        const defaultValues = {vλl: null, pλth: '[]', εrr: '[]'};
        super(rt, id, args, defaultValues, 'εrr', dependencies);
    }
}

// ################### Other Compiler functions ###################

export function shouldCreateDependency(cop: BaseCompiler, rt: RunType): boolean {
    if (cop.stack.length === 0) return false;
    if (rt.src.typeName) return true;
    const isRoot = cop.length === 1;
    const isExpression: boolean = (rt as BaseRunType).jitFnIsExpression(cop.opId);
    const codeHasReturn: boolean = (rt as BaseRunType).jitFnHasReturn(cop.opId);
    const isSelfInvoking = !isRoot && isExpression && codeHasReturn;
    if (isSelfInvoking) return true;
    const hasCircularParent = cop.stack.some((i) => isSameJitType(i.rt, rt));
    return hasCircularParent;
}

export function getJITFnHash(id: JitFnID, rt: RunType): string {
    const hash = getJitIDHash(rt.getJitId().toString());
    return `${id}_${hash}`;
}

export function getJitFnCode(cop: JitCompilerLike): {fnName: string; fnCode: string} {
    const fnName = process.env.DEBUG_JIT ? `${JitFnNames[cop.opId]}${cop.jitFnHash}` : JitFnNames[cop.opId];
    const fnArgs = getJitFnArgs(cop); // function arguments with default values ie: 'vλl, pλth=[], εrr=[]'
    const fnCode = `function ${fnName}(${fnArgs}){${cop.code}}`;
    return {fnName, fnCode};
}

function compiledFunction(cop: BaseCompiler): (...args: any[]) => any {
    if (cop.jitFn) return cop.jitFn;
    if (!cop.code || cop.stack.length !== 0)
        throw new Error('Can not get compiled function before the compile operation is finished');
    const fn = jitUtils.getCachedFn(cop.jitFnHash);
    if (fn) return fn;
    const {fnCode, fnName} = getJitFnCode(cop);
    const newFn = createJitFnWithContext(fnCode, fnName);
    (cop as Mutable<BaseCompiler>).jitFn = newFn;
    jitUtils.addCachedFn(cop.jitFnHash, cop as CompiledOperation);
    return newFn;
}

/**
 * Create a JIT function that has jitUtils (and possibly other required variables) in the context,
 * This way jitUtils ca be used without passing them as arguments to every atomic jit function (kind of global variables).
 * @param varName
 * @param code
 * @returns
 */
function createJitFnWithContext(code: string, functionName): (...args: any[]) => any {
    // this function will have jitUtils as context as is an argument of the enclosing function
    const fnWithContext = `${code}\nreturn ${functionName};`;
    try {
        const wrapperWithContext = new Function(jitNames.utils, fnWithContext);
        if (process.env.DEBUG_JIT) console.log(code);
        return wrapperWithContext(jitUtils); // returns the jit internal function with the context
    } catch (e: any) {
        if (process.env.DEBUG_JIT) console.warn('Error creating jit function with context code:\n', code);
        throw e;
    }
}

function getJitFnArgs(cop: JitCompilerLike): string {
    return Object.entries(cop.args)
        .map(([key, name]) => {
            if (!cop.defaultParamValues[key]) return name;
            const value = cop.defaultParamValues[key];
            return `${name}=${value}`;
        })
        .join(',');
}

function getStackVλl(cop: BaseCompiler): string {
    let vλl = cop.args.vλl;
    for (let i = 0; i < cop.stack.length; i++) {
        const rt = cop.stack[i].rt;
        if (isChildAccessorType(rt)) {
            vλl += rt.useArrayAccessor() ? `[${rt.getChildLiteral()}]` : `.${rt.getChildVarName()}`;
        }
    }
    return vλl;
}
function getStackStaticPath(cop: BaseCompiler): (string | number)[] {
    const path: (string | number)[] = [];
    for (let i = 0; i < cop.stack.length; i++) {
        const rt = cop.stack[i].rt;
        if (isChildAccessorType(rt)) {
            path.push(rt.getChildLiteral());
        }
    }
    return path;
}

// export function getSerializableJitCompiler(compiled: JITCompiledFunctions): SerializableJITFunctions {
//     return {
//         isType: {argNames: compiled.isType.argNames, code: compiled.isType.code},
//         typeErrors: {argNames: compiled.typeErrors.argNames, code: compiled.typeErrors.code},
//         jsonEncode: {argNames: compiled.jsonEncode.argNames, code: compiled.jsonEncode.code},
//         jsonDecode: {argNames: compiled.jsonDecode.argNames, code: compiled.jsonDecode.code},
//         jsonStringify: {argNames: compiled.jsonStringify.argNames, code: compiled.jsonStringify.code},
//     };
// }

// export function codifyJitFn(fn: JitFnData<(vλl: any) => any>): string {
//     const argNames = fn.argNames;
//     return `{\n  argNames:${arrayToLiteral(argNames)},\n  code:${toLiteral(fn.code)},\n  fn:function(${argNames.join(',')}){${fn.code}}\n}`;
// }

// export function codifyJitFunctions(compiled: JITCompiledFunctions): string {
//     const isType = codifyJitFn(compiled.isType);
//     const typeErrors = codifyJitFn(compiled.typeErrors);
//     const jsonEncode = codifyJitFn(compiled.jsonEncode);
//     const jsonDecode = codifyJitFn(compiled.jsonDecode);
//     const jsonStringify = codifyJitFn(compiled.jsonStringify);
//     return `{\n isType:${isType},\n typeErrors:${typeErrors},\n jsonEncode:${jsonEncode},\n jsonDecode:${jsonDecode},\n jsonStringify:${jsonStringify}\n}`;
// }

// /** Transform a SerializableJITFunctions into a JITFunctions */
// export function restoreJitFunctions(serializable: SerializableJITFunctions): JITCompiledFunctions {
//     const restored = serializable as JITCompiledFunctions;
//     restored.isType.fn = new Function(...restored.isType.argNames, restored.isType.code) as isTypeFn;
//     restored.typeErrors.fn = new Function(...restored.typeErrors.argNames, restored.typeErrors.code) as typeErrorsFn;

//     const encode = new Function(...restored.jsonEncode.argNames, restored.jsonEncode.code);
//     restored.jsonEncode.fn = (vλl: any) => encode(jitUtils, vλl);

//     const decode = new Function(...restored.jsonDecode.argNames, restored.jsonDecode.code);
//     restored.jsonDecode.fn = (vλl: any) => decode(jitUtils, vλl);

//     const stringify = new Function(...restored.jsonStringify.argNames, restored.jsonStringify.code);
//     const stringifyFn = (vλl: any) => stringify(jitUtils, vλl);
//     restored.jsonStringify.fn = stringifyFn;

//     return serializable as JITCompiledFunctions;
// }

// /**
//  * Restored JITFunctions after they have been codified and parsed by js.
//  * Codified stringify function are missing the jitUtils wrapper, so it is added here.
//  */
// export function restoreCodifiedJitFunctions(jitFns: UnwrappedJITFunctions): JITCompiledFunctions {
//     const restored = jitFns as any as JITCompiledFunctions;
//     // important to keep the original functions to avoid infinite recursion
//     const originalDecode = jitFns.jsonDecode.fn;
//     restored.jsonDecode.fn = (vλl: JSONValue) => originalDecode(jitUtils, vλl);
//     const originalEncode = jitFns.jsonEncode.fn;
//     jitFns.jsonEncode.fn = (vλl: any) => originalEncode(jitUtils, vλl);
//     const originalStringifyFn = jitFns.jsonStringify.fn;
//     restored.jsonStringify.fn = (vλl: any) => originalStringifyFn(jitUtils, vλl);

//     return restored;
// }
