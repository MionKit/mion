/* eslint-disable @typescript-eslint/ban-types */
/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {JITUtils, GenericPureFunction, TypeFormatError, FormatParam} from '@mionkit/core/src/types';
import type {BaseRunType} from '@mionkit/run-types/src/lib/baseRunTypes';
import type {JitCompiler, JitErrorsCompiler} from '@mionkit/run-types/src/lib/jitCompiler';
import type {RunTypeOptions} from '@mionkit/run-types/src/types';
import {BaseRunTypeFormat} from '@mionkit/run-types/src/lib/baseRunTypeFormat';
import {ReflectionKind} from '@deepkit/type';
import {TypeFormat} from '@mionkit/run-types/src/lib/formats.runtype';
import {registerFormatter, registerPureFnClosure} from '@mionkit/run-types/src/lib/formats';
import {fpVal} from '@mionkit/run-types/src/lib/utils';

// IP validator
export class IPRunTypeFormat extends BaseRunTypeFormat<FormatParams_IP> {
    static id = 'ip';
    kind = ReflectionKind.string;
    name = IPRunTypeFormat.id;
    _compileIsType(comp: JitCompiler, rt: BaseRunType): string {
        const params = this.getParams(rt);
        if (params.version === 4) return this.compilePureFunctionCall(comp, rt, mionIsIPV4).callCode;
        if (params.version === 6) return this.compilePureFunctionCall(comp, rt, mionIsIPV6).callCode;
        return `${this.compilePureFunctionCall(comp, rt, mionIsIPV4).callCode} || ${this.compilePureFunctionCall(comp, rt, mionIsIPV6).callCode}`;
    }
    _mock(opts: RunTypeOptions, rt: BaseRunType) {
        const params = this.getParams(rt);
        if (params.version === 4) return mockIpV4(params);
        if (params.version === 6) return mockIpV6(params);
        return Math.random() > 0.5 ? mockIpV4(params) : mockIpV6(params);
    }
    _compileTypeErrors(comp: JitErrorsCompiler, rt: BaseRunType): string {
        const isTypeCode = this._compileIsType(comp, rt);
        if (!isTypeCode) return '';
        const params = this.getParams(rt);
        const errFn = this.getCallJitFormatErr(comp, rt, this);
        return `if (!(${isTypeCode})) ${errFn('version', fpVal(params.version))}`;
    }
    _compileFormat(comp: JitCompiler) {
        return `${comp.vλl}.toLowerCase()`; // transform to lowercase in case it is localhost
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
            return fErrs.push({name, formatPath: [...fPath, 'version'], val: 4}), fErrs;
        if (p.version === 6 && !is_ip_v6(ip, p, noopDeps))
            return fErrs.push({name, formatPath: [...fPath, 'version'], val: 6}), fErrs;
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

export type FormatParams_IP = {
    version: FormatParam<4 | 6 | 'any'>;
    /** Allows localhost values ie: localhost, 127.0.0.1, 0::1 */
    allowLocalHost?: FormatParam<boolean>;
    // TODO: allow port
    allowPort?: FormatParam<boolean>;
};
export type FormatIP<P extends FormatParams_IP = DEFAULT_IP_PARAMS> = TypeFormat<string, 'ip', P>;
export type FormatIPV4 = FormatIP<{version: 4; allowLocalHost: true}>;
export type FormatIPV6 = FormatIP<{version: 6; allowLocalHost: true}>;
export type FormatIPWithPort = FormatIP<{version: 'any'; allowLocalHost: true; allowPort: true}>;
export type FormatIPV4WithPort = FormatIP<{version: 4; allowLocalHost: true; allowPort: true}>;
export type FormatIPV6WithPort = FormatIP<{version: 6; allowLocalHost: true; allowPort: true}>;
