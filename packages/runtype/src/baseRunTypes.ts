/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, Type} from './_deepkit/src/reflection/type';
import {buildJITFunctions} from './jitCompiler';
import {JITFunctionsData, RunType, RunTypeOptions, RunTypeVisitor, SrcType} from './types';

export abstract class BaseRunType<T extends Type, Opts extends RunTypeOptions = RunTypeOptions> implements RunType<Opts> {
    public abstract readonly slug: string;
    public abstract readonly isJsonEncodeRequired: boolean;
    public abstract readonly isJsonDecodeRequired: boolean;
    public abstract hasCircular: boolean;
    public readonly kind: ReflectionKind;
    public readonly nestLevel: number;

    constructor(
        visitor: RunTypeVisitor,
        public readonly src: T,
        readonly parents: RunType[],
        readonly opts: Opts
    ) {
        this.kind = src.kind;
        this.nestLevel = parents.length;
        // prevents infinite recursion when types have circular references, this should be assigned before any property type is resolved
        (src as SrcType)._runType = this;
    }

    abstract compileIsType(varName: string): string;
    abstract compileTypeErrors(varName: string, errorsName: string, pathChain: string): string;
    abstract compileJsonEncode(varName: string): string;
    abstract compileJsonDecode(varName: string): string;
    abstract compileJsonStringify(varName: string): string;
    abstract mock(...args: any[]): any;

    private _compiled: JITFunctionsData | undefined;
    get jitFunctions(): JITFunctionsData {
        if (this._compiled) return this._compiled;
        return (this._compiled = buildJITFunctions(this));
    }
}

export abstract class SingleRunType<T extends Type, Opts extends RunTypeOptions = RunTypeOptions> extends BaseRunType<T, Opts> {
    public isSingle = true;
    public hasCircular = false;
}
