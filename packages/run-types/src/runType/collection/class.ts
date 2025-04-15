/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {TypeClass} from '@deepkit/type';
import {InterfaceRunType, InterfaceMember} from './interface';
import {isConstructor} from '../../lib/guards';
import {JitCompiler} from '../../lib/jitCompiler';

export class ClassRunType extends InterfaceRunType<TypeClass> {
    getClassName(): string {
        return this.src.classType.name;
    }
    isSerializableClass(): boolean {
        const children = this.getChildRunTypes() as InterfaceMember[];
        return children.every((prop) => !isConstructor(prop) || prop.getParameters().getChildRunTypes().length === 0);
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _compileFromJsonVal(comp: JitCompiler): string {
        throw new Error(`Classes can not be deserialized.`);
    }
}
