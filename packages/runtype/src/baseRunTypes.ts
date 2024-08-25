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
    abstract compileTypeErrors(parents: RunType[], varName: string): string;
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

export abstract class SingleRunType<T extends Type, Opts extends RunTypeOptions = RunTypeOptions> extends BaseRunType<T, Opts> {
    public readonly isSingle = true;
    public readonly jitId: number;

    constructor(
        visitor: RunTypeVisitor,
        public readonly src: T,
        readonly parents: RunType[],
        readonly opts: Opts
    ) {
        super(visitor, src, parents, opts);
        this.jitId = this.src.kind;
    }
}

export abstract class CollectionRunType<T extends Type, Opts extends RunTypeOptions = RunTypeOptions> extends BaseRunType<
    T,
    Opts
> {
    /** Child RunTypes, only serializable RunTypes are included here, ie functions and other non serializable properties are not included */
    public abstract readonly childRunTypes: RunType[];
    public abstract readonly jitId: string;
    public readonly isCircular = false;

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
}
