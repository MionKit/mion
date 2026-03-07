import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
    // mion packages are type-checked separately with their own tsconfig;
    // skip re-checking them under Next.js's DOM-flavored lib settings
    typescript: {ignoreBuildErrors: true},
    turbopack: {
        resolveAlias: {
            'virtual:mion-aot/caches': './mion-aot-caches-shim.js',
            'virtual:mion-server-pure-fns': './mion-aot-caches-shim.js',
        },
    },
};

export default nextConfig;
