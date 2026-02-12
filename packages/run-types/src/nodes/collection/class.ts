/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {TypeClass} from '@deepkit/type';
import {InterfaceMember, InterfaceRunType} from './interface.ts';
import {JitFnCompiler} from '../../lib/jitFnCompiler.ts';
import {getJitUtils} from '@mionkit/core';
import {toLiteral} from '../../lib/utils.ts';
import {isConstructor} from '../../lib/guards.ts';
import {JitCode} from '../../types.ts';

export class ClassRunType extends InterfaceRunType<TypeClass> {
    getClassName(): string {
        return this.src.classType.name;
    }
    isClassWithEmptyConstructor(): boolean {
        const children = this.getChildRunTypes() as InterfaceMember[];
        const isEmpty = children.every((prop) => !isConstructor(prop) || prop.getParameters().getChildRunTypes().length === 0);
        return isEmpty;
    }
    emitRestoreFromJson(comp: JitFnCompiler): JitCode {
        const objJit = super.emitRestoreFromJson(comp);
        const desFnVarName = comp.getLocalVarName('desFn', this);
        const classLiteral = toLiteral(this.getClassName());
        const code = `
            ${objJit.code};
            let ${desFnVarName} = utl.${getJitUtils().getDeserializeFn.name}(${classLiteral});
            if (${desFnVarName}) {${comp.vλl} = ${desFnVarName}(${comp.vλl})}
            else if (${desFnVarName} = utl.${getJitUtils().getSerializeClass.name}(${classLiteral})) {${comp.vλl} = new ${desFnVarName}(${comp.vλl})}
        `;
        return {code, type: 'S'};
    }
}
