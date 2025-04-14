/* eslint-disable @typescript-eslint/no-unused-vars */
/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {
    MockOperation,
    RunType,
    JitConfig,
    Mutable,
    RunTypeChildAccessor,
    JitFnID,
    JitCompiled,
    MockOptions,
    SrcType,
    SrcCollection,
    CustomVλl,
    JitFn,
    FormatAnnotation,
    jitCode,
} from '../types';
import {
    jitArgs,
    jitErrorArgs,
    JitFunctions,
    maxStackDepth,
    maxStackErrorMessage,
    CodeType,
    getCodeType,
    JitFnSetting,
} from '../constants';
import {ReflectionKind, type TypeIndexSignature, type TypeProperty, type Type} from '@deepkit/type';
import {getPropIndex, memorize, toLiteral} from './utils';
import {JitErrorsCompiler, JitCompiler, getJITFnHash, createJitCompiler} from './jitCompiler';
import {type AnyKindName, getReflectionName} from '../constants.kind';
import {jitUtils} from './jitUtils';
import {createUniqueHash} from './quickHash';
import {
    initFormatAnnotations,
    getFormatAnnotations,
    getTypeFormats,
    getRunTypeFormatter,
    defaultIgnoreFormatProps,
} from './formats';
import {typeParamsToString} from './utils';
import type {mock} from '../mock/mockType';

const functionRegistry: Map<JitFnSetting, (...args: any[]) => any> = new Map();

export abstract class BaseRunType<T extends Type = Type> implements RunType {
    // Registry for dynamically loaded functions

    isCircular?: boolean;
    readonly src: SrcType<T> = null as any; // real value will be set after construction by the createRunType function
    abstract getFamily(): 'A' | 'C' | 'M' | 'F'; // Atomic, Collection, Member, Function
    abstract getJitConfig(stack?: RunType[]): JitConfig;
    abstract _mock(mockContext: MockOperation): any;
    isJitInlined = () => !(this.isCircular || (this.src.typeName && this.getFamily() === 'C'));
    getKindName = memorize((): AnyKindName => getReflectionName(this));
    getTypeName = (): string => this.src.typeName || this.getKindName();
    getFormatAnnotations = (): FormatAnnotation[] => getFormatAnnotations(this);
    getFormatterJitId = memorize((): string | undefined => {
        const formatter = getRunTypeFormatter(this);
        if (!formatter) return;
        return `<${typeParamsToString(formatter.getParams(this), defaultIgnoreFormatProps)}>`;
    });
    getJitId = (): string | number => {
        const jitId = this.getJitConfig().jitId;
        const getFormatterJitId = this.getFormatterJitId();
        if (!getFormatterJitId) return jitId;
        return `${jitId}${getFormatterJitId}`;
    };
    getJitHash = memorize((): string => createUniqueHash(this.getJitId().toString()));
    getParent = (): BaseRunType | undefined => (this.src.parent as SrcType)?._rt as BaseRunType;
    getNestLevel = memorize((): number => {
        if (this.isCircular) return 0; // circular references start a new context
        const parent = this.getParent() as BaseRunType<T>;
        if (!parent) return 0;
        return parent.getNestLevel() + 1;
    });
    getCircularJitConfig(stack: RunType[] = []): JitConfig | undefined {
        const inStackIndex = stack.findIndex((rt) => rt === this); // cant use isSameJitType because it uses getJitId and would loop forever
        const isInStack = inStackIndex >= 0; // recursive reference
        if (isInStack) {
            this.isCircular = true;
            const name = this.src.typeName || ''; // todo: not sure if all the circular references will have a name
            return {
                skipJit: false, // circular types requires custom logic so can't be skipped
                jitId: '$' + this.src.kind + `_${inStackIndex}` + name, // ensures different circular types have different jitId
            };
        }
    }
    /** Code Type flag
     * Any child with different settings should override these methods
     * these flags are used to determine if the compiled code should be wrapped in a self invoking function or not
     * or if the compiled code should contain a return statement or not */
    getCodeType(fnId: JitFnID): CodeType {
        return getCodeType(fnId);
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
    getCustomVλl(comp: JitCompiler): CustomVλl | undefined {
        return undefined;
    }
    /**
     * Some elements might need a custom static path to be able to reference the source of an error.
     * ie: when validating a Map we need to differentiate if the value that failed is the  key or the value of a map's entry.
     */
    getStaticPathLiteral(comp: JitCompiler): string | number | undefined {
        return undefined;
    }

    // ########## Mock ##########

    async mock(k?: Partial<MockOptions>): Promise<any> {
        // although the mock function is not jit, it is also stored in the registry
        const mockFn = (await this.loadRegisteredFunction(JitFunctions.mock)) as typeof mock;
        return mockFn(this, k);
    }

    /** synchronous version of mock, throws an error if the mock function has not been loaded */
    mockType(k?: Partial<MockOptions>): any {
        const mockFn = this.getRegisteredFunction(JitFunctions.mock) as typeof mock;
        return mockFn(this, k);
    }

    // ########## Load Composable Functions ##########
    loadRegisteredFunction = async (jitFn: JitFnSetting): Promise<(...args: any[]) => any> => {
        const fn = functionRegistry.get(jitFn);
        if (fn) return fn;
        if (!jitFn.import) throw new Error(`Jit function ${jitFn.name} has no import function`);
        functionRegistry.forEach((_v, k) => {
            if (k.id === jitFn.id) throw new Error('A function with the same id already exists in the functions registry');
        });
        const newFn = await jitFn.import();
        functionRegistry.set(JitFunctions.mock, newFn);
        return newFn;
    };

    /** synchronous version of loadRegisteredFunction, throws an error if the function has not been loaded */
    getRegisteredFunction = (jitFn: JitFnSetting): ((...args: any[]) => any) => {
        const fn = functionRegistry.get(jitFn);
        if (fn) return fn;
        throw new Error(`Function ${jitFn.name} has not been loaded.`);
    };

    // ########## Create Jit Functions ##########

    createJitFunction = (jitFn: JitFn): ((...args: any[]) => any) => {
        return this.createJitCompiledFunction(jitFn.id).fn;
    };

    createJitCompiledFunction(fnId: JitFnID, parentCop?: JitCompiler): JitCompiled {
        const jitCompiled = jitUtils.getJIT(getJITFnHash(fnId, this));
        if (jitCompiled) {
            if (process.env.DEBUG_JIT === 'VERBOSE')
                console.log(`\x1b[32m Using cached function: ${jitCompiled.jitFnHash} \x1b[0m`);
            return jitCompiled;
        }
        const newJitCompiler: JitCompiler = createJitCompiler(this, fnId, parentCop) as JitCompiler;
        try {
            this.compile(newJitCompiler, fnId);
        } catch (e) {
            // if something goes wrong during compilation we want to remove the compiler from
            // the cache as this is automatically added to jitUtils cache during compilation
            newJitCompiler.removeFromJitCache();
            throw e;
        }
        return newJitCompiler as JitCompiled;
    }

    // ########## Child _compile Methods ##########

    /* BaseRunType compileX method is in charge of handling circular refs, return values, create subprograms, etc.
     * While the child _compileX must only contain the logic to generate the code. */
    abstract _compileIsType(comp: JitCompiler): jitCode;
    abstract _compileTypeErrors(comp: JitErrorsCompiler): jitCode;
    abstract _compileToJsonVal(comp: JitCompiler): jitCode;
    abstract _compileFromJsonVal(comp: JitCompiler): jitCode;
    abstract _compileJsonStringify(comp: JitCompiler): jitCode;
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
    compileJsonStringify(comp: JitCompiler): jitCode {
        return this.compile(comp, JitFunctions.jsonStringify.id);
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
     * @param fnId operation id
     * @returns
     */
    private compile(comp: JitCompiler, fnId: JitFnID): jitCode {
        let code: jitCode;
        comp.pushStack(this);
        if (comp.shouldCallDependency()) {
            const compiledOp = this.createJitCompiledFunction(fnId, comp);
            code = this.callDependency(comp, compiledOp);
            comp.updateDependencies(compiledOp);
        } else {
            // prettier-ignore
            switch (fnId) {
                case JitFunctions.isType.id:
                    code = this.compileFormatter(comp, fnId, ' && ', this._compileIsType(comp));
                    break;
                case JitFunctions.typeErrors.id:
                    code = this.compileFormatter(comp, fnId, ';', this._compileTypeErrors(comp as JitErrorsCompiler));
                    break;
                case JitFunctions.toJsonVal.id:
                    code = this._compileToJsonVal(comp);
                    break;
                case JitFunctions.fromJsonVal.id:
                    code =this._compileFromJsonVal(comp);
                    break;
                case JitFunctions.jsonStringify.id:
                    code = this._compileJsonStringify(comp);
                    break;
                case JitFunctions.unknownKeyErrors.id: code = this._compileUnknownKeyErrors(comp as JitErrorsCompiler); break;
                case JitFunctions.hasUnknownKeys.id: code = this._compileHasUnknownKeys(comp); break;
                case JitFunctions.stripUnknownKeys.id: code = this._compileStripUnknownKeys(comp); break;
                case JitFunctions.unknownKeysToUndefined.id: code = this._compileUnknownKeysToUndefined(comp); break;
                case JitFunctions.format.id:  break;
                default: throw new Error(`Unknown compile operation: ${fnId}`);
            }
            if (code) code = this.handleReturnValues(comp, fnId, code);
        }
        comp.popStack(code);
        return code;
    }

    private compileFormatter(comp: JitCompiler, fnId: JitFnID, separator: string, code?: string): jitCode {
        const typeFormatters = getTypeFormats(this);
        if (!typeFormatters.length) return code;
        const formattersCode = typeFormatters
            .map((f) => {
                // Check if the formatter code can be embedded AND is compatible with the function ID
                const canEmbed = f.canEmbedFormatterCode(fnId, this);
                const codeType = f.getCodeType(fnId, this);
                const codeHasReturn = codeType === 'RB';

                // For isType and similar functions that are expressions, we need to ensure
                // the formatter code is also an expression or has a return statement
                const isCompatible = this.getCodeType(fnId) === codeType;

                if (canEmbed && isCompatible && !codeHasReturn) {
                    return f._compile(fnId, comp, this);
                }

                // Otherwise, create a separate function
                const compiled = f.createJitCompiledFormatter(fnId, this, comp);
                if (compiled.isNoop) return;
                comp.updateDependencies(compiled);
                return this.callDependency(comp, compiled);
            })
            .filter(Boolean) as string[];
        if (!formattersCode.length) return code;
        if (code) return code + separator + formattersCode.join(separator);
        return formattersCode.join(separator);
    }

    callDependency(currentCop: JitCompiler, comp: JitCompiled): jitCode {
        const stackItem = currentCop.getCurrentStackItem();
        const isErrorCall = comp.fnId === JitFunctions.typeErrors.id || comp.fnId === JitFunctions.unknownKeyErrors.id;
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
                    // if code is a block and does not have return, we need to make sure
                    const lastChar = code.length - 1;
                    const hasFullStop = code.lastIndexOf(';') === lastChar || code.lastIndexOf('}') === lastChar;
                    const stopChar = hasFullStop ? '' : ';';
                    return `${code}${stopChar} return ${comp.returnName}`;
                }
            }
        }

        const expType = getCodeType(currentOpId);
        switch (true) {
            case expType === 'E' && codeType === 'E':
                return code;
            case expType === 'E' && codeType === 'S':
                return this.callSelfInvokingFunction(code, true);
            case expType === 'E' && codeType === 'RB':
                return this.callSelfInvokingFunction(code);
            case expType === 'S' && codeType === 'E':
                // some nodes might return expressions that will be used by the parent statement
                return code;
            case expType === 'S' && codeType === 'S': {
                const lastChar = code.length - 1;
                const hasFullStop = code.lastIndexOf(';') === lastChar;
                const stopChar = hasFullStop ? '' : '; ';
                return `${stopChar}${code}`;
            }
            case expType === 'S' && codeType === 'RB':
                return this.callSelfInvokingFunction(code);
            case expType === 'RB' && codeType === 'E':
                throw new Error('Expected an block code but got an expression, this should not happen as would be useless code.');
            case expType === 'RB' && codeType === 'S': {
                const lastChar = code.length - 1;
                const hasFullStop = code.lastIndexOf(';') === lastChar;
                const stopChar = hasFullStop ? '' : '; ';
                return `${stopChar}${code}`;
            }
            case expType === 'RB' && codeType === 'RB': {
                // if code is a block and does not have return, we need to make sure
                const lastChar = code.length - 1;
                const hasFullStop = code.lastIndexOf(';') === lastChar || code.lastIndexOf('}') === lastChar;
                const stopChar = hasFullStop ? '' : ';';
                return `${code}${stopChar} return ${comp.returnName}`;
            }
            default:
                throw new Error(`Unexpected code type (expected: ${expType}, got: ${codeType})`);
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
    _compileJsonStringify(comp: JitCompiler): jitCode {
        return comp.vλl;
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
    getCodeType(fnId: JitFnID): CodeType {
        switch (fnId) {
            case JitFunctions.isType.id:
            case JitFunctions.toJsonVal.id:
            case JitFunctions.fromJsonVal.id:
            case JitFunctions.jsonStringify.id:
                return 'E';
            default:
                return super.getCodeType(fnId);
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
    getJitChildren(): BaseRunType[] {
        let skipIndex = false; // if there are multiple index signatures, only the first one will be used as they must be same type just different keys
        return this.getChildRunTypes().filter((c) => {
            if (c.getJitConfig().skipJit) return false;
            const isIndex = c.src.kind === ReflectionKind.indexSignature;
            if (isIndex && skipIndex) return false;
            if (isIndex) skipIndex = true;
            return true;
        });
    }
    getJitConfig(stack: BaseRunType[] = []): JitConfig {
        return this._getJitConfig(stack);
    }
    _compileHasUnknownKeys(comp: JitCompiler): jitCode {
        return this.getJitChildren()
            .map((c) => c.compileHasUnknownKeys(comp))
            .filter((code) => !!code)
            .join(' || ');
    }
    _compileUnknownKeyErrors(comp: JitErrorsCompiler): jitCode {
        return this.getJitChildren()
            .map((c) => c.compileUnknownKeyErrors(comp))
            .filter((code) => !!code)
            .join(';');
    }
    _compileStripUnknownKeys(comp: JitCompiler): jitCode {
        return this.getJitChildren()
            .map((c) => c.compileStripUnknownKeys(comp))
            .filter((code) => !!code)
            .join(';');
    }
    _compileUnknownKeysToUndefined(comp: JitCompiler): jitCode {
        return this.getJitChildren()
            .map((c) => c.compileUnknownKeysToUndefined(comp))
            .filter((code) => !!code)
            .join(';');
    }
    private _getJitConfig = memorize((stack: BaseRunType<any>[] = []): JitConfig => {
        if (stack.length > maxStackDepth) throw new Error(maxStackErrorMessage);
        const circularJitConf = this.getCircularJitConfig(stack);
        if (circularJitConf) return circularJitConf;
        stack.push(this);
        const childrenJitIds: (string | number)[] = [];
        const children = this.getChildRunTypes();
        const jitCts: Mutable<JitConfig> = {
            skipJit: true,
            jitId: ``,
        };
        for (const child of children) {
            const childConf = child.getJitConfig(stack);
            jitCts.skipJit &&= childConf.skipJit;
            childrenJitIds.push(child.getJitId());
        }
        const isArray = this.src.kind === ReflectionKind.tuple || this.src.kind === ReflectionKind.array;
        const groupID = isArray ? `[${childrenJitIds.join(',')}]` : `{${childrenJitIds.join(',')}}`;
        const kind = this.src.subKind || this.src.kind;
        jitCts.jitId = `${kind}${groupID}`;
        stack.pop();
        return jitCts;
    });
}

/**
 * RunType that contains a single member or child RunType. usually part of a collection RunType.
 * i.e object properties, {prop: memberType} where memberType is the child RunType
 */
export abstract class MemberRunType<T extends Type> extends BaseRunType<T> implements RunTypeChildAccessor {
    abstract isOptional(): boolean;
    abstract getChildVarName(): string | number;
    abstract getChildLiteral(): string | number;
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
    getChildIndex(): number {
        return getPropIndex(this.src);
    }
    getJitChild(): BaseRunType | undefined {
        const member: BaseRunType = this.getMemberType();
        if (member.getJitConfig().skipJit) return undefined;
        return member;
    }
    getJitConfig(stack: BaseRunType[] = []): JitConfig {
        return this._getJitConfig(stack);
    }
    _compileHasUnknownKeys(comp: JitCompiler): jitCode {
        const code = this.getJitChild()?.compileHasUnknownKeys(comp);
        if (!code) return undefined;
        const childName = comp.getChildVλl();
        return this.isOptional() ? `(${childName} !== undefined && ${code})` : code;
    }
    _compileUnknownKeyErrors(comp: JitErrorsCompiler): jitCode {
        const code = this.getJitChild()?.compileUnknownKeyErrors(comp);
        if (!code) return undefined;
        return this.isOptional() ? `if (${comp.getChildVλl()} !== undefined) {${code}}` : code;
    }
    _compileStripUnknownKeys(comp: JitCompiler): jitCode {
        const code = this.getJitChild()?.compileStripUnknownKeys(comp);
        if (!code) return undefined;
        return this.isOptional() ? `if (${comp.getChildVλl()} !== undefined) {${code}}` : code;
    }
    _compileUnknownKeysToUndefined(comp: JitCompiler): jitCode {
        const code = this.getJitChild()?.compileUnknownKeysToUndefined(comp);
        if (!code) return undefined;
        return this.isOptional() ? `if (${comp.getChildVλl()} !== undefined) {${code}}` : code;
    }
    private _getJitConfig = memorize((stack: BaseRunType<any>[] = []): JitConfig => {
        if (stack.length > maxStackDepth) throw new Error(maxStackErrorMessage);
        const circularJitConf = this.getCircularJitConfig(stack);
        if (circularJitConf) return circularJitConf;
        // TODO: some properties could be skipped from the JIT ID. so we could implement a mechanism to mark them to be skipped
        // ie: sample and sampleChars from StringFormat are too large but they do not affect jit code generation as those properties are only used during mocking
        stack.push(this);
        const member = this.getMemberType();
        const memberConfig = member.getJitConfig(stack);
        const optional = this.isOptional() ? '?' : '';
        const kind =
            (this.src as TypeProperty).name?.toString() ||
            (this.src as TypeIndexSignature).index?.kind ||
            this.src.subKind ||
            this.src.kind;
        const jitCts: Mutable<JitConfig> = {
            ...memberConfig,
            jitId: `${kind}${optional}:${member.getJitId()}`,
        };
        stack.pop();
        return jitCts;
    });
}
