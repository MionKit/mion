declare module 'virtual:mion-aot/caches' {
    export const jitFnsCache: Record<string, any>;
    export const pureFnsCache: Record<string, Record<string, any>>;
    export const routerCache: Record<string, any>;
}
