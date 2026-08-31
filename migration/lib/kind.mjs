// The context classifier. `scan`, `check`, `apply` and `verify` ALL derive row keys
// through this one function, so the key a row was marked under is by construction the key
// it is looked up under later. Nothing here may depend on anything but its arguments.
//
// It does not need to be clever, only deterministic and shared: `check` re-derives every
// key in the tree and fails on any key the shards do not carry, so a change here surfaces
// as a hard failure rather than a silent mis-apply.

const CODE_EXT = new Set(['ts', 'tsx', 'mts', 'cts', 'js', 'mjs', 'cjs', 'go', 'vue']);

function extensionOf(file) {
  const match = file.match(/\.([a-z]+)$/);
  if (match) return match[1];
  // Containerfile, _redirects, LICENSE and friends have no extension; the basename is a
  // better label than a shared "none" bucket that would merge unrelated contexts.
  return file.slice(file.lastIndexOf('/') + 1).toLowerCase();
}

// Returns a `(line, index) => kind` closure that carries the markdown fence state across
// the lines of one file. Call it once per file and feed it every line IN ORDER, including
// the lines with no match, or the fence tracking drifts.
export function makeKinder(file) {
  const ext = extensionOf(file);
  const isCode = CODE_EXT.has(ext);
  const isMarkdown = ext === 'md';
  const isConfig = ext === 'json' || ext === 'yaml' || ext === 'yml';
  let inFence = false;

  return function kindOf(line, index) {
    if (isMarkdown && /^\s*```/.test(line)) inFence = !inFence;

    const before = line.slice(0, index);

    if (isMarkdown) {
      // A fenced block, an indented block, or anything wearing inline backticks is code
      // being SHOWN. It follows the code's fate, not the prose's.
      if (inFence || /^\s{4,}/.test(line) || line.includes('`')) return 'md-code';
      return 'md-prose';
    }

    if (isCode) {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return 'comment';
      if (/\/\/|\/\*/.test(before)) return 'trailing-comment';
      // `from './x'`, `import('./x')`, `require('./x')` -- the specifier itself.
      if (/\b(from|import|require)\s*\(?\s*['"`]$/.test(before)) return 'import-spec';
    }

    if (isConfig) return /:\s*["']?$/.test(before) ? 'cfg-value' : 'cfg-key';

    if (isCode && /['"`]$/.test(before)) return 'string-lit';
    if (ext === 'go') return 'go';
    if (isCode) return 'code';

    // Shell, Containerfiles, .gitignore, yaml-less config: one bucket per file type keeps
    // unrelated contexts from merging into a single undifferentiated row.
    return `other-${ext}`;
  };
}
