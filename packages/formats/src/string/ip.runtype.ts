/* eslint-disable @typescript-eslint/ban-types */
/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

/*

*/
import type {BaseRunType} from '@mionkit/runtype/src/lib/baseRunTypes';
import type {JitCompiler, JitErrorsCompiler} from '@mionkit/runtype/src/lib/jitCompiler';
import type {GenericPureFunction, MockOperation, TypeFormatError} from '@mionkit/runtype/src/types';
import type {JITUtils} from '@mionkit/runtype/src/lib/jitUtils';
import {JitRunTypeFormatter} from '@mionkit/runtype/src/lib/baseFormatter';
import {ReflectionKind} from '@deepkit/type';
import {TypeFormat} from '@mionkit/runtype/src/lib/formats.runtype';
import {registerFormatter, registerPureFnClosure} from '@mionkit/runtype/src/lib/formats';

export type IpValidatorParams = {
    version: 4 | 6 | 'any';
    /** Allows localhost values ie: localhost, 127.0.0.1, 0::1 */
    allowLocalHost?: boolean;
    // TODO: allow port
    allowPort?: boolean;
};
export type IP<P extends Partial<IpValidatorParams> = {}> = TypeFormat<string, 'ip', {version: 'any'; allowLocalHost: true} & P>;
export type IPV4 = TypeFormat<string, 'ip', {version: 4; allowLocalHost: true}>;
export type IPV6 = TypeFormat<string, 'ip', {version: 6; allowLocalHost: true}>;
export type IPWithPort = TypeFormat<string, 'ip', {version: 'any'; allowLocalHost: true; allowPort: true}>;
export type IPV4WithPort = TypeFormat<string, 'ip', {version: 4; allowLocalHost: true; allowPort: true}>;
export type IPV6WithPort = TypeFormat<string, 'ip', {version: 6; allowLocalHost: true; allowPort: true}>;

// IP validator
export class IPFormat extends JitRunTypeFormatter<IpValidatorParams> {
    static id = 'ip';
    kind = ReflectionKind.string;
    name = IPFormat.id;
    _compileIsType(comp: JitCompiler, rt: BaseRunType): string {
        const params = this.getParams(rt);
        if (params.version === 4) return this.compilePureFunctionCall(comp, rt, isIPV4).callCode;
        if (params.version === 6) return this.compilePureFunctionCall(comp, rt, isIPV6).callCode;
        return `${this.compilePureFunctionCall(comp, rt, isIPV4).callCode} || ${this.compilePureFunctionCall(comp, rt, isIPV6).callCode}`;
    }
    _mock(mockContext: MockOperation, rt: BaseRunType) {
        const params = this.getParams(rt);
        if (params.version === 4) return mockIpV4(params);
        if (params.version === 6) return mockIpV6(params);
        return Math.random() > 0.5 ? mockIpV4(params) : mockIpV6(params);
    }
    _compileTypeErrors(comp: JitErrorsCompiler, rt: BaseRunType): string {
        const isTypeCode = this._compileIsType(comp, rt);
        if (!isTypeCode) return '';
        const params = this.getParams(rt);
        const errFn = comp.getCallJitFormatErr(rt, this);
        return `if (!(${isTypeCode})) ${errFn('version', params.version)}`;
    }
    _compileFormat(comp: JitCompiler) {
        return `${comp.vλl}.toLowerCase()`; // transform to lowercase in case it is localhost
    }
}

/** @reflection never */
export function isLocalHost() {
    const lhr = /^localhost$/i;
    return function is_local_host(ip: string, p: IpValidatorParams): boolean {
        if (p.version === 4) return lhr.test(ip) || ip === '127:0:0:1';
        if (p.version === 6) return ip === '::1' || ip === '0:0:0:0:0:0:0:1';
        return lhr.test(ip) || ip === '127:0:0:1' || ip === '::1' || ip === '0:0:0:0:0:0:0:1';
    };
}

/** @reflection never */
export function isIPV4(utl: JITUtils) {
    const is_Localhost = utl.getPureFn('isLocalHost') as ReturnType<typeof isLocalHost>;
    function get_address(ip: string, p: IpValidatorParams): false | string {
        if (!p.allowPort) return ip;
        const parts = ip.split(':');
        if (parts.length > 2) return false;
        const [address, portS] = parts;
        if (!portS) return address;
        const port = Number(portS);
        if (isNaN(port) || port < 0 || port > 65535) return false;
        return address;
    }
    return function is_ip_v4(ip: string, p: IpValidatorParams): boolean {
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
    } as GenericPureFunction<IpValidatorParams>;
}

/** @reflection never */
export function isIPV6(utl: JITUtils) {
    const is_Localhost = utl.getPureFn('isLocalHost') as ReturnType<typeof isLocalHost>;
    const ipv6PortRegexp = /^\[([^\]]+)\](?::(\d+))?$/;
    function get_address(ip: string, p: IpValidatorParams): false | string {
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
    return function is_ip_v6(ip: string, p: IpValidatorParams): boolean {
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
    } as GenericPureFunction<IpValidatorParams>;
}

/** @reflection never */
export function getIPErrors(utl: JITUtils) {
    const is_ip_v4 = utl.getPureFn('isIPV4') as ReturnType<typeof isIPV4>;
    const is_ip_v6 = utl.getPureFn('isIPV6') as ReturnType<typeof isIPV6>;
    const noopDeps = {};
    return function get_ip_errors(
        ip: string,
        p: IpValidatorParams,
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

export function mockIpV4(p: IpValidatorParams): string {
    const r = Math.random();
    if (p.allowLocalHost && r > 0.8) return Math.random() > 0.5 ? 'localhost' : '127:0:0:1';
    return Array.from({length: 4}, () => Math.floor(Math.random() * 256)).join('.');
}

export function mockIpV6(p: IpValidatorParams): string {
    if (p.allowLocalHost && Math.random() > 0.8) return Math.random() > 0.5 ? '0:0:0:0:0:0:0:1' : '::1';
    return Array.from({length: 8}, () => Math.floor(Math.random() * 0xffff).toString(16)).join(':');
}

// ############### Register runtypes ###############

// register pure functions so they can be used in the jit compiler
registerPureFnClosure(isLocalHost);
registerPureFnClosure(isIPV4, [isLocalHost]);
registerPureFnClosure(isIPV6, [isLocalHost]);

// register Validator operations so they can be used in the jit compiler
export const ipFormatter = registerFormatter(new IPFormat());
