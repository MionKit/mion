/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {RunTypeError} from '../types';
import type {JitCompiler} from './jitCompiler';

export interface JitRunTypeValidator {
    name: string;
    _compileIsType: (comp: JitCompiler) => boolean;
    _compileTypeErrors: (comp: JitCompiler) => RunTypeError[];
}
export interface JitRunTypeTransformer {
    _compileFromJsonVal: (comp: JitCompiler) => string | undefined;
    _compileToJsonVal: (comp: JitCompiler) => string | undefined;
    _compileJsonStringify: (comp: JitCompiler) => string;
}
