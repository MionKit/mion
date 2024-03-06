/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeTupleMember} from '@deepkit/type';
import {RunType, RunTypeVisitor} from '../types';

export class ProxyRunType<T extends TypeTupleMember> implements RunType<T> {
    public readonly shouldEncodeJson: boolean;
    public readonly shouldDecodeJson: boolean;
    public readonly memberType: RunType;
    public readonly name: string;
    constructor(
        public readonly src: T,
        public readonly visitor: RunTypeVisitor,
        public readonly nestLevel: number
    ) {
        this.memberType = visitor(src.type, nestLevel);
        this.shouldEncodeJson = this.memberType.shouldEncodeJson;
        this.shouldDecodeJson = this.memberType.shouldDecodeJson;
        this.name = this.memberType.name;
    }
    getValidateCode(varName: string): string {
        return this.memberType.getValidateCode(varName);
    }
    getValidateCodeWithErrors(varName: string, errorsName: string, pathChain: string): string {
        return this.memberType.getValidateCodeWithErrors(varName, errorsName, pathChain);
    }
    getJsonEncodeCode(varName: string): string {
        return this.memberType.getJsonEncodeCode(varName);
    }
    getJsonDecodeCode(varName: string): string {
        return this.memberType.getJsonDecodeCode(varName);
    }
    getMockCode(varName: string): string {
        return this.memberType.getMockCode(varName);
    }
}
