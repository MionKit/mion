/**
 * Microbenchmark for asJSONString function
 * Tests the performance of different code paths:
 * 1. Short strings (< 42 chars) with for loop
 * 2. Medium strings (>= 42, < MAX_SCAPE_TEST_LENGTH) with regex test
 * 3. Long strings (>= MAX_SCAPE_TEST_LENGTH) with JSON.stringify
 *
 * Also tests an alternative function that always uses the regex path
 * for strings >= 42 chars.
 */

// ============================================================================
// ORIGINAL asJSONString function (from packages/core/src/pureFns/corePureUtils.ts)
// ============================================================================

function asJSONString() {
  // eslint-disable-next-line no-control-regex
  const STR_ESCAPE = /[\u0000-\u001f\u0022\u005c\ud800-\udfff]/;
  const MAX_SCAPE_TEST_LENGTH = 1000;
  return function _asJSONString(str) {
    // Bellow code for 'asJSONString' is copied from from https://github.com/fastify/fast-json-stringify/blob/master/lib/serializer.js
    // which in turn got 'inspiration' from typia https://github.com/samchon/typia/blob/master/src/functional/$string.ts
    // both under MIT license
    // typia license: https://github.com/samchon/typia/blob/master/LICENSE
    // fastify lisecense: https://github.com/fastify/fast-json-stringify/blob/master/LICENSE
    if (str.length < 42) {
      const len = str.length;
      let result = '';
      let last = -1;
      let point = 255;

      // eslint-disable-next-line
      for (var i = 0; i < len; i++) {
        point = str.charCodeAt(i);
        if (
          point === 0x22 || // '"'
          point === 0x5c // '\\'
        ) {
          // eslint-disable-next-line @typescript-eslint/no-unused-expressions
          last === -1 && (last = 0);
          result += str.slice(last, i) + '\\';
          last = i;
        } else if (point < 32 || (point >= 0xd800 && point <= 0xdfff)) {
          // The current character is non-printable characters or a surrogate.
          return JSON.stringify(str);
        }
      }

      return (last === -1 && '"' + str + '"') || '"' + result + str.slice(last) + '"';
    } else if (str.length < MAX_SCAPE_TEST_LENGTH && STR_ESCAPE.test(str) === false) {
      // Only use the regular expression for shorter input. The overhead is otherwise too much.
      return '"' + str + '"';
    } else {
      return JSON.stringify(str);
    }
  };
}

// ============================================================================
// ALTERNATIVE: Always use regex path for strings >= 42 chars
// ============================================================================

function asJSONStringRegexOnly() {
  // eslint-disable-next-line no-control-regex
  const STR_ESCAPE = /[\u0000-\u001f\u0022\u005c\ud800-\udfff]/;
  const MAX_SCAPE_TEST_LENGTH = 1000;
  return function _asJSONStringRegexOnly(str) {
    // Always use regex test for strings >= 42 chars (no for loop)
    if (str.length < MAX_SCAPE_TEST_LENGTH && STR_ESCAPE.test(str) === false) {
      return '"' + str + '"';
    } else {
      return JSON.stringify(str);
    }
  };
}

// ============================================================================
// TEST DATA GENERATION
// ============================================================================

function getTestData() {
  // Safe strings (no characters needing escaping)
  const safeShort = 'hello world this is a safe string'; // 33 chars (< 42)
  const safeMedium = 'hello world this is a safe string that is longer than 42 chars'; // 64 chars (>= 42, < 1000)
  const safeLong = 'a'.repeat(1500); // 1500 chars (>= 1000)

  // Unsafe strings (contain characters needing escaping)
  const unsafeShort = 'hello "world" test'; // 18 chars (< 42) with quotes
  const unsafeMedium = 'hello "world" this is an unsafe string with quotes and backslash \\ test'; // 72 chars (>= 42)
  const unsafeLong = 'hello "world" ' + 'a'.repeat(1500); // > 1000 chars with quotes

  // Newline character tests
  const newlineShort = 'hello\nworld\ntest'; // 15 chars with newlines
  const newlineMedium = 'hello\nworld\nthis is a longer string with newlines\n'; // 54 chars

  return {
    safeShort,
    safeMedium,
    safeLong,
    unsafeShort,
    unsafeMedium,
    unsafeLong,
    newlineShort,
    newlineMedium,
  };
}

// ============================================================================
// VALIDATION
// ============================================================================

function validateResults(fn1, fn2, testData) {
  const errors = [];

  for (const [key, value] of Object.entries(testData)) {
    const result1 = fn1(value);
    const result2 = fn2(value);

    if (result1 !== result2) {
      errors.push(`${key}: mismatch\n  original: ${result1}\n  regex:    ${result2}`);
    }

    // Also validate that the result is valid JSON
    try {
      JSON.parse(result1);
    } catch (e) {
      errors.push(`${key}: original result is not valid JSON: ${result1}`);
    }

    try {
      JSON.parse(result2);
    } catch (e) {
      errors.push(`${key}: regex result is not valid JSON: ${result2}`);
    }
  }

  return errors;
}

// ============================================================================
// BENCHMARK UTILITIES
// ============================================================================

function benchmark(name, fn, iterations = 1000000) {
  // Warmup
  for (let i = 0; i < 1000; i++) {
    fn();
  }

  const start = process.hrtime.bigint();
  for (let i = 0; i < iterations; i++) {
    fn();
  }
  const end = process.hrtime.bigint();
  const duration = Number(end - start) / 1000000; // Convert to milliseconds
  const opsPerSecond = (iterations / duration) * 1000;
  console.log(
    `${name}: ${duration.toFixed(2)}ms (${iterations} iterations, ${opsPerSecond.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} ops/sec)`
  );
  return {duration, opsPerSecond};
}

function runComparison(name, fnOriginal, fnRegex, testValue, iterations = 1000000) {
  console.log(`\n--- ${name} ---`);
  console.log(`String length: ${testValue.length}`);

  const result1 = fnOriginal(testValue);
  const result2 = fnRegex(testValue);
  const result3 = JSON.stringify(testValue);

  const original = benchmark('  Original (asJSONString)', () => fnOriginal(testValue), iterations);
  const regex = benchmark('  Regex Only (asJSONStringRegexOnly)', () => fnRegex(testValue), iterations);
  const native = benchmark('  Native JSON.stringify', () => JSON.stringify(testValue), iterations);

  const speedupRegex = regex.opsPerSecond / original.opsPerSecond;
  const speedupNative = native.opsPerSecond / original.opsPerSecond;
  const fasterRegex = speedupRegex > 1 ? 'faster' : 'slower';
  const fasterNative = speedupNative > 1 ? 'faster' : 'slower';
  console.log(`  -> Regex is ${speedupRegex.toFixed(2)}x ${fasterRegex}`);
  console.log(`  -> Native JSON.stringify is ${speedupNative.toFixed(2)}x ${fasterNative}`);

  return {original, regex, native, speedupRegex, speedupNative, result1, result2, result3};
}

// ============================================================================
// MAIN BENCHMARK
// ============================================================================

function runBenchmarks() {
  console.log('='.repeat(80));
  console.log('asJSONString Microbenchmark');
  console.log('='.repeat(80));

  const testData = getTestData();
  const originalFn = asJSONString();
  const regexFn = asJSONStringRegexOnly();

  // Validate first
  console.log('\n--- Validation ---');
  const errors = validateResults(originalFn, regexFn, testData);
  if (errors.length > 0) {
    console.log('VALIDATION ERRORS:');
    errors.forEach((e) => console.log(`  ${e}`));
    process.exit(1);
  }
  console.log('All outputs are valid JSON and match between implementations ✓');

  // Run benchmarks
  const results = [];

  // Safe short string (< 42 chars) - Original uses for loop, Regex uses regex
  results.push(runComparison('Safe Short String (< 42 chars)', originalFn, regexFn, testData.safeShort, 1000000));

  // Safe medium string (>= 42, < 1000 chars) - Both use regex path
  results.push(runComparison('Safe Medium String (>= 42, < 1000 chars)', originalFn, regexFn, testData.safeMedium, 1000000));

  // Safe long string (>= 1000 chars) - Both use JSON.stringify
  results.push(runComparison('Safe Long String (>= 1000 chars)', originalFn, regexFn, testData.safeLong, 500000));

  // Unsafe short string (< 42 chars) - Original uses for loop (may escape), Regex uses regex then JSON.stringify
  results.push(
    runComparison('Unsafe Short String (< 42 chars, with quotes)', originalFn, regexFn, testData.unsafeShort, 1000000)
  );

  // Unsafe medium string (>= 42 chars) - Original uses regex then JSON.stringify, Regex uses regex then JSON.stringify
  results.push(
    runComparison('Unsafe Medium String (>= 42 chars, with quotes)', originalFn, regexFn, testData.unsafeMedium, 1000000)
  );

  // Unsafe long string (>= 1000 chars) - Both use JSON.stringify
  results.push(
    runComparison('Unsafe Long String (>= 1000 chars, with quotes)', originalFn, regexFn, testData.unsafeLong, 500000)
  );

  // Newline short string (< 42 chars)
  results.push(runComparison('Newline Short String (< 42 chars)', originalFn, regexFn, testData.newlineShort, 1000000));

  // Newline medium string (>= 42 chars)
  results.push(runComparison('Newline Medium String (>= 42 chars)', originalFn, regexFn, testData.newlineMedium, 1000000));

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));

  const avgSpeedupRegex = results.reduce((sum, r) => sum + r.speedupRegex, 0) / results.length;
  const avgSpeedupNative = results.reduce((sum, r) => sum + r.speedupNative, 0) / results.length;
  console.log(`Average speedup (Regex vs Original): ${avgSpeedupRegex.toFixed(2)}x`);
  console.log(`Average speedup (Native JSON.stringify vs Original): ${avgSpeedupNative.toFixed(2)}x`);

  const fasterRegexCount = results.filter((r) => r.speedupRegex > 1).length;
  const slowerRegexCount = results.filter((r) => r.speedupRegex < 1).length;
  const fasterNativeCount = results.filter((r) => r.speedupNative > 1).length;
  const slowerNativeCount = results.filter((r) => r.speedupNative < 1).length;
  console.log(`Regex Faster: ${fasterRegexCount}, Slower: ${slowerRegexCount}`);
  console.log(`Native JSON.stringify Faster: ${fasterNativeCount}, Slower: ${slowerNativeCount}`);

  console.log('\nKey Findings:');
  console.log('- For strings < 42 chars: Original uses for loop, Regex uses regex test');
  console.log('- For strings >= 42 and < 1000: Both use regex test (should be similar)');
  console.log('- For strings >= 1000: Both use JSON.stringify (should be similar)');
  console.log('- Native JSON.stringify is the baseline for comparison');
}

runBenchmarks();

/*
================================================================================
BENCHMARK RESULTS NOTES
================================================================================

## Node.js Results (v20+)

### Safe Short Strings (< 42 chars) - Common for object keys/values
- Original asJSONString:    ~21M ops/sec
- Regex Only:               ~21.7M ops/sec (1.03x faster)
- Native JSON.stringify:    ~18.8M ops/sec (0.89x slower)

### Safe Medium Strings (42-1000 chars)
- Original asJSONString:    ~11.8M ops/sec
- Regex Only:               ~12.0M ops/sec (1.01x faster)
- Native JSON.stringify:    ~15.2M ops/sec (1.29x faster)

### Key takeaway for Node.js:
For safe short strings (< 42 chars), asJSONString is ~12% faster than native
JSON.stringify. This is the sweet spot for the optimization.

## Bun Results (v1.1+)

### Safe Short Strings (< 42 chars)
- Original asJSONString:    ~16.9M ops/sec
- Regex Only:               ~29.4M ops/sec (1.74x faster)
- Native JSON.stringify:    ~31.9M ops/sec (1.89x faster)

### Safe Medium Strings (42-1000 chars)
- Original asJSONString:    ~16.4M ops/sec
- Regex Only:               ~16.6M ops/sec (1.01x faster)
- Native JSON.stringify:    ~26.8M ops/sec (1.63x faster)

### Key takeaway for Bun:
Bun's native JSON.stringify is significantly faster than Node's (~70% faster
for short strings). The regex-only optimization shows better relative gains
in Bun (1.74x vs 1.03x), but native JSON.stringify still wins overall.

## Summary

- Node.js: asJSONString wins for safe short strings (the common case)
- Bun: Native JSON.stringify is highly optimized and generally wins
- The regex-only path shows better relative improvements in Bun
- For unsafe strings with special characters, results vary by runtime

Run with: node asJSONString.bench.js
Run with: bun asJSONString.bench.js
================================================================================
*/
