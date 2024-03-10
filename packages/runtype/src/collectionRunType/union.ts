/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeUnion} from '../_deepkit/src/reflection/type';
import {RunType, RunTypeVisitor} from '../types';
import {toLiteral} from '../utils';
import {random} from '../mock';

export class UnionRunType implements RunType<TypeUnion> {
    public readonly name: string;
    public readonly isJsonEncodeRequired: boolean;
    public readonly isJsonDecodeRequired: boolean;
    public readonly runTypes: RunType[];
    constructor(
        public readonly src: TypeUnion,
        public readonly visitor: RunTypeVisitor,
        public readonly nestLevel: number
    ) {
        this.runTypes = src.types.map((t) => visitor(t, nestLevel));
        this.name = `union<${this.runTypes.map((rt) => rt.name).join(' | ')}>`;
        const shouldEnCodeDecode = this.runTypes.some((rt) => rt.isJsonEncodeRequired || rt.isJsonDecodeRequired);
        this.isJsonEncodeRequired = shouldEnCodeDecode;
        this.isJsonDecodeRequired = shouldEnCodeDecode;
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
    jsonEncodeJIT(varName: string, isStrict?: boolean): string {
        const errorCode = `throw new Error('Can not encode json to union: expected ${this.name} but got ' + ${varName}?.constructor?.name || typeof ${varName})`;
        if (!this.isJsonEncodeRequired) {
            const encode = this.runTypes
                .map((rt) => {
                    const useNative = rt.isJsonEncodeRequired && !isStrict;
                    const itemCode = useNative ? varName : rt.jsonEncodeJIT(varName, isStrict);
                    return `if (${rt.isTypeJIT(varName)}) return ${itemCode}`;
                })
                .join(';');
            return `(() => {${encode}; ${errorCode}})()`;
        }
        const encode = this.runTypes
            .map((rt, i) => {
                const useNative = !isStrict && !(rt.isJsonEncodeRequired || rt.isJsonDecodeRequired);
                const itemCode = useNative ? varName : rt.jsonEncodeJIT(varName, isStrict);
                return `if (${rt.isTypeJIT(varName)}) return [${i}, ${itemCode}]`;
            })
            .join(';');
        return `(() => {${encode}; ${errorCode}})()`;
    }
    jsonStringifyJIT(varName: string): string {
        const errorCode = `throw new Error('Can not stringify union: expected ${this.name} but got ' + ${varName}?.constructor?.name || typeof ${varName})`;
        if (!this.isJsonEncodeRequired) {
            const encode = this.runTypes
                .map((rt) => `if (${rt.isTypeJIT(varName)}) return ${rt.jsonStringifyJIT(varName)}`)
                .join(';');
            return `(() => {${encode}; ${errorCode}})()`;
        }
        const encode = this.runTypes
            .map((rt, i) => `if (${rt.isTypeJIT(varName)}) return ('[' + ${i} + ',' + ${rt.jsonStringifyJIT(varName)} + ']')`)
            .join(';');
        return `(() => {${encode}; ${errorCode}})()`;
    }
    jsonDecodeJIT(varName: string, isStrict?: boolean): string {
        const errorCode = `throw new Error('Can not decode json from union: expected ${this.name} but got ' + ${varName}?.constructor?.name || typeof ${varName})`;
        if (!this.isJsonDecodeRequired && !isStrict) {
            const decode = this.runTypes
                .map((rt) => {
                    const useNative = rt.isJsonDecodeRequired && !isStrict;
                    const itemCode = useNative ? varName : rt.jsonDecodeJIT(varName, isStrict);
                    return `if (${rt.isTypeJIT(varName)}) return ${itemCode}`;
                })
                .join(';');
            return `(() => {${decode}; ${errorCode}})()`;
        }
        const decode = this.runTypes
            .map((rt, i) => {
                const useNative = !isStrict && !(rt.isJsonEncodeRequired || rt.isJsonDecodeRequired);
                const itemCode = useNative ? `${varName}[1]` : rt.jsonDecodeJIT(`${varName}[1]`, isStrict);
                return `if ( ${varName}[0] === ${i}) return ${itemCode}`;
            })
            .join(';');
        return `(() => {${decode}; ${errorCode}})()`;
    }
    mock(...unionArgs: any[][]): string {
        const unionMock = this.runTypes.map((rt, i) => rt.mock(...(unionArgs?.[i] || [])));
        return unionMock[random(0, unionMock.length - 1)];
    }
}
