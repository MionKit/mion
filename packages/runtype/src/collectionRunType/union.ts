/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeUnion} from '@deepkit/type';
import {RunType, RunTypeVisitor} from '../types';
import {toLiteral} from '../utils';

export class UnionRunType implements RunType<TypeUnion> {
    public readonly name: string;
    public readonly shouldEncodeJson: boolean;
    public readonly shouldDecodeJson: boolean;
    public readonly runTypes: RunType[];
    constructor(
        public readonly src: TypeUnion,
        public readonly visitor: RunTypeVisitor,
        public readonly nestLevel: number
    ) {
        this.runTypes = src.types.map((t) => visitor(t, nestLevel));
        this.name = `union<${this.runTypes.map((rt) => rt.name).join(' | ')}>`;
        const shouldEnCodeDecode = this.runTypes.some((rt) => rt.shouldEncodeJson || rt.shouldDecodeJson);
        this.shouldEncodeJson = shouldEnCodeDecode;
        this.shouldDecodeJson = shouldEnCodeDecode;
    }
    isTypeJIT(varName: string): string {
        return this.runTypes.map((rt) => `(${rt.isTypeJIT(varName)})`).join(' || ');
    }
    typeErrorsJIT(varName: string, errorsName: string, pathChain: string): string {
        return `if (!(${this.isTypeJIT(varName)})) ${errorsName}.push({path: ${pathChain}, expected: ${toLiteral(this.name)}})`;
    }
    /**
     * Unions get encoded into an array where arr[0] is the discriminator and arr[1] is the value.
     * this is because some times we can't distinguish the type of an union.
     * ie: bigint gets encoded into an string, so if we have an union 'type U = string | bigint' we can't distinguish between the when encoding/decoding the json.
     * to solve this issue the index of the type is used as a discriminator.
     * So [0, "123n"] is interpreted as a string and [1, "123n"] is interpreted as a bigint.
     * */
    jsonEncodeJIT(varName: string): string {
        if (!this.shouldEncodeJson) return varName;
        const encode = this.runTypes
            .map((rt, i) => `if (${rt.isTypeJIT(varName)}) return [${i}, ${rt.jsonEncodeJIT(varName)}]`)
            .join(';');
        return `(() => {${encode}})()`;
    }
    jsonStringifyJIT(varName: string): string {
        const encode = this.runTypes
            .map((rt, i) => `if (${rt.isTypeJIT(varName)}) return '[${i}, ${rt.jsonStringifyJIT(varName)}]'`)
            .join(';');
        return `(() => {${encode}})()`;
    }
    jsonDecodeJIT(varName: string): string {
        if (!this.shouldDecodeJson) return varName;
        const itemsThatNeedDecode = this.runTypes.filter((rt) => rt.shouldDecodeJson).map((rt, i) => ({rt, i}));
        const decode = itemsThatNeedDecode
            .map((item) => {
                const itemCode = item.rt.jsonDecodeJIT(`${varName}[1]`);
                return `if ( ${varName}[0] === ${item.i}) return ${itemCode};`;
            })
            .join('');
        const othersCode = itemsThatNeedDecode.length !== this.runTypes.length ? `return ${varName}[1]` : '';
        return `(() => {${decode} ${othersCode}})()`;
    }
    mockJIT(varName: string): string {
        const arrayName = `unionList${this.nestLevel}`;
        const mockCodes = this.runTypes.map((rt, i) => `${rt.mockJIT(`${arrayName}[${i}]`)};`).join('');
        return `const ${arrayName} = []; ${mockCodes} ${varName} = ${arrayName}[Math.floor(Math.random() * ${arrayName}.length)]`;
    }
}
