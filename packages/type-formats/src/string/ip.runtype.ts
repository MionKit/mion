/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {JITUtils, GenericPureFunction, TypeFormatError} from '@mionkit/core';
import type {BaseRunType, JitFnCompiler, JitErrorsFnCompiler, RunTypeOptions, JitCode} from '@mionkit/run-types';
import {BaseRunTypeFormat, TypeFormat, registerFormatter, registerPureFnClosure} from '@mionkit/run-types';
import {ReflectionKind} from '@deepkit/type';
import {paramVal} from '../utils';
import {FormatParams_IP} from '@mionkit/core';

// IP validator
export class IPRunTypeFormat extends BaseRunTypeFormat<FormatParams_IP> {
    static id = 'ip';
    kind = ReflectionKind.string;
    name = IPRunTypeFormat.id;
    emitIsType(comp: JitFnCompiler, rt: BaseRunType): JitCode {
        const params = this.getParams(rt);
        if (params.version === 4) return {code: this.compilePureFunctionCall(comp, rt, mionIsIPV4).callCode, type: 'E'};
        if (params.version === 6) return {code: this.compilePureFunctionCall(comp, rt, mionIsIPV6).callCode, type: 'E'};
        return {
            code: `${this.compilePureFunctionCall(comp, rt, mionIsIPV4).callCode} || ${this.compilePureFunctionCall(comp, rt, mionIsIPV6).callCode}`,
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

// ############### Pure Functions ###############

/** @reflection never */
export function mionIsLocalHost() {
    const lhr = /^localhost$/i;
    return function is_local_host(ip: string, p: FormatParams_IP): boolean {
        if (p.version === 4) return lhr.test(ip) || ip === '127:0:0:1';
        if (p.version === 6) return ip === '::1' || ip === '0:0:0:0:0:0:0:1';
        return lhr.test(ip) || ip === '127:0:0:1' || ip === '::1' || ip === '0:0:0:0:0:0:0:1';
    };
}

/** @reflection never */
export function mionIsIPV4(utl: JITUtils) {
    const is_Localhost = utl.getPureFn('pf_mionIsLocalHost') as ReturnType<typeof mionIsLocalHost>;
    function get_address(ip: string, p: FormatParams_IP): false | string {
        if (!p.allowPort) return ip;
        const parts = ip.split(':');
        if (parts.length > 2) return false;
        const [address, portS] = parts;
        if (!portS) return address;
        const port = Number(portS);
        if (isNaN(port) || port < 0 || port > 65535) return false;
        return address;
    }
    return function is_ip_v4(ip: string, p: FormatParams_IP): boolean {
        const address = get_address(ip, p);
        if (address === false) return false;
        const isLocal = is_Localhost(address, p);
        if (p.allowLocalHost && isLocal) return true;
        if (!p.allowLocalHost && isLocal) return false;
        const sections = address.split('.');
        if (sections.length !== 4) return false;
        for (const section of sections) {
            const num = Number(section);
            if (isNaN(num) || num < 0 || num > 255) return false;
        }
        return true;
    } as GenericPureFunction<FormatParams_IP>;
}

/** @reflection never */
export function mionIsIPV6(utl: JITUtils) {
    const is_Localhost = utl.getPureFn('pf_mionIsLocalHost') as ReturnType<typeof mionIsLocalHost>;
    const ipv6PortRegexp = /^\[([^\]]+)\](?::(\d+))?$/;
    function get_address(ip: string, p: FormatParams_IP): false | string {
        if (!p.allowPort) return ip;
        const match = ip.match(ipv6PortRegexp);
        if (!match) return false;
        const address = match[1];
        const port = match[2];
        if (!port) return address;
        const num = Number(port);
        if (isNaN(num) || num < 0 || num > 65535) return false;
        return address;
    }
    return function is_ip_v6(ip: string, p: FormatParams_IP): boolean {
        const address = get_address(ip, p);
        if (address === false) return false;
        const isLocal = is_Localhost(address, p);
        if (p.allowLocalHost && isLocal) return true;
        if (!p.allowLocalHost && isLocal) return false;
        const sections = address.split(':');
        if (sections.length < 3 || sections.length > 8) return false;
        let doubleColon = 0;
        for (const section of sections) {
            if (section.length === 0) {
                doubleColon++;
                if (doubleColon > 1) return false;
                continue; // Allow empty sections for "::"
            }
            if (section.length > 4) return false;
            const num = parseInt(section, 16);
            if (isNaN(num) || num < 0 || num > 0xffff) return false;
        }
        return true;
    } as GenericPureFunction<FormatParams_IP>;
}

// ############### Pure Functions ###############

/** @reflection never */
export function mionGetIPErrors(utl: JITUtils) {
    const is_ip_v4 = utl.getPureFn('pf_mionIsIPV4') as ReturnType<typeof mionIsIPV4>;
    const is_ip_v6 = utl.getPureFn('pf_mionIsIPV6') as ReturnType<typeof mionIsIPV6>;
    const noopDeps = {};
    return function get_ip_errors(
        ip: string,
        p: FormatParams_IP,
        fPath: (string | number)[],
        fErrs: TypeFormatError[],
        name = 'ip'
    ): TypeFormatError[] {
        if (p.version === 4 && !is_ip_v4(ip, p, noopDeps))
            return (fErrs.push({name, formatPath: [...fPath, 'version'], val: 4}), fErrs);
        if (p.version === 6 && !is_ip_v6(ip, p, noopDeps))
            return (fErrs.push({name, formatPath: [...fPath, 'version'], val: 6}), fErrs);
        const isIP = is_ip_v4(ip, p, noopDeps) || is_ip_v6(ip, p, noopDeps);
        if (!isIP) fErrs.push({name, formatPath: ['version'], val: 'any'});
        return fErrs;
    };
}

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

// register pure functions so they can be used in the jit compiler
registerPureFnClosure(mionIsLocalHost);
registerPureFnClosure(mionIsIPV4, [mionIsLocalHost]);
registerPureFnClosure(mionIsIPV6, [mionIsLocalHost]);

// register Validator operations so they can be used in the jit compiler
export const IP_RUN_TYPE_FORMATTER = registerFormatter(new IPRunTypeFormat());

// ############### Type  ###############

type DEFAULT_IP_PARAMS = {
    version: 'any';
    allowLocalHost: true;
};

/** IP address format, branded by default with 'ip'. */
export type StrIP<P extends FormatParams_IP = DEFAULT_IP_PARAMS, BrandName extends string = 'ip'> = TypeFormat<
    string,
    'ip',
    P,
    BrandName
>;
export type StrIPv4<BrandName extends string = 'ip'> = StrIP<{version: 4; allowLocalHost: true}, BrandName>;
export type StrIPv6<BrandName extends string = 'ip'> = StrIP<{version: 6; allowLocalHost: true}, BrandName>;
export type StrIPWithPort<BrandName extends string = 'ip'> = StrIP<
    {version: 'any'; allowLocalHost: true; allowPort: true},
    BrandName
>;
export type StrIPv4WithPort<BrandName extends string = 'ip'> = StrIP<
    {version: 4; allowLocalHost: true; allowPort: true},
    BrandName
>;
export type StrIPv6WithPort<BrandName extends string = 'ip'> = StrIP<
    {version: 6; allowLocalHost: true; allowPort: true},
    BrandName
>;
