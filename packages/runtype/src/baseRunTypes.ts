/* eslint-disable @typescript-eslint/no-unused-vars */
/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeIndexSignature, type TypeProperty, type Type} from './_deepkit/src/reflection/type';
import type {
    MockContext,
    RunType,
    DKwithRT,
    JitConstants,
    Mutable,
    RunTypeChildAccessor,
    JitFnID,
    CompiledOperation,
} from './types';
import {getPropIndex, memo} from './utils';
import {
    defaultJitFnHasReturn,
    defaultJitFnIsExpression,
    jitArgs,
    jitErrorArgs,
    JitFnIDs,
    JitFnNames,
    maxStackDepth,
    maxStackErrorMessage,
} from './constants';
import {JitErrorsCompiler, JitCompiler, getJITFnHash, createJitCompiler} from './jitCompiler';
import {getReflectionName} from './reflectionNames';
import {createJitIDHash, jitUtils} from './jitUtils';

type DkCollection = Type & {types: Type[]};
type DkMember = Type & {type: Type; optional: boolean};

export abstract class BaseRunType<T extends Type = Type> implements RunType {
    isCircular?: boolean;
    abstract readonly src: T;
    abstract getFamily(): 'A' | 'C' | 'M' | 'F'; // Atomic, Collection, Member, Function
    abstract getJitConstants(stack?: RunType[]): JitConstants;
    abstract mock(mockContext?: MockContext): any;
    isJitInlined = () => !(this.isCircular || (this.src.typeName && this.getFamily() === 'C'));
    getName = memo((): string => getReflectionName(this));
    getJitId = () => this.getJitConstants().jitId;
    getJitHash = memo((): string => createJitIDHash(this.getJitId().toString(), 18));
    getParent = (): RunType | undefined => (this.src.parent as DKwithRT)?._rt;
    getNestLevel = memo((): number => {
        if (this.isCircular) return 0; // circular references start a new context
        const parent = this.getParent() as BaseRunType<T>;
        if (!parent) return 0;
        return parent.getNestLevel() + 1;
    });

    getCircularJitConstants(stack: RunType[] = []): JitConstants | undefined {
        const inStackIndex = stack.findIndex((rt) => rt === this); // cant use isSameJitType because it uses getJitId and would loop forever
        const isInStack = inStackIndex >= 0; // recursive reference
        if (isInStack) {
            this.isCircular = true;
            const name = this.src.typeName || ''; // todo: not sure if all the circular references will have a name
            return {
                skipJit: false, // circular types requires custom logic so can't be skipped
                skipJsonEncode: false,
                skipJsonDecode: false,
                jitId: '$' + this.src.kind + `_${inStackIndex}` + name, // ensures different circular types have different jitId
            };
        }
    }

    // ########## Create Jit Functions ##########

    createJitFunction = (fnId: JitFnID): ((...args: any[]) => any) => {
        return this._getJitCompiledOperation(fnId).fn;
    };

    private _getJitCompiledOperation(fnId: JitFnID, parentCop?: JitCompiler): CompiledOperation {
        const existingCop = jitUtils.getJIT(getJITFnHash(fnId, this));
        if (existingCop) {
            if (process.env.DEBUG_JIT) console.log(`\x1b[32m Using cached function: ${existingCop.jitFnHash} \x1b[0m`);
            return existingCop;
        }
        const newCompileOp: JitCompiler = createJitCompiler(this, fnId, parentCop) as JitCompiler;
        try {
            this.compile(newCompileOp, fnId);
        } catch (e) {
            // if something goes wrong during compilation we want to remove the compiler from the cache
            newCompileOp.removeFromJitCache();
            throw e;
        }
        return newCompileOp as CompiledOperation;
    }

    // ########## Child _compile Methods ##########

    /* BaseRunType compileX method is in charge of handling circular refs, return values, create subprograms, etc.
     * While the child _compileX must only contain the logic to generate the code. */
    abstract _compileIsType(cop: JitCompiler): string;
    abstract _compileTypeErrors(cop: JitErrorsCompiler): string;
    abstract _compileJsonEncode(cop: JitCompiler): string;
    abstract _compileJsonDecode(cop: JitCompiler): string;
    abstract _compileJsonStringify(cop: JitCompiler): string;
    abstract _compileHasUnknownKeys(cop: JitCompiler): string;
    abstract _compileUnknownKeyErrors(cop: JitErrorsCompiler): string;
    abstract _compileStripUnknownKeys(cop: JitCompiler): string;
    abstract _compileUnknownKeysToUndefined(cop: JitCompiler): string;

    // ########## Compile Methods ##########

    compileIsType(cop: JitCompiler): string {
        return this.compile(cop, JitFnIDs.isType);
    }
    compileTypeErrors(cop: JitErrorsCompiler): string {
        return this.compile(cop, JitFnIDs.typeErrors);
    }
    compileJsonEncode(cop: JitCompiler): string {
        return this.compile(cop, JitFnIDs.jsonEncode);
    }
    compileJsonDecode(cop: JitCompiler): string {
        return this.compile(cop, JitFnIDs.jsonDecode);
    }
    compileJsonStringify(cop: JitCompiler): string {
        return this.compile(cop, JitFnIDs.jsonStringify);
    }
    compileUnknownKeyErrors(cop: JitErrorsCompiler): string {
        return this.compile(cop, JitFnIDs.unknownKeyErrors);
    }
    compileHasUnknownKeys(cop: JitCompiler): string {
        return this.compile(cop, JitFnIDs.hasUnknownKeys);
    }
    compileStripUnknownKeys(cop: JitCompiler): string {
        return this.compile(cop, JitFnIDs.stripUnknownKeys);
    }
    compileUnknownKeysToUndefined(cop: JitCompiler): string {
        return this.compile(cop, JitFnIDs.unknownKeysToUndefined);
    }
    /**
     * Compiles the current function.
     * This function handles the logic to determine if the operation should be compiled and code should be inlined, or called as a dependency.
     * Note current JitCompiler operation might be different from the passed operation id.
     * ie: typeErrors might want to compile isType to generate the part of the code that checks for the type.
     * @param cop current jit compiler operation
     * @param fnId operation id
     * @returns
     */
    private compile(cop: JitCompiler, fnId: JitFnID) {
        let code: string | undefined;
        cop.pushStack(this);
        if (cop.shouldCallDependency()) {
            const compiledOp = this._getJitCompiledOperation(fnId, cop);
            code = this.callDependency(cop, compiledOp);
            cop.updateDependencies(compiledOp);
        } else {
            switch (fnId) {
                case JitFnIDs.isType:
                    code = this._compileIsType(cop);
                    break;
                case JitFnIDs.typeErrors:
                    code = this._compileTypeErrors(cop as JitErrorsCompiler);
                    break;
                case JitFnIDs.jsonEncode:
                    code = this._compileJsonEncode(cop);
                    break;
                case JitFnIDs.jsonDecode:
                    code = this._compileJsonDecode(cop);
                    break;
                case JitFnIDs.jsonStringify:
                    code = this._compileJsonStringify(cop);
                    break;
                case JitFnIDs.unknownKeyErrors:
                    code = this._compileUnknownKeyErrors(cop as JitErrorsCompiler);
                    break;
                case JitFnIDs.hasUnknownKeys:
                    code = this._compileHasUnknownKeys(cop);
                    break;
                case JitFnIDs.stripUnknownKeys:
                    code = this._compileStripUnknownKeys(cop);
                    break;
                case JitFnIDs.unknownKeysToUndefined:
                    code = this._compileUnknownKeysToUndefined(cop);
                    break;
                default:
                    throw new Error(`Unknown compile operation: ${fnId}`);
            }
            code = this.handleReturnValues(cop, fnId, code);
        }
        cop.popStack(code);
        return code;
    }

    callDependency(currentCop: JitCompiler, cop: CompiledOperation): string {
        const stackItem = currentCop.getCurrentStackItem();
        const isErrorCall = cop.opId === JitFnIDs.typeErrors || cop.opId === JitFnIDs.unknownKeyErrors;
        const args = isErrorCall ? jitErrorArgs : jitArgs;
        const argsCode = Object.entries(args)
            .map(([key, name]) => (key === 'vλl' ? stackItem.vλl : name))
            .join(',');
        const isSame = currentCop.jitFnHash === cop.jitFnHash;
        // call local variable instead directly calling jitUtils to avoid lookups.
        // ie function context (local variable created when compiling the function): const abc = jitUtils.getJIT('abc);
        // ie calling context variable: abc.fn();
        // if operation is the same as the current operation we can call the function directly
        const callCode = isSame ? `${cop.jitFnHash}(${argsCode})` : `${cop.jitFnHash}.fn(${argsCode})`;
        if (isErrorCall) {
            const pathArgs = currentCop.getStackStaticPathArgs();
            const pathLength = currentCop.getStaticPathLength();
            // increase and decrease the static path before and after calling the circular function
            return `${jitErrorArgs.pλth}.push(${pathArgs}); ${callCode}; ${jitErrorArgs.pλth}.splice(-${pathLength});`;
        }
        return callCode;
    }

    handleReturnValues(cop: JitCompiler, currentOpId: JitFnID, code: string, isCallDependency?: true): string {
        const codeHasReturn: boolean = isCallDependency ?? this.jitFnHasReturn(currentOpId);
        const isExpression: boolean = this.jitFnIsExpression(currentOpId);
        const isRoot = cop.length === 1;
        if (isRoot && isExpression) {
            return codeHasReturn ? code : `return ${code}`;
        }
        if (isRoot) {
            // if code is a block and does not have return, we need to make sure
            const lastChar = code.length - 1;
            const hasFullStop = code.lastIndexOf(';') === lastChar || code.lastIndexOf('}') === lastChar;
            const stopChar = hasFullStop ? '' : ';';
            return codeHasReturn ? code : `${code}${stopChar} return ${cop.returnName}`;
        }
        if (isExpression) {
            // if code should be an expression, but code has return a statement, we need to wrap it in a self invoking function to avoid syntax errors
            // TODO: we could create a new function and cache instead a self invoking function a performance is same but code is not repeated
            return codeHasReturn ? `(function(){${code}})()` : code;
        }
        // if code is an statement or block we don't need to do anything as code can be inlined as it is
        return code;
    }

    // ########## Return flags ##########
    // any child with different settings should override these methods
    // these flags are used to determine if the compiled code should be wrapped in a self invoking function or not
    // or if the compiled code should contain a return statement or not
    // all atomic types should have these same flags (code should never have a return statement)
    jitFnHasReturn(fnId: JitFnID): boolean {
        const hasReturn = defaultJitFnHasReturn[JitFnNames[fnId]];
        if (hasReturn === undefined) throw new Error(`Unknown compile operation: ${fnId}`);
        return hasReturn;
    }

    jitFnIsExpression(fnId: JitFnID): boolean {
        const isExpression = defaultJitFnIsExpression[JitFnNames[fnId]];
        if (isExpression === undefined) throw new Error(`Unknown compile operation: ${fnId}`);
        return isExpression;
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
    _compileJsonEncode(cop: JitCompiler): string {
        return cop.vλl;
    }
    _compileJsonDecode(cop: JitCompiler): string {
        return cop.vλl;
    }
    _compileJsonStringify(cop: JitCompiler): string {
        return cop.vλl;
    }
    _compileHasUnknownKeys(cop: JitCompiler): string {
        return '';
    }
    _compileUnknownKeyErrors(cop: JitCompiler): string {
        return '';
    }
    _compileStripUnknownKeys(cop: JitCompiler): string {
        return '';
    }
    _compileUnknownKeysToUndefined(cop: JitCompiler): string {
        return '';
    }
    jitFnIsExpression(fnId: JitFnID): boolean {
        switch (fnId) {
            case JitFnIDs.isType:
                return true;
            case JitFnIDs.jsonEncode:
                return true;
            case JitFnIDs.jsonDecode:
                return true;
            case JitFnIDs.jsonStringify:
                return true;
            default:
                return super.jitFnIsExpression(fnId);
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
        const childTypes = ((this.src as DkCollection).types as DKwithRT[]) || []; // deepkit stores child types in the types property
        return childTypes.map((t) => t._rt as BaseRunType);
    };
    getJitChildren(): BaseRunType[] {
        let skipIndex = false; // if there are multiple index signatures, only the first one will be used as they must be same type just different keys
        return this.getChildRunTypes().filter((c) => {
            if (c.getJitConstants().skipJit) return false;
            const isIndex = c.src.kind === ReflectionKind.indexSignature;
            if (isIndex && skipIndex) return false;
            if (isIndex) skipIndex = true;
            return true;
        });
    }
    getJsonEncodeChildren(): BaseRunType[] {
        return this.getJitChildren().filter((c) => !c.getJitConstants().skipJsonEncode);
    }
    getJsonDecodeChildren(): BaseRunType[] {
        return this.getJitChildren().filter((c) => !c.getJitConstants().skipJsonDecode);
    }
    // In order to json stringify to work properly optional properties must come first
    getJsonStringifyChildren(): BaseRunType[] {
        return this.getJitChildren().sort((a, b) => {
            const aOptional = a instanceof MemberRunType && a.isOptional();
            const bOptional = b instanceof MemberRunType && b.isOptional();
            if (aOptional && !bOptional) return -1;
            if (!aOptional && bOptional) return 1;
            return 0;
        });
    }
    getJitConstants(stack: BaseRunType[] = []): JitConstants {
        return this._getJitConstants(stack);
    }
    _compileHasUnknownKeys(cop: JitCompiler): string {
        return this.getJitChildren()
            .map((c) => c.compileHasUnknownKeys(cop))
            .filter((code) => !!code)
            .join(' || ');
    }
    _compileUnknownKeyErrors(cop: JitErrorsCompiler): string {
        return this.getJitChildren()
            .map((c) => c.compileUnknownKeyErrors(cop))
            .filter((code) => !!code)
            .join(';');
    }
    _compileStripUnknownKeys(cop: JitCompiler): string {
        return this.getJitChildren()
            .map((c) => c.compileStripUnknownKeys(cop))
            .filter((code) => !!code)
            .join(';');
    }
    _compileUnknownKeysToUndefined(cop: JitCompiler): string {
        return this.getJitChildren()
            .map((c) => c.compileUnknownKeysToUndefined(cop))
            .filter((code) => !!code)
            .join(';');
    }
    private _getJitConstants = memo((stack: BaseRunType[] = []): JitConstants => {
        if (stack.length > maxStackDepth) throw new Error(maxStackErrorMessage);
        const circularJitConstants = this.getCircularJitConstants(stack);
        if (circularJitConstants) return circularJitConstants;
        stack.push(this);
        const childrenJitIds: (string | number)[] = [];
        const children = this.getChildRunTypes();
        const jitCts: Mutable<JitConstants> = {
            skipJit: true,
            skipJsonEncode: true,
            skipJsonDecode: true,
            jitId: ``,
        };
        for (const child of children) {
            const childConstants = child.getJitConstants(stack);
            jitCts.skipJit &&= childConstants.skipJit;
            jitCts.skipJsonEncode &&= childConstants.skipJsonEncode;
            jitCts.skipJsonDecode &&= childConstants.skipJsonDecode;
            childrenJitIds.push(childConstants.jitId);
        }
        const isArray = this.src.kind === ReflectionKind.tuple || this.src.kind === ReflectionKind.array;
        const groupID = isArray ? `[${childrenJitIds.join(',')}]` : `{${childrenJitIds.join(',')}}`;
        jitCts.jitId = `${this.src.kind}${groupID}`;
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
        const memberType = (this.src as DkMember).type as DKwithRT; // deepkit stores member types in the type property
        return memberType._rt as BaseRunType;
    };
    getChildIndex(): number {
        return getPropIndex(this.src);
    }
    getJitChild(): BaseRunType | undefined {
        let member: BaseRunType | undefined = this.getMemberType();
        if (member.getJitConstants().skipJit) member = undefined;
        return member;
    }
    getJsonEncodeChild(): BaseRunType | undefined {
        const child = this.getJitChild();
        if (!child || child.getJitConstants().skipJsonEncode) return undefined;
        return child;
    }
    getJsonDecodeChild(): BaseRunType | undefined {
        const child = this.getJitChild();
        if (!child || child.getJitConstants().skipJsonDecode) return undefined;
        return child;
    }
    getJitConstants(stack: BaseRunType[] = []): JitConstants {
        return this._getJitConstants(stack);
    }
    skipSettingAccessor(): boolean {
        return false;
    }
    _compileHasUnknownKeys(cop: JitCompiler): string {
        const code = this.getJitChild()?.compileHasUnknownKeys(cop);
        if (!code) return '';
        const childName = cop.getChildVλl();
        return this.isOptional() ? `(${childName} !== undefined && ${code})` : code;
    }
    _compileUnknownKeyErrors(cop: JitErrorsCompiler): string {
        const code = this.getJitChild()?.compileUnknownKeyErrors(cop) || '';
        if (!code) return '';
        return this.isOptional() ? `if (${cop.getChildVλl()} !== undefined) {${code}}` : code;
    }
    _compileStripUnknownKeys(cop: JitCompiler): string {
        const code = this.getJitChild()?.compileStripUnknownKeys(cop) || '';
        if (!code) return '';
        return this.isOptional() ? `if (${cop.getChildVλl()} !== undefined) {${code}}` : code;
    }
    _compileUnknownKeysToUndefined(cop: JitCompiler): string {
        const code = this.getJitChild()?.compileUnknownKeysToUndefined(cop) || '';
        if (!code) return '';
        return this.isOptional() ? `if (${cop.getChildVλl()} !== undefined) {${code}}` : code;
    }
    private _getJitConstants = memo((stack: BaseRunType[] = []): JitConstants => {
        if (stack.length > maxStackDepth) throw new Error(maxStackErrorMessage);
        const circularJitConstants = this.getCircularJitConstants(stack);
        if (circularJitConstants) return circularJitConstants;
        stack.push(this);
        const member = this.getMemberType();
        const memberValues = member.getJitConstants(stack);
        const optional = this.isOptional() ? '?' : '';
        const id = (this.src as TypeProperty).name?.toString() || (this.src as TypeIndexSignature).index?.kind || this.src.kind;
        const jitCts: Mutable<JitConstants> = {
            ...memberValues,
            jitId: `${id}${optional}:${memberValues.jitId}`,
        };
        stack.pop();
        return jitCts;
    });
}
