/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {TypeClass} from '../_deepkit/src/reflection/type';
import {MockContext} from '../types';
import {InterfaceRunType, InterfaceMember} from './interface';
import {isConstructor} from '../guards';

export class ClassRunType extends InterfaceRunType<TypeClass> {
    getClassName(): string {
        return this.src.classType.name;
    }
    isSerializableClass(): boolean {
        const children = this.getChildRunTypes() as InterfaceMember[];
        return children.every((prop) => !isConstructor(prop) || prop.getParameters().getTotalParams() === 0);
    }
    _compileJsonDecode(): string {
        throw new Error(`Classes can not be deserialized.`);
    }
    mock(cop?: MockContext): Record<string | number, any> {
        const isSerializable = this.isSerializableClass();
        if (!isSerializable) {
            console.warn(
                `Class ${this.getClassName()} can not be mocked. Only classes with and empty constructor can be mocked.`
            );
        }
        const nextOp: MockContext = {...cop, parentObj: new this.src.classType()};
        return super.mock(nextOp);
    }
}
