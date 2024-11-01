/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {JitFnArgs, RunType, JitFnID, CodeUnit, Mutable, CompiledOperation} from './types';
import {jitNames, maxStackDepth, maxStackErrorMessage} from './constants';
import {isChildAccessorType} from './guards';
import {isSameJitType, toLiteral} from './utils';
import {BaseRunType} from './baseRunTypes';
import {jitUtils} from './jitUtils';

export type StackItem = {
    /** current compile stack full variable accessor */
    vλl: string;
    /** current compile stack variable accessor */
    rt: RunType;
    /** if should call a dependency instead inline code, then this would contain the id of the dependency to call */
    dependencyId?: string;
};

export class JitCompileOperation<FnArgsNames extends JitFnArgs = JitFnArgs, ID extends JitFnID = any> {
    constructor(
        public readonly rootType: RunType,
        public readonly opId: ID,
        public readonly args: FnArgsNames,
        /** when creating the function it might have default values */
        public readonly defaultParamValues: Record<keyof FnArgsNames, string | null>,
        public readonly returnName: string
    ) {}
    readonly code: string = '';
    /** The list of types being compiled.
     * each time there is a circular type a new substack is created.
     */
    readonly stack: StackItem[] = [];
    popItem: StackItem | undefined;
    /** List of function dependencies by jit id */
    readonly dependencies: Set<string> = new Set();
    /** current runType accessor in source code */
    get vλl(): string {
        return this._stackVλl;
    }
    /** shorthand for  this.length */
    get length() {
        return this.stack.length;
    }
    private _stackVλl: string = '';
    private _stackStaticPath: (string | number)[] = [];
    /** push new item to the stack, returns true if new child is already in the stack (is circular type) */
    pushStack(newChild: RunType): void {
        if (this.stack.length > maxStackDepth) throw new Error(maxStackErrorMessage);
        if (this.stack.length === 0) {
            if (newChild !== this.rootType) throw new Error('rootType should be the first item in the stack');
            newChild.getJitConstants(); // ensures the constants are generated in correct order
        }
        this._stackVλl = getStackVλl(this);
        this._stackStaticPath = getStackStaticPath(this);
        const newStackItem: StackItem = {vλl: this._stackVλl, rt: newChild};
        if (shouldCreateDependency(this, newChild)) {
            newStackItem.dependencyId = getJITFnId(this.opId, newChild);
            this.dependencies.add(newStackItem.dependencyId);
        }
        this.stack.push(newStackItem);
    }
    popStack(resultCode: string): void | ((...args: any[]) => any) {
        (this as Mutable<JitCompileOperation>).code = resultCode;
        this.popItem = this.stack.pop();
        this._stackVλl = this.popItem?.vλl || this.args.vλl;
        this._stackStaticPath = getStackStaticPath(this);
        if (this.stack.length === 0) {
            try {
                return getCompiledFunction(this); // add the compiled function to jit cache
            } catch (e: any) {
                const fnCode = ` Code:\nfunction ${this.opId}(){${this.code}}`;
                const name = `(${this.rootType.getName()}:${this.rootType.getJitId()})`;
                throw new Error(`Error building isType JIT function for type ${name}: ${e?.message} \n${fnCode}`);
            }
        }
    }
    getJITFnId(): string {
        return getJITFnId(this.opId, this.rootType);
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
    addDependency(dependencyCop: JitCompileOperation) {
        this.dependencies.add(dependencyCop.getJITFnId());
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
        return jitUtils.getCachedCompiledOperation(this.getJITFnId())?.code;
    }
    shouldCreateDependency(): boolean {
        return !!this.getCurrentStackItem().dependencyId && !isSameJitType(this.rootType, this.getCurrentStackItem().rt);
    }
    shouldCallDependency(): boolean {
        return this.stack.length > 1 && !!this.getCurrentStackItem().dependencyId;
    }
    getDependencyCallCode(): string {
        const id = toLiteral(this.getJITFnId());
        return `${jitNames.utils}.getCachedFn(${id})(${Object.values(this.args).join(', ')})`;
    }
    getCompiledFunction(): (...args: any[]) => any {
        return getCompiledFunction(this);
    }
}

// ################### Compile Operations ###################

export class jitIsTypeCompileOperation extends JitCompileOperation<{vλl: 'vλl'}, 'isType'> {
    constructor(rt: RunType) {
        super(rt, 'isType', {vλl: 'vλl'}, {vλl: null}, 'vλl');
    }
}

export class JitTypeErrorCompileOperation extends JitCompileOperation<{vλl: 'vλl'; pλth: 'pλth'; εrr: 'εrr'}, 'typeErrors'> {
    constructor(rt: RunType) {
        const args = {vλl: 'vλl', pλth: 'pλth', εrr: 'εrr'} as const;
        const defaultValues = {vλl: null, pλth: '[]', εrr: '[]'};
        super(rt, 'typeErrors', args, defaultValues, 'εrr');
    }
}

export class JitJsonEncodeCompileOperation extends JitCompileOperation<{vλl: 'vλl'}, 'jsonEncode'> {
    constructor(rt: RunType) {
        super(rt, 'jsonEncode', {vλl: 'vλl'}, {vλl: null}, 'vλl');
    }
}

export class JitJsonDecodeCompileOperation extends JitCompileOperation<{vλl: 'vλl'}, 'jsonDecode'> {
    constructor(rt: RunType) {
        super(rt, 'jsonDecode', {vλl: 'vλl'}, {vλl: null}, 'vλl');
    }
}

export class JitJsonStringifyCompileOperation extends JitCompileOperation<{vλl: 'vλl'}, 'jsonStringify'> {
    constructor(rt: RunType) {
        super(rt, 'jsonStringify', {vλl: 'vλl'}, {vλl: null}, 'vλl');
    }
}

// ################### Other Compiler functions ###################

export function getNewAuxFnNameFromIndex(index, rt: RunType): string {
    const typeName = (rt.src as any).typeName || 'Aux';
    return `ƒn${typeName}${index}`;
}

export function getCompiledFunction(cop: JitCompileOperation): (...args: any[]) => any {
    const fnId = getJITFnId(cop.opId, cop.rootType);
    if (!!cop.code || cop.stack.length !== 0)
        throw new Error('Can not get compiled function before the compile operation is finished');
    const fn = jitUtils.getCachedFn(fnId);
    if (!fn) return compileFunction(cop);
    return fn;
}

export function shouldCreateDependency(cop: JitCompileOperation, rt: RunType): boolean {
    if (cop.stack.length === 0) return false;
    if (rt.src.typeName) return true;
    const isRoot = cop.length === 1;
    const codeUnit: CodeUnit = (rt as BaseRunType).jitFnCodeUnit(cop.opId);
    const codeHasReturn: boolean = (rt as BaseRunType).jitFnHasReturn(cop.opId);
    const isSelfInvoking = !isRoot && codeUnit === 'EXPRESSION' && codeHasReturn;
    if (isSelfInvoking) return true;
    const hasCircularParent = cop.stack.some((i) => isSameJitType(i.rt, rt));
    return hasCircularParent;
}

export function getJITFnId(id: JitFnID, rt: RunType) {
    return `${id}${rt.getJitId()}`;
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
        if (process.env.DEBUG_JIT) console.log(wrapperWithContext.toString());
        return wrapperWithContext(jitUtils); // returns the jit internal function with the context
    } catch (e: any) {
        if (process.env.DEBUG_JIT) console.warn('Error creating jit function with context code:\n', code);
        console.log(e);
        throw e;
    }
}

function compileFunction(cop: JitCompileOperation): (...args: any[]) => any {
    const fnName = cop.opId;
    // function arguments with default values ie: 'vλl, pλth=[], εrr=[]'
    const fnArgs = getJitFnArgs(cop);
    const fnCode = `function ${fnName}(${fnArgs}){${cop.code}}`;
    const jitFn = createJitFnWithContext(fnCode, fnName);
    const compiledOperation: CompiledOperation = {
        jitFn,
        code: cop.code,
        opId: undefined,
        args: cop.args,
        defaultParamValues: cop.defaultParamValues,
        dependencies: Array.from(cop.dependencies),
    };
    jitUtils.addCachedFn(cop.getJITFnId(), compiledOperation);
    if (process.env.DEBUG_JIT) console.log(`cached jit functions for ${fnName}`);
    return jitFn;
}

function getJitFnArgs(cop: JitCompileOperation): string {
    return Object.entries(cop.args)
        .map(([key, name]) => {
            if (!cop.defaultParamValues[key]) return name;
            const value = cop.defaultParamValues[key];
            return `${name}=${value}`;
        })
        .join(',');
}

function getStackVλl(cop: JitCompileOperation): string {
    let vλl = cop.args.vλl;
    for (let i = 0; i < cop.stack.length; i++) {
        const rt = cop.stack[i].rt;
        if (isChildAccessorType(rt)) {
            vλl += rt.useArrayAccessor() ? `[${rt.getChildLiteral()}]` : `.${rt.getChildVarName()}`;
        }
    }
    return vλl;
}
function getStackStaticPath(cop: JitCompileOperation): (string | number)[] {
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
