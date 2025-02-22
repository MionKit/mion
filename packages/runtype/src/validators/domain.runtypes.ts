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
import {MockOperation} from '../types';
import {TypeFormat} from '../lib/formats.runtypes';

export type DomainParams = {
    maxLength?: number;
    allowedChars?: string;
    disallowedChars?: string;
    disabledNames?: string[];
    disabledTLDs?: string[];
};

export type Domain<P extends DomainParams> = TypeFormat<string, 'domain', P>;

// Domain validator
export class DomainValidator extends JitRunTypeValidator<DomainParams> {
    static id = 'domain';
    kind = ReflectionKind.string;
    name = DomainValidator.id;
    _compileIsType(comp: JitCompiler, rt: BaseRunType): string {
        return `// TODO: ${comp.vλl} ${rt.getKindName()}`;
    }
    _compileTypeErrors(comp: JitErrorsCompiler, rt: BaseRunType): string {
        // TODO: Implement domain validation error logic
        return `if (!(${this._compileIsType(comp, rt)})) ${comp.callJitErr('string', {format: this.name, typeName: rt.src.typeName})}`;
    }
    _mock(mockContext: MockOperation, rt: BaseRunType) {
        // TODO
        return {value: rt.getKindName()};
    }
}
