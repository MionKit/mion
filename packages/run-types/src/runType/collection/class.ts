/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {TypeClass} from '@deepkit/type';
import {InterfaceMember, InterfaceRunType} from './interface';
import {JitCompiler} from '../../lib/jitFnCompiler';
import {jitUtils} from '@mionkit/core';
import {toLiteral} from '../../lib/utils';
import {isConstructor} from '../../lib/guards';
import {JitCode} from '../../types';

export class ClassRunType extends InterfaceRunType<TypeClass> {
    getClassName(): string {
        return this.src.classType.name;
    }
    isClassWithEmptyConstructor(): boolean {
        const children = this.getChildRunTypes() as InterfaceMember[];
        const isEmpty = children.every((prop) => !isConstructor(prop) || prop.getParameters().getChildRunTypes().length === 0);
        return isEmpty;
    }
    visitFromJsonVal(comp: JitCompiler): JitCode {
        const objJit = super.visitFromJsonVal(comp);
        const desFnVarName = `desFn${comp.getNestLevel(this)}`;
        const classLiteral = toLiteral(this.getClassName());
        const code = `
            ${objJit.code};
            let ${desFnVarName} = utl.${jitUtils.getDeserializeFn.name}(${classLiteral});
            if (${desFnVarName}) {${comp.vλl} = ${desFnVarName}(${comp.vλl})}
            else if (${desFnVarName} = utl.${jitUtils.getSerializeClass.name}(${classLiteral})) {${comp.vλl} = new ${desFnVarName}(${comp.vλl})}
        `;
        return {code, type: 'S'};
    }
}
