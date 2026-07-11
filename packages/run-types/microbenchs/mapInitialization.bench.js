function getTestData() {
  // Create an array of key-value pairs (tuples)
  // Simulating a realistic scenario with string keys and various value types
  const pairs = [];
  for (let i = 0; i < 1000; i++) {
    pairs.push([`key_${i}`, { id: i, value: Math.random(), name: `item_${i}` }]);
  }
  return pairs;
}

function validateMaps(map1, map2) {
  const errors = [];

  // Check size
  if (map1.size !== map2.size) {
    errors.push(`Map size mismatch: ${map1.size} !== ${map2.size}`);
    return errors;
  }

  // Check all entries
  for (const [key, value] of map1) {
    if (!map2.has(key)) {
      errors.push(`Key missing in map2: ${key}`);
    } else {
      const value2 = map2.get(key);
      if (value.id !== value2.id || value.value !== value2.value || value.name !== value2.name) {
        errors.push(`Value mismatch for key ${key}`);
      }
    }
  }

  return errors;
}

// ============================================================================
// METHOD 1: Initialize Map from array constructor
// ============================================================================

function initializeMapFromConstructor(originalValues) {
  // Copy the array
  const copiedArray = [...originalValues];
  // Initialize Map from array
  return new Map(copiedArray);
}

// ============================================================================
// METHOD 2: Initialize empty Map and populate with set()
// ============================================================================

function initializeMapWithSet(originalValues) {
  // Create empty Map
  const map = new Map();
  // Populate with set()
  for (const [key, value] of originalValues) {
    map.set(key, value);
  }
  return map;
}

// ============================================================================
// VALIDATION
// ============================================================================

function runValidation() {
  const testData = getTestData();

  // Test Method 1: Map constructor
  const map1 = initializeMapFromConstructor(testData);
  const map1Errors = validateMaps(map1, map1);

  // Test Method 2: set() method
  const map2 = initializeMapWithSet(testData);
  const map2Errors = validateMaps(map2, map2);

  // Cross-validate both methods produce the same result
  const crossValidationErrors = validateMaps(map1, map2);

  // Report results
  // eslint-disable-next-line no-undef
  console.log('\n=== Validation Results ===');
  if (map1Errors.length === 0) {
    // eslint-disable-next-line no-undef
    console.log(`✓ Map constructor approach: PASSED (${map1.size} entries)`);
  } else {
    // eslint-disable-next-line no-undef
    console.log(`✗ Map constructor approach: FAILED (${map1.size} entries)`);
    map1Errors.forEach((error) => {
      // eslint-disable-next-line no-undef
      console.log(`  - ${error}`);
    });
  }

  if (map2Errors.length === 0) {
    // eslint-disable-next-line no-undef
    console.log(`✓ Map.set() approach: PASSED (${map2.size} entries)`);
  } else {
    // eslint-disable-next-line no-undef
    console.log(`✗ Map.set() approach: FAILED (${map2.size} entries)`);
    map2Errors.forEach((error) => {
      // eslint-disable-next-line no-undef
      console.log(`  - ${error}`);
    });
  }

  if (crossValidationErrors.length === 0) {
    // eslint-disable-next-line no-undef
    console.log(`✓ Cross-validation: Both methods produce identical results`);
  } else {
    // eslint-disable-next-line no-undef
    console.log(`✗ Cross-validation: Methods produce different results`);
    crossValidationErrors.forEach((error) => {
      // eslint-disable-next-line no-undef
      console.log(`  - ${error}`);
    });
  }

  return map1Errors.length === 0 && map2Errors.length === 0 && crossValidationErrors.length === 0;
}

// ============================================================================
// BENCHMARK
// ============================================================================

function runBenchmark() {
  const testData = getTestData();
  const iterations = 100_000;

  // Warm up
  for (let i = 0; i < 1000; i++) {
    initializeMapFromConstructor(testData);
    initializeMapWithSet(testData);
  }

  // Benchmark Method 1: Map constructor
  // eslint-disable-next-line no-undef
  const constructorStart = performance.now();
  for (let i = 0; i < iterations; i++) {
    initializeMapFromConstructor(testData);
  }
  // eslint-disable-next-line no-undef
  const constructorEnd = performance.now();
  const constructorTime = constructorEnd - constructorStart;

  // Benchmark Method 2: set() method
  // eslint-disable-next-line no-undef
  const setStart = performance.now();
  for (let i = 0; i < iterations; i++) {
    initializeMapWithSet(testData);
  }
  // eslint-disable-next-line no-undef
  const setEnd = performance.now();
  const setTime = setEnd - setStart;

  // Results
  // eslint-disable-next-line no-undef
  console.log('\n=== Map Initialization Benchmark ===');
  // eslint-disable-next-line no-undef
  console.log(`Iterations: ${iterations.toLocaleString()}`);
  // eslint-disable-next-line no-undef
  console.log(`Array size: ${testData.length} entries`);
  // eslint-disable-next-line no-undef
  console.log(`\nMethod 1 (Map constructor):`);
  // eslint-disable-next-line no-undef
  console.log(`  Total time: ${constructorTime.toFixed(2)}ms`);
  // eslint-disable-next-line no-undef
  console.log(`  Per iteration: ${(constructorTime / iterations).toFixed(4)}ms`);
  // eslint-disable-next-line no-undef
  console.log(`\nMethod 2 (Map.set()):`);
  // eslint-disable-next-line no-undef
  console.log(`  Total time: ${setTime.toFixed(2)}ms`);
  // eslint-disable-next-line no-undef
  console.log(`  Per iteration: ${(setTime / iterations).toFixed(4)}ms`);

  const faster = constructorTime < setTime ? 'Map constructor' : 'Map.set()';
  const percentage = Math.abs(((constructorTime - setTime) / Math.max(constructorTime, setTime)) * 100).toFixed(1);
  // eslint-disable-next-line no-undef
  console.log(`\n${faster} is ${percentage}% faster`);
}

// Run validation first, then benchmark
const validationPassed = runValidation();
if (validationPassed) {
  runBenchmark();
} else {
  // eslint-disable-next-line no-undef
  console.log('\n⚠ Validation failed. Skipping benchmark.');
}

