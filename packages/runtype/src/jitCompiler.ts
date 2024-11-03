/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {JitFnArgs, RunType, CodeUnit, Mutable, CompiledOperation, JitFnID} from './types';
import {JitFnIDs, JitFnNames, jitNames, maxStackDepth, maxStackErrorMessage} from './constants';
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

export class JitCompiler<FnArgsNames extends JitFnArgs = JitFnArgs, ID extends JitFnID = any> {
    constructor(
        public readonly rootType: RunType,
        public readonly opId: ID,
        public readonly args: FnArgsNames,
        /** when creating the function it might have default values */
        public readonly defaultParamValues: Record<keyof FnArgsNames, string | null>,
        public readonly returnName: string,
        public readonly parentLength: number
    ) {
        this.jitFnId = getJITFnId(this.opId, this.rootType);
    }
    readonly jitFnId: string;
    readonly jitFn: ((...args: any[]) => any) | undefined;
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
        const totalLength = this.stack.length + this.parentLength;
        if (totalLength > maxStackDepth) throw new Error(maxStackErrorMessage);
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
        (this as Mutable<JitCompiler>).code = resultCode;
        this.popItem = this.stack.pop();
        this._stackVλl = this.popItem?.vλl || this.args.vλl;
        this._stackStaticPath = getStackStaticPath(this);
        if (this.stack.length === 0) {
            try {
                return this.compiledFunction(); // add the compiled function to jit cache
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
    addDependency(dependencyCop: JitCompiler | CompiledOperation) {
        this.dependencies.add(dependencyCop.jitFnId);
        dependencyCop.dependencies.forEach((id) => this.dependencies.add(id));
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
        return jitUtils.getCachedCompiledOperation(this.jitFnId)?.code;
    }
    shouldCreateDependency(): boolean {
        const stackItem = this.getCurrentStackItem();
        return !!stackItem.dependencyId && !isSameJitType(stackItem.rt, this.rootType);
    }
    shouldCallDependency(): boolean {
        return this.stack.length > 1 && !!this.getCurrentStackItem().dependencyId;
    }
    getDependencyCallCode(opId: JitFnID, fnID?: string): string {
        const stackItem = this.getCurrentStackItem();
        if (!stackItem.dependencyId) throw new Error('Current stack item is already a dependency');
        const fnId = fnID ?? getJITFnId(opId, stackItem.rt);
        const id = toLiteral(fnId);
        const args = Object.entries(this.args)
            .map(([key, name]) => (key === 'vλl' ? stackItem.vλl : name))
            .join(',');
        return `${jitNames.utils}.getJitFn(${id})(${args})`;
    }
    getCompiledFunction(): (...args: any[]) => any {
        if (!this.jitFn) throw new Error('Can not get compiled function before the compile operation is finished');
        return this.jitFn;
    }
    private compiledFunction(): (...args: any[]) => any {
        if (this.jitFn) return this.jitFn;
        if (!this.code || this.stack.length !== 0)
            throw new Error('Can not get compiled function before the compile operation is finished');
        const fn = jitUtils.getCachedFn(this.jitFnId);
        if (fn) return fn;
        const fnName = JitFnNames[this.opId];
        const fnArgs = getJitFnArgs(this); // function arguments with default values ie: 'vλl, pλth=[], εrr=[]'
        const fnCode = `function ${fnName}(${fnArgs}){${this.code}}`;
        const newFn = createJitFnWithContext(fnCode, fnName);
        (this as Mutable<JitCompiler>).jitFn = newFn;
        jitUtils.addCachedFn(this.jitFnId, this as CompiledOperation);
        return newFn;
    }
}

// ################### Compile Operations ###################

export class JitBaseCompiler<ID extends JitFnID = any> extends JitCompiler<{vλl: 'vλl'}, ID> {
    constructor(rt: RunType, id: ID, parentLength: number) {
        super(rt, id, {vλl: 'vλl'}, {vλl: null}, 'vλl', parentLength);
    }
}

export class JitErrorsBaseCompiler<ID extends JitFnID = any> extends JitCompiler<{vλl: 'vλl'; pλth: 'pλth'; εrr: 'εrr'}, ID> {
    constructor(rt: RunType, id: ID, parentLength: number) {
        const args = {vλl: 'vλl', pλth: 'pλth', εrr: 'εrr'} as const;
        const defaultValues = {vλl: null, pλth: '[]', εrr: '[]'};
        super(rt, id, args, defaultValues, 'εrr', parentLength);
    }
}

export class JitIsTypeCompiler extends JitBaseCompiler<(typeof JitFnIDs)['isType']> {
    constructor(rt: RunType, parentLength: number) {
        super(rt, JitFnIDs.isType, parentLength);
    }
}

export class JitTypeErrorCompiler extends JitErrorsBaseCompiler<(typeof JitFnIDs)['typeErrors']> {
    constructor(rt: RunType, parentLength: number) {
        super(rt, JitFnIDs.typeErrors, parentLength);
    }
}

export class JitUnknownKeyErrorCompiler extends JitErrorsBaseCompiler<(typeof JitFnIDs)['unknownKeyErrors']> {
    constructor(rt: RunType, parentLength: number) {
        super(rt, JitFnIDs.unknownKeyErrors, parentLength);
    }
}

export class JitJsonEncodeCompiler extends JitBaseCompiler<(typeof JitFnIDs)['jsonEncode']> {
    constructor(rt: RunType, parentLength: number) {
        super(rt, JitFnIDs.jsonEncode, parentLength);
    }
}

export class JitJsonDecodeCompileOperation extends JitBaseCompiler<(typeof JitFnIDs)['jsonDecode']> {
    constructor(rt: RunType, parentLength: number) {
        super(rt, JitFnIDs.jsonDecode, parentLength);
    }
}
export class JitJsonStringifyCompiler extends JitCompiler<{vλl: 'vλl'}, (typeof JitFnIDs)['jsonStringify']> {
    constructor(rt: RunType, parentLength: number) {
        super(rt, JitFnIDs.jsonStringify, {vλl: 'vλl'}, {vλl: null}, 'vλl', parentLength);
    }
}

export class JitHasUnknownKeysCompiler extends JitBaseCompiler<(typeof JitFnIDs)['hasUnknownKeys']> {
    constructor(rt: RunType, parentLength: number) {
        super(rt, JitFnIDs.hasUnknownKeys, parentLength);
    }
}

export class JitStripUnknownKeysCompiler extends JitBaseCompiler<(typeof JitFnIDs)['stripUnknownKeys']> {
    constructor(rt: RunType, parentLength: number) {
        super(rt, JitFnIDs.stripUnknownKeys, parentLength);
    }
}

export class JitUnknownKeysToUndefinedCompiler extends JitBaseCompiler<(typeof JitFnIDs)['unknownKeysToUndefined']> {
    constructor(rt: RunType, parentLength: number) {
        super(rt, JitFnIDs.unknownKeysToUndefined, parentLength);
    }
}

// ################### Other Compiler functions ###################

export function getNewAuxFnNameFromIndex(index, rt: RunType): string {
    const typeName = (rt.src as any).typeName || 'Aux';
    return `ƒn${typeName}${index}`;
}

export function shouldCreateDependency(cop: JitCompiler, rt: RunType): boolean {
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

export function getJITFnId(id: JitFnID, rt: RunType): string {
    const hash = getJitIDHash(rt.getJitId().toString());
    return `${id}:${hash}`;
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

function getJitFnArgs(cop: JitCompiler): string {
    return Object.entries(cop.args)
        .map(([key, name]) => {
            if (!cop.defaultParamValues[key]) return name;
            const value = cop.defaultParamValues[key];
            return `${name}=${value}`;
        })
        .join(',');
}

function getStackVλl(cop: JitCompiler): string {
    let vλl = cop.args.vλl;
    for (let i = 0; i < cop.stack.length; i++) {
        const rt = cop.stack[i].rt;
        if (isChildAccessorType(rt)) {
            vλl += rt.useArrayAccessor() ? `[${rt.getChildLiteral()}]` : `.${rt.getChildVarName()}`;
        }
    }
    return vλl;
}
function getStackStaticPath(cop: JitCompiler): (string | number)[] {
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
