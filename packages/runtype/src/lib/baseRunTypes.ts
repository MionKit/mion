/* eslint-disable @typescript-eslint/no-unused-vars */
/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeIndexSignature, type TypeProperty, type Type} from './_deepkit/src/reflection/type';
import type {
    MockOperation,
    RunType,
    DKwithRT,
    JitConstants,
    Mutable,
    RunTypeChildAccessor,
    JitFnID,
    CompiledOperation,
    MockOptions,
} from '../types';
import {getPropIndex, memorize, toLiteral} from './utils';
import {
    defaultJitFnHasReturn,
    defaultJitFnIsExpression,
    jitArgs,
    jitErrorArgs,
    JitFnIDs,
    JitFnNames,
    maxStackDepth,
    maxStackErrorMessage,
} from '../constants';
import {JitErrorsCompiler, JitCompiler, getJITFnHash, createJitCompiler} from './jitCompiler';
import {getReflectionName} from '../constants.kind';
import {createJitIDHash, jitUtils} from './jitUtils';
import {isMockContext} from './guards';
import {defaultMockOptions} from '../constants.mock';

type DkCollection = Type & {types: Type[]};
type DkMember = Type & {type: Type; optional: boolean};

export abstract class BaseRunType<T extends Type = Type> implements RunType {
    isCircular?: boolean;
    abstract readonly src: T;
    abstract getFamily(): 'A' | 'C' | 'M' | 'F'; // Atomic, Collection, Member, Function
    abstract getJitConstants(stack?: RunType[]): JitConstants;
    abstract _mock(mockContext: MockOperation): any;
    isJitInlined = () => !(this.isCircular || (this.src.typeName && this.getFamily() === 'C'));
    getName = memorize((): string => getReflectionName(this));
    getJitId = () => this.getJitConstants().jitId;
    getJitHash = memorize((): string => createJitIDHash(this.getJitId().toString()));
    getParent = (): RunType | undefined => (this.src.parent as DKwithRT)?._rt;
    getNestLevel = memorize((): number => {
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

    // ########## Mock ##########

    mock(k?: Partial<MockOptions>): any {
        const ctx = this.initMockOptions(k);
        ctx.stack.push(this);
        const recursionLevel = ctx.stack.filter((rt) => rt === this).length;
        const updatedContext = recursionLevel ? this.onCircularMock(ctx, recursionLevel) : ctx;
        const mocked = this._mock(updatedContext);
        ctx.stack.pop();
        return mocked;
    }

    // reduces all probabilities within the MockOptions to prevent infinite loops
    private onCircularMock(ctx: MockOperation, recursionLevel): MockOperation {
        const maxDepth = ctx.maxMockRecursion;
        const divisor = recursionLevel;
        const {optionalProbability, maxRandomArrayLength, optionalPropertyProbability, arrayLength} = ctx;
        const newProv = recursionLevel >= maxDepth ? 0 : optionalProbability / divisor;
        const newMaxLength = recursionLevel >= maxDepth ? 0 : Math.round(maxRandomArrayLength / divisor);
        // console.log(`divisor: ${divisor} | newMaxLength: ${newMaxLength} | newProv: ${newProv}`);
        const ret: MockOperation = {
            ...ctx,
            optionalProbability: newProv,
            maxRandomArrayLength: newMaxLength,
        };
        if (optionalPropertyProbability) {
            const entries = Object.entries(optionalPropertyProbability).map(([key, value]) => {
                const newProv = recursionLevel > maxDepth ? 0 : value / divisor;
                return [key, value / newProv];
            });
            ret.optionalPropertyProbability = Object.fromEntries(entries);
        }
        if (arrayLength) {
            const newLength = recursionLevel >= maxDepth ? 0 : Math.round(arrayLength / divisor);
            ret.arrayLength = newLength;
        }
        if (ret.parentObj) ret.parentObj = {}; // prevents mocking objects with circular references
        return ret;
    }

    private initMockOptions(k?: Partial<MockOptions>): MockOperation {
        if (k && isMockContext(k)) return k;
        return {
            ...defaultMockOptions,
            ...(k || {}),
            stack: [],
        };
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
    abstract _compileIsType(comp: JitCompiler): string;
    abstract _compileTypeErrors(comp: JitErrorsCompiler): string;
    abstract _compileJsonEncode(comp: JitCompiler): string;
    abstract _compileJsonDecode(comp: JitCompiler): string;
    abstract _compileJsonStringify(comp: JitCompiler): string;
    abstract _compileHasUnknownKeys(comp: JitCompiler): string;
    abstract _compileUnknownKeyErrors(comp: JitErrorsCompiler): string;
    abstract _compileStripUnknownKeys(comp: JitCompiler): string;
    abstract _compileUnknownKeysToUndefined(comp: JitCompiler): string;

    // ########## Compile Methods ##########

    compileIsType(comp: JitCompiler): string {
        return this.compile(comp, JitFnIDs.isType);
    }
    compileTypeErrors(comp: JitErrorsCompiler): string {
        return this.compile(comp, JitFnIDs.typeErrors);
    }
    compileJsonEncode(comp: JitCompiler): string {
        return this.compile(comp, JitFnIDs.jsonEncode);
    }
    compileJsonDecode(comp: JitCompiler): string {
        return this.compile(comp, JitFnIDs.jsonDecode);
    }
    compileJsonStringify(comp: JitCompiler): string {
        return this.compile(comp, JitFnIDs.jsonStringify);
    }
    compileUnknownKeyErrors(comp: JitErrorsCompiler): string {
        return this.compile(comp, JitFnIDs.unknownKeyErrors);
    }
    compileHasUnknownKeys(comp: JitCompiler): string {
        return this.compile(comp, JitFnIDs.hasUnknownKeys);
    }
    compileStripUnknownKeys(comp: JitCompiler): string {
        return this.compile(comp, JitFnIDs.stripUnknownKeys);
    }
    compileUnknownKeysToUndefined(comp: JitCompiler): string {
        return this.compile(comp, JitFnIDs.unknownKeysToUndefined);
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
    private compile(comp: JitCompiler, fnId: JitFnID) {
        let code: string | undefined;
        comp.pushStack(this);
        if (comp.shouldCallDependency()) {
            const compiledOp = this._getJitCompiledOperation(fnId, comp);
            code = this.callDependency(comp, compiledOp);
            comp.updateDependencies(compiledOp);
        } else {
            switch (fnId) {
                case JitFnIDs.isType:
                    code = this._compileIsType(comp);
                    break;
                case JitFnIDs.typeErrors:
                    code = this._compileTypeErrors(comp as JitErrorsCompiler);
                    break;
                case JitFnIDs.jsonEncode:
                    code = this._compileJsonEncode(comp);
                    break;
                case JitFnIDs.jsonDecode:
                    code = this._compileJsonDecode(comp);
                    break;
                case JitFnIDs.jsonStringify:
                    code = this._compileJsonStringify(comp);
                    break;
                case JitFnIDs.unknownKeyErrors:
                    code = this._compileUnknownKeyErrors(comp as JitErrorsCompiler);
                    break;
                case JitFnIDs.hasUnknownKeys:
                    code = this._compileHasUnknownKeys(comp);
                    break;
                case JitFnIDs.stripUnknownKeys:
                    code = this._compileStripUnknownKeys(comp);
                    break;
                case JitFnIDs.unknownKeysToUndefined:
                    code = this._compileUnknownKeysToUndefined(comp);
                    break;
                default:
                    throw new Error(`Unknown compile operation: ${fnId}`);
            }
            code = this.handleReturnValues(comp, fnId, code);
        }
        comp.popStack(code);
        return code;
    }

    callDependency(currentCop: JitCompiler, comp: CompiledOperation): string {
        const stackItem = currentCop.getCurrentStackItem();
        const isErrorCall = comp.opId === JitFnIDs.typeErrors || comp.opId === JitFnIDs.unknownKeyErrors;
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
            const pathArgs = currentCop.getStackStaticPathArgs();
            const pathLength = currentCop.getStaticPathLength();
            // increase and decrease the static path before and after calling the circular function
            return `${jitErrorArgs.pλth}.push(${pathArgs}); ${callCode}; ${jitErrorArgs.pλth}.splice(-${pathLength});`;
        }
        return callCode;
    }

    handleReturnValues(comp: JitCompiler, currentOpId: JitFnID, code: string, isCallDependency?: true): string {
        const codeHasReturn: boolean = isCallDependency ?? this.jitFnHasReturn(currentOpId);
        const isExpression: boolean = this.jitFnIsExpression(currentOpId);
        const isRoot = comp.length === 1;
        if (isRoot && isExpression) {
            return codeHasReturn ? code : `return ${code}`;
        }
        if (isRoot) {
            // if code is a block and does not have return, we need to make sure
            const lastChar = code.length - 1;
            const hasFullStop = code.lastIndexOf(';') === lastChar || code.lastIndexOf('}') === lastChar;
            const stopChar = hasFullStop ? '' : ';';
            return codeHasReturn ? code : `${code}${stopChar} return ${comp.returnName}`;
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
    _compileJsonEncode(comp: JitCompiler): string {
        return comp.vλl;
    }
    _compileJsonDecode(comp: JitCompiler): string {
        return comp.vλl;
    }
    _compileJsonStringify(comp: JitCompiler): string {
        return comp.vλl;
    }
    _compileHasUnknownKeys(comp: JitCompiler): string {
        return '';
    }
    _compileUnknownKeyErrors(comp: JitCompiler): string {
        return '';
    }
    _compileStripUnknownKeys(comp: JitCompiler): string {
        return '';
    }
    _compileUnknownKeysToUndefined(comp: JitCompiler): string {
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
    _compileHasUnknownKeys(comp: JitCompiler): string {
        return this.getJitChildren()
            .map((c) => c.compileHasUnknownKeys(comp))
            .filter((code) => !!code)
            .join(' || ');
    }
    _compileUnknownKeyErrors(comp: JitErrorsCompiler): string {
        return this.getJitChildren()
            .map((c) => c.compileUnknownKeyErrors(comp))
            .filter((code) => !!code)
            .join(';');
    }
    _compileStripUnknownKeys(comp: JitCompiler): string {
        return this.getJitChildren()
            .map((c) => c.compileStripUnknownKeys(comp))
            .filter((code) => !!code)
            .join(';');
    }
    _compileUnknownKeysToUndefined(comp: JitCompiler): string {
        return this.getJitChildren()
            .map((c) => c.compileUnknownKeysToUndefined(comp))
            .filter((code) => !!code)
            .join(';');
    }
    private _getJitConstants = memorize((stack: BaseRunType[] = []): JitConstants => {
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
    _compileHasUnknownKeys(comp: JitCompiler): string {
        const code = this.getJitChild()?.compileHasUnknownKeys(comp);
        if (!code) return '';
        const childName = comp.getChildVλl();
        return this.isOptional() ? `(${childName} !== undefined && ${code})` : code;
    }
    _compileUnknownKeyErrors(comp: JitErrorsCompiler): string {
        const code = this.getJitChild()?.compileUnknownKeyErrors(comp) || '';
        if (!code) return '';
        return this.isOptional() ? `if (${comp.getChildVλl()} !== undefined) {${code}}` : code;
    }
    _compileStripUnknownKeys(comp: JitCompiler): string {
        const code = this.getJitChild()?.compileStripUnknownKeys(comp) || '';
        if (!code) return '';
        return this.isOptional() ? `if (${comp.getChildVλl()} !== undefined) {${code}}` : code;
    }
    _compileUnknownKeysToUndefined(comp: JitCompiler): string {
        const code = this.getJitChild()?.compileUnknownKeysToUndefined(comp) || '';
        if (!code) return '';
        return this.isOptional() ? `if (${comp.getChildVλl()} !== undefined) {${code}}` : code;
    }
    private _getJitConstants = memorize((stack: BaseRunType[] = []): JitConstants => {
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
