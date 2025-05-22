/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {TypeClass} from '@deepkit/type';
import {InterfaceMember, InterfaceRunType} from './interface';
import {JitCompiler} from '../../lib/jitCompiler';
import {jitUtils} from '@mionkit/core/src/jitUtils';
import {toLiteral} from '@mionkit/run-types/src/lib/utils';
import {isConstructor} from '@mionkit/run-types/src/lib/guards';

export class ClassRunType extends InterfaceRunType<TypeClass> {
    getClassName(): string {
        return this.src.classType.name;
    }
    isClassWithEmptyConstructor(): boolean {
        const children = this.getChildRunTypes() as InterfaceMember[];
        const isEmpty = children.every((prop) => !isConstructor(prop) || prop.getParameters().getChildRunTypes().length === 0);
        return isEmpty;
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _compileFromJsonVal(comp: JitCompiler) {
        const deserializeFn = jitUtils.getDeserializeFn(this.getClassName());
        const serializableClass = jitUtils.getSerializeClass(this.getClassName());

        if (deserializeFn) {
            const plainObjCode = super._compileFromJsonVal(comp);
            const classCode = `${comp.vλl} = utl.${jitUtils.useDeserializeFn.name}(${toLiteral(this.getClassName())})(${comp.vλl})`;
            if (plainObjCode) return `${plainObjCode} ${classCode}`;
            return classCode;
        }
        if (serializableClass) {
            const plainObjCode = super._compileFromJsonVal(comp);
            const classCode = `${comp.vλl} = new (utl.${jitUtils.useSerializeClass.name}(${toLiteral(this.getClassName())}))(${comp.vλl})`;
            if (plainObjCode) return `${plainObjCode} ${classCode}`;
            return classCode;
        }

        throw new Error(
            `Class ${this.getClassName()} can not be deserialized. Be sure to register a deserialize function first with jiUtils.${jitUtils.setDeserializeFn.name}`
        );
    }
}
