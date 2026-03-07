import type {DeployTarget} from '../../prompts.ts';

interface ApiPackageJsonOpts {
    projectName: string;
    deployTarget: DeployTarget;
}

/** Generates the api/package.json content */
export function generateApiPackageJson(opts: ApiPackageJsonOpts): string {
    const deps: Record<string, string> = {
        '@mionkit/core': '^0.7.2',
        '@mionkit/router': '^0.7.2',
    };

    const devDeps: Record<string, string> = {
        '@mionkit/devtools': '^0.8.0',
        vite: '^7.3.1',
        'vite-node': '^5.3.0',
    };

    if (opts.deployTarget === 'vercel-serverless') {
        deps['@mionkit/platform-vercel'] = '^0.7.2';
        devDeps['@mionkit/platform-node'] = '^0.7.2';
    } else if (opts.deployTarget === 'standalone-bun') {
        deps['@mionkit/platform-bun'] = '^0.7.2';
    } else {
        deps['@mionkit/platform-node'] = '^0.7.2';
    }

    const pkg = {
        name: `@${opts.projectName}/api`,
        version: '0.1.0',
        private: true,
        type: 'module',
        main: './dist/server.js',
        exports: {'.': './src/routes.ts', './dist/*': './dist/*'},
        scripts: {
            dev: 'vite-node src/server.ts',
            build: 'vite build',
        },
        dependencies: deps,
        devDependencies: devDeps,
    };

    return JSON.stringify(pkg, null, 2) + '\n';
}
