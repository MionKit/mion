// Shared vitest globalSetup — TEARDOWN only. The runtypes transform writes a
// generated-modules tree under each project's `.mion` genDir during a test
// run; this removes those trees once the run finishes so tests never leave
// generated artifacts behind on disk (the .gitignore entries stay only as a
// safety net for an interrupted run).
//
// It sweeps for dirs named `.mion` / `.mion-*` under the project root
// rather than removing one fixed path, because genDirs also land in nested spots
// (mion devtools test-fixtures, test-server's per-target `.mion-edge` /
// `.mion-cloudflare`, the mock-format-isolation project). The sweep never
// enters build outputs: `.dist/**/.mion` is SHIPPED bundled output, not a
// leftover. Referenced from the ROOT vitest config too — the root project's
// globalSetup initializes on every run, filtered ones included, which covers the
// genDirs that project INITIALIZATION creates for projects that never run a test
// (their own teardowns don't fire).
//
// Safe to reference from any project: vitest runs ALL projects' teardowns after
// the WHOLE multi-project run, so no still-running suite can be using a dir.
import {readdir, rm} from 'node:fs/promises';
import {join} from 'node:path';
import type {TestProject} from 'vitest/node';

// Never recurse into these: huge trees (node_modules, .git, third_party), build
// outputs that legitimately contain a bundled .mion (.dist, dist, build),
// or unrelated container apps.
// This is also why the Go resolver's output dir is `mion-bin/` and NOT
// `.mion-bin/`: the `.mion-*` sweep below deletes such a dir wholesale, so a
// dot-prefixed name would silently remove the built binary after every run.
const SKIP_DIRS = new Set(['node_modules', '.git', '.dist', 'dist', 'build', 'mion-bin', 'third_party', 'container']);
// Recursion bound: a genDir is found as long as its PARENT dir sits at depth <
// MAX_DEPTH. Deepest known parent from the repo root is depth 4
// (packages/run-types/test/mock-format-isolation/.mion).
const MAX_DEPTH = 5;
// The generated halves inside a `.mion` dir: the cache modules, the enrichment
// mirrors (test trees only; a real project's `enriched/` is committed and never
// sits under a test root), the README, and `rpc/`, the batch transport the
// resolver regenerates on every generate. Only these are swept, never the
// folder itself: a hand-placed file beside them is not ours. Per-target
// `.mion-<target>` dirs are RunTypes-only and go wholesale.
export const RUNTYPES_HALVES = ['types', 'enriched', 'rpc', 'README.md'];

async function removeGenDirs(dir: string, depth: number): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, {withFileTypes: true});
  } catch {
    return; // root vanished mid-walk or unreadable — nothing to clean here
  }
  await Promise.all(
    entries.map(async (entry) => {
      if (!entry.isDirectory()) return; // symlinks are not followed
      if (entry.name === '.mion') {
        await Promise.all(RUNTYPES_HALVES.map((half) => rm(join(dir, entry.name, half), {recursive: true, force: true})));
        return;
      }
      if (entry.name.startsWith('.mion-')) {
        await rm(join(dir, entry.name), {recursive: true, force: true});
        return;
      }
      if (SKIP_DIRS.has(entry.name) || depth >= MAX_DEPTH) return;
      await removeGenDirs(join(dir, entry.name), depth + 1);
    })
  );
}

export default function cleanRunTypesGenDirs(project: TestProject): () => Promise<void> {
  const root = project.config.root;
  return () => removeGenDirs(root, 0);
}
