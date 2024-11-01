/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type Type} from './_deepkit/src/reflection/type';
import type {MockContext, RunType, DKwithRT, JitConstants, Mutable, RunTypeChildAccessor, CodeUnit, JitFnID} from './types';
import {getPropIndex, memo} from './utils';
import {maxStackDepth, maxStackErrorMessage} from './constants';
import {
    JitTypeErrorCompileOperation,
    jitIsTypeCompileOperation,
    JitJsonEncodeCompileOperation,
    JitJsonStringifyCompileOperation,
    JitJsonDecodeCompileOperation,
    JitCompileOperation,
} from './jitCompiler';
import {getReflectionName} from './reflectionNames';

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

    // ########## Compile Methods ##########

    /* BaseRunType is in charge of handling circular refs, return values, create subprograms, etc.
     * While the child class will only contain the logic to generate the code. */
    abstract _compileIsType(cop: jitIsTypeCompileOperation): string;
    abstract _compileTypeErrors(cop: JitTypeErrorCompileOperation): string;
    abstract _compileJsonEncode(cop: JitJsonEncodeCompileOperation): string;
    abstract _compileJsonDecode(cop: JitJsonDecodeCompileOperation): string;
    abstract _compileJsonStringify(cop: JitJsonStringifyCompileOperation): string;

    /**
     * JIT code validation code
     * should not include anything that is purely the validation of the type, ie function wrappers.
     * this code should not use return statements, it should be a single line of code that evaluates to a boolean
     * this code should not contain any sentence breaks or semicolons.
     * ie: compileIsType = () => `typeof vλl === 'string'`
     */
    compileIsType(cop: jitIsTypeCompileOperation): string {
        let code: string | undefined = cop.getCodeFromCache();
        if (code) return code;
        cop.pushStack(this);
        if (cop.shouldCreateDependency()) {
            const newCompileOp = new jitIsTypeCompileOperation(this);
            this.compileIsType(newCompileOp);
            cop.addDependency(newCompileOp);
            code = cop.getDependencyCallCode();
        } else if (cop.shouldCallDependency()) {
            code = cop.getDependencyCallCode();
        } else {
            code = this._compileIsType(cop);
            code = this.handleReturnValues(code, cop);
        }
        cop.popStack(code);
        return code;
    }

    /**
     * JIT code Validation + error info
     * Similar to validation code but instead of returning a boolean it should assign an error message to the errorsName
     * This is an executable code block and can contain multiple lines or semicolons
     * ie:  validateCodeWithErrors = () => `if (typeof vλl !== 'string') ${cop.args.εrr} = 'Expected to be a String';`
     * path is a string that represents the path to the property being validated.
     * path is calculated at runtime so is an expression like 'path1' + '/' + 'path2' + '/' + 'path3'
     */
    compileTypeErrors(cop: JitTypeErrorCompileOperation): string {
        let code: string | undefined = cop.getCodeFromCache();
        if (code) return code;
        cop.pushStack(this);
        if (cop.shouldCreateDependency()) {
            const newCompileOp = new JitTypeErrorCompileOperation(this);
            this.compileTypeErrors(newCompileOp);
            cop.addDependency(newCompileOp);
            code = cop.getDependencyCallCode();
        } else if (cop.shouldCallDependency()) {
            const pathArgs = cop.getStackStaticPathArgs();
            const pathLength = cop.getStaticPathLength();
            // increase and decrease the static path before and after calling the circular function
            code = `${cop.args.pλth}.push(${pathArgs}); ${cop.getDependencyCallCode()}; ${cop.args.pλth}.splice(-${pathLength});`;
        } else {
            code = this._compileTypeErrors(cop);
            code = this.handleReturnValues(code, cop);
        }
        cop.popStack(code);
        return code;
    }

    /**
     * JIT code to transform from type to an object that can be serialized using json
     * this code should not use return statements, it should be a single line of code that evaluates to a json compatible type.
     * this code should not contain any sentence breaks or semicolons.
     * ie for bigIng: compileJsonEncode = () => `vλl.toString()`
     * */
    compileJsonEncode(cop: JitJsonEncodeCompileOperation): string {
        let code: string | undefined = cop.getCodeFromCache();
        if (code) return code;
        cop.pushStack(this);
        if (cop.shouldCreateDependency()) {
            const newCompileOp = new JitJsonEncodeCompileOperation(this);
            this.compileJsonEncode(newCompileOp);
            cop.addDependency(newCompileOp);
            code = cop.getDependencyCallCode();
        } else if (cop.shouldCallDependency()) {
            code = cop.getDependencyCallCode();
        } else {
            code = this._compileJsonEncode(cop);
            code = this.handleReturnValues(code, cop);
        }
        cop.popStack(code);
        return code;
    }

    /**
     * JIT code to transform from json to type so type can be deserialized from json
     * this code should not use return statements, it should be a single line that receives a json compatible type and returns a deserialized value.
     * this code should not contain any sentence breaks or semicolons.
     * ie for bigIng: compileJsonDecode = () => `BigInt(vλl)`
     *
     * For security reason decoding ignores any properties that are not defined in the type.
     * So is your type is {name: string} and the json is {name: string, age: number} the age property will be ignored.
     * */
    compileJsonDecode(cop: JitJsonDecodeCompileOperation): string {
        let code: string | undefined = cop.getCodeFromCache();
        if (code) return code;
        cop.pushStack(this);
        if (cop.shouldCreateDependency()) {
            const newCompileOp = new JitJsonDecodeCompileOperation(this);
            this.compileJsonDecode(newCompileOp);
            cop.addDependency(newCompileOp);
            code = cop.getDependencyCallCode();
        } else if (cop.shouldCallDependency()) {
            code = cop.getDependencyCallCode();
        } else {
            code = this._compileJsonDecode(cop);
            code = this.handleReturnValues(code, cop);
        }
        cop.popStack(code);
        return code;
    }

    /**
     * JIT code to transform a type directly into s json string.
     * when serializing to json normally we need first to prepare the object using compileJsonEncode and then JSON.stringify().
     * this code directly outputs the json string and saves traversing the type twice
     * stringify is always strict
     */
    compileJsonStringify(cop: JitJsonStringifyCompileOperation): string {
        let code: string | undefined = cop.getCodeFromCache();
        if (code) return code;
        cop.pushStack(this);
        if (cop.shouldCreateDependency()) {
            const newCompileOp = new JitJsonStringifyCompileOperation(this);
            this.compileJsonStringify(newCompileOp);
            cop.addDependency(newCompileOp);
            code = cop.getDependencyCallCode();
        } else if (cop.shouldCallDependency()) {
            code = cop.getDependencyCallCode();
        } else {
            code = this._compileJsonStringify(cop);
            code = this.handleReturnValues(code, cop);
        }
        cop.popStack(code);
        return code;
    }

    private handleReturnValues(code: string, cop: JitCompileOperation<any, any>): string {
        const rt = cop.getCurrentStackItem()?.rt;
        if (!rt) throw new Error('No current stack item');
        const codeHasReturn: boolean = this.jitFnHasReturn(cop.opId);
        const codeUnit: CodeUnit = this.jitFnCodeUnit(cop.opId);
        if (cop.length === 1) {
            switch (codeUnit) {
                case 'EXPRESSION':
                    return codeHasReturn ? code : `return (${code});`;
                case 'BLOCK':
                    // if code is a block and does not have return, we need to make sure
                    const lastChar = code.length - 1; // eslint-disable-line no-case-declarations
                    const hasFullStop = code.lastIndexOf(';') === lastChar || code.lastIndexOf('}') === lastChar; // eslint-disable-line no-case-declarations
                    const stopChar = hasFullStop ? '' : ';'; // eslint-disable-line no-case-declarations
                    return codeHasReturn ? code : `${code}${stopChar}return ${cop.returnName}`;
                case 'STATEMENT':
                    // statements can be returned directly
                    return codeHasReturn ? code : `return ${cop.returnName}`;
            }
        }

        switch (codeUnit) {
            case 'EXPRESSION':
                // if code should be an expression, but code has return a statement, we need to wrap it in a self invoking function to avoid syntax errors
                // TODO: we could create a new function and cache instead a self invoking function a performance is same but code is not repeated
                return codeHasReturn ? `(function(){${code}})()` : code;
            default:
                // if code is an statement or block we don't need to do anything as code can be inlined as it is
                return code;
        }
    }

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

    // ########## Return flags ##########
    // any child with different settings should override these methods
    // these flags are used to determine if the compiled code should be wrapped in a self invoking function or not
    // or if the compiled code should contain a return statement or not
    // all atomic types should have these same flags (code should never have a return statement)
    jitFnHasReturn(copId: JitFnID): boolean {
        switch (copId) {
            case 'isType':
                return false;
            case 'typeErrors':
                return false;
            case 'jsonEncode':
                return false;
            case 'jsonDecode':
                return false;
            case 'jsonStringify':
                return false;
            case 'getUnknownKeys':
                return false;
            case 'hasUnknownKeys':
                return false;
            case 'stripUnknownKeys':
                return false;
            case 'unknownKeysToUndefined':
                return false;
            default:
                throw new Error(`Unknown compile operation: ${copId}`);
        }
    }

    jitFnCodeUnit(copId: JitFnID): CodeUnit {
        switch (copId) {
            case 'isType':
                return 'EXPRESSION';
            case 'typeErrors':
                return 'BLOCK';
            case 'jsonEncode':
                return 'STATEMENT';
            case 'jsonDecode':
                return 'STATEMENT';
            case 'jsonStringify':
                return 'EXPRESSION';
            case 'getUnknownKeys':
                return 'BLOCK';
            case 'hasUnknownKeys':
                return 'EXPRESSION';
            case 'stripUnknownKeys':
                return 'BLOCK';
            case 'unknownKeysToUndefined':
                return 'BLOCK';
            default:
                throw new Error(`Unknown compile operation: ${copId}`);
        }
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
