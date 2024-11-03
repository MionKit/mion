/* eslint-disable @typescript-eslint/no-unused-vars */
/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type Type} from './_deepkit/src/reflection/type';
import type {MockContext, RunType, DKwithRT, JitConstants, Mutable, RunTypeChildAccessor, CodeUnit, JitFnID} from './types';
import {getPropIndex, memo} from './utils';
import {JitFnIDs, maxStackDepth, maxStackErrorMessage} from './constants';
import {JitErrorsCompiler, JitCompiler, getJITFnHash} from './jitCompiler';
import {getReflectionName} from './reflectionNames';
import {jitUtils} from './jitUtils';
import {isJitErrorsCompiler} from './guards';

type DkCollection = Type & {types: Type[]};
type DkMember = Type & {type: Type; optional: boolean};

export abstract class BaseRunType<T extends Type = Type> implements RunType {
    isCircular?: boolean;
    abstract readonly src: T;
    abstract getFamily(): 'A' | 'C' | 'M' | 'F'; // Atomic, Collection, Member, Function
    abstract getJitConstants(stack?: RunType[]): JitConstants;
    abstract mock(mockContext?: MockContext): any;
    getName = memo((): string => getReflectionName(this));
    getJitId = () => this.getJitConstants().jitId;
    getParent = (): RunType | undefined => (this.src.parent as DKwithRT)?._rt;
    getNestLevel = memo((): number => {
        if (this.isCircular) return 0; // circular references start a new context
        const parent = this.getParent() as BaseRunType<T>;
        if (!parent) return 0;
        return parent.getNestLevel() + 1;
    });

    getCircularJitConstants(stack: RunType[] = []): JitConstants | undefined {
        const inStackIndex = stack.findIndex((rt) => rt === this); // cant use isSameJitType because it uses getJitId
        const isInStack = inStackIndex >= 0; // recursive reference
        if (isInStack) {
            this.isCircular = true;
            return {
                skipJit: false, // ensures that jit is ran when circular reference is found
                skipJsonEncode: false,
                skipJsonDecode: false,
                jitId: '$',
            };
        }
    }

    // ########## Create Jit Functions ##########

    createJitFunction = (copId: JitFnID): ((...args: any[]) => any) => {
        const fn = jitUtils.getCachedFn(getJITFnHash(copId, this));
        if (fn) return fn;
        const newCompileOp: JitCompiler = this.createJitCompiler(copId);
        this.compile(newCompileOp, copId);
        return newCompileOp.getCompiledFunction();
    };

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
     * Compiles the current operation.
     * Note current JitCompiler operation might be different from the passed operation id.
     * ie: typeErrors might want to compile isType to generate the part of the code that checks for the type.
     * @param cop current jit compiler operation
     * @param copId operation id
     * @returns
     */
    private compile(cop: JitCompiler, copId: JitFnID) {
        let code: string | undefined = cop.getCodeFromCache();
        if (code) return code;
        cop.pushStack(this);
        if (cop.shouldCreateDependency(copId)) {
            const fnId = getJITFnHash(copId, this);
            const cachedCop = jitUtils.getCachedCompiledOperation(fnId);
            if (cachedCop) {
                cop.addDependency(cachedCop);
                code = this.callDependency(cop, copId, fnId);
            } else {
                const newCompileOp: JitCompiler = this.createJitCompiler(copId, cop);
                this.compile(newCompileOp, copId);
                code = this.callDependency(cop, copId, fnId);
            }
        } else if (cop.shouldCallDependency()) {
            code = this.callDependency(cop, copId);
        } else {
            code = this._compile(copId, cop);
            code = this.handleReturnValues(code, cop);
        }
        cop.popStack(code);
        return code;
    }

    private callDependency(cop: JitCompiler, copId: JitFnID, fnId?: string): string {
        const code = cop.getDependencyCallCode(copId, fnId);
        if (isJitErrorsCompiler(cop)) {
            const pathArgs = cop.getStackStaticPathArgs();
            const pathLength = cop.getStaticPathLength();
            // increase and decrease the static path before and after calling the circular function
            return `${cop.args.pλth}.push(${pathArgs}); ${code}; ${cop.args.pλth}.splice(-${pathLength});`;
        }
        return code;
    }

    private handleReturnValues(code: string, cop: JitCompiler): string {
        const codeHasReturn: boolean = this.jitFnHasReturn(cop.opId);
        const isExpression: boolean = this.jitFnIsExpression(cop.opId);
        const isRoot = cop.length === 1;
        if (isRoot && isExpression) {
            return codeHasReturn ? code : `return (${code})`;
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
    jitFnHasReturn(copId: JitFnID): boolean {
        switch (copId) {
            case JitFnIDs.isType:
                return false;
            case JitFnIDs.typeErrors:
                return false;
            case JitFnIDs.jsonEncode:
                return false;
            case JitFnIDs.jsonDecode:
                return false;
            case JitFnIDs.jsonStringify:
                return false;
            case JitFnIDs.unknownKeyErrors:
                return false;
            case JitFnIDs.hasUnknownKeys:
                return false;
            case JitFnIDs.stripUnknownKeys:
                return false;
            case JitFnIDs.unknownKeysToUndefined:
                return false;
            default:
                throw new Error(`Unknown compile operation: ${copId}`);
        }
    }

    jitFnIsExpression(copId: JitFnID): boolean {
        switch (copId) {
            case JitFnIDs.isType:
                return true;
            case JitFnIDs.typeErrors:
                return false;
            case JitFnIDs.jsonEncode:
                return false;
            case JitFnIDs.jsonDecode:
                return false;
            case JitFnIDs.jsonStringify:
                return true;
            case JitFnIDs.unknownKeyErrors:
                return false;
            case JitFnIDs.hasUnknownKeys:
                return true;
            case JitFnIDs.stripUnknownKeys:
                return false;
            case JitFnIDs.unknownKeysToUndefined:
                return false;
            default:
                throw new Error(`Unknown compile operation: ${copId}`);
        }
    }

    private _compile(copId: JitFnID, cop: JitCompiler): string {
        switch (copId) {
            case JitFnIDs.isType:
                return this._compileIsType(cop);
            case JitFnIDs.typeErrors:
                return this._compileTypeErrors(cop as JitErrorsCompiler);
            case JitFnIDs.jsonEncode:
                return this._compileJsonEncode(cop);
            case JitFnIDs.jsonDecode:
                return this._compileJsonDecode(cop);
            case JitFnIDs.jsonStringify:
                return this._compileJsonStringify(cop);
            case JitFnIDs.unknownKeyErrors:
                return this._compileUnknownKeyErrors(cop as JitErrorsCompiler);
            case JitFnIDs.hasUnknownKeys:
                return this._compileHasUnknownKeys(cop);
            case JitFnIDs.stripUnknownKeys:
                return this._compileStripUnknownKeys(cop);
            case JitFnIDs.unknownKeysToUndefined:
                return this._compileUnknownKeysToUndefined(cop);
            default:
                throw new Error(`Unknown compile operation: ${copId}`);
        }
    }

    private createJitCompiler = (copId: JitFnID, parent?: JitCompiler): JitCompiler => {
        const existingJitCompiler = parent?.getDependency(copId, this);
        if (existingJitCompiler) {
            if (process.env.DEBUG_JIT) console.warn(`Circular reference runType:`, this);
            throw new Error(`Circular reference detected: ${existingJitCompiler.jitFnHash}`);
        }
        switch (copId) {
            case JitFnIDs.isType:
                return new JitCompiler(this, copId, parent?.dependencies);
            case JitFnIDs.typeErrors:
                return new JitErrorsCompiler(this, copId, parent?.dependencies);
            case JitFnIDs.jsonEncode:
                return new JitCompiler(this, copId, parent?.dependencies);
            case JitFnIDs.jsonDecode:
                return new JitCompiler(this, copId, parent?.dependencies);
            case JitFnIDs.jsonStringify:
                return new JitCompiler(this, copId, parent?.dependencies);
            case JitFnIDs.unknownKeyErrors:
                return new JitErrorsCompiler(this, copId, parent?.dependencies);
            case JitFnIDs.hasUnknownKeys:
                return new JitCompiler(this, copId, parent?.dependencies);
            case JitFnIDs.stripUnknownKeys:
                return new JitCompiler(this, copId, parent?.dependencies);
            case JitFnIDs.unknownKeysToUndefined:
                return new JitCompiler(this, copId, parent?.dependencies);
            default:
                throw new Error(`Unknown compile operation: ${copId}`);
        }
    };
}

/**
 * RunType that is atomic an does not contains any other child runTypes.
 * ie: string, number, boolean, any, null, undefined, void, never, bigint, etc.
 * */
export abstract class AtomicRunType<T extends Type> extends BaseRunType<T> {
    getFamily(): 'A' {
        return 'A';
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
        return this.getChildRunTypes().filter((c) => !c.getJitConstants().skipJit);
    }
    getJsonEncodeChildren(): BaseRunType[] {
        return this.getChildRunTypes().filter((c) => !c.getJitConstants().skipJit && !c.getJitConstants().skipJsonEncode);
    }
    getJsonDecodeChildren(): BaseRunType[] {
        return this.getChildRunTypes().filter((c) => !c.getJitConstants().skipJit && !c.getJitConstants().skipJsonDecode);
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
    _compileHasUnknownKeys(cop: JitCompiler): string {
        const code = this.getJitChild()?.compileHasUnknownKeys(cop);
        if (!code) return '';
        return this.isOptional() ? `(${cop.vλl} !== undefined && ${code})` : code;
    }
    _compileUnknownKeyErrors(cop: JitErrorsCompiler): string {
        const code = this.getJitChild()?.compileUnknownKeyErrors(cop) || '';
        if (!code) return '';
        return this.isOptional() ? `if (${cop.vλl} !== undefined) {${code}}` : code;
    }
    _compileStripUnknownKeys(cop: JitCompiler): string {
        const code = this.getJitChild()?.compileStripUnknownKeys(cop) || '';
        if (!code) return '';
        return this.isOptional() ? `if (${cop.vλl} !== undefined) {${code}}` : code;
    }
    _compileUnknownKeysToUndefined(cop: JitCompiler): string {
        const code = this.getJitChild()?.compileUnknownKeysToUndefined(cop) || '';
        if (!code) return '';
        return this.isOptional() ? `if (${cop.vλl} !== undefined) {${code}}` : code;
    }
    private _getJitConstants = memo((stack: BaseRunType[] = []): JitConstants => {
        if (stack.length > maxStackDepth) throw new Error(maxStackErrorMessage);
        const circularJitConstants = this.getCircularJitConstants(stack);
        if (circularJitConstants) return circularJitConstants;
        stack.push(this);
        const member = this.getMemberType();
        const memberValues = member.getJitConstants(stack);
        const optional = this.isOptional() ? '?' : '';
        const name = (this.src as any).name ?? this.src.kind;
        const jitCts: JitConstants = {
            ...memberValues,
            jitId: `${name}${optional}:${memberValues.jitId}`,
        };
        stack.pop();
        return jitCts;
    });
}
