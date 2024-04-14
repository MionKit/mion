/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, Type} from './_deepkit/src/reflection/type';
import {JITCompiler} from './jitCompiler';
import {JITFunctions, RunType, RunTypeOptions, RunTypeVisitor, SrcType} from './types';

export abstract class BaseRunType<T extends Type, Opts extends RunTypeOptions = RunTypeOptions> implements RunType<Opts> {
    public abstract readonly name: string;
    public abstract readonly isJsonEncodeRequired: boolean;
    public abstract readonly isJsonDecodeRequired: boolean;
    public readonly kind: ReflectionKind;

    constructor(
        visitor: RunTypeVisitor,
        public readonly src: T,
        public readonly nestLevel: number,
        public readonly opts: Opts
    ) {
        this.kind = src.kind;
        (src as SrcType)._runType = this; // prevents infinite recursion when types have circular references
    }

    abstract JIT_isType(varName: string): string;
    abstract JIT_typeErrors(varName: string, errorsName: string, pathChain: string): string;
    abstract JIT_jsonEncode(varName: string): string;
    abstract JIT_jsonDecode(varName: string): string;
    abstract JIT_jsonStringify(varName: string): string;
    abstract mock(...args: any[]): any;

    private _compiled: JITFunctions | undefined;
    get jitFunctions(): JITFunctions {
        if (this._compiled) return this._compiled;
        return (this._compiled = new JITCompiler(this));
    }
}
