import { Plugin } from 'vite';
export interface VirtualSiteMap {
    register(virtualPath: string, realFile: string): void;
    resolve(siteFile: string): string | undefined;
}
export declare function createVirtualSiteMap(): VirtualSiteMap;
export declare function mionSfcPlugins(rt: Plugin | undefined, inject?: boolean, virtualSites?: VirtualSiteMap): Plugin[];
//# sourceMappingURL=sfcTransform.d.ts.map