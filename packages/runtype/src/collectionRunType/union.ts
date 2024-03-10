/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeUnion} from '../_deepkit/src/reflection/type';
import {RunType, RunTypeOptions, RunTypeVisitor} from '../types';
import {skipJsonDecode, skipJsonEncode, toLiteral} from '../utils';
import {random} from '../mock';

export class UnionRunType implements RunType<TypeUnion> {
    public readonly name: string;
    public readonly isJsonEncodeRequired: boolean;
    public readonly isJsonDecodeRequired: boolean;
    public readonly runTypes: RunType[];
    /**
     * Some unions get encoded into an array where arr[0] is the discriminator and arr[1] is the value.
     * this is because some times we can't distinguish the type of an union.
     * ie: bigint gets encoded into an string, so if we have an union 'type U = string | bigint' we can't distinguish between the when encoding/decoding the json.
     * to solve this issue the index of the type is used as a discriminator.
     * So [0, "123n"] is interpreted as a string and [1, "123n"] is interpreted as a bigint.
     * */
    public readonly needDiscriminatorIndex: boolean;
    constructor(
        visitor: RunTypeVisitor,
        public readonly src: TypeUnion,
        public readonly nestLevel: number,
        public readonly opts: RunTypeOptions
    ) {
        this.runTypes = src.types.map((t) => visitor(t, nestLevel, opts));
        this.name = `union<${this.runTypes.map((rt) => rt.name).join(' | ')}>`;
        // TODO: this could be optimized if every run type would have a jsonType and we could check they do not collide.
        // On the other hand the discriminator encode is more efficient so maybe we should not optimize at all 😅
        this.needDiscriminatorIndex = this.runTypes.some((rt) => rt.isJsonEncodeRequired || rt.isJsonDecodeRequired);
        this.isJsonEncodeRequired = this.needDiscriminatorIndex;
        this.isJsonDecodeRequired = this.needDiscriminatorIndex;
    }
    isTypeJIT(varName: string): string {
        return this.runTypes.map((rt) => `(${rt.isTypeJIT(varName)})`).join(' || ');
    }
    typeErrorsJIT(varName: string, errorsName: string, pathChain: string): string {
        return `if (!(${this.isTypeJIT(varName)})) ${errorsName}.push({path: ${pathChain}, expected: ${toLiteral(this.name)}})`;
    }
    jsonEncodeJIT(varName: string): string {
        const errorCode = `throw new Error('Can not encode json to union: expected ${this.name} but got ' + ${varName}?.constructor?.name || typeof ${varName})`;
        const encode = this.runTypes
            .map((rt, i) => {
                const checkCode = rt.isTypeJIT(varName);
                const itemCode = skipJsonEncode(rt) ? varName : rt.jsonEncodeJIT(varName);
                const returnCode = !this.needDiscriminatorIndex ? itemCode : `[${i}, ${itemCode}]`;
                return `if (${checkCode}) return ${returnCode}`;
            })
            .join(';');
        return `(() => {${encode}; ${errorCode}})()`;
    }
    jsonDecodeJIT(varName: string): string {
        const errorCode = `throw new Error('Can not decode json from union: expected ${this.name} but got ' + ${varName}?.constructor?.name || typeof ${varName})`;
        const decode = this.runTypes
            .map((rt, i) => {
                const valueName = !this.needDiscriminatorIndex ? varName : `${varName}[1]`;
                const checkCode = !this.needDiscriminatorIndex ? rt.isTypeJIT(varName) : `${varName}[0] === ${i}`;
                const returnCode = skipJsonDecode(rt) ? valueName : rt.jsonDecodeJIT(valueName);
                return `if (${checkCode}) return ${returnCode}`;
            })
            .join(';');
        return `(() => {${decode}; ${errorCode}})()`;
    }
    jsonStringifyJIT(varName: string): string {
        const errorCode = `throw new Error('Can not stringify union: expected ${this.name} but got ' + ${varName}?.constructor?.name || typeof ${varName})`;
        const encode = this.runTypes
            .map((rt, i) => {
                const checkCode = rt.isTypeJIT(varName);
                const returnCode = !this.needDiscriminatorIndex
                    ? rt.jsonStringifyJIT(varName)
                    : `('[' + ${i} + ',' + ${rt.jsonStringifyJIT(varName)} + ']')`;
                return `if (${checkCode}) return ${returnCode}`;
            })
            .join(';');
        return `(() => {${encode}; ${errorCode}})()`;
    }
    mock(...unionArgs: any[][]): string {
        const unionMock = this.runTypes.map((rt, i) => rt.mock(...(unionArgs?.[i] || [])));
        return unionMock[random(0, unionMock.length - 1)];
    }
}
