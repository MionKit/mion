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
import {isChildAccessorType, isJitErrorsCompiler} from './guards';
import {jitUtils} from './jitUtils';
import {toLiteral} from './utils';

export type StackItem = {
    /** current compile stack full variable accessor */
    vλl: string;
    /** current compile stack variable accessor */
    rt: BaseRunType;
    /** if should call a dependency instead inline code, then this would contain the id of the dependency to call */
    dependencyId?: string;
    staticPath?: (string | number)[];
};

export type JitCompilerLike = BaseCompiler | CompiledOperation;
export type JitDependencies = Set<string>;

export class BaseCompiler<FnArgsNames extends JitFnArgs = JitFnArgs, ID extends JitFnID = any> {
    constructor(
        public readonly rootType: BaseRunType,
        public readonly fnId: ID,
        public readonly args: FnArgsNames,
        /** when creating the function it might have default values */
        public readonly defaultParamValues: Record<keyof FnArgsNames, string | null>,
        public readonly returnName: string,
        public readonly parentLength: number = 0
    ) {
        this.jitFnHash = getJITFnHash(this.fnId, this.rootType);
        this.jitId = this.rootType.getJitId();
        this.vλl = this.args.vλl;
        jitUtils.addToJitCache(this.jitFnHash, this);
    }
    readonly jitId: string | number;
    readonly jitFnHash: string;
    // !!! DO NOT MODIFY METHOD WITHOUT REVIEWING JIT CODE INVOCATIONS!!!
    /** The Jit Generated function once the compilation is finished */
    readonly fn: ((...args: any[]) => any) | undefined;

    /** Code for the jit function. after the operation has been compiled */
    readonly code: string = '';
    /** Code for the context function enclosing the jit function.
     * This can be used to initialize constant or some other things that will be required across all invocation.
     * By default this contains constants for the direct dependencies of the jit function.
     * */
    readonly contextCodeItems = new Map<string, string>();
    /**
     * This flag is set to true when the result of a jit compilation is a no operation.
     * Some jit compiled functions could execute no operations (ie: toJsonVal/fromJsonVal a string)
     */
    readonly isNoop?: boolean = false;
    /** The list of all jit functions that are used by this function and it's children. */
    readonly dependenciesSet: JitDependencies = new Set();
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
            newChild.getJitConfig(); // ensures the constants are generated in correct order
        }
        this.vλl = getStackVλl(this);
        // static path must be called before pushing the new item
        if (isJitErrorsCompiler(this)) this._stackStaticPath = getStackStaticPath(this);
        const newStackItem: StackItem = {vλl: this.vλl, rt: newChild, staticPath: this._stackStaticPath};
        this.stack.push(newStackItem);
    }
    popStack(resultCode: string | undefined): void | ((...args: any[]) => any) {
        if (resultCode) (this as Mutable<BaseCompiler>).code = resultCode;
        this.popItem = this.stack.pop();
        const item = this.stack[this.stack.length - 1];
        this.vλl = item?.vλl || this.args.vλl;
        if (isJitErrorsCompiler(this)) this._stackStaticPath = item?.staticPath || [];
        if (this.stack.length === 0) {
            try {
                this.setIsNoop();
                return compileFunction(this); // add the compiled function to jit cache
            } catch (e: any) {
                const fnCode = ` Code:\nfunction ${this.fnId}(){${this.code}}`;
                const name = `(${this.rootType.getName()}:${this.rootType.getJitId()})`;
                throw new Error(`Error building ${this.fnId} JIT function for type ${name}: ${e?.message} \n${fnCode}`);
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
        if (rt.skipSettingAccessor?.()) return parent.vλl;
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
        this.dependenciesSet.add(childCop.jitFnHash);
        childCop.dependenciesSet.forEach((dep) => this.dependenciesSet.add(dep));
    }
    removeFromJitCache(): void {
        jitUtils.removeFromJitCache(this.jitFnHash);
    }
    setIsNoop(): void {
        let isNoop = false;
        let code = this.code.trim(); // todo: investigate removing all white spaces from the code
        switch (this.fnId) {
            case JitFnIDs.isType:
                isNoop = !this.code || this.code === 'true' || this.code === 'return true';
                if (isNoop) code = `return true`; // if code is a noop, we still need to return true
                break;
            case JitFnIDs.hasUnknownKeys:
                isNoop = !this.code || this.code === 'false' || this.code === 'return false';
                if (isNoop) code = `return false`; // if code is a noop, we still need return false
                break;
            case JitFnIDs.toJsonVal:
            case JitFnIDs.fromJsonVal:
            case JitFnIDs.stripUnknownKeys:
            case JitFnIDs.unknownKeysToUndefined:
                isNoop = !this.code || this.code === this.args.vλ || this.code === `return ${this.args.vλl}`;
                if (isNoop) code = `return ${this.args.vλl}`; // if code is a noop, we need to return the value
                break;
            case JitFnIDs.typeErrors:
            case JitFnIDs.unknownKeyErrors:
                isNoop = !this.code || this.code === this.args.εrr || this.code === `return ${this.args.εrr}`;
                if (isNoop) code = `return ${this.args.εrr}`; // if code is a noop, we need to return the error array
                break;
        }
        (this as Mutable<BaseCompiler>).isNoop = isNoop;
        (this as Mutable<BaseCompiler>).code = code;
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
    callJitErr(expected: string | number | BaseRunType, extraPathLiteral?: string | number): string {
        const expectLiteral = typeof expected === 'object' ? toLiteral(expected.getName()) : toLiteral(expected);
        const extraPath = extraPathLiteral ? `${extraPathLiteral}` : '';
        const pathItems = [this.getStackStaticPathArgs(), extraPath].filter((a) => a).join(',');
        return `utl.err(${this.args.εrr},${this.args.pλth},[${pathItems}],${expectLiteral})`;
    }
}

// ################### Compiler Creation ###################

export function createJitCompiler(rt: BaseRunType, fnId: JitFnID, parent?: BaseCompiler): BaseCompiler {
    switch (fnId) {
        case JitFnIDs.isType:
            return new JitCompiler(rt, fnId, parent?.totalLength);
        case JitFnIDs.typeErrors:
            return new JitErrorsCompiler(rt, fnId, parent?.totalLength);
        case JitFnIDs.toJsonVal:
            return new JitCompiler(rt, fnId, parent?.totalLength);
        case JitFnIDs.fromJsonVal:
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

function compileFunction(comp: BaseCompiler): (...args: any[]) => any {
    if (comp.fn) return comp.fn;
    if (comp.stack.length !== 0) throw new Error('Can not get compiled function before the compile operation is finished');
    if (jitUtils.hasJitFn(comp.jitFnHash)) return jitUtils.getJitFn(comp.jitFnHash);
    const {fnCode, fnName, contextCode} = getJitFnCode(comp);
    const {fn, code} = createJitFnWithContext(fnName, fnCode, contextCode);
    (comp as Mutable<BaseCompiler>).code = code;
    (comp as Mutable<BaseCompiler>).fn = fn;
    return fn;
}

function getJitFnCode(comp: BaseCompiler): {fnName: string; fnCode: string; contextCode: string} {
    const fnName = comp.jitFnHash;
    const fnArgs = getJitFnArgs(comp); // function arguments with default values ie: 'vλl, pλth=[], εrr=[]'
    const fnCode = `function ${fnName}(${fnArgs}){${comp.code}}`;
    return {fnName, fnCode, contextCode: Array.from(comp.contextCodeItems.values()).join(';\n')};
}

/**
 * Create a JIT function that has jitUtils (and possibly other required variables) in the context,
 * This way jitUtils ca be used without passing them as arguments to every atomic jit function (kind of global variables).
 * @param varName
 * @param fnCode
 * @returns
 */
function createJitFnWithContext(fnName: string, fnCode: string, contextCode?: string) {
    // this function will have jitUtils as context as is an argument of the enclosing function
    const context = contextCode ? `${contextCode};` : '';
    const fnWithContext = `${context} ${fnCode} return ${fnName};`;
    try {
        const wrapperWithContext = new Function(jitNames.utils, fnWithContext);
        if (process.env.DEBUG_JIT) console.log(printFn(fnWithContext, fnCode, fnName, contextCode));
        return {fn: wrapperWithContext(jitUtils), code: fnWithContext}; // returns the jit internal function with the context
    } catch (e: any) {
        if (process.env.DEBUG_JIT) {
            console.warn('Error creating jit function with context code:\n', printFn(fnWithContext, fnCode, fnName, contextCode));
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
    let vλl: string = comp.args.vλl;
    for (let i = 0; i < comp.stack.length; i++) {
        const rt = comp.stack[i].rt;
        const custom = rt.getCustomVλl(comp as JitCompiler);
        if (custom && custom.isStandalone) {
            vλl = custom.vλl;
        } else if (custom) {
            vλl += custom.useArrayAccessor ? `[${custom.vλl}]` : `.${custom.vλl}`;
        } else if (isChildAccessorType(rt) && !rt.skipSettingAccessor?.()) {
            vλl += rt.useArrayAccessor() ? `[${rt.getChildLiteral()}]` : `.${rt.getChildVarName()}`;
        }
    }
    return vλl;
}
function getStackStaticPath(comp: BaseCompiler): (string | number)[] {
    const path: (string | number)[] = [];
    const rtName: any = [];
    for (let i = 0; i < comp.stack.length; i++) {
        const rt = comp.stack[i].rt;
        const pathItem = rt.getStaticPathLiteral(comp as JitCompiler);
        if (pathItem) {
            path.push(pathItem);
        } else if (isChildAccessorType(rt) && !rt.skipSettingAccessor?.()) {
            path.push(rt.getChildLiteral());
        }
        rtName.push({path: [...path], name: rt.constructor.name});
    }
    return path;
}

// export function getSerializableJitCompiler(compiled: JITCompiledFunctions): SerializableJITFunctions {
//     return {
//         isType: {argNames: compiled.isType.argNames, code: compiled.isType.code},
//         typeErrors: {argNames: compiled.typeErrors.argNames, code: compiled.typeErrors.code},
//         toJsonVal: {argNames: compiled.toJsonVal.argNames, code: compiled.toJsonVal.code},
//         fromJsonVal: {argNames: compiled.fromJsonVal.argNames, code: compiled.fromJsonVal.code},
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
//     const toJsonVal = codifyJitFn(compiled.toJsonVal);
//     const fromJsonVal = codifyJitFn(compiled.fromJsonVal);
//     const jsonStringify = codifyJitFn(compiled.jsonStringify);
//     return `{\n isType:${isType},\n typeErrors:${typeErrors},\n toJsonVal:${toJsonVal},\n fromJsonVal:${fromJsonVal},\n jsonStringify:${jsonStringify}\n}`;
// }

// /** Transform a SerializableJITFunctions into a JITFunctions */
// export function restoreJitFunctions(serializable: SerializableJITFunctions): JITCompiledFunctions {
//     const restored = serializable as JITCompiledFunctions;
//     restored.isType.fn = new Function(...restored.isType.argNames, restored.isType.code) as isTypeFn;
//     restored.typeErrors.fn = new Function(...restored.typeErrors.argNames, restored.typeErrors.code) as typeErrorsFn;

//     const encode = new Function(...restored.toJsonVal.argNames, restored.toJsonVal.code);
//     restored.toJsonVal.fn = (vλl: any) => encode(jitUtils, vλl);

//     const decode = new Function(...restored.fromJsonVal.argNames, restored.fromJsonVal.code);
//     restored.fromJsonVal.fn = (vλl: any) => decode(jitUtils, vλl);

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
//     const originalDecode = jitFns.fromJsonVal.fn;
//     restored.fromJsonVal.fn = (vλl: JSONValue) => originalDecode(jitUtils, vλl);
//     const originalEncode = jitFns.toJsonVal.fn;
//     jitFns.toJsonVal.fn = (vλl: any) => originalEncode(jitUtils, vλl);
//     const originalStringifyFn = jitFns.jsonStringify.fn;
//     restored.jsonStringify.fn = (vλl: any) => originalStringifyFn(jitUtils, vλl);

//     return restored;
// }
