/* eslint-disable @typescript-eslint/ban-types */
/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

/*

*/
import type {BaseRunType} from '../lib/baseRunTypes';
import type {JitCompiler, JitErrorsCompiler} from '../lib/jitCompiler';
import {JitRunTypeFormatter} from '../lib/jitFormatters';
import {ReflectionKind} from '@deepkit/type';
import {TypeFormat} from '../lib/formats.runtype';
import {InvalidFormatParams, MockOperation, PureFunction} from '../types';
import {JITUtils} from '../lib/jitUtils';
import {compileErrorsPureFunctionCall, compilePureFunctionCall} from '../lib/formats';
import {registerFormatter, registerPureFunctionWithCtx} from '../lib/formats';

export type IpValidatorParams = {
    version?: 4 | 6 | 'any';
    /** Allows localhost values ie: localhost, 127.0.0.1, 0::1 */
    allowLocalHost?: boolean;
    // TODO: allow port
    allowPort?: boolean;
};
export type IP<P extends IpValidatorParams = {}> = TypeFormat<string, 'ip', {version: 'any'; allowLocalHost: true} & P>;
export type IPV4 = TypeFormat<string, 'ip', {version: 4; allowLocalHost: true}>;
export type IPV6 = TypeFormat<string, 'ip', {version: 6; allowLocalHost: true}>;
export type IPWithPort = TypeFormat<string, 'ip', {version: 'any'; allowLocalHost: true; allowPort: true}>;
export type IPV4WithPort = TypeFormat<string, 'ip', {version: 4; allowLocalHost: true; allowPort: true}>;
export type IPV6WithPort = TypeFormat<string, 'ip', {version: 6; allowLocalHost: true; allowPort: true}>;

// IP validator
export class IPValidator extends JitRunTypeFormatter<IpValidatorParams> {
    static id = 'ip';
    kind = ReflectionKind.string;
    name = IPValidator.id;
    _compileIsType(comp: JitCompiler, rt: BaseRunType): string {
        const params = this.getParams(rt);
        if (params.version === 4) return compilePureFunctionCall(comp, rt, isIPV4, params);
        if (params.version === 6) return compilePureFunctionCall(comp, rt, isIPV6, params);
        return `${compilePureFunctionCall(comp, rt, isIPV4, params)} || ${compilePureFunctionCall(comp, rt, isIPV6, params)}`;
    }
    _mock(mockContext: MockOperation, rt: BaseRunType) {
        const params = this.getParams(rt);
        if (params.version === 4) return mockIpV4(params);
        if (params.version === 6) return mockIpV6(params);
        return Math.random() > 0.5 ? mockIpV4(params) : mockIpV6(params);
    }
    _compileTypeErrors(comp: JitErrorsCompiler, rt: BaseRunType): string {
        const params = this.getParams(rt);
        return compileErrorsPureFunctionCall(comp, rt, getIPErrors, params, this.name);
    }
    _format(comp: JitCompiler) {
        return `${comp.vλl}.toLowerCase()`; // all domain are lower case
    }
    _formatMockedValue(mockContext: MockOperation, rt: BaseRunType, val: any): string {
        return val.toLowerCase();
    }
    validateParams() {}
}

/** @reflection never */
export function isLocalHost() {
    const localhostRegexp = /^localhost$/i;
    return function is_local_host(ip: string, p: IpValidatorParams): boolean {
        if (p.version === 4) return localhostRegexp.test(ip) || ip === '127:0:0:1';
        if (p.version === 6) return ip === '::1' || ip === '0:0:0:0:0:0:0:1';
        return localhostRegexp.test(ip) || ip === '127:0:0:1' || ip === '::1' || ip === '0:0:0:0:0:0:0:1';
    } as PureFunction<any>;
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
    } as PureFunction<IpValidatorParams>;
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
    } as PureFunction<IpValidatorParams>;
}

/** @reflection never */
export function getIPErrors(utl: JITUtils) {
    const is_ip_v4 = utl.getPureFn('isIPV4') as ReturnType<typeof isIPV4>;
    const is_ip_v6 = utl.getPureFn('isIPV6') as ReturnType<typeof isIPV6>;
    return function get_ip_errors(ip: string, p: IpValidatorParams): InvalidFormatParams | undefined {
        if (p.version === 4 && !is_ip_v4(ip, p)) return {version: 4};
        if (p.version === 6 && !is_ip_v6(ip, p)) return {version: 6};
        const isIP = is_ip_v4(ip, p) || is_ip_v6(ip, p);
        if (!isIP) return {version: 'any'};
    } as PureFunction<IpValidatorParams>;
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
registerPureFunctionWithCtx(isLocalHost);
registerPureFunctionWithCtx(isIPV4, [isLocalHost]);
registerPureFunctionWithCtx(isIPV6, [isLocalHost]);
registerPureFunctionWithCtx(getIPErrors, [isIPV4, isIPV6]);

// register Validator operations so they can be used in the jit compiler
export const ipFormatter = registerFormatter(new IPValidator());
