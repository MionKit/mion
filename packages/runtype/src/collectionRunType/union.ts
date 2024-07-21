/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeUnion} from '../_deepkit/src/reflection/type';
import {RunType, RunTypeOptions, RunTypeVisitor} from '../types';
import {hasCircularRunType, skipJsonDecode, skipJsonEncode, toLiteral} from '../utils';
import {random} from '../mock';
import {BaseRunType} from '../baseRunTypes';

/**
 * Unions get encoded into an array where arr[0] is the discriminator and arr[1] is the value.
 * this is because some times we can't distinguish the type of an union.
 * ie: bigint gets encoded into an string, so if we have an union 'type U = string | bigint' we can't distinguish between the when encoding/decoding the json.
 * to solve this issue the index of the type is used as a discriminator.
 * So [0, "123n"] is interpreted as a string and [1, "123n"] is interpreted as a bigint.
 * */
export class UnionRunType extends BaseRunType<TypeUnion> {
    public readonly slug: string;
    public readonly isJsonEncodeRequired = true;
    public readonly isJsonDecodeRequired = true;
    public readonly hasCircular: boolean;
    public readonly runTypes: RunType[];
    constructor(
        visitor: RunTypeVisitor,
        public readonly src: TypeUnion,
        public readonly parents: RunType[],
        public readonly opts: RunTypeOptions
    ) {
        super(visitor, src, parents, opts);
        this.runTypes = src.types.map((t) => visitor(t, parents, opts));
        this.slug = `union<${this.runTypes.map((rt) => rt.slug).join(' | ')}>`;
        this.hasCircular =
            this.runTypes.some((rt) => rt.hasCircular) || this.runTypes.some((rt) => hasCircularRunType(rt, parents));
    }
    JIT_isType(varName: string): string {
        return this.runTypes.map((rt) => `(${rt.JIT_isType(varName)})`).join(' || ');
    }
    JIT_typeErrors(varName: string, errorsName: string, pathChain: string): string {
        return `if (!(${this.JIT_isType(varName)})) ${errorsName}.push({path: ${pathChain}, expected: ${toLiteral(this.slug)}})`;
    }
    JIT_jsonEncode(varName: string): string {
        const errorCode = `else { throw new Error('Can not encode json to union: expected ${this.slug} but got ' + ${varName}?.constructor?.name || typeof ${varName}) }`;
        const encode = this.runTypes
            .map((rt, i) => {
                const checkCode = rt.JIT_isType(varName);
                const accessor = `${varName}[1]`;
                const itemCode = skipJsonEncode(rt) ? '' : rt.JIT_jsonEncode(accessor);
                const discriminatorCode = `{${varName} = [${i}, ${varName}]; ${itemCode}}`;
                return `${i === 0 ? 'if' : 'else if'} (${checkCode}) ${discriminatorCode}`;
            })
            .join('\n');
        return `${encode}\n${errorCode}`;
    }
    JIT_jsonDecode(varName: string): string {
        const errorCode = `else { throw new Error('Can not decode json from union: expected ${this.slug} but got ' + ${varName}?.constructor?.name || typeof ${varName}) }`;
        const decode = this.runTypes
            .map((rt, i) => {
                const checkCode = `${varName}[0] === ${i}`;
                const accessor = `${varName}[1]`;
                const itemCode = skipJsonDecode(rt) ? '' : rt.JIT_jsonDecode(varName);
                const discriminatorCode = `{${varName} = ${accessor}; ${itemCode}}`;
                return `${i === 0 ? 'if' : 'else if'} (${checkCode})  ${discriminatorCode}`;
            })
            .join('\n');
        return `${decode}\n${errorCode}`;
    }
    JIT_jsonStringify(varName: string): string {
        const errorCode = `throw new Error('Can not stringify union: expected ${this.slug} but got ' + ${varName}?.constructor?.name || typeof ${varName})`;
        const encode = this.runTypes
            .map((rt, i) => {
                const checkCode = rt.JIT_isType(varName);
                const returnCode = `('[' + ${i} + ',' + ${rt.JIT_jsonStringify(varName)} + ']')`;
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
