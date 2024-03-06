/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeTuple} from '@deepkit/type';
import {RunType, RunTypeVisitor} from '../types';
import {addToPathChain, scapeQ} from '../utils';

export class TupleRunType implements RunType<TypeTuple> {
    public readonly name: string;
    public readonly shouldEncodeJson: boolean;
    public readonly shouldDecodeJson: boolean;
    public readonly runTypes: RunType[];
    constructor(
        public readonly src: TypeTuple,
        public readonly visitor: RunTypeVisitor,
        public readonly nestLevel: number
    ) {
        this.runTypes = src.types.map((t) => visitor(t, nestLevel));
        this.name = `Tuple<${this.runTypes.map((rt) => rt.name).join(', ')}>`;
        this.shouldEncodeJson = this.runTypes.some((rt) => rt.shouldEncodeJson);
        this.shouldDecodeJson = this.runTypes.some((rt) => rt.shouldDecodeJson);
    }
    getValidateCode(varName: string): string {
        return this.runTypes.map((rt, i) => `(${rt.getValidateCode(`${varName}[${i}]`)})`).join(' && ');
    }
    getValidateCodeWithErrors(varName: string, errorsName: string, pathChain: string): string {
        const itemsCode = this.runTypes
            .map((rt, i) => rt.getValidateCodeWithErrors(`${varName}[${i}]`, errorsName, addToPathChain(pathChain, i)))
            .join(';');
        return (
            `if (!Array.isArray(${varName})) ${errorsName}.push({path: ${pathChain}, message: 'Expected to be a ${scapeQ(this.name)}'});` +
            `else {${itemsCode}}`
        );
    }
    getJsonEncodeCode(varName: string): string {
        if (!this.shouldEncodeJson) return varName;
        const encodeCodes = this.runTypes.map((rt, i) => rt.getJsonEncodeCode(`${varName}[${i}]`));
        return `[${encodeCodes.join(', ')}]`;
    }
    getJsonDecodeCode(varName: string): string {
        if (!this.shouldDecodeJson) return varName;
        const decodeCodes = this.runTypes.map((rt, i) => rt.getJsonDecodeCode(`${varName}[${i}]`));
        return `[${decodeCodes.join(', ')}]`;
    }
    getMockCode(varName: string): string {
        const arrayName = `tupleList${this.nestLevel}`;
        const mockCodes = this.runTypes
            .map((rt, i) => {
                const itemName = `tupleIτεm${this.nestLevel}${i}`;
                return `let ${itemName}; ${rt.getMockCode(itemName)}; ${arrayName}[${i}] = ${itemName};`;
            })
            .join('');
        return `const ${arrayName} = []; ${mockCodes} ${varName} = ${arrayName};`;
    }
}
