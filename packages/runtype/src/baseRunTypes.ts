/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {Type} from './_deepkit/src/reflection/type';
import {buildJITFunctions} from './jitCompiler';
import {JitErrorPath, JITFunctionsData, RunType, RunTypeOptions, RunTypeVisitor, SrcType} from './types';

export abstract class BaseRunType<T extends Type, Opts extends RunTypeOptions = RunTypeOptions> implements RunType<Opts> {
    public abstract readonly isJsonEncodeRequired: boolean;
    public abstract readonly isJsonDecodeRequired: boolean;
    public abstract hasCircular: boolean;
    public readonly nestLevel: number;

    constructor(
        visitor: RunTypeVisitor,
        public readonly src: T,
        readonly parents: RunType[],
        readonly opts: Opts
    ) {
        this.nestLevel = parents.length;
        // prevents infinite recursion when types have circular references, this should be assigned before any property type is resolved
        (src as SrcType)._runType = this;
    }

    abstract compileIsType(varName: string): string;
    abstract compileTypeErrors(varName: string, errorsName: string, pathChain: JitErrorPath): string;
    abstract compileJsonEncode(varName: string): string;
    abstract compileJsonDecode(varName: string): string;
    abstract compileJsonStringify(varName: string): string;
    abstract mock(...args: any[]): any;
    abstract getJitId(): string | number;

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
    public readonly hasCircular = false;

    getJitId(): number | string {
        return this.src.kind;
    }
}
