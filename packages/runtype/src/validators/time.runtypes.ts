/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {BaseRunType} from '../lib/baseRunTypes';
import type {JitCompiler, JitErrorsCompiler} from '../lib/jitCompiler';
import {JitRunTypeValidator} from '../lib/formats';
import {ReflectionKind} from '../lib/_deepkit/src/reflection/type';
import {TypeFormat} from '../lib/formats.runtypes';
import {MockOperation} from '../types';

export type StringTime = TypeFormat<string, 'time', any>;

// Time validator
export class TimeValidator extends JitRunTypeValidator {
    static id = 'time';
    kind = ReflectionKind.string;
    name = TimeValidator.id;
    _compileIsType(comp: JitCompiler, rt: BaseRunType): string {
        return `// TODO: ${comp.vλl} ${rt.getKindName()}`;
    }
    _compileTypeErrors(comp: JitErrorsCompiler, rt: BaseRunType): string {
        // TODO: Implement time validation error logic
        return `if (!(${this._compileIsType(comp, rt)})) ${comp.callJitErr('string', {format: this.name, typeName: rt.src.typeName})}`;
    }
    _mock(mockContext: MockOperation, rt: BaseRunType) {
        // TODO
        return {value: rt.getKindName()};
    }
}
