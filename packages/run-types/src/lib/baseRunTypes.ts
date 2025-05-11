/* eslint-disable @typescript-eslint/no-unused-vars */
/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {MAX_STACK_DEPTH} from '@mionkit/core/src/constants';
import type {
    RunType,
    Mutable,
    RunTypeChildAccessor,
    JitFnID,
    SrcType,
    SrcCollection,
    CustomVλl,
    JitFn,
    FormatAnnotation,
    jitCode,
    RunTypeOptions,
    StrNumber,
    DeepPartial,
    JitCompilerOpts,
} from '../types';
import type {mockType} from '../mocking/mockType';
import {jitArgs, jitErrorArgs, JitFunctions, maxStackErrorMessage, CodeType, getCodeType} from '../constants';
import {ReflectionKind, type TypeIndexSignature, type TypeProperty, type Type} from '@deepkit/type';
import {getPropIndex, memorize, toLiteral} from './utils';
import {JitErrorsCompiler, JitCompiler, getJITFnHash, createJitCompiler} from './jitCompiler';
import {type AnyKindName, getReflectionName} from '../constants.kind';
import {jitUtils} from '../../../core/src/jitUtils';
import {createUniqueHash} from './quickHash';
import {
    initFormatAnnotations,
    getFormatAnnotations,
    getTypeFormats,
    getRunTypeFormatter,
    defaultIgnoreFormatProps,
} from './formats';
import {typeParamsToString} from './utils';
import {_compileJsonStringify} from '@mionkit/run-types/src/jitCompilers/jsonStringify';
import {getJitCompilerFunction, loadJitCompilerFunction} from './jitFnsRegistry';
import {JitCompiledFn} from '@mionkit/core/src/types';
import {_compileToCode} from '@mionkit/run-types/src/jitCompilers/toCode';
import {defaultMockOptions} from '@mionkit/run-types/src/mocking/constants.mock';

export abstract class BaseRunType<T extends Type = Type> implements RunType {
    // Registry for dynamically loaded functions
    isCircular?: boolean;
    readonly src: SrcType<T> = null as any; // real value will be set after construction by the createRunType function
    abstract getFamily(): 'A' | 'C' | 'M' | 'F'; // Atomic, Collection, Member, Function
    abstract _getTypeID(stack?: RunType[]): StrNumber;
    isJitInlined = () => !(this.isCircular || (this.src.typeName && this.getFamily() === 'C'));
    getKindName = memorize((): AnyKindName => getReflectionName(this));
    getTypeName = (): string => this.src.typeName || this.getKindName();
    getFormatAnnotations = (): FormatAnnotation[] => getFormatAnnotations(this);
    skipJit(comp: JitCompilerOpts): boolean {
        return false;
    }
    getFormatTypeID = memorize((): string | undefined => {
        const formatter = getRunTypeFormatter(this);
        if (!formatter) return;
        return `<${typeParamsToString(formatter.getParams(this), defaultIgnoreFormatProps)}>`;
    });
    getTypeID(stack: BaseRunType[] = []): StrNumber {
        const formatID = this.getFormatTypeID();
        if (!formatID) return this._getTypeID(stack);
        return this._getTypeID(stack) + formatID;
    }
    getJitHash = memorize((): string => createUniqueHash(this.getTypeID().toString()));
    getParent = (): BaseRunType | undefined => (this.src.parent as SrcType)?._rt as BaseRunType;
    getNestLevel = memorize((): number => {
        if (this.isCircular) return 0; // circular references start a new context
        const parent = this.getParent() as BaseRunType<T>;
        if (!parent) return 0;
        return parent.getNestLevel() + 1;
    });
    getCircularTypeID(stack: RunType[] = []): StrNumber | undefined {
        const inStackIndex = stack.findIndex((rt) => rt === this); // cant use isSameJitType because it uses getTypeID and would loop forever
        const isInStack = inStackIndex >= 0; // recursive reference
        if (isInStack) {
            this.isCircular = true;
            const name = this.src.typeName || ''; // todo: not sure if all the circular references will have a name
            return '$' + this.src.kind + `_${inStackIndex}` + name; // ensures different circular types have different typeID
        }
    }
    /** Code Type flag
     * Any child with different settings should override these methods
     * these flags are used to determine if the compiled code should be wrapped in a self invoking function or not
     * or if the compiled code should contain a return statement or not */
    getCodeType(fnID: JitFnID): CodeType {
        return getCodeType(fnID);
    }
    /**
     * Method that should be called Immediately after the RunType gets created to link the SrcType and RunType.
     * This is more flexible than passing params to the constructor helps to avoid circular dependencies, etc.
     * */
    onCreated(src: SrcType<any>): void {
        (this as Mutable<RunType>).src = src;
        (src as Mutable<SrcType>)._rt = this;
        initFormatAnnotations(this);
    }
    /**
     * Some elements might need a standalone name variable that ignores the vλl value of the parents.
     * returns a variable that is being compiled, ignores the parents variable names */
    getCustomVλl(comp: JitCompilerOpts): CustomVλl | undefined {
        return undefined;
    }
    /**
     * Some elements might need a custom static path to be able to reference the source of an error.
     * ie: when validating a Map we need to differentiate if the value that failed is the  key or the value of a map's entry.
     */
    getStaticPathLiteral(comp: JitCompilerOpts): string | number | undefined {
        return undefined;
    }

    // ########## Mock ##########

    async mock(opts?: DeepPartial<RunTypeOptions>): Promise<any> {
        // although the mock function is not jit, it is also stored in the registry
        await loadJitCompilerFunction(JitFunctions.mock);
        return this.mockType(opts);
    }

    /** synchronous version of mock, throws an error if the mock function has not been loaded */
    mockType(opts: DeepPartial<RunTypeOptions> = {}): any {
        const mockFn = getJitCompilerFunction(JitFunctions.mock) as typeof mockType;
        if (!mockFn)
            throw new Error(
                `Function ${JitFunctions.mock.name} has not been loaded. make sure you have called loadJitCompilerFunction(JitFunctions.mock) before calling mockType.`
            );
        const fnID = JitFunctions.mock.id;
        // options sent to the compiler will be set to empty as mock options are handled separately from the compiler
        const mockingOpts = {...opts, mock: {...defaultMockOptions, ...(opts.mock || {})}} as RunTypeOptions;
        const hash = getJITFnHash(fnID, this, mockingOpts);
        const comp: JitCompilerOpts = {
            fnID,
            typeID: this.getTypeID(),
            jitFnHash: hash,
            opts: mockingOpts,
        };
        return mockFn(this, comp);
    }

    // ########## Create Jit Functions ##########

    createJitFunction = (jitFn: JitFn, opts: RunTypeOptions = {}): ((...args: any[]) => any) => {
        return this.createJitCompiledFunction(jitFn.id, undefined, opts).fn;
    };

    createJitCompiledFunction(fnID: JitFnID, parentCop?: JitCompiler, opts: RunTypeOptions = {}): JitCompiledFn {
        const jitCompiled = jitUtils.getJIT(getJITFnHash(fnID, this, opts));
        if (jitCompiled) {
            if (process.env.DEBUG_JIT === 'VERBOSE')
                console.log(`\x1b[32m Using cached function: ${jitCompiled.jitFnHash} \x1b[0m`);
            return jitCompiled;
        }
        const newJitCompiler: JitCompiler = createJitCompiler(this, fnID, parentCop, undefined, undefined, opts) as JitCompiler;
        try {
            this.compile(newJitCompiler, fnID);
        } catch (e) {
            // if something goes wrong during compilation we want to remove the compiler from
            // the cache as this is automatically added to jitUtils cache during compilation
            newJitCompiler.removeFromJitCache();
            throw e;
        }
        return newJitCompiler as JitCompiledFn;
    }

    // ########## Child _compile Methods ##########

    /* BaseRunType compileX method is in charge of handling circular refs, return values, create subprograms, etc.
     * While the child _compileX must only contain the logic to generate the code. */
    abstract _compileIsType(comp: JitCompiler): jitCode;
    abstract _compileTypeErrors(comp: JitErrorsCompiler): jitCode;
    abstract _compileToJsonVal(comp: JitCompiler): jitCode;
    abstract _compileFromJsonVal(comp: JitCompiler): jitCode;
    abstract _compileHasUnknownKeys(comp: JitCompiler): jitCode;
    abstract _compileUnknownKeyErrors(comp: JitErrorsCompiler): jitCode;
    abstract _compileStripUnknownKeys(comp: JitCompiler): jitCode;
    abstract _compileUnknownKeysToUndefined(comp: JitCompiler): jitCode;

    // ########## Compile Methods ##########

    compileIsType(comp: JitCompiler): jitCode {
        return this.compile(comp, JitFunctions.isType.id);
    }
    compileTypeErrors(comp: JitErrorsCompiler): jitCode {
        return this.compile(comp, JitFunctions.typeErrors.id);
    }
    compileToJsonVal(comp: JitCompiler): jitCode {
        return this.compile(comp, JitFunctions.toJsonVal.id);
    }
    compileFromJsonVal(comp: JitCompiler): jitCode {
        return this.compile(comp, JitFunctions.fromJsonVal.id);
    }
    compileUnknownKeyErrors(comp: JitErrorsCompiler): jitCode {
        return this.compile(comp, JitFunctions.unknownKeyErrors.id);
    }
    compileHasUnknownKeys(comp: JitCompiler): jitCode {
        return this.compile(comp, JitFunctions.hasUnknownKeys.id);
    }
    compileStripUnknownKeys(comp: JitCompiler): jitCode {
        return this.compile(comp, JitFunctions.stripUnknownKeys.id);
    }
    compileUnknownKeysToUndefined(comp: JitCompiler): jitCode {
        return this.compile(comp, JitFunctions.unknownKeysToUndefined.id);
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
    compile(comp: JitCompiler, fnID: JitFnID): jitCode {
        let code: jitCode;
        comp.pushStack(this);
        if (comp.shouldCallDependency()) {
            const compiledOp = this.createJitCompiledFunction(fnID, comp, comp.opts);
            code = this.callDependency(comp, compiledOp);
            comp.updateDependencies(compiledOp);
        } else {
            // prettier-ignore
            switch (fnID) {
                case JitFunctions.isType.id:
                    code = this.compileFormatter(comp, fnID, ' && ', this._compileIsType(comp));
                    break;
                case JitFunctions.typeErrors.id:
                    code = this.compileFormatter(comp, fnID, ';', this._compileTypeErrors(comp as JitErrorsCompiler));
                    break;
                case JitFunctions.toJsonVal.id:
                    code = this._compileToJsonVal(comp);
                    break;
                case JitFunctions.fromJsonVal.id:
                    code =this._compileFromJsonVal(comp);
                    break;
                case JitFunctions.jsonStringify.id:
                    code = _compileJsonStringify(this, comp);
                    break;
                case JitFunctions.toCode.id:
                        code = _compileToCode(this, comp);
                        break;
                case JitFunctions.unknownKeyErrors.id: code = this._compileUnknownKeyErrors(comp as JitErrorsCompiler); break;
                case JitFunctions.hasUnknownKeys.id: code = this._compileHasUnknownKeys(comp); break;
                case JitFunctions.stripUnknownKeys.id: code = this._compileStripUnknownKeys(comp); break;
                case JitFunctions.unknownKeysToUndefined.id: code = this._compileUnknownKeysToUndefined(comp); break;
                case JitFunctions.format.id:  break;
                default:
                    throw new Error(`Unknown compile operation: ${fnID}`);
            }
            if (code) code = this.handleReturnValues(comp, fnID, code);
        }
        comp.popStack(code);
        return code;
    }

    private compileFormatter(comp: JitCompiler, fnID: JitFnID, separator: string, code?: string): jitCode {
        const typeFormatters = getTypeFormats(this);
        if (!typeFormatters.length) return code;
        const formattersCode = typeFormatters
            .map((f) => {
                // Check if the formatter code can be embedded AND is compatible with the function ID
                const canEmbed = f.canEmbedFormatterCode(fnID, this);
                const codeType = f.getCodeType(fnID, this);
                const codeHasReturn = codeType === 'RB';

                // For isType and similar functions that are expressions, we need to ensure
                // the formatter code is also an expression or has a return statement
                const isCompatible = this.getCodeType(fnID) === codeType;

                if (canEmbed && isCompatible && !codeHasReturn) {
                    return f._compile(fnID, comp, this);
                }

                // Otherwise, create a separate function
                const compiled = f.createJitCompiledFormatter(fnID, this, comp, undefined, undefined, undefined, comp.opts);
                if (compiled.isNoop) return;
                comp.updateDependencies(compiled);
                return this.callDependency(comp, compiled);
            })
            .filter(Boolean) as string[];
        if (!formattersCode.length) return code;
        if (code) return code + separator + formattersCode.join(separator);
        return formattersCode.join(separator);
    }

    callDependency(currentCop: JitCompiler, comp: JitCompiledFn): jitCode {
        const stackItem = currentCop.getCurrentStackItem();
        const isErrorCall = comp.fnID === JitFunctions.typeErrors.id || comp.fnID === JitFunctions.unknownKeyErrors.id;
        const args = isErrorCall ? jitErrorArgs : jitArgs;
        const argsCode = Object.entries(args)
            .map(([key, name]) => (key === 'vλl' ? stackItem.vλl : name))
            .join(',');
        const isSelf = currentCop.jitFnHash === comp.jitFnHash;
        const varName = comp.jitFnHash;
        // call local variable instead directly calling jitUtils to avoid lookups.
        // ie function context (local variable created when compiling the function): const abc = jitUtils.getJIT('abc);
        // ie calling context variable: abc.fn();
        // if operation is the same as the current operation we can call the function directly
        const callCode = isSelf ? `${varName}(${argsCode})` : `${varName}.fn(${argsCode})`;
        if (!isSelf) currentCop.contextCodeItems.set(varName, `const ${varName} = utl.getJIT(${toLiteral(varName)})`);
        if (isErrorCall) {
            const pathArgs = currentCop.getAccessPathArgs();
            const pathLength = currentCop.getAccessPathLength();
            if (!pathLength) return callCode;
            // increase and decrease the static path before and after calling the dependency function
            // TODO, maybe we can improve performance by using something else than push and splice
            return `${jitErrorArgs.pλth}.push(${pathArgs}); ${callCode}; ${jitErrorArgs.pλth}.splice(-${pathLength});`;
        }
        return callCode;
    }

    handleReturnValues(comp: JitCompiler, currentOpId: JitFnID, code: string, isCallDependency?: true): jitCode {
        const codeType = isCallDependency ? 'E' : this.getCodeType(currentOpId);
        const isRoot = comp.length === 1;
        if (isRoot) {
            // root code must ensure values are returned
            switch (codeType) {
                case 'E':
                    return `return ${code}`;
                case 'S': {
                    const lastChar = code.length - 1;
                    const hasFullStop = code.lastIndexOf(';') === lastChar;
                    const stopChar = hasFullStop ? '' : ';';
                    return `${code}${stopChar} return ${comp.returnName}`;
                }
                case 'RB': {
                    return code;
                }
            }
        }

        const expectedType = getCodeType(currentOpId);
        switch (true) {
            case expectedType === 'E' && codeType === 'E':
                return code;
            case expectedType === 'E' && codeType === 'S':
                return this.callSelfInvokingFunction(code, true);
            case expectedType === 'E' && codeType === 'RB':
                return this.callSelfInvokingFunction(code);
            case expectedType === 'S' && codeType === 'E':
                // some nodes might return expressions that will be used by the parent statement
                return code;
            case expectedType === 'S' && codeType === 'S': {
                const lastChar = code.length - 1;
                const hasFullStop = code.lastIndexOf(';') === lastChar;
                const stopChar = hasFullStop ? '' : '; ';
                return `${stopChar}${code}`;
            }
            case expectedType === 'S' && codeType === 'RB':
                return this.callSelfInvokingFunction(code);
            case expectedType === 'RB' && codeType === 'E':
                throw new Error('Expected an block code but got an expression, this should not happen as would be useless code.');
            case expectedType === 'RB' && codeType === 'S': {
                const lastChar = code.length - 1;
                const hasFullStop = code.lastIndexOf(';') === lastChar;
                const stopChar = hasFullStop ? '' : '; ';
                return `${stopChar}${code}`;
            }
            case expectedType === 'RB' && codeType === 'RB': {
                // if code is a block and does not have return, we need to make sure
                const lastChar = code.length - 1;
                const hasFullStop = code.lastIndexOf(';') === lastChar || code.lastIndexOf('}') === lastChar;
                const stopChar = hasFullStop ? '' : ';';
                return `${code}${stopChar} return ${comp.returnName}`;
            }
            default:
                throw new Error(`Unexpected code type (expected: ${expectedType}, got: ${codeType})`);
        }
    }
    /**
     * If code should be an expression, but code has return a statement, we need to wrap it in a self invoking function to avoid syntax errors
     * IMPORTANT TODO, WE CAN IMPROVE PERF QUITE A BIT BY CREATING A NEW FUNCTION IN CONTEXT INSTEAD SELF INVOkING
     * TODO: we could create a new function and cache instead a self invoking function a performance is same but code is not repeated
     * IE: comp.selfInvoke(code), this will create a new function in context and call that function instead of self invoking
     * this is specially for atomic types as we can be sure there are no references to children types inside the code block
     */
    callSelfInvokingFunction(code: string, addReturn = false): jitCode {
        const returnCode = addReturn ? `return ` : '';
        return `(function(){${returnCode}${code}})()`;
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
    _compileToJsonVal(comp: JitCompiler): jitCode {
        return undefined;
    }
    _compileFromJsonVal(comp: JitCompiler): jitCode {
        return undefined;
    }
    _compileHasUnknownKeys(comp: JitCompiler): jitCode {
        return undefined;
    }
    _compileUnknownKeyErrors(comp: JitCompiler): jitCode {
        return undefined;
    }
    _compileStripUnknownKeys(comp: JitCompiler): jitCode {
        return undefined;
    }
    _compileUnknownKeysToUndefined(comp: JitCompiler): jitCode {
        return undefined;
    }
    getCodeType(fnID: JitFnID): CodeType {
        switch (fnID) {
            case JitFunctions.isType.id:
            case JitFunctions.toJsonVal.id:
            case JitFunctions.fromJsonVal.id:
            case JitFunctions.jsonStringify.id:
            case JitFunctions.toCode.id:
                return 'E';
            default:
                return super.getCodeType(fnID);
        }
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
    getChildRunTypes = (): BaseRunType[] => {
        const childTypes = ((this.src as SrcCollection).types as SrcType[]) || []; // deepkit stores child types in the types property
        return childTypes.map((t) => t._rt as BaseRunType);
    };
    getJitChildren(comp: JitCompilerOpts): BaseRunType[] {
        let skipIndex = false; // if there are multiple index signatures, only the first one will be used as they must be same type just different keys
        return this.getChildRunTypes().filter((c) => {
            if (c.skipJit(comp)) return false;
            const isIndex = c.src.kind === ReflectionKind.indexSignature;
            if (isIndex && skipIndex) return false;
            if (isIndex) skipIndex = true;
            return true;
        });
    }
    _compileHasUnknownKeys(comp: JitCompiler): jitCode {
        return this.getJitChildren(comp)
            .map((c) => c.compileHasUnknownKeys(comp))
            .filter((code) => !!code)
            .join(' || ');
    }
    _compileUnknownKeyErrors(comp: JitErrorsCompiler): jitCode {
        return this.getJitChildren(comp)
            .map((c) => c.compileUnknownKeyErrors(comp))
            .filter((code) => !!code)
            .join(';');
    }
    _compileStripUnknownKeys(comp: JitCompiler): jitCode {
        return this.getJitChildren(comp)
            .map((c) => c.compileStripUnknownKeys(comp))
            .filter((code) => !!code)
            .join(';');
    }
    _compileUnknownKeysToUndefined(comp: JitCompiler): jitCode {
        return this.getJitChildren(comp)
            .map((c) => c.compileUnknownKeysToUndefined(comp))
            .filter((code) => !!code)
            .join(';');
    }
    _getTypeID(stack: BaseRunType[] = []): StrNumber {
        return this.getChildrenTypeID(stack);
    }
    private getChildrenTypeID = memorize((stack: BaseRunType<any>[] = []): StrNumber => {
        if (stack.length > MAX_STACK_DEPTH) throw new Error(maxStackErrorMessage);
        const circularJitConf = this.getCircularTypeID(stack);
        if (circularJitConf) return circularJitConf;
        stack.push(this);
        const childrenIds: (string | number)[] = [];
        const children = this.getChildRunTypes();
        for (const child of children) {
            childrenIds.push(child.getTypeID(stack));
        }
        const isArray = this.src.kind === ReflectionKind.tuple || this.src.kind === ReflectionKind.array;
        const groupID = isArray ? `[${childrenIds.join(',')}]` : `{${childrenIds.join(',')}}`;
        const kind = this.src.subKind || this.src.kind;
        stack.pop();
        return `${kind}${groupID}`;
    });
}

/**
 * RunType that contains a single member or child RunType. usually part of a collection RunType.
 * i.e object properties, {prop: memberType} where memberType is the child RunType
 */
export abstract class MemberRunType<T extends Type> extends BaseRunType<T> implements RunTypeChildAccessor {
    abstract isOptional(): boolean;
    abstract getChildVarName(): string | number;
    abstract getChildLiteral(comp?: JitCompilerOpts): string | number;
    abstract useArrayAccessor(): boolean;
    /** used to compile json stringify */
    skipCommas?: boolean;
    /** used to compile json stringify */
    tempChildVλl?: string;
    getFamily(): 'M' {
        return 'M';
    }
    getMemberType = (): BaseRunType => {
        const memberType = (this.src as any).type as SrcType; // deepkit stores member types in the type property
        return memberType._rt as BaseRunType;
    };
    getChildIndex(comp?: JitCompilerOpts) {
        const start = comp?.opts?.paramsSlice?.start;
        if (start) return getPropIndex(this.src) - start;
        return getPropIndex(this.src);
    }
    getJitChild(comp: JitCompilerOpts): BaseRunType | undefined {
        const member: BaseRunType = this.getMemberType();
        if (member.skipJit(comp)) return undefined;
        return member;
    }
    _compileHasUnknownKeys(comp: JitCompiler): jitCode {
        const code = this.getJitChild(comp)?.compileHasUnknownKeys(comp);
        if (!code) return undefined;
        const childName = comp.getChildVλl();
        return this.isOptional() ? `(${childName} !== undefined && ${code})` : code;
    }
    _compileUnknownKeyErrors(comp: JitErrorsCompiler): jitCode {
        const code = this.getJitChild(comp)?.compileUnknownKeyErrors(comp);
        if (!code) return undefined;
        return this.isOptional() ? `if (${comp.getChildVλl()} !== undefined) {${code}}` : code;
    }
    _compileStripUnknownKeys(comp: JitCompiler): jitCode {
        const code = this.getJitChild(comp)?.compileStripUnknownKeys(comp);
        if (!code) return undefined;
        return this.isOptional() ? `if (${comp.getChildVλl()} !== undefined) {${code}}` : code;
    }
    _compileUnknownKeysToUndefined(comp: JitCompiler): jitCode {
        const code = this.getJitChild(comp)?.compileUnknownKeysToUndefined(comp);
        if (!code) return undefined;
        return this.isOptional() ? `if (${comp.getChildVλl()} !== undefined) {${code}}` : code;
    }
    _getTypeID(stack: BaseRunType[] = []): StrNumber {
        return this.getMemberTypeID(stack);
    }
    private getMemberTypeID = memorize((stack: BaseRunType<any>[] = []): StrNumber => {
        if (stack.length > MAX_STACK_DEPTH) throw new Error(maxStackErrorMessage);
        const circularJitConf = this.getCircularTypeID(stack);
        if (circularJitConf) return circularJitConf;
        // TODO: some properties could be skipped from the JIT ID. so we could implement a mechanism to mark them to be skipped
        // ie: sample and sampleChars from StringFormat are too large but they do not affect jit code generation as those properties are only used during mocking
        stack.push(this);
        const member = this.getMemberType();
        const memberTypeID = member.getTypeID(stack);
        const optional = this.isOptional() ? '?' : '';
        const kind =
            (this.src as TypeProperty).name?.toString() ||
            (this.src as TypeIndexSignature).index?.kind ||
            this.src.subKind ||
            this.src.kind;
        const typeID = `${kind}${optional}:${memberTypeID}`;
        stack.pop();
        return typeID;
    });
}

// ########## Load Composable Functions ##########
