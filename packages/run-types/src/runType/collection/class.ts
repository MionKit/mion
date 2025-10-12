/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {TypeClass} from '@deepkit/type';
import {InterfaceMember, InterfaceRunType} from './interface';
import {JitCompiler} from '../../lib/jitCompiler';
import {jitUtils} from '@mionkit/core';
import {toLiteral} from '../../lib/utils';
import {isConstructor} from '../../lib/guards';

export class ClassRunType extends InterfaceRunType<TypeClass> {
    getClassName(): string {
        return this.src.classType.name;
    }
    isClassWithEmptyConstructor(): boolean {
        const children = this.getChildRunTypes() as InterfaceMember[];
        const isEmpty = children.every((prop) => !isConstructor(prop) || prop.getParameters().getChildRunTypes().length === 0);
        return isEmpty;
    }
    _compileFromJsonVal(comp: JitCompiler) {
        const plainObjCode = super._compileFromJsonVal(comp);
        const desFnVarName = `desFn${comp.getNestLevel(this)}`;
        const desFnInit = `let ${desFnVarName} = utl.${jitUtils.getDeserializeFn.name}(${toLiteral(this.getClassName())})`;
        const desFnCode = `if (${desFnVarName}) {${comp.vλl} = ${desFnVarName}(${comp.vλl})}`;
        const desClassCode = `else if (${desFnVarName} = utl.${jitUtils.getSerializeClass.name}(${toLiteral(this.getClassName())})) {${comp.vλl} = new ${desFnVarName}(${comp.vλl})}`;
        return `${plainObjCode};${desFnInit};${desFnCode} ${desClassCode}`;
    }
}
