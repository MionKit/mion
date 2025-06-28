/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {
    JitCompiledFn,
    JitCompiledFnData,
    JitFnArgs,
    JITUtils,
    PureFunction,
    PureFunctionClosure,
} from '@mionkit/core/src/types';
import {MAX_STACK_DEPTH} from '@mionkit/core/src/constants';
import type {Mutable, JitFnID, StrNumber, jitCode, RunTypeOptions, JitCompilerOpts} from '../types';
import type {BaseRunType} from './baseRunTypes';
import type {AnyKindName} from '../constants.kind';
import {
    getJITFnName,
    jitArgs,
    jitDefaultArgs,
    jitDefaultErrorArgs,
    jitErrorArgs,
    JitFunctions,
    maxStackErrorMessage,
    JIT_STACK_TRACE_MESSAGE,
} from '../constants';
import {isChildAccessorType, isJitErrorsCompiler} from './guards';
import {jitUtils} from '../../../core/src/jitUtils';
import {toLiteral, toLiteralInContext} from './utils';
import type {BaseRunTypeFormat} from './baseRunTypeFormat';
import {getPureFunctionKey, registerPureFnClosure} from '@mionkit/run-types/src/lib/formats';

export type StackItem = {
    /** current compile stack full variable accessor */
    vλl: string;
    /** current compile stack variable accessor */
    rt: BaseRunType;
    /** if should call a dependency instead inline code, then this would contain the id of the dependency to call */
    dependencyId?: string;
    staticPath?: StrNumber[];
};

export type JitCompilerLike = BaseCompiler | JitCompiledFnData;
export type JitDependencies = Set<string>;

export class BaseCompiler<FnArgsNames extends JitFnArgs = JitFnArgs, ID extends JitFnID = any>
    implements JitCompiledFnData, JitCompilerOpts
{
    constructor(
        public readonly rootType: BaseRunType,
        // the id of the function to be compiled (isType, typeErrors, toJsonVal, fromJsonVal, etc)
        public readonly fnID: ID,
        public readonly args: FnArgsNames,
        /** when creating the function it might have default values */
        public readonly defaultParamValues: JitFnArgs,
        public readonly returnName: string,
        public readonly parentCompiler?: BaseCompiler,
        jitFnHash?: string,
        typeID?: StrNumber,
        public readonly opts: RunTypeOptions = {}
    ) {
        this.jitFnHash = jitFnHash || getJITFnHash(this.fnID, this.rootType, opts);
        this.typeID = typeID || this.rootType.getTypeID();
        if (this.args.vλl) this.vλl = this.args.vλl;
        // At the time of adding this compiler to the jit cache, the fn is undefined which is technically not allowed
        // but this prevents issues with circular types and loading order of jit dependencies
        jitUtils.addToJitCache(this as JitCompiledFn);
        validateCompilerOptions(opts);
    }
    readonly typeID: StrNumber;
    readonly jitFnHash: string;
    // !!! DO NOT MODIFY METHOD WITHOUT REVIEWING JIT CODE INVOCATIONS!!!
    /** The Jit Generated function once the compilation is finished */
    readonly fn: ((...args: any[]) => any) | undefined;
    readonly closureFn: ((utl: JITUtils) => (...args: any[]) => any) | undefined;

    /** Code for the jit function. after the operation has been compiled */
    readonly code: string = '';
    /** Code for the context function enclosing the jit function.
     * This can be used to initialize constant or some other things that will be required across all invocation.
     * By default this contains constants for the direct dependencies of the jit function.
     * */
    readonly contextCodeItems = new Map<string, string>();
    /**
     * This flag is set to true when the result of a jit compilation is a no operation (empty function).
     * Some jit compiled functions could execute no operations (ie: string, boolean and numbers does not require toJsonVal/fromJsonVal)
     */
    readonly isNoop?: boolean = false;
    /** The list of all jit functions that are used by this function and it's children. */
    readonly dependenciesSet: JitDependencies = new Set();
    readonly pureFnDependencies: Set<string> = new Set();
    /** The list of types being compiled.*/
    readonly stack: StackItem[] = [];
    popItem: StackItem | undefined;
    /** shorthand for  this.length */
    get length() {
        return this.stack.length;
    }
    get totalLength() {
        if (this.parentCompiler) return this.stack.length + this.parentCompiler.totalLength;
        return this.stack.length;
    }
    vλl: string = '';
    /**
     * The path to the current item in the stack,
     * This path can contain prop names array indexes or event literal variable values, ie: if parsing an array the path item would be the name if the index variable.
     * This is used to generate the correct code to access the value at runtime of the current item in the stack.
     * ie: if parsing the tuple ['A','B','C'] and the current item is 'B', the path would [1] as is the index of the item in the stack.
     * ie: if parsing the object {a: {b: {c: 'C'}}} and the current item is 'b', the path would ['a','b'] as is the path to the item in the stack.
     * At runtime this path gets combined with the runtime pλth variable to generate the correct path to access the value
     * */
    private _accessPathLiterals: StrNumber[] = [];
    /** push new item to the stack, returns true if new child is already in the stack (is circular type) */
    pushStack(newChild: BaseRunType): void {
        const totalLength = this.stack.length + this.totalLength;
        if (totalLength > MAX_STACK_DEPTH) throw new Error(maxStackErrorMessage);
        if (this.stack.length === 0) {
            if (newChild !== this.rootType) throw new Error('rootType should be the first item in the stack');
            newChild.getTypeID(); // ensures the constants are generated in correct order
        }
        this.vλl = getStackVλl(this);
        // static path must be called before pushing the new item
        if (isJitErrorsCompiler(this)) this._accessPathLiterals = getAccessPath(this);
        const newStackItem: StackItem = {vλl: this.vλl, rt: newChild, staticPath: this._accessPathLiterals};
        this.stack.push(newStackItem);
    }
    popStack(resultCode: jitCode): void | ((...args: any[]) => any) {
        if (resultCode) (this as Mutable<BaseCompiler>).code = resultCode;
        this.popItem = this.stack.pop();
        const item = this.stack[this.stack.length - 1];
        this.vλl = item?.vλl || this.args.vλl;
        if (isJitErrorsCompiler(this)) this._accessPathLiterals = item?.staticPath || [];
        if (this.stack.length === 0) {
            return this.compile();
        }
    }
    siplePushStack(newChild: BaseRunType): void {
        const newStackItem: StackItem = {vλl: this.vλl, rt: newChild, staticPath: this._accessPathLiterals};
        this.stack.push(newStackItem);
    }
    simplePopStack(): void {
        this.popItem = this.stack.pop();
    }
    compile(overrideCode?: string): (...args: any[]) => any {
        try {
            if (overrideCode) (this as Mutable<BaseCompiler>).code = overrideCode;
            this.setIsNoop();
            return compileFunction(this); // add the compiled function to jit cache
        } catch (e: any) {
            const fnName = getJITFnName(this.fnID);
            const fnCode = ` Code:\nfunction ${fnName}(){${this.code}}`;
            const name = `(${this.rootType.getTypeName()}:${this.rootType.getTypeID()})`;
            throw new Error(`Error building ${fnName} JIT function for type ${name}: ${e?.message} \n${fnCode}`);
        }
    }
    /** Returns a copy of the access pat for current stack item */
    getAccessPath(): StrNumber[] {
        return [...this._accessPathLiterals];
    }

    getAccessPathArgs(): string {
        return this._accessPathLiterals.join(',');
    }
    getAccessPathLength(): number {
        return this._accessPathLiterals.length;
    }
    getAccessPathArgsForFnCall(): {args: string; length: number} {
        return {args: this.getAccessPathArgs(), length: this.getAccessPathLength()};
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
        if (!isChildAccessorType(rt)) throw new Error(`cant get child var name from ${rt.getKindName()}`);
        if (rt.skipSettingAccessor?.()) return parent.vλl;
        return parent.vλl + (rt.useArrayAccessor() ? `[${rt.getChildLiteral(this)}]` : `.${rt.getChildVarName(this)}`);
    }
    shouldCallDependency(): boolean {
        const stackItem = this.getCurrentStackItem();
        return !stackItem.rt.isJitInlined() && this.stack.length > 1;
    }
    updateDependencies(childCop: JitCompiledFnData): void {
        this.dependenciesSet.add(childCop.jitFnHash);
        childCop.dependenciesSet.forEach((dep) => this.dependenciesSet.add(dep));
    }
    addPureFnDependency(fn: PureFunction | string): void {
        const fnHash = getPureFunctionKey(fn);
        if (!jitUtils.hasPureFn(fnHash))
            throw new Error(
                `Pure function with name ${fnHash} can not be added as jit dependency, be sure to register the pure function first by calling jitUtils.addPureFn()`
            );
        this.pureFnDependencies.add(fnHash);
    }
    removeFromJitCache(): void {
        jitUtils.removeFromJitCache(this as JitCompiledFn);
    }
    /**
     * Set the isNoop flag based on the code of the operation.
     * must be called before function gets compiled.
     * The isNoop flag is used to avoid calling the function when the result of compilation is an empty function.
     */
    private setIsNoop(): void {
        let isNoop = false;
        let code = this.code.trim();
        switch (this.fnID) {
            case JitFunctions.isType.id:
                isNoop = !this.code || this.code === 'true' || this.code === 'return true';
                if (isNoop) code = `return true`; // if code is a noop, we still need to return true
                break;
            case JitFunctions.hasUnknownKeys.id:
                isNoop = !this.code || this.code === 'false' || this.code === 'return false';
                if (isNoop) code = `return false`; // if code is a noop, we still need return false
                break;
            case JitFunctions.toJsonVal.id:
            case JitFunctions.fromJsonVal.id:
            case JitFunctions.stripUnknownKeys.id:
            case JitFunctions.unknownKeysToUndefined.id:
                isNoop = !this.code || this.code === this.args.vλl || this.code === `return ${this.args.vλl}`;
                if (isNoop) code = `return ${this.args.vλl}`; // if code is a noop, we need to return the value
                break;
            case JitFunctions.typeErrors.id:
            case JitFunctions.unknownKeyErrors.id:
                isNoop = !this.code || this.code === this.args.εrr || this.code === `return ${this.args.εrr}`;
                if (isNoop) code = `return ${this.args.εrr}`; // if code is a noop, we need to return the error array
                break;
            case JitFunctions.format.id:
                isNoop = !this.code || this.code === this.args.vλl || this.code === `return ${this.args.vλl}`;
                if (isNoop) code = `return ${this.args.vλl}`; // if code is a noop, we need to return the value
                break;
        }
        (this as Mutable<BaseCompiler>).isNoop = isNoop;
        (this as Mutable<BaseCompiler>).code = code;
    }
    getStackTrace(): string {
        const separator = '.';
        const parentTrace = this.parentCompiler ? this.parentCompiler.getStackTrace() + separator : JIT_STACK_TRACE_MESSAGE;
        const lastParentItem = this.parentCompiler?.getCurrentStackItem();
        const filteredStack = lastParentItem ? this.stack.filter((item) => item.rt !== lastParentItem?.rt) : this.stack;
        return parentTrace + filteredStack.map((item) => item.rt.getTypeTraceInfo()).join(separator);
    }
    hasStackTrace(errorMessage: string) {
        return errorMessage.includes(JIT_STACK_TRACE_MESSAGE);
    }
}

// ################### Compile Operations ###################

export class JitCompiler<ID extends JitFnID = any> extends BaseCompiler<typeof jitArgs, ID> {
    constructor(
        rt: BaseRunType,
        fnID: ID,
        parentCompiler?: BaseCompiler,
        jitFnHash?: string,
        typeID?: StrNumber,
        opts: RunTypeOptions = {}
    ) {
        super(rt, fnID, {...jitArgs}, {...jitDefaultArgs}, 'v', parentCompiler, jitFnHash, typeID, opts);
    }
}

export class JitErrorsCompiler<ID extends JitFnID = any> extends BaseCompiler<typeof jitErrorArgs, ID> {
    constructor(
        rt: BaseRunType,
        dnId: ID,
        parentCompiler?: BaseCompiler,
        jitFnHash?: string,
        typeID?: StrNumber,
        opts: RunTypeOptions = {}
    ) {
        const args = {...jitErrorArgs};
        const defaultValues = {...jitDefaultErrorArgs};
        super(rt, dnId, args, defaultValues, 'er', parentCompiler, jitFnHash, typeID, opts);
    }
    callJitErr(expected: AnyKindName | BaseRunType<any>): string {
        // TODO: most of the time jit path is an empty array, so a new array is created every time
        // this can be optimized by adding it to the compiler context, or maybe make the param optional in jitUtils.err
        return this.callJitErrWithPath(expected);
    }
    callJitErrWithPath(exp: AnyKindName | BaseRunType<any>, extraPathLiteral?: StrNumber): string {
        const args = this._getJitErrorArgs(exp);
        const accessPath = this.getAccessPathLiteral(extraPathLiteral);
        if (accessPath) args.push(accessPath);
        return `utl.err(${args.join(',')})`;
    }
    callJitFormatErr(
        expected: AnyKindName | BaseRunType<any>,
        formatter: BaseRunTypeFormat<any>,
        paramName: string,
        paramValue: string | number | boolean | bigint,
        extraPathLiteral?: StrNumber
    ): string {
        // jitUtil.formatErr function arguments =>

        // pλth: StrNumber[],
        // εrr: RunTypeError[],
        // expected: string,

        // fmtName: string,
        // paramName: string,
        // paramVal: StrNumber,
        // fmtPath: StrNumber[],
        // accessPath?: StrNumber[],
        // fmtAccessPath?: StrNumber[]

        const typeErrArgs = this._getJitErrorArgs(expected);
        const fmtName = toLiteralInContext(this, formatter.getFormatName());
        const pName = toLiteralInContext(this, paramName);
        const pVal = toLiteralInContext(this, paramValue);
        const fmtPath = toLiteralInContext(this, formatter.getFormatPath());
        const formatArgs = [fmtName, pName, pVal, fmtPath];
        const optionalArgs: string[] = [];
        const accessPath = this.getAccessPathLiteral(extraPathLiteral);
        const formatAccessPath = this.getFormatAccessPathLiteral(formatter);
        if (!accessPath && formatAccessPath) optionalArgs.push('undefined');
        if (accessPath) optionalArgs.push(accessPath);
        if (formatAccessPath) optionalArgs.push(formatAccessPath);
        return `utl.formatErr(${[...typeErrArgs, ...formatArgs, ...optionalArgs].join(',')})`;
    }

    private _getJitErrorArgs(exp: AnyKindName | BaseRunType<any>): string[] {
        // jitUtil.err function arguments =>
        // pλth: StrNumber[],
        // εrr: RunTypeError[],
        // expected: string,
        const path = this.args.pλth;
        const err = this.args.εrr;
        const expected = typeof exp === 'string' ? toLiteral(exp) : toLiteral(exp.getKindName());
        return [path, err, expected];
    }

    getAccessPathLiteral(extraPathLiteral?: StrNumber): string {
        const accessPath = this.getAccessPath();
        if (extraPathLiteral) accessPath.push(extraPathLiteral);
        return accessPath.length ? `[${accessPath.join(',')}]` : '';
    }

    getFormatAccessPathLiteral(formatter: BaseRunTypeFormat<any>): string {
        const formatExtraPathLiteral = formatter.getFormatExtraPathLiteral();
        return formatExtraPathLiteral ? `[${formatExtraPathLiteral}]` : '';
    }
}

// ################### Compiler Creation ###################

export function createJitCompiler(
    rt: BaseRunType,
    fnID: JitFnID,
    parent?: BaseCompiler,
    jitFnHash?: string,
    typeID?: StrNumber,
    opts: RunTypeOptions = {}
): BaseCompiler {
    switch (fnID) {
        case JitFunctions.isType.id:
        case JitFunctions.toJsonVal.id:
        case JitFunctions.fromJsonVal.id:
        case JitFunctions.jsonStringify.id:
        case JitFunctions.hasUnknownKeys.id:
        case JitFunctions.stripUnknownKeys.id:
        case JitFunctions.unknownKeysToUndefined.id:
        case JitFunctions.format.id:
        case JitFunctions.toCode.id:
            return new JitCompiler(rt, fnID, parent, jitFnHash, typeID, opts);
        case JitFunctions.typeErrors.id:
        case JitFunctions.unknownKeyErrors.id:
            return new JitErrorsCompiler(rt, fnID, parent, jitFnHash, typeID, opts);
        default:
            throw new Error(`Unknown compile operation: ${fnID}`);
    }
}

export function getSerializableJitCompiler(comp: JitCompiledFn): JitCompiledFnData {
    return {
        fnID: comp.fnID,
        jitFnHash: comp.jitFnHash,
        args: structuredClone(comp.args),
        isNoop: comp.isNoop,
        defaultParamValues: structuredClone(comp.defaultParamValues),
        code: comp.code,
        dependenciesSet: new Set(comp.dependenciesSet),
        pureFnDependencies: new Set(comp.pureFnDependencies),
        ...(comp.paramNames ? {paramNames: structuredClone(comp.paramNames)} : {}),
    };
}

export function compileAddPureFunctionWithClosure(comp: JitCompiler | JitErrorsCompiler, pureFn: PureFunctionClosure): string {
    const fnHash = getPureFunctionKey(pureFn.name);
    registerPureFnClosure(pureFn); // will throw if there is a different pure function with the same name
    if (comp.contextCodeItems.has(fnHash)) return fnHash;
    comp.addPureFnDependency(pureFn);
    // Add context code for the pure function and params
    const pureFunctionCode = `const ${fnHash} = utl.getPureFn(${toLiteral(fnHash)})`;
    comp.contextCodeItems.set(fnHash, pureFunctionCode);
    return fnHash;
}

// ################### Other Compiler functions ###################
/**
 * Creates a function name based on the jitHash of the runType and the id of the function.
 * it is a valid js variable name.
 * @param id
 * @param rt
 * @returns
 */
export function getJITFnHash(id: JitFnID, rt: BaseRunType, opts?: RunTypeOptions): string {
    if (opts) return `${id}_${rt.getJitHash(opts)}`;
    return `${id}_${rt.getJitHash({})}`;
}

function compileFunction(comp: BaseCompiler): (...args: any[]) => any {
    if (comp.fn) return comp.fn;
    if (comp.stack.length !== 0) throw new Error('Can not get compiled function before the compile operation is finished');
    if (jitUtils.hasJitFn(comp.jitFnHash)) return jitUtils.getJitFn(comp.jitFnHash);
    const {fnCode, fnName, contextCode} = getJitFnCode(comp);
    const {closureFn, fn, code} = createJitFnWithContext(comp, fnName, fnCode, contextCode);
    (comp as Mutable<BaseCompiler>).code = code;
    (comp as Mutable<BaseCompiler>).fn = fn;
    (comp as Mutable<BaseCompiler>).closureFn = closureFn;
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
function createJitFnWithContext(comp: BaseCompiler, fnName: string, fnCode: string, contextCode?: string) {
    // this function will have jitUtils as context as is an argument of the enclosing function
    const context = contextCode ? `${contextCode};` : '';
    let fnWithContext = `${context} ${fnCode} return ${fnName};`;
    if (process.env.DEBUG_RUN_TIME) {
        const fnArgs = getJitFnArgs(comp);
        const argsCall = getJitFnArgs(comp, false);
        const debugWrapper = `function debug_${fnName}(${fnArgs}){
            const resp = ${fnName}(${argsCall});
            console.log('${fnName} ${getJITFnName(comp.fnID)} ${comp.rootType.getTypeName()}', 'result:', resp, ' value:', ${argsCall});
            return resp;
        }`;
        fnWithContext = `${context} ${fnCode} ${debugWrapper} return debug_${fnName};`;
    }
    try {
        const wrapperWithContext = new Function('utl', fnWithContext) as (utl: JITUtils) => (...args: any[]) => any;
        if (process.env.DEBUG_JIT) console.log(printClosure(fnWithContext, fnName));
        return {closureFn: wrapperWithContext, fn: wrapperWithContext(jitUtils), code: fnWithContext}; // returns the jit internal function with the context
    } catch (e: any) {
        if (process.env.DEBUG_JIT) {
            console.warn('Error creating jit function with context code:\n', printClosure(fnWithContext, fnName));
        }
        throw e;
    }
}

function printClosure(fnWithContext: string, functionName: string): string {
    return `function closure_${functionName}(utl){${fnWithContext}}`;
}

export function getJitFnArgs(comp: JitCompilerLike, defaultValues = true): string {
    return Object.entries(comp.args)
        .map(([key, name]) => {
            if (!comp.defaultParamValues[key] || !defaultValues) return name;
            const value = comp.defaultParamValues[key];
            return `${name}=${value}`;
        })
        .join(',');
}

function getStackVλl(comp: BaseCompiler): string {
    let vλl: string = comp.args.vλl;
    for (let i = 0; i < comp.stack.length; i++) {
        const rt = comp.stack[i].rt;
        const custom = rt.getCustomVλl(comp);
        if (custom && custom.isStandalone) {
            vλl = custom.vλl;
        } else if (custom) {
            vλl += custom.useArrayAccessor ? `[${custom.vλl}]` : `.${custom.vλl}`;
        } else if (isChildAccessorType(rt) && !rt.skipSettingAccessor?.()) {
            vλl += rt.useArrayAccessor() ? `[${rt.getChildLiteral(comp)}]` : `.${rt.getChildVarName(comp)}`;
        }
    }
    return vλl;
}
function getAccessPath(comp: BaseCompiler): StrNumber[] {
    const path: StrNumber[] = [];
    const rtName: any = [];
    for (let i = 0; i < comp.stack.length; i++) {
        const rt = comp.stack[i].rt;
        const pathItem = rt.getStaticPathLiteral(comp);
        if (pathItem) {
            path.push(pathItem);
        } else if (isChildAccessorType(rt) && !rt.skipSettingAccessor?.()) {
            path.push(rt.getChildLiteral(comp));
        }
        rtName.push({path: [...path], name: rt.constructor.name});
    }
    return path;
}

function validateCompilerOptions(opts: RunTypeOptions): void {
    if (opts.paramsSlice) {
        const start = opts.paramsSlice?.start;
        const end = opts.paramsSlice?.end;
        if (start && start < 0) {
            throw new Error(`paramsSlice.start must be greater than 0`);
        }
        if (end && end < 0) {
            throw new Error(`paramsSlice.end must be greater than 0`);
        }
        if (end && start && end <= start) {
            throw new Error(`paramsSlice.end must be greater than paramsSlice.start`);
        }
    }
}
