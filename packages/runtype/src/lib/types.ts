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
    /**
     * Compiles extra IsType code.
     * Generated code must be of an expression type and does not contain return.
     * Otherwise compilation will fail!
     * */
    _compileIsType: (comp: JitCompiler, rt: BaseRunType) => string;
    /**
     * Compiles extra typeErrors code.
     * Generated code must be of an code block type and does not contain return.
     * Otherwise compilation will fail!
     * */
    _compileTypeErrors: (comp: JitErrorsCompiler, rt: BaseRunType) => string;
}
export interface JitRunTypeFormatter {
    kind: ReflectionKind;
    name: string;
    /**
     * Compiles extra FromJsonVal code.
     * Generated code must be of an code block type and does not contain return.
     * Otherwise compilation will fail!
     * */
    _compileFromJsonVal: (comp: JitCompiler, rt: BaseRunType) => string | undefined;
    /**
     * Compiles extra toJsonVal code.
     * Generated code must be of an code block type and does not contain return.
     * Otherwise compilation will fail!
     * */
    _compileToJsonVal: (comp: JitCompiler, rt: BaseRunType) => string | undefined;
    /**
     * Compiles extra toJsonStringify code.
     * Generated code must be of an expression type and does not contain return.
     * Otherwise compilation will fail!
     * */
    _compileJsonStringify: (comp: JitCompiler, rt: BaseRunType) => string;
}
