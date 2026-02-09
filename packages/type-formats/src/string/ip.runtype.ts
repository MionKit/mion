/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {BaseRunType, JitFnCompiler, JitErrorsFnCompiler, RunTypeOptions, JitCode} from '@mionkit/run-types';
import {BaseRunTypeFormat, TypeFormat, registerFormatter} from '@mionkit/run-types';
import {ReflectionKind} from '@deepkit/type';
import {paramVal} from '../utils';
import {FormatParams_IP} from '@mionkit/core';
import {isIPV4, isIPV6} from '../type-formats-pure-fns';

// IP validator
export class IPRunTypeFormat extends BaseRunTypeFormat<FormatParams_IP> {
    static id = 'ip';
    kind = ReflectionKind.string;
    name = IPRunTypeFormat.id;
    emitIsType(comp: JitFnCompiler, rt: BaseRunType): JitCode {
        const params = this.getParams(rt);
        if (params.version === 4) return {code: this.compilePureFunctionCall(comp, rt, isIPV4).callCode, type: 'E'};
        if (params.version === 6) return {code: this.compilePureFunctionCall(comp, rt, isIPV6).callCode, type: 'E'};
        return {
            code: `${this.compilePureFunctionCall(comp, rt, isIPV4).callCode} || ${this.compilePureFunctionCall(comp, rt, isIPV6).callCode}`,
            type: 'E',
        };
    }
    _mock(opts: RunTypeOptions, rt: BaseRunType) {
        const params = this.getParams(rt);
        if (params.version === 4) return mockIpV4(params);
        if (params.version === 6) return mockIpV6(params);
        return Math.random() > 0.5 ? mockIpV4(params) : mockIpV6(params);
    }
    emitIsTypeErrors(comp: JitErrorsFnCompiler, rt: BaseRunType): JitCode {
        const isTypeCodeObj = this.emitIsType(comp, rt);
        const isTypeCode = isTypeCodeObj.code;
        if (!isTypeCode) return {code: '', type: 'S'};
        const params = this.getParams(rt);
        const errFn = this.getCallJitFormatErr(comp, rt, this);
        return {code: `if (!(${isTypeCode})) ${errFn('version', paramVal(params.version))}`, type: 'S'};
    }
    emitFormat(comp: JitFnCompiler): JitCode {
        return {code: `${comp.vλl}.toLowerCase()`, type: 'E'}; // transform to lowercase in case it is localhost
    }
}

// ############### Mock Functions ###############

export function mockIpV4(p: FormatParams_IP): string {
    const r = Math.random();
    if (p.allowLocalHost && r > 0.8) return Math.random() > 0.5 ? 'localhost' : '127:0:0:1';
    return Array.from({length: 4}, () => Math.floor(Math.random() * 256)).join('.');
}

export function mockIpV6(p: FormatParams_IP): string {
    if (p.allowLocalHost && Math.random() > 0.8) return Math.random() > 0.5 ? '0:0:0:0:0:0:0:1' : '::1';
    return Array.from({length: 8}, () => Math.floor(Math.random() * 0xffff).toString(16)).join(':');
}

// ############### Register runtypes ###############

// register Validator operations so they can be used in the jit compiler
export const IP_RUN_TYPE_FORMATTER = registerFormatter(new IPRunTypeFormat());

// ############### Type  ###############

type DEFAULT_IP_PARAMS = {
    version: 'any';
    allowLocalHost: true;
};

/** IP address format, always branded with 'ip'. */
export type StrIP<P extends FormatParams_IP = DEFAULT_IP_PARAMS> = TypeFormat<string, 'ip', P, 'ip'>;
export type StrIPv4 = StrIP<{version: 4; allowLocalHost: true}>;
export type StrIPv6 = StrIP<{version: 6; allowLocalHost: true}>;
export type StrIPWithPort = StrIP<{version: 'any'; allowLocalHost: true; allowPort: true}>;
export type StrIPv4WithPort = StrIP<{version: 4; allowLocalHost: true; allowPort: true}>;
export type StrIPv6WithPort = StrIP<{version: 6; allowLocalHost: true; allowPort: true}>;
