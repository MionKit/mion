/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {BaseRunType} from '../lib/baseRunTypes';
import type {JitCompiler, JitErrorsCompiler} from '../lib/jitCompiler';
import {JitRunTypeValidator} from '../lib/jitFormatters';
import {ReflectionKind} from '../lib/_deepkit/src/reflection/type';
import {TypeFormat} from '../lib/formats.runtype';
import {MockOperation} from '../types';

export const IpParams = {} as const;
export const IpV4Params = {version: 4} as const;
export const IpV6Params = {version: 6} as const;

export type IpValidatorParams = {version?: 4 | 6};
export type IP = TypeFormat<string, 'ip', typeof IpParams>;
export type IPV4 = TypeFormat<string, 'ip', typeof IpV4Params>;
export type IPV6 = TypeFormat<string, 'ip', typeof IpV6Params>;

// IP validator
export class IPValidator extends JitRunTypeValidator {
    static id = 'ip';
    kind = ReflectionKind.string;
    name = IPValidator.id;
    _compileIsType(comp: JitCompiler, rt: BaseRunType): string {
        return `// TODO: ${comp.vλl} ${rt.getKindName()}`;
    }
    _compileTypeErrors(comp: JitErrorsCompiler, rt: BaseRunType): string {
        // TODO: Implement IP validation error logic
        return `if (!(${this._compileIsType(comp, rt)})) ${comp.callJitErr('string', {format: this.name, typeName: rt.src.typeName})}`;
    }
    _mock(mockContext: MockOperation, rt: BaseRunType) {
        // TODO
        return {value: rt.getKindName()};
    }
    validateParams() {}
}
