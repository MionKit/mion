/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {JitFnArgs, Mutable, CompiledOperation, JitFnID} from '../types';
import type {BaseRunType} from './baseRunTypes';
import {
    jitArgs,
    jitDefaultArgs,
    jitDefaultErrorArgs,
    jitErrorArgs,
    JitFnIDs,
    jitNames,
    maxStackDepth,
    maxStackErrorMessage,
} from '../constants';
import {isChildAccessorType} from './guards';
import {jitUtils} from './jitUtils';

export type StackItem = {
    /** current compile stack full variable accessor */
    vλl: string;
    /** current compile stack variable accessor */
    rt: BaseRunType;
    /** if should call a dependency instead inline code, then this would contain the id of the dependency to call */
    dependencyId?: string;
};

export type JitCompilerLike = BaseCompiler | CompiledOperation;
export type JitDependencies = Set<string>;

export class BaseCompiler<FnArgsNames extends JitFnArgs = JitFnArgs, ID extends JitFnID = any> {
    constructor(
        public readonly rootType: BaseRunType,
        public readonly opId: ID,
        public readonly args: FnArgsNames,
        /** when creating the function it might have default values */
        public readonly defaultParamValues: Record<keyof FnArgsNames, string | null>,
        public readonly returnName: string,
        public readonly parentLength: number = 0
    ) {
        this.jitFnHash = getJITFnHash(this.opId, this.rootType);
        this.jitId = this.rootType.getJitId();
        this.vλl = this.args.vλl;
        jitUtils.addToJitCache(this.jitFnHash, this as CompiledOperation);
    }
    readonly jitId: string | number;
    readonly jitFnHash: string;
    // !!! DO NOT MODIFY METHOD WITHOUT REVIEWING JIT CODE INVOCATIONS!!!
    /** The Jit Generated function once the compilation is finished */
    readonly fn: ((...args: any[]) => any) | undefined;

    /** Code for the jit function. */
    readonly code: string = '';
    /** Code for the context function enclosing the jit function.
     * This can be used to initialize constant or some other things that will be required across all invocation.
     * By default this contains constants for the direct dependencies of the jit function.
     * */
    readonly contextCode: string = '';
    readonly contextCodeItems = new Map<string, string>();
    /**
     * This flag is set to true when the result of a jit compilation is a no operation.
     * Some jit compiled functions could execute no operations (ie: jsonEncode/jsonDecode a string)
     */
    readonly isNoop?: boolean = false;
    /** The list of dependencies that are called directly by this function */
    readonly directDependencies: JitDependencies = new Set();
    /** The list of dependencies that are called by the child dependencies of this function.
     * TODO: this could not be required, as we could resolve them accessing the dependencies child items.
     */
    readonly childDependencies: JitDependencies = new Set();
    /** The list of types being compiled.*/
    readonly stack: StackItem[] = [];
    popItem: StackItem | undefined;
    /** shorthand for  this.length */
    get length() {
        return this.stack.length;
    }
    get totalLength() {
        return this.stack.length + this.parentLength;
    }
    vλl: string = '';
    private _stackStaticPath: (string | number)[] = [];
    /** push new item to the stack, returns true if new child is already in the stack (is circular type) */
    pushStack(newChild: BaseRunType): void {
        const totalLength = this.stack.length + this.totalLength;
        if (totalLength > maxStackDepth) throw new Error(maxStackErrorMessage);
        if (this.stack.length === 0) {
            if (newChild !== this.rootType) throw new Error('rootType should be the first item in the stack');
            newChild.getJitConstants(); // ensures the constants are generated in correct order
        }
        this.vλl = getStackVλl(this);
        this._stackStaticPath = getStackStaticPath(this);
        const newStackItem: StackItem = {vλl: this.vλl, rt: newChild};
        this.stack.push(newStackItem);
    }
    popStack(resultCode: string): void | ((...args: any[]) => any) {
        (this as Mutable<BaseCompiler>).code = resultCode;
        this.popItem = this.stack.pop();
        const item = this.stack[this.stack.length - 1];
        this.vλl = item?.vλl || this.args.vλl;
        this._stackStaticPath = getStackStaticPath(this);
        if (this.stack.length === 0) {
            try {
                return compileFunction(this); // add the compiled function to jit cache
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
        const item = this.stack[this.stack.length - 1];
        if (!item) throw new Error('Compiler stack is empty, no current item');
        return item;
    }
    getChildVλl(): string {
        const parent = this.getCurrentStackItem();
        if (!parent) return this.args.vλl;
        const rt = parent.rt;
        if (!isChildAccessorType(rt)) throw new Error(`cant get child var name from ${rt.getName()}`);
        return parent.vλl + (rt.useArrayAccessor() ? `[${rt.getChildLiteral()}]` : `.${rt.getChildVarName()}`);
    }
    getParentVλl(): string {
        const parent = this.stack[this.stack.length - 2];
        if (!parent) return this.args.vλl;
        return parent.vλl;
    }
    shouldCallDependency(): boolean {
        const stackItem = this.getCurrentStackItem();
        return !stackItem.rt.isJitInlined() && this.stack.length > 1;
    }
    getCompiledFunction(): (...args: any[]) => any {
        if (!this.fn) throw new Error('Can not get compiled function before the compile operation is finished');
        return this.fn;
    }
    updateDependencies(childCop: CompiledOperation): void {
        this.directDependencies.add(childCop.jitFnHash);
        childCop.directDependencies.forEach((dep) => this.childDependencies.add(dep));
        childCop.childDependencies.forEach((dep) => this.childDependencies.add(dep));
    }
    removeFromJitCache(): void {
        jitUtils.removeFromJitCache(this.jitFnHash);
    }
}

// ################### Compile Operations ###################

export class JitCompiler<ID extends JitFnID = any> extends BaseCompiler<typeof jitArgs, ID> {
    constructor(rt: BaseRunType, id: ID, parentLength: number = 0) {
        super(rt, id, {...jitArgs}, {...jitDefaultArgs}, 'v', parentLength);
    }
}

export class JitErrorsCompiler<ID extends JitFnID = any> extends BaseCompiler<typeof jitErrorArgs, ID> {
    constructor(rt: BaseRunType, id: ID, parentLength: number = 0) {
        const args = {...jitErrorArgs};
        const defaultValues = {...jitDefaultErrorArgs};
        super(rt, id, args, defaultValues, 'er', parentLength);
    }
}

// ################### Compiler Creation ###################

export function createJitCompiler(rt: BaseRunType, fnId: JitFnID, parent?: BaseCompiler): BaseCompiler {
    switch (fnId) {
        case JitFnIDs.isType:
            return new JitCompiler(rt, fnId, parent?.totalLength);
        case JitFnIDs.typeErrors:
            return new JitErrorsCompiler(rt, fnId, parent?.totalLength);
        case JitFnIDs.jsonEncode:
            return new JitCompiler(rt, fnId, parent?.totalLength);
        case JitFnIDs.jsonDecode:
            return new JitCompiler(rt, fnId, parent?.totalLength);
        case JitFnIDs.jsonStringify:
            return new JitCompiler(rt, fnId, parent?.totalLength);
        case JitFnIDs.unknownKeyErrors:
            return new JitErrorsCompiler(rt, fnId, parent?.totalLength);
        case JitFnIDs.hasUnknownKeys:
            return new JitCompiler(rt, fnId, parent?.totalLength);
        case JitFnIDs.stripUnknownKeys:
            return new JitCompiler(rt, fnId, parent?.totalLength);
        case JitFnIDs.unknownKeysToUndefined:
            return new JitCompiler(rt, fnId, parent?.totalLength);
        default:
            throw new Error(`Unknown compile operation: ${fnId}`);
    }
}

// ################### Other Compiler functions ###################
/**
 * Creates a function name based on the jitHash of the runType and the id of the function.
 * it is a valid js variable name.
 * @param id
 * @param rt
 * @returns
 */
export function getJITFnHash(id: JitFnID, rt: BaseRunType): string {
    return `f${id}_${rt.getJitHash()}`;
}

function getJitFnCode(comp: JitCompilerLike): {fnName: string; fnCode: string} {
    const fnName = comp.jitFnHash;
    const fnArgs = getJitFnArgs(comp); // function arguments with default values ie: 'vλl, pλth=[], εrr=[]'
    const fnCode = `function ${fnName}(${fnArgs}){${comp.code}}`;
    return {fnName, fnCode};
}

function compileFunction(comp: BaseCompiler): (...args: any[]) => any {
    if (comp.fn) return comp.fn;
    if (comp.stack.length !== 0) throw new Error('Can not get compiled function before the compile operation is finished');
    if (jitUtils.hasJitFn(comp.jitFnHash)) return jitUtils.getJitFn(comp.jitFnHash);
    const {fnCode, fnName} = getJitFnCode(comp);
    (comp as Mutable<BaseCompiler>).contextCode = Array.from(comp.contextCodeItems.values()).join(';\n');
    const newFn = createJitFnWithContext(fnCode, fnName, comp.contextCode);
    (comp as Mutable<BaseCompiler>).fn = newFn;
    return newFn;
}

/**
 * Create a JIT function that has jitUtils (and possibly other required variables) in the context,
 * This way jitUtils ca be used without passing them as arguments to every atomic jit function (kind of global variables).
 * @param varName
 * @param code
 * @returns
 */
function createJitFnWithContext(code: string, functionName: string, contextCode?: string): (...args: any[]) => any {
    // this function will have jitUtils as context as is an argument of the enclosing function
    const context = contextCode ? `${contextCode};` : '';
    const fnWithContext = `${context} ${code} return ${functionName};`;
    try {
        const wrapperWithContext = new Function(jitNames.utils, fnWithContext);
        if (process.env.DEBUG_JIT) console.log(printFn(fnWithContext, code, functionName, contextCode));
        return wrapperWithContext(jitUtils); // returns the jit internal function with the context
    } catch (e: any) {
        if (process.env.DEBUG_JIT) {
            console.warn(
                'Error creating jit function with context code:\n',
                printFn(fnWithContext, code, functionName, contextCode)
            );
        }
        throw e;
    }
}

function printFn(fnWithContext: string, code: string, functionName: string, contextCode?: string): string {
    return contextCode ? `function context_${functionName}(){${fnWithContext}}` : code;
}

function getJitFnArgs(comp: JitCompilerLike): string {
    return Object.entries(comp.args)
        .map(([key, name]) => {
            if (!comp.defaultParamValues[key]) return name;
            const value = comp.defaultParamValues[key];
            return `${name}=${value}`;
        })
        .join(',');
}

function getStackVλl(comp: BaseCompiler): string {
    let vλl = comp.args.vλl;
    for (let i = 0; i < comp.stack.length; i++) {
        const rt = comp.stack[i].rt;
        const standaloneVλl = rt.getStandaloneVλl();
        if (standaloneVλl) {
            vλl = standaloneVλl;
        } else if (isChildAccessorType(rt) && !rt.skipSettingAccessor?.()) {
            vλl += rt.useArrayAccessor() ? `[${rt.getChildLiteral()}]` : `.${rt.getChildVarName()}`;
        }
    }
    return vλl;
}
function getStackStaticPath(comp: BaseCompiler): (string | number)[] {
    const path: (string | number)[] = [];
    for (let i = 0; i < comp.stack.length; i++) {
        const rt = comp.stack[i].rt;
        const pathItem = rt.getStaticPathLiteral();
        if (pathItem) {
            path.push(pathItem);
        } else if (isChildAccessorType(rt) && !rt.skipSettingAccessor?.()) {
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
