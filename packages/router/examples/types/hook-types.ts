import {Handler, HeaderHandler, HookMethod, HeaderMethod, RawMethod, RawHookHandler} from '@mionkit/router';
import {HookOptions, HeaderHookOptions, RawHookOptions} from '@mionkit/router';

// start-rawhook-def
/**
 * Raw hook, used only to access raw request/response and modify the call context.
 * Can not declare extra parameters.
 */
export type RawHookDef<H extends RawHookHandler = any> = Pick<RawMethod<H>, 'type' | 'handler'> & {
    options?: RawHookOptions;
};
// end-rawhook-def

// start-hook-def
/** Hook definition, a function that hooks into the execution path */
export type HookDef<H extends Handler = any> = Pick<HookMethod<H>, 'type' | 'handler'> & {
    options?: HookOptions;
};
// end-hook-def

// start-header-hook-def
/** Header Hook definition, used to handle header params via HeadersSubset */
export type HeaderHookDef<H extends HeaderHandler = any> = Pick<HeaderMethod<H>, 'type' | 'handler'> & {
    options?: HeaderHookOptions;
};
// end-header-hook-def

// start-headers-subset
/** Type-safe wrapper for HTTP headers */
export class HeadersSubset<Required extends string, Optional extends string = never> {
    readonly headers: {[K in Required]: string} & {[K in Optional]?: string};
    constructor(headers: {[K in Required]: string} & {[K in Optional]?: string}) {
        this.headers = headers;
    }
}
// end-headers-subset

