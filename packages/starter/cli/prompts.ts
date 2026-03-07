import {createInterface} from 'node:readline';

export type DeployTarget = 'vercel-serverless' | 'standalone-node' | 'standalone-bun';

export interface InitOptions {
    deployTarget: DeployTarget;
    basePath: string;
    withExample?: boolean;
}

const DEPLOY_OPTIONS: {label: string; value: DeployTarget}[] = [
    {label: 'Vercel Serverless (default)', value: 'vercel-serverless'},
    {label: 'Standalone Node.js', value: 'standalone-node'},
    {label: 'Standalone Bun', value: 'standalone-bun'},
];

/** Prompts the user for init configuration using readline (zero deps) */
export async function promptInitOptions(): Promise<InitOptions> {
    const rl = createInterface({input: process.stdin, output: process.stdout});
    const ask = (question: string): Promise<string> =>
        new Promise((resolve) => rl.question(question, (answer) => resolve(answer.trim())));

    try {
        console.log('\n? Deployment target:');
        DEPLOY_OPTIONS.forEach((opt, i) => {
            console.log(`  ${i + 1}) ${opt.label}`);
        });
        const targetAnswer = await ask('  Enter choice [1]: ');
        const targetIndex = targetAnswer ? parseInt(targetAnswer, 10) - 1 : 0;
        const deployTarget = DEPLOY_OPTIONS[targetIndex]?.value || DEPLOY_OPTIONS[0].value;
        console.log(`  > ${DEPLOY_OPTIONS[targetIndex]?.label || DEPLOY_OPTIONS[0].label}\n`);

        const basePathAnswer = await ask('? API base path [/api/mion]: ');
        const basePath = basePathAnswer || '/api/mion';
        console.log(`  > ${basePath}\n`);

        const exampleAnswer = await ask('? Include example API (orders showcase)? [y/N]: ');
        const withExample = exampleAnswer.toLowerCase() === 'y' || exampleAnswer.toLowerCase() === 'yes';
        console.log(`  > ${withExample ? 'Yes' : 'No'}\n`);

        return {deployTarget, basePath, withExample};
    } finally {
        rl.close();
    }
}
