/** Returns the scripts to add/merge into the root package.json for Next.js projects */
export function getNextjsRootScripts(apiWorkspaceName: string): Record<string, string> {
    return {
        dev: `concurrently "npm run dev -w ${apiWorkspaceName}" "next dev"`,
        build: `npm run build -w ${apiWorkspaceName} && next build`,
    };
}
