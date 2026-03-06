import {join} from 'node:path';
import {existsSync} from 'node:fs';
import {detectFramework} from './detect.ts';
import {promptInitOptions, type InitOptions, type DeployTarget} from './prompts.ts';
import {writeFiles, readJson, writeJson, type GeneratedFile} from './fileGenerator.ts';
import {generateApiPackageJson} from './generators/shared/apiPackageJson.ts';
import {getNextjsRootScripts} from './generators/nextjs/rootScripts.ts';
import {readTemplate} from './readTemplate.ts';

const SERVER_TEMPLATES: Record<DeployTarget, string> = {
    'vercel-serverless': 'nextjs/api/src/server.vercel.ts',
    'standalone-node': 'nextjs/api/src/server.node.ts',
    'standalone-bun': 'nextjs/api/src/server.bun.ts',
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
                'Make sure you run this command from your project root.',
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
            {path: 'api/package.json', content: generateApiPackageJson({projectName: project.name, deployTarget: options.deployTarget})},
            {path: 'api/tsconfig.json', content: readTemplate('nextjs/api/tsconfig.json')},
            {path: 'api/vite.config.ts', content: readTemplate('nextjs/api/vite.config.ts')},
            {path: 'api/src/routes.ts', content: readTemplate('nextjs/api/src/routes.ts', {PREFIX: routerPrefix})},
        );

        // Server entry point (varies by deploy target)
        const serverReplacements = options.deployTarget === 'vercel-serverless' ? {BASE_PATH: options.basePath} : undefined;
        files.push({
            path: 'api/src/server.ts',
            content: readTemplate(SERVER_TEMPLATES[options.deployTarget], serverReplacements),
        });

        // Catch-all route for Vercel serverless
        if (options.deployTarget === 'vercel-serverless') {
            const catchAllDir = getCatchAllDir(cwd);
            files.push({
                path: `${catchAllDir}/route.ts`,
                content: readTemplate('nextjs/app/api/[...mion]/route.ts', {API_WORKSPACE: apiWorkspaceName}),
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
    updateRootPackageJson(cwd, rootScripts);

    // 8. Print instructions
    printInstructions(options.deployTarget);
}

/** Finds the Next.js catch-all route path based on app router structure */
function getCatchAllDir(cwd: string): string {
    if (existsSync(join(cwd, 'src/app'))) return 'src/app/api/[...mion]';
    if (existsSync(join(cwd, 'app'))) return 'app/api/[...mion]';
    return 'src/app/api/[...mion]';
}

/** Updates the root package.json with workspaces and scripts */
function updateRootPackageJson(cwd: string, scripts: Record<string, string>): void {
    const pkgPath = join(cwd, 'package.json');
    const pkg = readJson<Record<string, unknown>>(pkgPath);

    // Add workspaces
    const workspaces = (pkg.workspaces as string[]) || [];
    if (!workspaces.includes('api')) {
        workspaces.push('api');
        pkg.workspaces = workspaces;
        console.log('  added workspaces: ["api"]');
    }

    // Add/update scripts
    const existingScripts = (pkg.scripts as Record<string, string>) || {};
    for (const [name, command] of Object.entries(scripts)) {
        existingScripts[`mion:${name}`] = command;
        console.log(`  added script "mion:${name}"`);
    }
    pkg.scripts = existingScripts;

    writeJson(pkgPath, pkg);
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
