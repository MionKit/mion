// Prints the report's numbers. Run setup.mjs first. REPS=<n> sets the timing repeats (default 5).
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {readFileSync, writeFileSync, statSync} from 'node:fs';
import {join} from 'node:path';

const HERE = new URL('.', import.meta.url).pathname;
const REPO = join(HERE, '../..');
const WORK = join(HERE, '.work');
const ts = createRequire(join(REPO, 'package.json'))('typescript');
const REPS = Number(process.env.REPS || 5);
const TSC = join(REPO, 'node_modules/.bin/tsc');
const TSGO = join(WORK, 'tsgo');
const fixtures = JSON.parse(readFileSync(join(WORK, 'fixtures.json'), 'utf8'));
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const CONFIG = {
  module: 'esnext', moduleResolution: 'bundler', lib: ['es2023', 'dom'], types: ['node'], typeRoots: [join(REPO, 'node_modules/@types')],
  allowImportingTsExtensions: true, esModuleInterop: true, skipLibCheck: true, strict: true, noImplicitAny: false, noEmit: true,
  target: 'es2023', moduleDetection: 'force',
};
const OPTIONS = ts.convertCompilerOptionsFromJson(CONFIG, WORK).options;

/** Editor-like (only the client file checked) or tsc-like (whole program) instantiation count. */
function apiCount(file, wholeProgram) {
  const program = ts.createProgram([file], OPTIONS);
  const diagnostics = wholeProgram ? program.getSemanticDiagnostics() : program.getSemanticDiagnostics(program.getSourceFile(file));
  const errors = diagnostics.filter((d) => !d.file?.fileName.endsWith('.d.ts'));
  if (errors.length) throw new Error(`${file}: ${ts.flattenDiagnosticMessageText(errors[0].messageText, ' ')}`);
  return {files: program.getSourceFiles().length, instantiations: program.getTypeChecker().getInstantiationCount()};
}

/** Real compiler run on a one-file tsconfig: median total time, plus counts and memory. */
function cli(bin, file) {
  const config = join(WORK, 'tsconfig.case.json');
  writeFileSync(config, JSON.stringify({compilerOptions: CONFIG, files: [file]}));
  const runs = Array.from({length: REPS}, () => {
    let out;
    try {
      out = execFileSync(bin, ['-p', config, '--extendedDiagnostics'], {encoding: 'utf8'});
    } catch (err) {
      throw new Error(`${bin} failed on ${file}:\n${err.stdout}`);
    }
    const field = (name) => out.match(new RegExp(`^${name}:\\s+(\\S+)`, 'm'))?.[1];
    return {instantiations: Number(field('Instantiations')), totalS: parseFloat(field('Total time')), memory: field('Memory used')};
  });
  return {...runs[0], totalS: median(runs.map((r) => r.totalS))};
}

console.log('## Example app: instantiations, editor (client file only) / whole program\n');
console.log('| fixture | client | layout | files | editor | whole program |\n| --- | --- | --- | ---: | ---: | ---: |');
for (const fx of fixtures)
  for (const client of ['typeOnly', 'valueImport'])
    for (const layout of ['split', 'mixed', 'mixedQueries', 'splitDts', 'mixedDts', 'mixedQueriesDts']) {
      const file = join(WORK, 'fx', fx, `client.${client}.${layout}.ts`);
      const editor = apiCount(file, false);
      const whole = apiCount(file, true);
      console.log(`| ${fx} | ${client} | ${layout} | ${editor.files} | ${editor.instantiations} | ${whole.instantiations} |`);
    }

console.log(`\n## Example app, type-only client: tsc and tsgo, median of ${REPS}\n`);
console.log('| fixture | layout | tool | instantiations | total | memory |\n| --- | --- | --- | ---: | ---: | ---: |');
for (const fx of ['pg.builders', 'sqlite.types'])
  for (const layout of ['split', 'mixed', 'mixedQueries', 'splitDts', 'mixedDts'])
    for (const [tool, bin] of [['tsc', TSC], ['tsgo', TSGO]]) {
      const r = cli(bin, join(WORK, 'fx', fx, `client.typeOnly.${layout}.ts`));
      console.log(`| ${fx} | ${layout} | ${tool} | ${r.instantiations} | ${r.totalS} s | ${r.memory} |`);
    }

console.log(`\n## Scaling: generated pg tables, median of ${REPS}\n`);
console.log('| tables | layout | editor | tsc inst | tsc total | tsgo inst | tsgo total |\n| ---: | --- | ---: | ---: | ---: | ---: | ---: |');
for (const n of [1, 10, 30, 60])
  for (const layout of ['split', 'mixed']) {
    const file = join(WORK, 'scale', `n${n}`, `client.${layout}.ts`);
    const editor = apiCount(file, false);
    const tsc = cli(TSC, file);
    const tsgo = cli(TSGO, file);
    console.log(`| ${n} | ${layout} | ${editor.instantiations} | ${tsc.instantiations} | ${tsc.totalS} s | ${tsgo.instantiations} | ${tsgo.totalS} s |`);
  }

console.log('\n## Bundle: pg builders value import, esbuild minified\n');
console.log('| layout | bytes | drizzle-orm modules |\n| --- | ---: | ---: |');
for (const layout of ['split', 'mixed']) {
  const out = join(WORK, 'bundle', `${layout}.js`);
  const meta = join(WORK, 'bundle', `${layout}.meta.json`);
  execFileSync(join(REPO, 'node_modules/.bin/esbuild'), [
    join(WORK, 'bundle/pg.builders', `client.valueImport.${layout}.ts`), '--bundle', '--format=esm', '--minify', '--platform=browser',
    '--conditions=source', `--outfile=${out}`, `--metafile=${meta}`, '--log-level=error',
  ]);
  const inputs = Object.keys(JSON.parse(readFileSync(meta, 'utf8')).inputs).filter((f) => f.includes('drizzle-orm/') && !f.includes('packages/'));
  console.log(`| ${layout} | ${statSync(out).size} | ${inputs.length} |`);
}
