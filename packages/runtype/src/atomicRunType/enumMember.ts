/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeEnum} from '../_deepkit/src/reflection/type';
import {AtomicRunType} from '../baseRunTypes';
import {JitConstants} from '../types';

const jitConstants: JitConstants = {
    skipJit: true,
    skipJsonEncode: true,
    skipJsonDecode: true,
    isCircularRef: false,
    jitId: ReflectionKind.enumMember,
};

// TODO: not sure when run type will be generated but doesn't seem to be used when using reflection on enums
export class EnumMemberRunType extends AtomicRunType<TypeEnum> {
    src: TypeEnum = null as any; // will be set after construction
    constants = () => jitConstants;
    getName(): string {
        return 'enum';
    }
    _compileIsType(): string {
        throw new Error('Enum member operations are not supported');
    }
    _compileTypeErrors(): string {
        throw new Error('Enum member operations are not supported');
    }
    _compileJsonEncode(): string {
        throw new Error('Enum member operations are not supported');
    }
    _compileJsonDecode(): string {
        throw new Error('Enum member operations are not supported');
    }
    _compileJsonStringify(): string {
        throw new Error('Enum member operations are not supported');
    }
    mock() {
        throw new Error('Enum member operations are not supported');
    }
}
