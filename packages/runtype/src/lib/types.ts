/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {ReflectionKind} from './_deepkit/src/reflection/type';
import type {BaseRunType} from './baseRunTypes';
import type {JitCompiler, JitErrorsCompiler} from './jitCompiler';

export interface JitRunTypeValidator {
    kind: ReflectionKind;
    name: string;
    _compileIsType: (comp: JitCompiler, rt: BaseRunType) => string;
    _compileTypeErrors: (comp: JitErrorsCompiler, rt: BaseRunType) => string;
}
export interface JitRunTypeTransformer {
    kind: ReflectionKind;
    name: string;
    _compileFromJsonVal: (comp: JitCompiler, rt: BaseRunType) => string | undefined;
    _compileToJsonVal: (comp: JitCompiler, rt: BaseRunType) => string | undefined;
    _compileJsonStringify: (comp: JitCompiler, rt: BaseRunType) => string;
}
