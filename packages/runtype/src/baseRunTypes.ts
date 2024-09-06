/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {Type} from './_deepkit/src/reflection/type';
import type {JITFunctionsData, RunType, RunTypeOptions, RunTypeVisitor, SrcType} from './types';
import {buildJITFunctions} from './jitCompiler';
import {hasCircularParents} from './utils';
import {isCollectionRunType} from './guards';

export abstract class BaseRunType<T extends Type, Opts extends RunTypeOptions = RunTypeOptions> implements RunType<Opts> {
    public abstract readonly isJsonEncodeRequired: boolean;
    public abstract readonly isJsonDecodeRequired: boolean;
    public abstract readonly jitId: number | string;

    constructor(
        visitor: RunTypeVisitor,
        public readonly src: T,
        readonly parents: RunType[],
        readonly opts: Opts
    ) {
        // prevents infinite recursion when types have circular references, this should be assigned before any property type is resolved
        (src as SrcType)._runType = this;
    }

    abstract compileIsType(parents: RunType[], varName: string): string;
    abstract compileTypeErrors(parents: RunType[], varName: string, pathC: (string | number)[]): string;
    abstract compileJsonEncode(parents: RunType[], varName: string): string;
    abstract compileJsonDecode(parents: RunType[], varName: string): string;
    abstract compileJsonStringify(parents: RunType[], varName: string): string;
    abstract mock(...args: any[]): any;

    private _compiledJitFunctions: JITFunctionsData | undefined;
    get jitFunctions(): JITFunctionsData {
        if (this._compiledJitFunctions) return this._compiledJitFunctions;
        return (this._compiledJitFunctions = buildJITFunctions(this));
    }

    private _typeName: string | undefined;
    getName() {
        if (this._typeName) return this._typeName;
        return (this._typeName = this.constructor.name.toLowerCase().replace('runtype', ''));
    }
}

/**
 * RunType that is atomic an does not contains any other child runTypes.
 * ie: string, number, boolean, any, null, undefined, void, never, bigint, etc.
 * */
export abstract class AtomicRunType<T extends Type, Opts extends RunTypeOptions = RunTypeOptions> extends BaseRunType<T, Opts> {
    public readonly isAtomic = true;

    get jitId(): number {
        return this.src.kind;
    }

    constructor(
        visitor: RunTypeVisitor,
        public readonly src: T,
        readonly parents: RunType[],
        readonly opts: Opts
    ) {
        super(visitor, src, parents, opts);
    }
}

/**
 * RunType that contains a collection or child runTypes.
 * Collection RunTypes are the only ones that can have circular references. as a child of a collection RunType can be the parent of the collection RunType.
 * i.e: interface, child runTypes are it's properties
 * i.e: tuple, it's child runTypes are the tuple members
 */
export abstract class CollectionRunType<T extends Type, Opts extends RunTypeOptions = RunTypeOptions> extends BaseRunType<
    T,
    Opts
> {
    /** Child RunTypes, only serializable RunTypes are included here, ie functions and other non serializable properties are not included */
    public abstract readonly childRunTypes: RunType[];
    public abstract readonly jitId: string;
    public readonly isCircularRef = false;

    constructor(
        visitor: RunTypeVisitor,
        public readonly src: T,
        readonly parents: RunType[],
        readonly opts: Opts
    ) {
        super(visitor, src, parents, opts);
    }

    protected getJitId(parents: RunType[]): string {
        if (hasCircularParents(this, parents)) return `(${this.src.kind})`;
        parents.push(this);
        const childJitIds = this.childRunTypes.map((c) => (isCollectionRunType(c) ? c.getJitId(parents) : c.jitId));
        const jitId = `${this.src.kind}${childJitIds}`;
        parents.pop();
        return jitId;
    }

    /**
     * jit code to check the type a Collection.
     * ie: is a collection type is an array of string string[] then compileCollectionType generates jit code to check if the value is an array.
     * if a collection type is an object with properties, then compileCollectionType generates jit code to check if the value is an object.
     * this is used for the union type where we need to check a value against multiple types.
     */
    abstract compileCollectionIsType(parents: RunType[], varName: string): string;
}

/**
 * RunType that contains a single member or child RunType. usually part of a collection RunType.
 * i.e object properties, {prop: memberType} where memberType is the child RunType
 */
export abstract class MemberRunType<T extends Type, Opts extends RunTypeOptions = RunTypeOptions> extends BaseRunType<T, Opts> {
    public abstract readonly memberType: RunType;
    public abstract readonly memberName: string | number | symbol;
    public abstract readonly jitId: string;
}
