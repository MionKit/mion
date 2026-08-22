import { Plugin } from 'vite';
import { MionServerOptions } from './mionVitePlugin.ts';
export declare const DEFAULT_MIDDLEWARE_EXCLUDE: RegExp[];
export interface MiddlewareReadySignals {
    onReady: () => void;
    onError: (err: Error) => void;
}
export declare function mionMiddlewarePlugin(options: MionServerOptions, signals: MiddlewareReadySignals): Plugin;
//# sourceMappingURL=middlewareMode.d.ts.map