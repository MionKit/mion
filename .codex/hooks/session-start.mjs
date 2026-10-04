import {spawnSync} from 'node:child_process';
import {accessSync, constants, existsSync, readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';

const capture = (command, args, cwd) => spawnSync(command, args, {cwd, encoding: 'utf8', timeout: 2000});

function report() {
  let cwd = process.cwd();
  const input = readFileSync(0, 'utf8').trim();
  if (input) cwd = JSON.parse(input).cwd || cwd;
  const checkout = capture('git', ['rev-parse', '--show-toplevel'], cwd);
  if (checkout.status !== 0) return 'Mion startup check: no repository checkout found.';
  const root = checkout.stdout.trim();
  const lines = [];
  const check = (ok, label) => lines.push(`${ok ? 'OK' : 'MISSING'} ${label}`);
  const versionAtLeast = (actual, major, minor = 0) => {
    const match = /(\d+)\.(\d+)/.exec(actual || '');
    return !!match && (Number(match[1]) > major || (Number(match[1]) === major && Number(match[2]) >= minor));
  };

  check(versionAtLeast(process.versions.node, 26), 'Node >= 26');
  check(versionAtLeast(capture('pnpm', ['--version'], root).stdout, 11), 'pnpm >= 11');
  check(versionAtLeast(capture('go', ['version'], root).stdout, 1, 26), 'Go >= 1.26');
  check(versionAtLeast(capture('podman', ['--version'], root).stdout, 4), 'podman >= 4');
  for (const path of [
    'ts-go-runtypes/third_party/tsgolint/go.mod',
    'ts-go-runtypes/third_party/tsgolint/typescript-go/go.mod',
    'node_modules/.modules.yaml',
    'packages/devtools/dist/index.js',
    'packages/run-types/dist/index.js',
  ]) check(existsSync(join(root, path)), path);
  const patches = join(root, 'ts-go-runtypes/third_party/tsgolint/patches');
  const compiler = join(root, 'ts-go-runtypes/third_party/tsgolint/typescript-go');
  const patchFiles = existsSync(patches) ? readdirSync(patches).filter((file) => file.endsWith('.patch')) : [];
  check(existsSync(patches) && existsSync(compiler) && patchFiles.every((file) =>
    capture('git', ['apply', '--reverse', '--check', join(patches, file)], compiler).status === 0), 'tsgolint patches applied');
  let executable = true;
  try {
    accessSync(join(root, 'mion-bin/mion'), constants.X_OK);
  } catch {
    executable = false;
  }
  check(executable, 'mion-bin/mion executable');
  return ['Mion startup check (read only):', ...lines,
    lines.some((line) => line.startsWith('MISSING'))
      ? 'Use the ts-runtypes-setup skill and SETUP.md for missing dependencies. This hook does not install or build.'
      : 'Required tools and build artifacts are present.'].join('\n');
}

try {
  console.log(JSON.stringify({hookSpecificOutput: {hookEventName: 'SessionStart', additionalContext: report()}}));
} catch {
  console.log(JSON.stringify({hookSpecificOutput: {hookEventName: 'SessionStart', additionalContext: 'Mion startup check could not read its input. Check SETUP.md before running project commands.'}}));
}
