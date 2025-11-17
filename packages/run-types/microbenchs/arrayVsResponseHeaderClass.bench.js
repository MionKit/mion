// ============================================================================
// LIGHTWEIGHT ResponseHeader CLASS
// ============================================================================

class ResponseHeader {
  constructor(...headers) {
    this.headers = headers;
  }
}

// ============================================================================
// TEST DATA GENERATION
// ============================================================================

function getTestData() {
  return {
    array1: ['custom-value'],
    classInstance1: new ResponseHeader('custom-value'),
    array3: ['custom-value', 'token-value', 'v1.0'],
    classInstance3: new ResponseHeader('custom-value', 'token-value', 'v1.0'),
    array5: ['h1', 'h2', 'h3', 'h4', 'h5'],
    classInstance5: new ResponseHeader('h1', 'h2', 'h3', 'h4', 'h5'),
  };
}

function validateResults(array, classInstance) {
  const errors = [];

  // Check length
  if (array.length !== classInstance.headers.length) {
    errors.push(`Length mismatch: array=${array.length}, class=${classInstance.headers.length}`);
    return errors;
  }

  // Check all values
  for (let i = 0; i < array.length; i++) {
    if (array[i] !== classInstance.headers[i]) {
      errors.push(`Value mismatch at index ${i}: array="${array[i]}", class="${classInstance.headers[i]}"`);
    }
  }

  // Check instanceof
  if (!(classInstance instanceof ResponseHeader)) {
    errors.push('instanceof check failed for ResponseHeader');
  }

  if (Array.isArray(array) !== true) {
    errors.push('Array.isArray check failed');
  }

  return errors;
}

// ============================================================================
// VALIDATION
// ============================================================================

function runValidation() {
  const testData = getTestData();

  const errors1 = validateResults(testData.array1, testData.classInstance1);
  const errors3 = validateResults(testData.array3, testData.classInstance3);
  const errors5 = validateResults(testData.array5, testData.classInstance5);

  const allErrors = [...errors1, ...errors3, ...errors5];

  // eslint-disable-next-line no-undef
  console.log('\n=== Validation Results ===');
  if (allErrors.length === 0) {
    // eslint-disable-next-line no-undef
    console.log('✓ All validations PASSED (1, 3, and 5 headers)');
  } else {
    // eslint-disable-next-line no-undef
    console.log('✗ Validation FAILED:');
    allErrors.forEach((error) => {
      // eslint-disable-next-line no-undef
      console.log(`  - ${error}`);
    });
  }

  return allErrors.length === 0;
}

// ============================================================================
// BENCHMARK
// ============================================================================

function runBenchmark() {
  const iterations = 10_000_000;

  // Store results to prevent optimization
  let arrayResults = [];
  let classResults = [];

  // Warm up
  for (let i = 0; i < 10000; i++) {
    new ResponseHeader('custom-value', 'token-value', 'v1.0');
  }

  // Benchmark Method 1: Array creation (1 header)
  arrayResults = [];
  // eslint-disable-next-line no-undef
  const array1Start = performance.now();
  for (let i = 0; i < iterations; i++) {
    const arr = ['custom-value'];
    // Store every 100000th result to prevent full optimization but minimize memory
    if (i % 100000 === 0) arrayResults.push(arr);
  }
  // eslint-disable-next-line no-undef
  const array1End = performance.now();
  const array1Time = array1End - array1Start;

  // Benchmark Method 2: ResponseHeader class (1 header)
  classResults = [];
  // eslint-disable-next-line no-undef
  const class1Start = performance.now();
  for (let i = 0; i < iterations; i++) {
    const header = new ResponseHeader('custom-value');
    // Store every 100000th result to prevent full optimization but minimize memory
    if (i % 100000 === 0) classResults.push(header);
  }
  // eslint-disable-next-line no-undef
  const class1End = performance.now();
  const class1Time = class1End - class1Start;

  // Benchmark Method 3: Array creation (3 headers)
  arrayResults = [];
  // eslint-disable-next-line no-undef
  const array3Start = performance.now();
  for (let i = 0; i < iterations; i++) {
    const arr = ['custom-value', 'token-value', 'v1.0'];
    if (i % 100000 === 0) arrayResults.push(arr);
  }
  // eslint-disable-next-line no-undef
  const array3End = performance.now();
  const array3Time = array3End - array3Start;

  // Benchmark Method 4: ResponseHeader class (3 headers)
  classResults = [];
  // eslint-disable-next-line no-undef
  const class3Start = performance.now();
  for (let i = 0; i < iterations; i++) {
    const header = new ResponseHeader('custom-value', 'token-value', 'v1.0');
    if (i % 100000 === 0) classResults.push(header);
  }
  // eslint-disable-next-line no-undef
  const class3End = performance.now();
  const class3Time = class3End - class3Start;

  // Benchmark Method 5: Array creation (5 headers)
  arrayResults = [];
  // eslint-disable-next-line no-undef
  const array5Start = performance.now();
  for (let i = 0; i < iterations; i++) {
    const arr = ['h1', 'h2', 'h3', 'h4', 'h5'];
    if (i % 100000 === 0) arrayResults.push(arr);
  }
  // eslint-disable-next-line no-undef
  const array5End = performance.now();
  const array5Time = array5End - array5Start;

  // Benchmark Method 6: ResponseHeader class (5 headers)
  classResults = [];
  // eslint-disable-next-line no-undef
  const class5Start = performance.now();
  for (let i = 0; i < iterations; i++) {
    const header = new ResponseHeader('h1', 'h2', 'h3', 'h4', 'h5');
    if (i % 100000 === 0) classResults.push(header);
  }
  // eslint-disable-next-line no-undef
  const class5End = performance.now();
  const class5Time = class5End - class5Start;

  // Results
  // eslint-disable-next-line no-undef
  console.log('\n=== Array vs ResponseHeader Class Benchmark ===');
  // eslint-disable-next-line no-undef
  console.log(`Iterations: ${iterations.toLocaleString()}`);

  // 1 header results
  // eslint-disable-next-line no-undef
  console.log(`\n--- 1 Header ---`);
  // eslint-disable-next-line no-undef
  console.log(`Array:             ${array1Time.toFixed(2)}ms (${(array1Time / iterations).toFixed(6)}ms per iteration)`);
  // eslint-disable-next-line no-undef
  console.log(`ResponseHeader:    ${class1Time.toFixed(2)}ms (${(class1Time / iterations).toFixed(6)}ms per iteration)`);
  const faster1 = array1Time < class1Time ? 'Array' : 'ResponseHeader';
  const percentage1 = Math.abs(((array1Time - class1Time) / Math.max(array1Time, class1Time)) * 100).toFixed(1);
  // eslint-disable-next-line no-undef
  console.log(`${faster1} is ${percentage1}% faster`);

  // 3 headers results
  // eslint-disable-next-line no-undef
  console.log(`\n--- 3 Headers ---`);
  // eslint-disable-next-line no-undef
  console.log(`Array:             ${array3Time.toFixed(2)}ms (${(array3Time / iterations).toFixed(6)}ms per iteration)`);
  // eslint-disable-next-line no-undef
  console.log(`ResponseHeader:    ${class3Time.toFixed(2)}ms (${(class3Time / iterations).toFixed(6)}ms per iteration)`);
  const faster3 = array3Time < class3Time ? 'Array' : 'ResponseHeader';
  const percentage3 = Math.abs(((array3Time - class3Time) / Math.max(array3Time, class3Time)) * 100).toFixed(1);
  // eslint-disable-next-line no-undef
  console.log(`${faster3} is ${percentage3}% faster`);

  // 5 headers results
  // eslint-disable-next-line no-undef
  console.log(`\n--- 5 Headers ---`);
  // eslint-disable-next-line no-undef
  console.log(`Array:             ${array5Time.toFixed(2)}ms (${(array5Time / iterations).toFixed(6)}ms per iteration)`);
  // eslint-disable-next-line no-undef
  console.log(`ResponseHeader:    ${class5Time.toFixed(2)}ms (${(class5Time / iterations).toFixed(6)}ms per iteration)`);
  const faster5 = array5Time < class5Time ? 'Array' : 'ResponseHeader';
  const percentage5 = Math.abs(((array5Time - class5Time) / Math.max(array5Time, class5Time)) * 100).toFixed(1);
  // eslint-disable-next-line no-undef
  console.log(`${faster5} is ${percentage5}% faster`);
}

// Run validation first, then benchmark
const validationPassed = runValidation();
if (validationPassed) {
  runBenchmark();
} else {
  // eslint-disable-next-line no-undef
  console.log('\n⚠ Validation failed. Skipping benchmark.');
}
