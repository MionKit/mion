/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {TypeRest} from '@deepkit/type';
import type {JitCompiler} from '../../lib/jitCompiler';
import type {ParameterRunType} from './param';
import type {TupleMemberRunType} from './tupleMember';
import {ArrayRunType} from './array';

export class RestParamsRunType extends ArrayRunType<TypeRest> {
    getChildIndex(): number {
        const parent = this.getParent() as ParameterRunType | TupleMemberRunType;
        return parent.getChildIndex();
    }
    startIndex(): number {
        return this.getChildIndex();
    }
    _compileJsonStringify(comp: JitCompiler): string {
        let itemCode = this.getJitChild()?.compileJsonStringify(comp);
        if (!itemCode) itemCode = 'JSON.stringify(' + comp.getChildVλl() + ')';
        const arrName = `res${this.getNestLevel()}`;
        const itemName = `its${this.getNestLevel()}`;
        const index = this.getChildVarName();
        const isFist = this.getChildIndex() === 0;
        const sep = isFist ? '' : `','+`;
        return `
            const ${arrName} = [];
            for (let ${index} = ${this.getChildIndex()}; ${index} < ${comp.vλl}.length; ${index}++) {
                const ${itemName} = ${itemCode};
                if(${itemName}) ${arrName}.push(${itemName});
            }
            if (!${arrName}.length) {return '';}
            else {return ${sep}${arrName}.join(',')}
        `;
    }
}
