/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeUnion} from '../_deepkit/src/reflection/type';
import {RunType, RunTypeOptions, RunTypeVisitor} from '../types';
import {getErrorPath, getExpected, shouldSkipJsonDecode, shouldSkipJsonEncode} from '../utils';
import {random} from '../mock';
import {BaseRunType} from '../baseRunTypes';
import {jitNames} from '../constants';

/**
 * Unions get encoded into an array where arr[0] is the discriminator and arr[1] is the value.
 * this is because some times we can't distinguish the type of an union.
 * ie: bigint gets encoded into an string, so if we have an union 'type U = string | bigint' we can't distinguish between the when encoding/decoding the json.
 * to solve this issue the index of the type is used as a discriminator.
 * So [0, "123n"] is interpreted as a string and [1, "123n"] is interpreted as a bigint.
 * */
export class UnionRunType extends BaseRunType<TypeUnion> {
    public readonly isJsonEncodeRequired = true;
    public readonly isJsonDecodeRequired = true;
    public readonly runTypes: RunType[];
    public readonly jitId: string;
    constructor(
        visitor: RunTypeVisitor,
        public readonly src: TypeUnion,
        public readonly parents: RunType[],
        opts: RunTypeOptions
    ) {
        super(visitor, src, parents, opts);
        parents.push(this);
        this.runTypes = src.types.map((t) => visitor(t, parents, opts));
        parents.pop();
        this.jitId = `${this.src.kind}[${this.runTypes.map((prop) => `${prop.jitId}`).join('|')}]`;
    }
    compileIsType(parents: RunType[], varName: string): string {
        parents.push(this);
        const code = `(${this.runTypes.map((rt) => rt.compileIsType(parents, varName)).join(' || ')})`;
        parents.pop();
        return code;
    }
    compileTypeErrors(parents: RunType[], varName: string, pathC: string[]): string {
        parents.push(this);
        const code = `if (!(${this.compileIsType(parents, varName)})) ${jitNames.errors}.push({path: ${getErrorPath(pathC)}, expected: ${getExpected(this)}})`;
        parents.pop();
        return code;
    }
    compileJsonEncode(parents: RunType[], varName: string): string {
        const errorCode = `else { throw new Error('Can not encode json to union: expected one of <${this.getUnionTypeNames()}> but got ' + ${varName}?.constructor?.name || typeof ${varName}) }`;
        const encode = this.runTypes
            .map((rt, i) => {
                const checkCode = rt.compileIsType(parents, varName);
                const accessor = `${varName}[1]`;
                const itemCode = shouldSkipJsonEncode(rt) ? '' : rt.compileJsonEncode(parents, accessor);
                const discriminatorCode = `{${varName} = [${i}, ${varName}]; ${itemCode}}`;
                return `${i === 0 ? 'if' : 'else if'} (${checkCode}) ${discriminatorCode}`;
            })
            .join('\n');
        return `${encode}\n${errorCode}`;
    }
    compileJsonDecode(parents: RunType[], varName: string): string {
        const errorCode = `else { throw new Error('Can not decode json from union: expected one of <${this.getUnionTypeNames()}> but got ' + ${varName}?.constructor?.name || typeof ${varName}) }`;
        const decode = this.runTypes
            .map((rt, i) => {
                const checkCode = `${varName}[0] === ${i}`;
                const accessor = `${varName}[1]`;
                const itemCode = shouldSkipJsonDecode(rt) ? '' : rt.compileJsonDecode([...parents, this], varName);
                const discriminatorCode = `{${varName} = ${accessor}; ${itemCode}}`;
                return `${i === 0 ? 'if' : 'else if'} (${checkCode})  ${discriminatorCode}`;
            })
            .join('\n');
        return `${decode}\n${errorCode}`;
    }
    compileJsonStringify(parents: RunType[], varName: string): string {
        const errorCode = `throw new Error('Can not stringify union: expected one of <${this.getUnionTypeNames()}> but got ' + ${varName}?.constructor?.name || typeof ${varName})`;
        const encode = this.runTypes
            .map((rt, i) => {
                const checkCode = rt.compileIsType(parents, varName);
                const returnCode = `('[' + ${i} + ',' + ${rt.compileJsonStringify([...parents, this], varName)} + ']')`;
                return `if (${checkCode}) return ${returnCode}`;
            })
            .join(';');
        return `(() => {${encode}; ${errorCode}})()`;
    }
    mock(...unionArgs: any[][]): string {
        const unionMock = this.runTypes.map((rt, i) => rt.mock(...(unionArgs?.[i] || [])));
        return unionMock[random(0, unionMock.length - 1)];
    }
    private _unionTypeNames: string | undefined;
    getUnionTypeNames(): string {
        if (this._unionTypeNames) return this._unionTypeNames;
        return (this._unionTypeNames = this.runTypes.map((rt) => rt.getName()).join(' | '));
    }
}
