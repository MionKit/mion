# Code Import Links Extension

A simple VS Code extension that makes `code-import` path attributes clickable in markdown files.

## Features

- **Ctrl+Click** (or Cmd+Click on macOS) on any `path` attribute in a `<code-import>` tag to open the file
- Works with paths relative to the monorepo root

## Installation (Development)

1. Navigate to the extension folder:
   ```bash
   cd container/website/.vscode-extension
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Compile the extension:
   ```bash
   npm run compile
   ```

4. Press `F5` in VS Code to launch a new Extension Development Host window with the extension loaded.

## Alternative: Symlink for Local Use

You can also symlink this extension to your VS Code extensions folder:

```bash
# On macOS/Linux
ln -s $(pwd) ~/.vscode/extensions/code-import-links

# On Windows (run as admin)
mklink /D "%USERPROFILE%\.vscode\extensions\code-import-links" "%CD%"
```

Then reload VS Code.

## Usage

In any markdown file, paths in `code-import` tags become clickable:

```markdown
<code-import path="packages/examples/src/router/middleFns.ts" lang="ts" />
```

Ctrl+Click (Cmd+Click on macOS) on the path to open the file.

