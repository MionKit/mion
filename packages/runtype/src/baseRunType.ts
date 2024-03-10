/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {Type} from './_deepkit/src/reflection/type';
import {JITCompiler} from './jitCompiler';
import {CompiledFunctions, RunType, RunTypeOptions, RunTypeVisitor} from './types';

export abstract class BaseRunType<T extends Type, Opts extends RunTypeOptions = RunTypeOptions> implements RunType<T, Opts> {
    public abstract readonly name: string;
    public abstract readonly isJsonEncodeRequired: boolean;
    public abstract readonly isJsonDecodeRequired: boolean;

    constructor(
        visitor: RunTypeVisitor,
        public readonly src: T,
        public readonly nestLevel: number,
        public readonly opts: Opts
    ) {}

    abstract JIT_isType(varName: string): string;
    abstract JIT_typeErrors(varName: string, errorsName: string, pathChain: string): string;
    abstract JIT_jsonEncode(varName: string): string;
    abstract JIT_jsonDecode(varName: string): string;
    abstract JIT_jsonStringify(varName: string): string;
    abstract mock(...args: any[]): any;

    private _compiled: CompiledFunctions | undefined;
    get compiled(): CompiledFunctions {
        if (this._compiled) return this._compiled;
        return (this._compiled = new JITCompiler(this));
    }
}
