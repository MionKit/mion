I need to implement TypeScript LSP-like hover information for code blocks in our documentation website, similar to IDE functionality. The website uses Nuxt 4, MDC 3, and Docus theme, with a code-import plugin that imports code from `packages/examples/src` before markdown rendering.

**Implementation Requirements:**
- Use Shiki.js (likely already installed via MDC) with the `@shikijs/twoslash` plugin
- The twoslash plugin runs TypeScript analysis on code blocks using a virtual file system
- Must work with our existing code-import functionality


**Setup Instructions:**
1. Create branch `typescript-lsp-docs` before starting
2. Commit after each successful stage (do NOT commit package-lock.json changes)
3. Research how `@shikijs/twoslash` creates virtual file systems for TypeScript analysis

**Stage 1: Basic Twoslash Functionality**
- Create a test page with TypeScript code blocks (no imports)
- Include: 1 type definition and 1 constant using that type
- Use `// ^?` syntax to show type information of the constant
- Create custom component to render Shiki code blocks with twoslash (default Shiki markdown won't work)
- Test with Playwright to verify type information displays correctly

**Stage 2: Twoslash + Code-Import Integration**
- Create example file in examples package with same structure as Stage 1
- Verify code-import executes before twoslash functionality
- Use playwright to Ensure type information still displays correctly

example
```MDC
::twoslash-code
<code-import src="packages/examples/src/introduction/about-client.ts" />
::
```

in previous example code import is resolve before markdown is rendered,
so the ::twoslash-code component will see code fully resolved. we just need to make sure
the ::twoslash-code component is able to process the slot content and run it by twoslash 

```MDC
import {initClient} from '@mionjs/client';
import type {MyApi} from './about-server.ts';

const {routes} = initClient<MyApi>({
    baseURL: 'http://localhost:3000',
});

async function example() {
    // Call server method as if it were a local function
    const [hello] = await routes.sayHello('World').call();
    console.log(hello);
}
example();
```

**Stage 3: Full Import Resolution (Most Complex)**
- Test with these specific files:
  - `packages/examples/src/introduction/about-client.ts`
  - `packages/examples/src/introduction/about-server.ts`
- Convert relative imports to named package imports:
  - Change: `import type {MyApi} from './about-server.ts';`
  - To: `import type {MyApi} from '@mionjs/examples/src/introduction/about-server.ts';`
- we need to geneate d.ts files fol all mion packages, so you can compile the examples and esure d.ts files are emitted correctly.
- Configure twoslash to resolve all @mionjs packages in virtual file system (might neet to pass references to all mion packages)
- Ensure all example files are properly exported from package

**Success Criteria:**
Complete stage 1 and 2, and try to implement satge 3 if you see you are getting many errors and can't make it work then leave it as is.

Please create a detailed task list for each stage before implementation. and commit after each satge is succesful so e can go back if needed. !!!Do not modify any other pacakge other than examples.!!!

Before you start please make sure to check @shikijs/twoslash docs to see how it works. 
Bellow is a description of how the virtual file system works: 

-------- twoslash virtual file system --------

## 1. How Twoslash actually runs TypeScript (important mental model)

Twoslash does not:
- spawn tsc
- read your real filesystem by default
- use your project’s tsconfig.json automatically

Instead, it:
- Creates an in-memory TypeScript Language Service
- Feeds it a set of virtual files (strings)
- Applies compiler options you explicitly pass
- Lets TypeScript resolve imports only inside that virtual world

So unless you tell it otherwise:
- There is no node_modules
- There is no project root
- There are no files other than the snippet
- This is the key reason imports “sometimes work” and sometimes don’t.

## 2. The key concept: virtual files

Twoslash supports multiple virtual files via special comments:

```ts
// @filename: server/routes.ts
export type Routes = {
  "/users": {
    GET: { response: { id: string } }
  }
}
```
```ts
// @filename: client/api.ts
import type { Routes } from "../server/routes"

type UserResponse = Routes["/users"]["GET"]["response"]
//    ^?
```

Twoslash stitches these into an in-memory filesystem and asks TypeScript to resolve imports as if those files existed.

👉 All imports must resolve inside this virtual file graph.



## 3. How import resolution works in Twoslash

TypeScript resolves imports using:
- Compiler options (moduleResolution, baseUrl, paths, etc.)
- The virtual filenames you define
- The “current file” name

Twoslash sets:
- a default file name if you don’t specify one
- relative imports are resolved relative to that filename

Example: why relative imports break

If you write:
```ts
import { Routes } from "../server/routes"
```
but your file is implicitly named something like:
``` bash
/index.ts
```
Then TS tries to resolve:
``` bash
/server/routes.ts
```

## 4.How to use twonslash in monorepos (our case)

What you already have (good)
- Monorepo
- packages/*
- Project references
- An examples package that actually compiles

Consistent named imports like:
```ts
import { createRouter } from "@mionjs/router"
```

The critical constraint (the missing piece)

Twoslash does not understand TS project references.

Even if you pass:
```ts
compilerOptions: {
  references: [...]
}
```
👉 Twoslash ignores them because:
- it does not invoke tsc --build
- it only runs a language service with an in-memory FS

So you must materialize the referenced packages in some form.

The correct mental model

Think of Twoslash as this:

“Compile the examples package in isolation, but everything it imports must exist as .ts or .d.ts files.”

So your job is to make this virtual view true:
```bash
/node_modules/@mionjs/router/index.d.ts
/node_modules/@mionjs/server/index.d.ts
/node_modules/@mionjs/client/index.d.ts
/examples/example.ts
```
Recommended architecture (this works very well)
✅ 1. Always use named imports (you’re right)
Benefits:
- No relative paths in markdown
- Stable copy/paste UX
- Mirrors real user usage
- Easy to stub or generate types


✅ 2. Treat examples as the “root project”

Your Twoslash config should mirror:
```bash
packages/examples/tsconfig.json
```
Including:
- strict
- lib
- moduleResolution
- paths (if any)

✅ 3. Generate .d.ts for each package (THIS IS KEY)
- You already have references → perfect.
- Run once during docs build:
```bash
tsc -b packages/* --emitDeclarationOnly
```
This gives you:
```bash
packages/core/dist/core.d.ts
packages/router/dist/router.d.ts
packages/client/dist/client.d.ts
```
✅ 4. Configure Twoslash to load these .d.ts files

✅ 4. Feed those .d.ts files into Twoslash as virtual node_modules

Programmatically:
```ts
const extraFiles = {
  "node_modules/@mionjs/router/index.d.ts":
    fs.readFileSync("packages/router/dist/index.d.ts", "utf8"),

  "node_modules/@mionjs/server/index.d.ts":
    fs.readFileSync("packages/server/dist/index.d.ts", "utf8"),
}
runTwoSlash(code, {
  compilerOptions: {
    moduleResolution: "NodeNext",
    strict: true,
  },
  extraFiles,
})
```
Now named imports should resolve exactly like real users expect

Named imports mean:
- You don’t care where the file lives
- You only need the public surface
- You can stub, generate, or reuse .d.ts

What you do not need
❌ Passing TS references
❌ Loading full source trees
❌ Matching real filesystem layout
❌ Running tsc inside Twoslash

Twoslash only needs:
- types
- entrypoints
- correct module names

Minimal checklist
✅ Always import from @mionjs/*
✅ One examples package = source of truth
✅ Emit .d.ts for every workspace package
✅ Mount them as node_modules/* in Twoslash
✅ Mirror examples/tsconfig.json options

One last subtle tip:
If your packages use "exports" in package.json, make sure your generated .d.ts matches the export shape — otherwise Twoslash may resolve but show different types than runtime.