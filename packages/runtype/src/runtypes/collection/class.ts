/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {TypeClass} from '../../lib/_deepkit/src/reflection/type';
import {MockOperation} from '../../types';
import {InterfaceRunType, InterfaceMember} from './interface';
import {isConstructor} from '../../lib/guards';
import {PropertyRunType} from '../member/property';
import {IndexSignatureRunType} from '../member/indexProperty';
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
    _compileJsonDecode(comp: JitCompiler): string {
        throw new Error(`Classes can not be deserialized.`);
    }
    _mock(ctx: MockOperation): Record<string | number, any> {
        const isSerializable = this.isSerializableClass();
        if (!isSerializable) {
            throw new Error(
                `Class ${this.getClassName()} can not be mocked. Only classes with and empty constructor can be mocked.`
            );
        }
        const instance = new this.src.classType();
        // only properties that are used in jit operations are mocked, there properties should be initialized in the constructor
        this.getJitChildren().forEach((prop) => {
            const name = (prop as PropertyRunType).getChildVarName();
            if (prop instanceof IndexSignatureRunType) prop.mock(ctx);
            else instance[name] = prop.mock(ctx as MockOperation);
        });
        return instance;
    }
}
