/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeTuple} from '@deepkit/type';
import {RunType, RunTypeVisitor} from '../types';
import {addToPathChain, toLiteral} from '../utils';

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
        this.name = `tuple<${this.runTypes.map((rt) => rt.name).join(', ')}>`;
        this.shouldEncodeJson = this.runTypes.some((rt) => rt.shouldEncodeJson);
        this.shouldDecodeJson = this.runTypes.some((rt) => rt.shouldDecodeJson);
    }
    isTypeJIT(varName: string): string {
        return this.runTypes.map((rt, i) => `(${rt.isTypeJIT(`${varName}[${i}]`)})`).join(' && ');
    }
    typeErrorsJIT(varName: string, errorsName: string, pathChain: string): string {
        const itemsCode = this.runTypes
            .map((rt, i) => rt.typeErrorsJIT(`${varName}[${i}]`, errorsName, addToPathChain(pathChain, i)))
            .join(';');
        return (
            `if (!Array.isArray(${varName})) ${errorsName}.push({path: ${pathChain}, expected: ${toLiteral(this.name)}});` +
            `else {${itemsCode}}`
        );
    }
    jsonEncodeJIT(varName: string): string {
        if (!this.shouldEncodeJson) return varName;
        const encodeCodes = this.runTypes.map((rt, i) => rt.jsonEncodeJIT(`${varName}[${i}]`));
        return `[${encodeCodes.join(', ')}]`;
    }
    jsonStringifyJIT(varName: string): string {
        const encodeCodes = this.runTypes.map((rt, i) => rt.jsonStringifyJIT(`${varName}[${i}]`));
        return `[${encodeCodes.join(', ')}]`;
    }
    jsonDecodeJIT(varName: string): string {
        if (!this.shouldDecodeJson) return varName;
        const decodeCodes = this.runTypes.map((rt, i) => rt.jsonDecodeJIT(`${varName}[${i}]`));
        return `[${decodeCodes.join(', ')}]`;
    }
    mockJIT(varName: string): string {
        const arrayName = `tupleList${this.nestLevel}`;
        const mockCodes = this.runTypes.map((rt, i) => `${rt.mockJIT(`${arrayName}[${i}]`)};`).join('');
        return `const ${arrayName} = []; ${mockCodes} ${varName} = ${arrayName};`;
    }
}
