/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeEnum} from '../../lib/_deepkit/src/reflection/type';
import {AtomicRunType} from '../../lib/baseRunTypes';
import {JitConfig} from '../../types';

const jitConstants: JitConfig = {
    skipJit: true,
    jitId: ReflectionKind.enumMember,
};

// TODO: not sure when run type will be generated but doesn't seem to be used when using reflection on enums
export class EnumMemberRunType extends AtomicRunType<TypeEnum> {
    getJitConfig = () => jitConstants;
    _compileIsType(): string {
        throw new Error('Enum member operations are not supported');
    }
    _compileTypeErrors(): string {
        throw new Error('Enum member operations are not supported');
    }
    _compileToJsonVal(): string {
        throw new Error('Enum member operations are not supported');
    }
    _compileFromJsonVal(): string {
        throw new Error('Enum member operations are not supported');
    }
    _compileJsonStringify(): string {
        throw new Error('Enum member operations are not supported');
    }
    _mock() {
        throw new Error('Enum member operations are not supported');
    }
}
