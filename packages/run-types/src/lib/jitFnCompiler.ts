/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {JitCompiledFn, JitCompiledFnData, JitFnArgs, JITUtils, PureFunction, PureFunctionClosure} from '@mionkit/core';
import {MAX_STACK_DEPTH, getJitUtils} from '@mionkit/core';
import type {TypeFunction} from '@deepkit/type';
import type {Mutable, JitFnID, StrNumber, JitCode, RunTypeOptions, JitCompilerOpts, RunTypeChildAccessor} from '../types';
import type {BaseRunType} from './baseRunTypes';
import type {BaseRunTypeFormat} from './baseRunTypeFormat';
import {getReflectionName, type AnyKindName} from '../constants.kind';
import {maxStackErrorMessage, JIT_STACK_TRACE_MESSAGE} from '../constants';
import {type CodeType, CodeTypes, jitErrorArgs, type JitFnSettings} from '../constants.functions';
import {getJITFnName, getJitFnSettings} from './jitFnsRegistry';
import {JitFunctions} from '../constants.functions';
import {isChildAccessorType, isFunctionParamsRunType, isJitErrorsCompiler} from './guards';
import {addFullStop, getJitFnArgCallVarName, toLiteral, toLiteralInContext} from './utils';
import {registerPureFnClosure} from './pureFn';
import {getPureFunctionKey} from './pureFn';
import {getRunTypeFormat} from './formats';
import {emitJsonStringify} from '../jitCompilers/json/stringifyJson';
import {emitToBinary} from '../jitCompilers/binary/toBinary';
import {emitFromBinary} from '../jitCompilers/binary/fromBinary';
import {emitToCode} from '../jitCompilers/json/toJsCode';
import {createJitFunction, getJITFnHash} from './createJitFunction';

const RB = CodeTypes.returnBlock;
const S = CodeTypes.statement;
const E = CodeTypes.expression;

export type StackItem = {
    /** current compile stack full variable accessor */
    vλl: string;
    /** current compile stack variable accessor */
    rt: BaseRunType;
    /** if should call a dependency instead inline code, then this would contain the id of the dependency to call */
    dependencyId?: string;
    staticPath?: StrNumber[];
};

export type JitCompilerLike = BaseFnCompiler | JitCompiledFnData;
export type JitDependencies = Set<string>;

/**
 * Program to compile a Jit function to be used at runtime.
 * These jit functions are used to validate, serialize, deserialize, etc... based on runTypes.
 */
export class BaseFnCompiler<FnArgsNames extends JitFnArgs = JitFnArgs, ID extends JitFnID = any>
    implements JitCompiledFnData, JitCompilerOpts
{
    // !!! DO NOT MODIFY METHOD WITHOUT REVIEWING JIT CODE INVOCATIONS!!!
    /** The Jit Generated function once the compilation is finished */
    readonly fn: ((...args: any[]) => any) | undefined;
    readonly createJitFn: ((utl: JITUtils) => (...args: any[]) => any) | undefined;
    private isCompiled = false;

    constructor(
        public readonly rootType: BaseRunType,
        // the id of the function to be compiled (isType, typeErrors, prepareForJson, restoreFromJson, etc)
        public readonly fnID: ID,
        jitFnSettings: JitFnSettings,
        public readonly parentCompiler?: BaseFnCompiler,
        jitFnHash?: string,
        typeID?: StrNumber,
        public readonly opts: RunTypeOptions = {}
    ) {
        this.typeName = this.rootType.getTypeName();
        this.jitFnHash = jitFnHash || getJITFnHash(this.fnID, this.rootType, opts);
        this.typeID = typeID || this.rootType.getTypeID();
        this.args = {...jitFnSettings.jitArgs} as FnArgsNames;
        this.defaultParamValues = {...jitFnSettings.jitDefaultArgs} as FnArgsNames;
        this.returnName = jitFnSettings.returnName;
        if (this.args.vλl) this.vλl = this.args.vλl;
        // At the time of adding this compiler to the jit cache, the fn is undefined which is technically not allowed
        // but this prevents issues with circular types and loading order of jit dependencies
        getJitUtils().addToJitCache(this as JitCompiledFn);
        validateCompilerOptions(opts);
    }
    readonly typeName: string;
    readonly typeID: StrNumber;
    readonly jitFnHash: string;
    readonly args: FnArgsNames;
    readonly defaultParamValues: FnArgsNames;
    readonly returnName: string;

    /** Alternative arguments to use when calling a child function */
    readonly childrenCallArgs: Partial<Record<JitFnID, Partial<JitFnArgs>>> = {};

    /** Code for the jit function. after the operation has been compiled */
    readonly code: string = '';
    /** Code for the context function enclosing the jit function.
     * This can be used to initialize constant or some other things that will be required across all invocation.
     * By default this contains constants for the direct dependencies of the jit function.
     * */
    readonly contextCodeItems = new Map<string, string>();
    /**
     * This flag is set to true when the result of a jit compilation is a no operation (empty function).
     * Some jit compiled functions could execute no operations (ie: string, boolean and numbers does not require prepareForJson/restoreFromJson)
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
    /** The variable name for the current item in the stack. */
    vλl: string = '';
    getNestLevel(rt: BaseRunType<any>): number {
        let index = -1;
        this.stack.forEach((item, i) => {
            if (item.rt === rt) index = i;
            if (item.rt.src.id && item.rt.src.id === rt.src.id) index = i;
        });
        if (index !== -1) return index;
        const fromParent = this.parentCompiler?.getNestLevel(rt);
        if (fromParent && fromParent !== -1) return fromParent;
        return -1; // not found
    }
    private varNameindex: Map<BaseRunType<any> | number, number> = new Map();
    getLocalVarName(prefix: string, rt: BaseRunType<any>): string {
        const key = rt.src.id || rt; // duplicated elements might have same index (that means they are the same deepkit type)
        const index = this.varNameindex.get(key);
        if (index !== undefined) return `${prefix}${index}`;
        const newIndex = this.varNameindex.size;
        this.varNameindex.set(key, newIndex);
        return `${prefix}${newIndex}`;
    }
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
    popStack(resultCode: JitCode): void | ((...args: any[]) => any) {
        if (resultCode?.code) (this as Mutable<BaseFnCompiler>).code = resultCode.code;
        this.popItem = this.stack.pop();
        const item = this.stack[this.stack.length - 1];
        this.vλl = item?.vλl || this.args.vλl;
        if (isJitErrorsCompiler(this)) this._accessPathLiterals = item?.staticPath || [];
    }
    siplePushStack(newChild: BaseRunType): void {
        const newStackItem: StackItem = {vλl: this.vλl, rt: newChild, staticPath: this._accessPathLiterals};
        this.stack.push(newStackItem);
    }
    simplePopStack(): void {
        this.popItem = this.stack.pop();
    }
    createJitFunction(overrideCode?: string): (...args: any[]) => any {
        try {
            if (overrideCode) {
                (this as Mutable<BaseFnCompiler>).code = overrideCode;
                this.isCompiled = false;
            }
            this.handleFunctionReturn();
            return createJitFunction(this); // add the compiled function to jit cache
        } catch (e: any) {
            const fnName = getJITFnName(this.fnID);
            const fnCode = ` Code:\nfunction ${fnName}(){${this.code}}`;
            const name = `(${this.rootType.getTypeName()}:${this.rootType.getTypeID()})`;
            const typeString = `Type: ${this.rootType.stringify()}`;
            throw new Error(`Error building ${fnName} JIT function for type ${name}: ${e?.message} \n${typeString} \n${fnCode}`);
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
    updateDependencies(childComp: JitCompiledFnData): void {
        if (childComp.isNoop) return; // noop functions are not added to dependencies as shouldn't be used inside jit code neither
        this.dependenciesSet.add(childComp.jitFnHash);
    }
    removeFromJitCache(): void {
        getJitUtils().removeFromJitCache(this as JitCompiledFn);
    }
    getStackTrace(): string {
        const separator = '.';
        const parentTrace = this.parentCompiler ? this.parentCompiler.getStackTrace() + separator : JIT_STACK_TRACE_MESSAGE;
        const lastParentItem = this.parentCompiler?.getCurrentStackItem();
        const filteredStack = lastParentItem ? this.stack.filter((item) => item.rt !== lastParentItem?.rt) : this.stack;
        return parentTrace + filteredStack.map((item) => this.getTypeTraceInfo(item.rt)).join(separator);
    }
    hasStackTrace(errorMessage: string) {
        return errorMessage.includes(JIT_STACK_TRACE_MESSAGE);
    }

    /** Set a context code item */
    setContextItem(key: string, value: string): void {
        this.contextCodeItems.set(key, value);
    }

    /** Get a context code item */
    getContextItem(key: string): string | undefined {
        return this.contextCodeItems.get(key);
    }

    /** Check if a context code item exists */
    hasContextItem(key: string): boolean {
        return this.contextCodeItems.has(key);
    }

    /** Get all context code items values */
    getContextItemValues(): string[] {
        return Array.from(this.contextCodeItems.values());
    }

    setChildrenCallArgs(fnID: string, args: Partial<JitFnArgs>): void {
        this.childrenCallArgs[fnID] = args;
    }

    getChildrenCallArgs(fnID: string): Partial<JitFnArgs> | undefined {
        return this.childrenCallArgs[fnID];
    }

    /**
     * Compiles the current function.
     * This function handles the logic to determine if the operation should be compiled and code should be inlined, or called as a dependency.
     * Note current JitCompiler operation might be different from the passed operation id.
     * ie: typeErrors might want to compile isType to generate the part of the code that checks for the type.
     * @param comp current jit compiler operation
     * @param fnID operation id
     * @returns
     */
    compile(rt: BaseRunType | undefined, expectedCType: CodeType, fnID: JitFnID): JitCode {
        if (!rt) return {code: undefined, type: expectedCType};
        let jCode: JitCode;
        this.pushStack(rt);
        if (this.shouldCallDependency()) {
            const compiledOp = rt.createJitCompiledFunction(fnID, this, this.opts);
            jCode = this.callDependency(rt, compiledOp);
            this.updateDependencies(compiledOp);
        } else {
            // prettier-ignore
            switch (fnID) {
                    case JitFunctions.isType.id:
                        jCode = this.compileFormatter(rt, fnID, rt.emitIsType(this, expectedCType), expectedCType, '&&'); break;
                    case JitFunctions.typeErrors.id:
                        jCode = this.compileFormatter(rt, fnID, rt.emitTypeErrors(this as any, expectedCType), expectedCType, ';'); break;
                    case JitFunctions.prepareForJson.id:
                        jCode = this.compileFormatter(rt, fnID,rt.emitPrepareForJson(this, expectedCType), expectedCType, ';'); break;
                    case JitFunctions.restoreFromJson.id:
                        jCode = this.compileFormatter(rt, fnID,rt.emitRestoreFromJson(this, expectedCType), expectedCType, ';'); break;
                    case JitFunctions.stringifyJson.id:
                        jCode = this.compileFormatter(rt, fnID,emitJsonStringify(rt, this), expectedCType, ';'); break;
                    case JitFunctions.toBinary.id:
                        jCode = this.compileFormatter(rt, fnID,emitToBinary(rt, this as any), expectedCType, ';'); break;
                    case JitFunctions.fromBinary.id:
                        jCode = this.compileFormatter(rt, fnID,emitFromBinary(rt, this as any), expectedCType, ';'); break;
                    case JitFunctions.toJSCode.id:
                        jCode =this.compileFormatter(rt, fnID, emitToCode(rt, this), expectedCType, ';'); break;
                    case JitFunctions.unknownKeyErrors.id:
                        jCode = rt.emitUnknownKeyErrors(this as any, expectedCType); break;
                    case JitFunctions.hasUnknownKeys.id:
                        jCode = rt.emitHasUnknownKeys(this, expectedCType); break;
                    case JitFunctions.stripUnknownKeys.id:
                        jCode = rt.emitStripUnknownKeys(this, expectedCType); break;
                    case JitFunctions.unknownKeysToUndefined.id:
                        jCode = rt.emitUnknownKeysToUndefined(this, expectedCType); break;
                    case JitFunctions.format.id:
                        jCode = {code: undefined, type: E}; break;
                    default:
                        throw new Error(`Unknown compile operation: ${fnID}`);
                }
            if (jCode?.code) {
                // endure the child code type is compatible with the parent code type.
                // ie: a code statement can not be interpolated within an expression
                const compatibleCode = this.handleCodeInterpolation(rt, jCode, expectedCType);
                jCode = {code: compatibleCode, type: jCode.type};
            }
        }
        this.popStack(jCode);
        return jCode;
    }

    private compileFormatter(
        rt: BaseRunType,
        fnID: JitFnID,
        childJCode: JitCode,
        expectedCType: CodeType,
        separator: ';' | '&&'
    ): JitCode {
        const expectedCT = childJCode.code ? childJCode.type : expectedCType;
        const typeFormatter = getRunTypeFormat(rt);
        if (!typeFormatter) return childJCode;
        let jitCode: JitCode | undefined = undefined;
        const formatterCode = typeFormatter.compileFormat(fnID, this, rt);
        // Check if the formatter code can be embedded AND is compatible with the function ID
        const canEmbed = typeFormatter.canEmbedFormatterCode(fnID, rt);
        const codeHasReturn = formatterCode.type === RB;

        // For isType and similar functions that are expressions, we need to ensure
        // the formatter code is also an expression or has a return statement
        const isCompatible = formatterCode.type === expectedCT;
        if (canEmbed && isCompatible && !codeHasReturn) {
            jitCode = formatterCode;
        } else {
            // Otherwise, create a separate function
            const compiled = typeFormatter.createJitCompiledFormatter(fnID, rt, this, undefined, undefined, undefined, this.opts);
            if (!compiled.isNoop) {
                this.updateDependencies(compiled);
                jitCode = this.callDependency(rt, compiled);
            }
        }
        if (!jitCode?.code) return childJCode;
        const shouldReplace = getJitFnSettings(fnID).formatShouldReplaceJitCode;
        const joiner = separator === '&&' ? ' && ' : '; ';
        if (shouldReplace) {
            return jitCode;
        }
        const finalCode = childJCode?.code ? childJCode.code + joiner + jitCode.code : jitCode.code;
        return {code: finalCode, type: expectedCT};
    }

    private callDependency(rt: BaseRunType, dependencyComp: JitCompiledFn): JitCode {
        if (dependencyComp.isNoop) return {code: '', type: E}; // we don't need to call noop functions
        const isErrorCall =
            dependencyComp.fnID === JitFunctions.typeErrors.id || dependencyComp.fnID === JitFunctions.unknownKeyErrors.id;

        // Use the dependency's args, not the current compiler's args
        const depArgs = getJitFnSettings(dependencyComp.fnID as JitFnID).jitArgs;
        const callArgsCode = Object.keys(depArgs)
            .map((key) => getJitFnArgCallVarName(this, rt, dependencyComp.fnID as JitFnID, key))
            .join(',');
        const isSelf = this.jitFnHash === dependencyComp.jitFnHash;
        const varName = dependencyComp.jitFnHash;
        // call local variable instead directly calling jitUtils to avoid lookups.
        // ie function context (local variable created when compiling the function): const abc = jitUtils.getJIT('abc);
        // ie calling context variable: abc.fn();
        // if operation is the same as the current operation we can call the function directly

        const callCode = isSelf ? `${varName}(${callArgsCode})` : `${varName}.fn(${callArgsCode})`;
        if (!isSelf) this.setContextItem(varName, `const ${varName} = utl.getJIT(${toLiteral(varName)})`);
        if (isErrorCall) {
            const pathArgs = this.getAccessPathArgs();
            const pathLength = this.getAccessPathLength();
            if (!pathLength) return {code: callCode, type: 'E'};
            // increase and decrease the static path before and after calling the dependency function
            // TODO, maybe we can improve performance by using something else than push and splice
            return {
                code: `${jitErrorArgs.pλth}.push(${pathArgs}); ${callCode}; ${jitErrorArgs.pλth}.splice(-${pathLength});`,
                type: 'S',
            };
        }
        return {code: callCode, type: 'E'};
    }

    /** Check if root type is a FunctionParamsRunType with no children (empty params) */
    private isEmptyFunctionParams(): boolean {
        if (!isFunctionParamsRunType(this.rootType)) return false;
        return this.rootType.getChildRunTypes().length === 0;
    }

    /**
     * Set the isNoop flag based on the code of the operation.
     * must be called before function gets compiled.
     * The isNoop flag is used to avoid calling the function when the result of compilation is an empty function.
     */
    private handleFunctionReturn(): void {
        if (this.isCompiled) return;
        let isNoop = false;
        // trims code and transforms multiple whitespaces into a single one, does not affect new lines as those can be significant
        let code = this.code.replace(/[ \t]+/g, ' ').replace(/;+/g, ';');
        // For functions with no params, all validation/serialization functions are noop
        const isEmptyParams = this.isEmptyFunctionParams();
        switch (this.fnID) {
            case JitFunctions.isType.id:
                isNoop = isEmptyParams || !this.code || this.code === 'true' || this.code === 'return true';
                if (isNoop) code = `return true`; // if code is a noop, we still need to return true
                break;
            case JitFunctions.hasUnknownKeys.id:
                isNoop = !this.code || this.code === 'false' || this.code === 'return false';
                if (isNoop) code = `return false`; // if code is a noop, we still need return false
                break;
            case JitFunctions.prepareForJson.id:
            case JitFunctions.restoreFromJson.id:
            case JitFunctions.stripUnknownKeys.id:
            case JitFunctions.unknownKeysToUndefined.id:
                isNoop = isEmptyParams || !this.code || this.code === this.args.vλl || this.code === `return ${this.args.vλl}`;
                if (isNoop) code = `return ${this.args.vλl}`; // if code is a noop, we need to return the value
                break;
            case JitFunctions.typeErrors.id:
            case JitFunctions.unknownKeyErrors.id:
                isNoop = isEmptyParams || !this.code || this.code === this.args.εrr || this.code === `return ${this.args.εrr}`;
                if (isNoop) code = `return ${this.args.εrr}`; // if code is a noop, we need to return the error array
                break;
            case JitFunctions.format.id:
                isNoop = !this.code || this.code === this.args.vλl || this.code === `return ${this.args.vλl}`;
                if (isNoop) code = `return ${this.args.vλl}`; // if code is a noop, we need to return the value
                break;
        }
        (this as Mutable<BaseFnCompiler>).isNoop = isNoop;
        (this as Mutable<BaseFnCompiler>).code = code;
        this.isCompiled = true;
    }

    /** Ensures the child code type is compatible with the parent code type */
    private handleCodeInterpolation(rt: BaseRunType, childJCode: JitCode, parentCodeType: CodeType): string {
        const code = childJCode.code || '';
        const childCodeType = childJCode.type;
        const isRoot = this.length === 1;
        // root code must ensure values are returned
        if (isRoot) {
            // prettier-ignore
            switch (childCodeType) {
                case E: return `return ${code}`;
                case S: return  `${addFullStop(code)} return ${this.returnName}`;
                case RB: return code;
            }
        }
        switch (true) {
            case parentCodeType === E && childCodeType === E:
                return code;
            case parentCodeType === E && childCodeType === S:
                return this.callSelfInvokingFunction(childJCode);
            case parentCodeType === E && childCodeType === RB:
                return this.callSelfInvokingFunction(childJCode);
            case parentCodeType === S && childCodeType === E:
                return code; // no need for full stop, parent should handle it
            case parentCodeType === S && childCodeType === S:
                return addFullStop(code);
            case parentCodeType === S && childCodeType === RB:
                return this.callSelfInvokingFunction(childJCode);
            case parentCodeType === RB && childCodeType === E:
                throw new Error('Expected an block code but got an expression, rt should not happen as would be useless code.');
            case parentCodeType === RB && childCodeType === S:
                return addFullStop(code);
            case parentCodeType === RB && childCodeType === RB:
                return `${addFullStop(code)} return ${this.returnName}`;
            default:
                throw new Error(`Unexpected code type (expected: ${parentCodeType}, got: ${childCodeType})`);
        }
    }

    /**
     * If code should be an expression, but code has return a statement, we need to wrap it in a self invoking function to avoid syntax errors
     * IMPORTANT TODO, WE CAN IMPROVE PERF QUITE A BIT BY CREATING A NEW FUNCTION IN CONTEXT INSTEAD SELF INVOkING
     * TODO: we could create a new function and cache instead a self invoking function a performance is same but code is not repeated
     * IE: this.selfInvoke(code), rt will create a new function in context and call that function instead of self invoking
     * rt is specially for atomic types as we can be sure there are no references to children types inside the code block
     */
    private callSelfInvokingFunction(jCode: JitCode): string {
        if (jCode.type === E) throw new Error('Javascript expressions never need to be wrapped in a self invoking function.');
        if (!jCode.code) return '';
        const code = jCode.code.trim();
        const isSelfInvoking = code.startsWith('(function()') && code.endsWith(')()');
        if (isSelfInvoking) return code;
        const addReturn = jCode.type !== RB;
        const returnCode = addReturn ? `return ` : '';
        return `(function(){${returnCode}${jCode.code}})()`;
    }

    getTypeTraceInfo(rt: BaseRunType): string {
        if (rt.getFamily() === 'C') return rt.src.typeName || getReflectionName(rt);
        if (rt.getFamily() === 'F') return String((rt.src as TypeFunction).name) || getReflectionName(rt);
        if (rt.getFamily() === 'M') {
            const rtChild = rt as any as RunTypeChildAccessor;
            const isRunTypeChildAccessor = !!rtChild.getChildVarName;
            if (!isRunTypeChildAccessor) return getReflectionName(rt);
            return String(rtChild.getChildVarName(this));
        }
        return getReflectionName(rt);
    }

    // ########## Compile Methods shorthands ##########

    compileIsType(rt: BaseRunType | undefined, expectedCType: CodeType): JitCode {
        return this.compile(rt, expectedCType, JitFunctions.isType.id);
    }
    compileTypeErrors(rt: BaseRunType | undefined, expectedCType: CodeType): JitCode {
        return this.compile(rt, expectedCType, JitFunctions.typeErrors.id);
    }
    compilePrepareForJson(rt: BaseRunType | undefined, expectedCType: CodeType): JitCode {
        return this.compile(rt, expectedCType, JitFunctions.prepareForJson.id);
    }
    compileRestoreFromJson(rt: BaseRunType | undefined, expectedCType: CodeType): JitCode {
        return this.compile(rt, expectedCType, JitFunctions.restoreFromJson.id);
    }
    compileJsonStringify(rt: BaseRunType | undefined, expectedCType: CodeType): JitCode {
        return this.compile(rt, expectedCType, JitFunctions.stringifyJson.id);
    }
    compileToBinary(rt: BaseRunType | undefined, expectedCType: CodeType): JitCode {
        return this.compile(rt, expectedCType, JitFunctions.toBinary.id);
    }
    compileFromBinary(rt: BaseRunType | undefined, expectedCType: CodeType): JitCode {
        return this.compile(rt, expectedCType, JitFunctions.fromBinary.id);
    }
    compileUnknownKeyErrors(rt: BaseRunType | undefined, expectedCType: CodeType): JitCode {
        return this.compile(rt, expectedCType, JitFunctions.unknownKeyErrors.id);
    }
    compileHasUnknownKeys(rt: BaseRunType | undefined, expectedCType: CodeType): JitCode {
        return this.compile(rt, expectedCType, JitFunctions.hasUnknownKeys.id);
    }
    compileStripUnknownKeys(rt: BaseRunType | undefined, expectedCType: CodeType): JitCode {
        return this.compile(rt, expectedCType, JitFunctions.stripUnknownKeys.id);
    }
    compileUnknownKeysToUndefined(rt: BaseRunType | undefined, expectedCType: CodeType): JitCode {
        return this.compile(rt, expectedCType, JitFunctions.unknownKeysToUndefined.id);
    }

    // ################### Pure Functions Operations ###################

    addPureFunction(pureFn: PureFunctionClosure): string {
        const fnHash = getPureFunctionKey(pureFn.name);
        registerPureFnClosure(pureFn); // will throw if there is a different pure function with the same name
        if (this.hasContextItem(fnHash)) return fnHash;
        this.addPureFnDependency(pureFn);
        // Add context code for the pure function and params
        const pureFunctionCode = `const ${fnHash} = utl.getPureFn(${toLiteral(fnHash)})`;
        this.setContextItem(fnHash, pureFunctionCode);
        return fnHash;
    }

    addPureFnDependency(fn: PureFunction | string): void {
        const fnHash = getPureFunctionKey(fn);
        if (!getJitUtils().hasPureFn(fnHash))
            throw new Error(
                `Pure function with name ${fnHash} can not be added as jit dependency, be sure to register the pure function first by calling getJitUtils().addPureFn()`
            );
        this.pureFnDependencies.add(fnHash);
    }
}

// ################### Compile Operations ###################

export class JitFnCompiler<ID extends JitFnID = any> extends BaseFnCompiler<JitFnArgs, ID> {
    constructor(
        rt: BaseRunType,
        fnID: ID,
        parentCompiler?: BaseFnCompiler,
        jitFnHash?: string,
        typeID?: StrNumber,
        opts: RunTypeOptions = {}
    ) {
        const fnSettings = getJitFnSettings(fnID);
        super(rt, fnID, fnSettings, parentCompiler, jitFnHash, typeID, opts);
    }
}

export class JitErrorsFnCompiler<ID extends JitFnID = any> extends BaseFnCompiler<typeof jitErrorArgs, ID> {
    constructor(
        rt: BaseRunType,
        fnID: ID,
        parentCompiler?: BaseFnCompiler,
        jitFnHash?: string,
        typeID?: StrNumber,
        opts: RunTypeOptions = {}
    ) {
        const fnSettings = getJitFnSettings(fnID);
        super(rt, fnID, fnSettings, parentCompiler, jitFnHash, typeID, opts);
    }
    callJitErr(expected: AnyKindName | BaseRunType<any>): string {
        // TODO: most of the time jit path is an empty array, so a new array is created every time
        // this can be optimized by adding it to the compiler context, or maybe make the param optional in jitUtils.err
        return this.callJitErrWithPath(expected);
    }
    /**
     * This is used when we add an extra item to the path,
     * for extra info, ie union items, maps keys, etc...
     * This is because we don't want the item int the real path as it is not part of the runtime path of an object.
     * but we still want to add that info to process the error.
     * ie: type  AorBList = ({a: string} | {b: string})[];
     * we want the error to contain the info if it is union item a or b, but the path to the the doesn't have that info is just list[index]
     * */
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

/**
 * This is an special compiler for mock Function as mock is not technically a jit compiled function
 * but still needs to be created to reuse all jit functionality.
 */
export class MockJitCompiler extends BaseFnCompiler<JitFnArgs, 'mock'> {
    constructor(rt: BaseRunType, opts: RunTypeOptions, parentCompiler?: BaseFnCompiler, jitFnHash?: string, typeID?: StrNumber) {
        super(rt, JitFunctions.mock.id, JitFunctions.mock, parentCompiler, jitFnHash, typeID, opts);
    }
}

// ################### Compiler Creation ###################

export function createJitCompiler(
    rt: BaseRunType,
    fnID: JitFnID,
    parent?: BaseFnCompiler,
    jitFnHash?: string,
    typeID?: StrNumber,
    opts: RunTypeOptions = {}
): BaseFnCompiler {
    switch (fnID) {
        case JitFunctions.isType.id:
        case JitFunctions.prepareForJson.id:
        case JitFunctions.restoreFromJson.id:
        case JitFunctions.stringifyJson.id:
        case JitFunctions.hasUnknownKeys.id:
        case JitFunctions.stripUnknownKeys.id:
        case JitFunctions.unknownKeysToUndefined.id:
        case JitFunctions.format.id:
        case JitFunctions.toJSCode.id:
        case JitFunctions.toBinary.id:
        case JitFunctions.fromBinary.id:
            return new JitFnCompiler(rt, fnID, parent, jitFnHash, typeID, opts);
        case JitFunctions.typeErrors.id:
        case JitFunctions.unknownKeyErrors.id:
            return new JitErrorsFnCompiler(rt, fnID, parent, jitFnHash, typeID, opts);
        case JitFunctions.mock.id:
            return new MockJitCompiler(rt, opts, parent, jitFnHash, typeID);
        default:
            throw new Error(`Unknown compile operation: ${fnID}`);
    }
}

export function printClosure(fnWithContext: string, functionName: string): string {
    return `function get_${functionName}(utl){${fnWithContext}}`;
}

// ################### utils ###################

function getStackVλl(comp: BaseFnCompiler): string {
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
function getAccessPath(comp: BaseFnCompiler): StrNumber[] {
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
