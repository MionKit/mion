import {readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';

export function annotateFixtureDiagnostics(tree, diagnostics) {
  const files = new Map();
  for (const diagnostic of diagnostics) {
    if (diagnostic.code !== 'rpc-handler-drizzle-import' || diagnostic.downgraded) continue;
    const file = path.resolve(tree, diagnostic.site.filePath);
    const relative = path.relative(path.join(tree, 'tests'), file);
    if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) continue;
    if (!files.has(file)) files.set(file, new Set());
    files.get(file).add(diagnostic.site.startLine);
  }
  let count = 0;
  for (const [file, lines] of files) {
    const source = readFileSync(file, 'utf8').split('\n');
    for (const line of [...lines].sort((a, b) => b - a)) {
      if (!Number.isInteger(line) || line < 1 || line > source.length) throw new Error(`Invalid diagnostic line in ${file}`);
      source.splice(line - 1, 0, '// @mion-downgrade-error rpc-handler-drizzle-import');
      count++;
    }
    writeFileSync(file, source.join('\n'));
  }
  return count;
}
