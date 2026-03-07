import {join} from 'node:path';
import {existsSync} from 'node:fs';
import {detectFramework} from './detect.ts';
import {promptInitOptions, type InitOptions, type DeployTarget} from './prompts.ts';
import {writeFiles, readJson, writeJson, type GeneratedFile} from './fileGenerator.ts';
import {generateApiPackageJson} from './generators/shared/apiPackageJson.ts';
import {getNextjsRootScripts} from './generators/nextjs/rootScripts.ts';
import {readStarterFile, readStarterTsConfig} from './readStarterFile.ts';

const SERVER_FILES: Record<DeployTarget, string> = {
    'vercel-serverless': 'nextjs-16/mion-app/api/src/vercel-serverless.ts',
    'standalone-node': 'nextjs-16/mion-app/api/src/server.node.ts',
    'standalone-bun': 'nextjs-16/mion-app/api/src/server.bun.ts',
};

/** Main init command: scaffolds mion into the current project */
export async function init(cwd: string, providedOptions?: InitOptions): Promise<void> {
    console.log('\n@mionkit/starter — Scaffold mion API\n');

    // 1. Detect project type
    const project = detectFramework(cwd);
    if (!project) {
        throw new Error(
            'Could not detect a supported meta-framework in this directory.\n' +
                'Supported: Next.js (next.config.{js,ts,mjs})\n\n' +
                'Make sure you run this command from your project root.'
        );
    }
    console.log(`Detected: ${project.framework} (${project.configFile})`);
    console.log(`Project: ${project.name}`);

    // 2. Check if api/ already exists
    if (existsSync(join(cwd, 'api'))) {
        throw new Error('An api/ directory already exists. Aborting to avoid overwriting files.');
    }

    // 3. Prompt user for options (or use provided ones)
    const options = providedOptions || (await promptInitOptions());

    // 4. Derive config values
    const routerPrefix = options.basePath.replace(/^\//, '');
    const apiWorkspaceName = `@${project.name}/api`;

    // 5. Generate files
    const files: GeneratedFile[] = [];
    let rootScripts: Record<string, string> = {};

    if (project.framework === 'nextjs') {
        // api/ workspace files
        files.push(
            {
                path: 'api/package.json',
                content: generateApiPackageJson({projectName: project.name, deployTarget: options.deployTarget}),
            },
            {path: 'api/tsconfig.json', content: readStarterTsConfig('nextjs-16/mion-app/api/tsconfig.json')},
            {
                path: 'api/vite.config.ts',
                content: readStarterFile('nextjs-16/mion-app/api/vite.config.ts', {SERVER_ENTRY: 'server.ts'}),
            }
        );

        if (options.withExample) {
            // Full example: api.ts with orders handler + showcase page
            files.push(
                {path: 'api/src/api.ts', content: readStarterFile('nextjs-16/mion-app/api/src/api.ts', {PREFIX: routerPrefix})},
                {path: 'api/src/handlers/orders.ts', content: readStarterFile('nextjs-16/mion-app/api/src/handlers/orders.ts')},
                {
                    path: 'app/orders/page.tsx',
                    content: readStarterFile('nextjs-16/mion-app/app/orders/page.tsx', {
                        PREFIX: routerPrefix,
                        API_WORKSPACE: apiWorkspaceName,
                    }),
                }
            );
        } else {
            // Minimal api entry point
            files.push({path: 'api/src/api.ts', content: generateMinimalApi(routerPrefix)});
        }

        // Server entry point (varies by deploy target)
        const serverReplacements = options.deployTarget === 'vercel-serverless' ? {BASE_PATH: options.basePath} : undefined;
        files.push({
            path: 'api/src/server.ts',
            content: readStarterFile(SERVER_FILES[options.deployTarget], serverReplacements),
        });

        // Catch-all route for Vercel serverless
        if (options.deployTarget === 'vercel-serverless') {
            const catchAllDir = getCatchAllDir(cwd);
            files.push({
                path: `${catchAllDir}/route.ts`,
                content: readStarterFile('nextjs-16/mion-app/app/api/[...mion]/route.ts', {API_WORKSPACE: apiWorkspaceName}),
            });
        }

        rootScripts = getNextjsRootScripts(apiWorkspaceName);
    } else {
        throw new Error(`Framework "${project.framework}" is not yet supported. Only Next.js is currently available.`);
    }

    // 6. Write all files
    console.log('\nCreating files:');
    writeFiles(cwd, files);

    // 7. Modify root package.json
    console.log('\nUpdating root package.json:');
    const rootDependencies: Record<string, string> = {'@mionkit/client': '^0.7.2'};
    updateRootPackageJson(cwd, rootScripts, rootDependencies);

    // 8. Print instructions
    printInstructions(options.deployTarget);
}

/** Finds the Next.js catch-all route path based on app router structure */
function getCatchAllDir(cwd: string): string {
    if (existsSync(join(cwd, 'src/app'))) return 'src/app/api/[...mion]';
    if (existsSync(join(cwd, 'app'))) return 'app/api/[...mion]';
    return 'src/app/api/[...mion]';
}

/** Updates the root package.json with workspaces, scripts, and dependencies */
function updateRootPackageJson(cwd: string, scripts: Record<string, string>, dependencies: Record<string, string>): void {
    const pkgPath = join(cwd, 'package.json');
    const pkg = readJson<Record<string, unknown>>(pkgPath);

    // Add workspaces
    const workspaces = (pkg.workspaces as string[]) || [];
    if (!workspaces.includes('api')) {
        workspaces.push('api');
        pkg.workspaces = workspaces;
        console.log('  added workspaces: ["api"]');
    }

    // Add dependencies
    const existingDeps = (pkg.dependencies as Record<string, string>) || {};
    for (const [name, version] of Object.entries(dependencies)) {
        existingDeps[name] = version;
        console.log(`  added dependency "${name}": "${version}"`);
    }
    pkg.dependencies = existingDeps;

    // Add/update scripts
    const existingScripts = (pkg.scripts as Record<string, string>) || {};
    for (const [name, command] of Object.entries(scripts)) {
        existingScripts[`mion:${name}`] = command;
        console.log(`  added script "mion:${name}"`);
    }
    pkg.scripts = existingScripts;

    writeJson(pkgPath, pkg);
}

/** Generates a minimal api.ts with hello/getTime routes */
function generateMinimalApi(prefix: string): string {
    return [
        `import {initMionRouter, route, Routes} from '@mionkit/router';`,
        ``,
        `const routes = {`,
        `    hello: route((ctx, name: string): string => \`Hello \${name}!\`),`,
        `    getTime: route((ctx): Date => new Date()),`,
        `} satisfies Routes;`,
        ``,
        `export const myApi = await initMionRouter(routes, {prefix: '${prefix}'});`,
        `export type MyApi = typeof myApi;`,
        ``,
    ].join('\n');
}

function printInstructions(deployTarget: string): void {
    console.log(`
Done! Next steps:

  1. Install dependencies:
     npm install

  2. Start development:
     npm run mion:dev

  3. Build for production:
     npm run mion:build
`);

    if (deployTarget === 'vercel-serverless') {
        console.log(`  Vercel build command: npm run mion:build`);
        console.log(`  The catch-all route at src/app/api/[...mion]/route.ts`);
        console.log(`  imports the pre-built mion API output.\n`);
    }
}
