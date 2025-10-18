/**
 * @typedef {string} JidCode1
 */

/**
 * @typedef {{code: string, type: string}} JidCode2
 */

// ## Goal
// the goal is to compare the performance hit of returning a string vs an object from a function for JitCode type
// JitCode type is return type of all _compileX functions.

let jitCode1Counter = 0;
let jitCode2Counter = 0;

function getJitCodeObject() {
  return {code: 'const a = 1;', type: 'E' + jitCode2Counter++};
}

function getJitCode1Type() {
  return 'E' + jitCode1Counter++;
}

function getJitCodeString1() {
  return 'const a = 1;' + getJitCode1Type();
}

function getJitCodeStringOnly() {
  getJitCode1Type();
  return 'const a = 1;';
}

function getJitCodeArray() {
  return ['const a = 1;', getJitCode1Type()];
}

// Benchmark utilities
function benchmark(name, fn, iterations = 1000000) {
  const start = process.hrtime.bigint();
  for (let i = 0; i < iterations; i++) {
    fn();
  }
  const end = process.hrtime.bigint();
  const duration = Number(end - start) / 1000000; // Convert to milliseconds
  console.log(`${name}: ${duration.toFixed(2)}ms (${iterations} iterations)`);
  return duration;
}

function resetCounters() {
  jitCode1Counter = 0;
  jitCode2Counter = 0;
}

function runBenchmarks() {
  console.log('\n=== JIT Code String vs Object Benchmark ===\n');
  const iterations = 10000000;
  console.log(`Running ${iterations.toLocaleString()} iterations...\n`);

  resetCounters();
  const stringTime = benchmark('getJitCode1 (string)', getJitCodeString1, iterations);

  resetCounters();
  const objectTime = benchmark('getJitCode2 (object)', getJitCodeObject, iterations);

  resetCounters();
  const stringOnlyTime = benchmark('getJitCode1Only (string)', getJitCodeStringOnly, iterations);

  resetCounters();
  const arrayTime = benchmark('getJitCodeArray (array)', getJitCodeArray, iterations);

  console.log(`\n=== Results ===\n`);

  const results = [
    {
      Approach: 'StringOnly',
      'Time (ms)': stringOnlyTime.toFixed(2),
      Iterations: iterations.toLocaleString(),
    },
    {
      Approach: 'String + concat',
      'Time (ms)': stringTime.toFixed(2),
      Iterations: iterations.toLocaleString(),
    },
    {
      Approach: 'Object',
      'Time (ms)': objectTime.toFixed(2),
      Iterations: iterations.toLocaleString(),
    },
    {
      Approach: 'Array',
      'Time (ms)': arrayTime.toFixed(2),
      Iterations: iterations.toLocaleString(),
    },
  ];

  console.table(results);

  console.log(`\nDifference: ${Math.abs(stringTime - objectTime).toFixed(2)}ms`);
  console.log(
    `Ratio: ${(stringTime / objectTime).toFixed(2)}x (${stringTime > objectTime ? 'String is slower' : 'Object is slower'})`
  );
}

// Run benchmarks
runBenchmarks();
