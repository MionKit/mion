/* eslint-disable @typescript-eslint/no-unused-vars */
/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {MAX_STACK_DEPTH} from '@mionkit/core';
import type {
    RunType,
    Mutable,
    RunTypeChildAccessor,
    JitFnID,
    SrcType,
    SrcCollection,
    CustomVλl,
    JitFn,
    JitCode,
    RunTypeOptions,
    StrNumber,
    DeepPartial,
    RunTypeFamily,
} from '../types';
import type {mockType} from '../mocking/mockType';
import {maxStackErrorMessage} from '../constants';
import {type CodeType, JitFunctions, CodeTypes} from '../constants.functions';
import {ReflectionKind} from '@deepkit/type';
import type {TypeIndexSignature, TypeProperty, Type, TypeLiteral} from '@deepkit/type';
import {getPropIndex, memorize, toLiteral} from './utils';
import {createJitCompiler, MockJitCompiler} from './jitFnCompiler';
import {getJITFnHash} from './createJitFunction';
import type {JitFnCompiler, JitErrorsFnCompiler} from './jitFnCompiler';
import {type AnyKindName, getReflectionName} from '../constants.kind';
import {jitUtils} from '@mionkit/core';
import {createUniqueHash} from './quickHash';
import {initFormatAnnotations, getRunTypeFormat, defaultIgnoreFormatProps} from './formats';
import {typeParamsToString} from './utils';
import {getJitFunctionCompiler, registerJitFunctionCompiler} from './jitFnsRegistry';
import {JitCompiledFn} from '@mionkit/core';
import {defaultMockOptions} from '../mocking/constants.mock';
import {getENV} from '@mionkit/core';
import {hasTypeArguments} from './guards';
import {runType} from '../createRunType';

const RB = CodeTypes.returnBlock;
const S = CodeTypes.statement;
const E = CodeTypes.expression;

export abstract class BaseRunType<T extends Type = Type> implements RunType {
    isCircular?: boolean;
    readonly src: SrcType<T> = null as any; // real value will be set after construction by the createRunType function
    abstract getFamily(): RunTypeFamily; // Atomic, Collection, Member, Function
    abstract _getTypeID(stack: RunType[], isGenericId: boolean): StrNumber;
    private _cachedTypeID?: StrNumber;
    private _cachedGenericTypeID?: StrNumber;
    private _cachedFormatTypeID?: string | undefined;
    /**
     * This single functions controls whether or not the code for a type should be inlined into the parent function
     * or should create a separate jit function for it, add as a dependency and call it.
     * @returns
     */
    isJitInlined = (): boolean => {
        // if is circular, always create a separate jit function as need to self invoke
        if (this.isCircular) return false;
        if (getENV('DEBUG_JIT') === 'INLINED') return true;
        // all array  are self invoked for isType and are usually repeated type like string[] or number[] so worth deduplicating
        if (this.src.kind === ReflectionKind.array) return false;
        // collection with name might be used in different places so worth deduplicating
        if (this.src.typeName && this.getFamily() === 'C') return false;
        return true;
    };
    getKindName = memorize((): AnyKindName => getReflectionName(this));
    getTypeName = (): string => this.src.typeName || this.getKindName();
    skipJit(comp: JitFnCompiler): boolean {
        return false;
    }
    getFormatTypeID(): string | undefined {
        if (this._cachedFormatTypeID !== undefined) return this._cachedFormatTypeID;
        const formatter = getRunTypeFormat(this);
        if (!formatter) {
            this._cachedFormatTypeID = undefined;
            return undefined;
        }
        const result = `<${typeParamsToString(formatter.getParams(this), defaultIgnoreFormatProps)}>`;
        this._cachedFormatTypeID = result;
        return result;
    }
    getTypeID(stack: BaseRunType[] = []): StrNumber {
        if (this._cachedTypeID !== undefined) return this._cachedTypeID;
        const formatID = this.getFormatTypeID();
        const typeID = this._getTypeID(stack, false);
        const result = formatID ? typeID + formatID : typeID;
        this._cachedTypeID = result;
        return result;
    }
    getGenericTypeID(stack: BaseRunType[] = []): StrNumber {
        if (this._cachedGenericTypeID !== undefined) return this._cachedGenericTypeID;
        const formatID = this.getFormatTypeID();
        const genericTypeID = this._getTypeID(stack, true);
        const result = formatID ? genericTypeID + formatID : genericTypeID;
        this._cachedGenericTypeID = result;
        return result;
    }
    getJitHash(opts: RunTypeOptions): string {
        const optsCopy = {...opts};
        // remove mock options as not relevant for jit functionality
        if (optsCopy.mock) delete optsCopy.mock;
        const optsKey = JSON.stringify(optsCopy);
        return createUniqueHash(this.getTypeID().toString() + optsKey);
    }
    getGenericJitHash(opts: RunTypeOptions): string {
        const optsCopy = {...opts};
        // remove mock options as not relevant for jit functionality
        if (optsCopy.mock) delete optsCopy.mock;
        const optsKey = JSON.stringify(optsCopy);
        return createUniqueHash(this.getGenericTypeID().toString() + optsKey);
    }
    /**
     * Returns the generic version of this RunType by replacing primitive literal type arguments with their base types.
     * For example, RpcError<'my-error'> returns RpcError<string>.
     * If the type has no primitive type arguments, returns itself.
     */
    getGenericType(): BaseRunType {
        if (!hasTypeArguments(this.src)) return this;

        // Check if any type arguments are primitive literals
        let hasPrimitiveLiterals = false;
        const genericTypeArgs: Type[] = this.src.typeArguments.map((typeArg) => {
            if (typeArg.kind === ReflectionKind.literal) {
                hasPrimitiveLiterals = true;
                // Replace literal with its base type
                const literal = (typeArg as TypeLiteral).literal;
                const baseKind =
                    typeof literal === 'string'
                        ? ReflectionKind.string
                        : typeof literal === 'number'
                          ? ReflectionKind.number
                          : typeof literal === 'boolean'
                            ? ReflectionKind.boolean
                            : typeof literal === 'bigint'
                              ? ReflectionKind.bigint
                              : ReflectionKind.any;
                return {kind: baseKind} as Type;
            }
            return typeArg;
        });

        // If no primitive literals, return self
        if (!hasPrimitiveLiterals) return this;

        // Create a new Type object with replaced typeArguments
        const genericSrc: Mutable<Type> = {
            ...this.src,
            typeArguments: genericTypeArgs,
        };

        // Create and return the generic RunType
        return runType(genericSrc) as BaseRunType;
    }
    getParent = (): BaseRunType | undefined => (this.src.parent as SrcType)?._rt as BaseRunType;
    checkIsCircularAndGetRefId(stack: RunType[] = []): StrNumber | undefined {
        const inStackIndex = stack.findIndex((rt) => {
            if (rt === this) return true;
            // some nodes seems to be different objects in memory but are the same id, so we check by id as well
            return rt.src.id && this.src.id && rt.src.id === this.src.id;
        }); // cant use isSameJitType because it uses getTypeID and would loop forever
        const inStackSrcId = stack.findIndex((rt) => rt.src.id && this.src.id && rt.src.id === this.src.id);
        const isInStack = inStackIndex >= 0; // recursive reference
        if (isInStack) {
            this.isCircular = true;
            const name = this.src.typeName || ''; // todo: not sure if all the circular references will have a name
            const refId = '$' + this.src.kind + `_${inStackIndex}` + name; // ensures different circular types have different typeID
            return refId;
        }
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
    getCustomVλl(comp: JitFnCompiler): CustomVλl | undefined {
        return undefined;
    }
    /**
     * Some elements might need a custom static path to be able to reference the source of an error.
     * ie: when validating a Map we need to differentiate if the value that failed is the  key or the value of a map's entry.
     */
    getStaticPathLiteral(comp: JitFnCompiler): string | number | undefined {
        return undefined;
    }

    // ########## Mock ##########

    async mock(opts?: DeepPartial<RunTypeOptions>): Promise<any> {
        // although the mock function is not jit, it is also stored in the registry
        // this is because we don't want to load mock related functionality if not needed
        await registerJitFunctionCompiler(JitFunctions.mock);
        return this.mockType(opts);
    }

    /** synchronous version of mock, throws an error if the mock function has not been loaded */
    mockType(opts: DeepPartial<RunTypeOptions> = {}): any {
        const mockFn = getJitFunctionCompiler(JitFunctions.mock) as typeof mockType;
        if (!mockFn)
            throw new Error(
                `Function ${JitFunctions.mock.name} has not been loaded. make sure you have called loadJitCompilerFunction(JitFunctions.mock) before calling mockType.`
            );
        const fnID = JitFunctions.mock.id;
        // options sent to the compiler will be set to empty as mock options are handled separately from the compiler
        const mockingOpts = {...opts, mock: {...defaultMockOptions, ...(opts.mock || {})}} as RunTypeOptions;
        const hash = getJITFnHash(fnID, this, mockingOpts);
        const comp = new MockJitCompiler(this, mockingOpts, undefined, hash, this.getTypeID());
        return mockFn(this, comp);
    }

    // ########## Create Jit Functions ##########

    createJitFunction = (jitFn: JitFn, opts: RunTypeOptions = {}): ((...args: any[]) => any) => {
        return this.createJitCompiledFunction(jitFn.id, undefined, opts).fn;
    };

    createJitCompiledFunction(fnID: JitFnID, parentCop?: JitFnCompiler, opts: RunTypeOptions = {}): JitCompiledFn {
        const fnHash = getJITFnHash(fnID, this, opts);
        const jitCompiled = jitUtils.getJIT(fnHash);
        if (jitCompiled) {
            if (getENV('DEBUG_JIT') === 'VERBOSE')
                console.log(`\x1b[32m Using cached function: ${jitCompiled.jitFnHash} \x1b[0m`);
            return jitCompiled;
        }
        const newJitCompiler: JitFnCompiler = createJitCompiler(
            this,
            fnID,
            parentCop,
            undefined,
            undefined,
            opts
        ) as JitFnCompiler;
        try {
            const codeType = this.getFamily() === 'A' ? E : S;
            newJitCompiler.compile(this, codeType, fnID);
            newJitCompiler.createJitFunction();
        } catch (e: any) {
            // if something goes wrong during compilation we want to remove the compiler from
            // the cache as this is automatically added to jitUtils cache during compilation
            newJitCompiler.removeFromJitCache();
            // TODO: we need to print the full path to the type that is causing the error
            // for this ideally we should add a parent Compiler and print the trace only from the root
            if (typeof e?.message === 'string' && !newJitCompiler.hasStackTrace(e.message))
                e.message += newJitCompiler.getStackTrace();
            throw e;
        }
        return newJitCompiler as JitCompiledFn;
    }

    // ########## emit Methods that generates src code ##########

    abstract emitIsType(comp: JitFnCompiler, expectedCType: CodeType): JitCode;
    abstract emitTypeErrors(comp: JitErrorsFnCompiler, expectedCType: CodeType): JitCode;
    abstract emitHasUnknownKeys(comp: JitFnCompiler, expectedCType: CodeType): JitCode;
    abstract emitUnknownKeyErrors(comp: JitErrorsFnCompiler, expectedCType: CodeType): JitCode;
    abstract emitStripUnknownKeys(comp: JitFnCompiler, expectedCType: CodeType): JitCode;
    abstract emitUnknownKeysToUndefined(comp: JitFnCompiler, expectedCType: CodeType): JitCode;
    // todo: maybe we should move these two into a single file like the rest of serializers
    abstract emitPrepareForJson(comp: JitFnCompiler, expectedCType: CodeType): JitCode;
    abstract emitRestoreFromJson(comp: JitFnCompiler, expectedCType: CodeType): JitCode;
}

/**
 * RunType that is atomic an does not contains any other child runTypes.
 * ie: string, number, boolean, any, null, undefined, void, never, bigint, etc.
 * */
export abstract class AtomicRunType<T extends Type> extends BaseRunType<T> {
    getFamily(): 'A' {
        return 'A';
    }
    emitPrepareForJson(comp: JitFnCompiler): JitCode {
        return {code: undefined, type: S};
    }
    emitRestoreFromJson(comp: JitFnCompiler): JitCode {
        return {code: undefined, type: S};
    }
    emitHasUnknownKeys(comp: JitFnCompiler): JitCode {
        return {code: undefined, type: E};
    }
    emitUnknownKeyErrors(comp: JitFnCompiler): JitCode {
        return {code: undefined, type: S};
    }
    emitStripUnknownKeys(comp: JitFnCompiler): JitCode {
        return {code: undefined, type: S};
    }
    emitUnknownKeysToUndefined(comp: JitFnCompiler): JitCode {
        return {code: undefined, type: S};
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
    getJitChildren(comp: JitFnCompiler): BaseRunType[] {
        let skipIndex = false; // if there are multiple index signatures, only the first one will be used as they must be same type just different keys
        return this.getChildRunTypes().filter((c) => {
            if (c.skipJit(comp)) return false;
            const isIndex = c.src.kind === ReflectionKind.indexSignature;
            if (isIndex && skipIndex) return false;
            if (isIndex) skipIndex = true;
            return true;
        });
    }
    areAllChildrenOptional(children: BaseRunType[]) {
        return children.every(
            (prop) =>
                (prop as MemberRunType<any>)?.isOptional() ||
                (prop.src as TypeProperty)?.optional ||
                prop.src.kind === ReflectionKind.indexSignature
        );
    }
    emitHasUnknownKeys(comp: JitFnCompiler): JitCode {
        const codes = this.getJitChildren(comp)
            .map((c) => comp.compileHasUnknownKeys(c, E).code)
            .filter((code) => !!code);
        return {code: codes.join(' || '), type: E};
    }
    emitUnknownKeyErrors(comp: JitErrorsFnCompiler): JitCode {
        const codes = this.getJitChildren(comp)
            .map((c) => comp.compileUnknownKeyErrors(c, S).code)
            .filter((code) => !!code);
        return {code: codes.join(';'), type: S};
    }
    emitStripUnknownKeys(comp: JitFnCompiler): JitCode {
        const codes = this.getJitChildren(comp)
            .map((c) => comp.compileStripUnknownKeys(c, S).code)
            .filter((code) => !!code);
        return {code: codes.join(';'), type: S};
    }
    emitUnknownKeysToUndefined(comp: JitFnCompiler): JitCode {
        const codes = this.getJitChildren(comp)
            .map((c) => comp.compileUnknownKeysToUndefined(c, S).code)
            .filter((code) => !!code);
        return {code: codes.join(';'), type: S};
    }
    _getTypeID(stack: BaseRunType[], isGenericId: boolean): StrNumber {
        if (stack.length > MAX_STACK_DEPTH) throw new Error(maxStackErrorMessage);
        const circularJitConf = this.checkIsCircularAndGetRefId(stack);
        if (circularJitConf) return circularJitConf;
        stack.push(this as any);
        const childrenIds: (string | number)[] = [];
        const children = this.getChildRunTypes();
        for (const child of children) {
            const childId = isGenericId ? child.getGenericTypeID(stack) : child.getTypeID(stack);
            childrenIds.push(childId);
        }
        const isArray = this.src.kind === ReflectionKind.tuple || this.src.kind === ReflectionKind.array;
        const groupID = isArray ? `[${childrenIds.join(',')}]` : `{${childrenIds.join(',')}}`;
        const kind = this.src.subKind || this.src.kind;
        stack.pop();
        return `${kind}${groupID}`;
    }
}

/**
 * RunType that contains a single member or child RunType. usually part of a collection RunType.
 * i.e object properties, {prop: memberType} where memberType is the child RunType
 */
export abstract class MemberRunType<T extends Type> extends BaseRunType<T> implements RunTypeChildAccessor {
    abstract isOptional(): boolean;
    abstract getChildVarName(comp: JitFnCompiler): string | number;
    abstract getChildLiteral(comp: JitFnCompiler): string | number;
    abstract useArrayAccessor(): boolean;
    /** used to compile json stringify */
    skipCommas?: boolean;
    /** used to compile json stringify */
    tempChildVλl?: string;
    getFamily(): 'M' {
        return 'M';
    }
    getMemberType(): BaseRunType {
        const memberType = (this.src as any).type as SrcType; // deepkit stores member types in the type property
        return memberType._rt as BaseRunType;
    }
    getChildIndex(comp: JitFnCompiler) {
        const start = comp?.opts?.paramsSlice?.start;
        if (start) return getPropIndex(this.src) - start;
        return getPropIndex(this.src);
    }
    getJitChild(comp: JitFnCompiler): BaseRunType | undefined {
        const member: BaseRunType = this.getMemberType();
        if (member.skipJit(comp)) return undefined;
        return member;
    }
    emitHasUnknownKeys(comp: JitFnCompiler): JitCode {
        const child = this.getJitChild(comp);
        const codeResult = comp.compileHasUnknownKeys(child, E);
        if (!codeResult?.code) return {code: undefined, type: E};
        const childName = comp.getChildVλl();
        const finalCode = this.isOptional() ? `(${childName} !== undefined && ${codeResult.code})` : codeResult.code;
        return {code: finalCode, type: codeResult.type};
    }
    emitUnknownKeyErrors(comp: JitErrorsFnCompiler): JitCode {
        const child = this.getJitChild(comp);
        const codeResult = comp.compileUnknownKeyErrors(child, S);
        if (!codeResult?.code) return {code: undefined, type: S};
        const finalCode = this.isOptional() ? `if (${comp.getChildVλl()} !== undefined) {${codeResult.code}}` : codeResult.code;
        return {code: finalCode, type: codeResult.type};
    }
    emitStripUnknownKeys(comp: JitFnCompiler): JitCode {
        const child = this.getJitChild(comp);
        const codeResult = comp.compileStripUnknownKeys(child, S);
        if (!codeResult?.code) return {code: undefined, type: S};
        const finalCode = this.isOptional() ? `if (${comp.getChildVλl()} !== undefined) {${codeResult.code}}` : codeResult.code;
        return {code: finalCode, type: codeResult.type};
    }
    emitUnknownKeysToUndefined(comp: JitFnCompiler): JitCode {
        const child = this.getJitChild(comp);
        const codeResult = comp.compileUnknownKeysToUndefined(child, S);
        if (!codeResult?.code) return {code: undefined, type: S};
        const finalCode = this.isOptional() ? `if (${comp.getChildVλl()} !== undefined) {${codeResult.code}}` : codeResult.code;
        return {code: finalCode, type: codeResult.type};
    }
    visitToBinary(comp: JitFnCompiler): JitCode {
        const child = this.getJitChild(comp);
        const code = comp.compileToBinary(child, S);
        if (!code?.code) return {code: undefined, type: S};
        return this.isOptional()
            ? {code: `(${comp.getChildVλl()} !== undefined ? ${code.code} : utl.writeBinaryNull())`, type: S}
            : code;
    }
    visitFromBinary(comp: JitFnCompiler): JitCode {
        const child = this.getJitChild(comp);
        const code = comp.compileFromBinary(child, S);
        if (!code?.code) return {code: undefined, type: S};
        return code;
    }
    _getTypeID(stack: BaseRunType[], isGenericId: boolean): StrNumber {
        if (stack.length > MAX_STACK_DEPTH) throw new Error(maxStackErrorMessage);
        const optional = this.isOptional() ? '?' : '';
        const kind =
            (this.src as TypeProperty).name?.toString() ||
            (this.src as TypeIndexSignature).index?.kind ||
            this.src.subKind ||
            this.src.kind;
        const kindID = `${kind}${optional}`;
        const circularJitConf = this.checkIsCircularAndGetRefId(stack);
        if (circularJitConf) return `${kindID}:${circularJitConf}`;
        // TODO: some properties could be skipped from the JIT ID. so we could implement a mechanism to mark them to be skipped
        // ie: sample and sampleChars from StringFormat are too large but they do not affect jit code generation as those properties are only used during mocking
        stack.push(this as any);
        const member = this.getMemberType();
        const memberTypeID = isGenericId ? member.getGenericTypeID(stack) : member.getTypeID(stack);
        const typeID = `${kindID}:${memberTypeID}`;
        stack.pop();
        return typeID;
    }
}

// ########## Load Composable Functions ##########
