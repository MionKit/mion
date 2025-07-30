/**
 * Performance benchmark comparing our JSON tokenizer vs native JSON.parse
 * Focus on string parsing performance and JIT-style object/array parsing
 */

import {
    parseJsonNumber,
    parseJsonString,
    parseJsonStringRegex,
    parseJsonNull,
    parseJsonTrue,
    parseJsonFalse,
    parseStartArray,
    parseEndArray,
    parseStartObject,
    parseEndObject,
    parseComma,
    parseColon,
} from '../jitFnsCompilers/jsonBasicTypesTokenizer';

interface BenchmarkResult {
    name: string;
    tokenizerTime: number;
    regexTime?: number; // Optional - only for string tests
    jsonParseTime: number;
    wrappedJsonParseTime: number;
    tokenizerRatio: number; // tokenizerTime / jsonParseTime
    regexRatio?: number; // regexTime / jsonParseTime (optional)
    wrappedRatio: number; // wrappedJsonParseTime / jsonParseTime
    iterations: number;
}

// Generate test strings of different lengths
function generateTestStrings() {
    const short = '"hello"';
    const medium = '"This is a medium length string with some content that represents typical JSON data"';
    
    // Generate a long string programmatically (1000 chars)
    const longContent = 'A'.repeat(995); // 995 + quotes + escaping = ~1000
    const long = `"${longContent}"`;
    
    return { short, medium, long };
}

// Generate strings with different escape densities
function generateEscapeTestStrings() {
    const noEscapes = '"simple string with no escapes at all"';
    const lightEscapes = '"string with \\"quotes\\" and \\\\backslash"';
    const heavyEscapes = '"lots\\nof\\t\\"escape\\\\sequences\\neverywhere\\tand\\rmore"';
    const unicodeHeavy = '"\\u0048\\u0065\\u006C\\u006C\\u006F \\u0057\\u006F\\u0072\\u006C\\u0064"';
    
    return { noEscapes, lightEscapes, heavyEscapes, unicodeHeavy };
}

// Wrapper functions for JSON.parse to measure function call overhead
function wrappedJsonParseNumber(str: string): number {
    return JSON.parse(str);
}

function wrappedJsonParseString(str: string): string {
    return JSON.parse(str);
}

function wrappedJsonParseBoolean(str: string): boolean {
    return JSON.parse(str);
}

function wrappedJsonParseNull(str: string): null {
    return JSON.parse(str);
}

function wrappedJsonParseAny(str: string): any {
    return JSON.parse(str);
}

// Benchmark function with three-way comparison
function benchmark(name: string, tokenizerFn: () => void, jsonParseFn: () => void, wrappedJsonParseFn: () => void, iterations: number = 100000): BenchmarkResult {
    // Warm up
    for (let i = 0; i < 1000; i++) {
        tokenizerFn();
        jsonParseFn();
        wrappedJsonParseFn();
    }

    // Benchmark our tokenizer
    const tokenizerStart = performance.now();
    for (let i = 0; i < iterations; i++) {
        tokenizerFn();
    }
    const tokenizerEnd = performance.now();
    const tokenizerTime = tokenizerEnd - tokenizerStart;

    // Benchmark direct JSON.parse
    const jsonParseStart = performance.now();
    for (let i = 0; i < iterations; i++) {
        jsonParseFn();
    }
    const jsonParseEnd = performance.now();
    const jsonParseTime = jsonParseEnd - jsonParseStart;

    // Benchmark wrapped JSON.parse
    const wrappedJsonParseStart = performance.now();
    for (let i = 0; i < iterations; i++) {
        wrappedJsonParseFn();
    }
    const wrappedJsonParseEnd = performance.now();
    const wrappedJsonParseTime = wrappedJsonParseEnd - wrappedJsonParseStart;

    return {
        name,
        tokenizerTime,
        jsonParseTime,
        wrappedJsonParseTime,
        tokenizerRatio: tokenizerTime / jsonParseTime,
        wrappedRatio: wrappedJsonParseTime / jsonParseTime,
        iterations
    };
}

// Special benchmark function for string parsing that includes regex version
function benchmarkString(name: string, tokenizerFn: () => void, regexFn: () => void, jsonParseFn: () => void, wrappedJsonParseFn: () => void, iterations: number = 100000): BenchmarkResult {
    // Warm up
    for (let i = 0; i < 1000; i++) {
        tokenizerFn();
        regexFn();
        jsonParseFn();
        wrappedJsonParseFn();
    }

    // Benchmark our tokenizer
    const tokenizerStart = performance.now();
    for (let i = 0; i < iterations; i++) {
        tokenizerFn();
    }
    const tokenizerEnd = performance.now();
    const tokenizerTime = tokenizerEnd - tokenizerStart;

    // Benchmark regex version
    const regexStart = performance.now();
    for (let i = 0; i < iterations; i++) {
        regexFn();
    }
    const regexEnd = performance.now();
    const regexTime = regexEnd - regexStart;

    // Benchmark direct JSON.parse
    const jsonParseStart = performance.now();
    for (let i = 0; i < iterations; i++) {
        jsonParseFn();
    }
    const jsonParseEnd = performance.now();
    const jsonParseTime = jsonParseEnd - jsonParseStart;

    // Benchmark wrapped JSON.parse
    const wrappedJsonParseStart = performance.now();
    for (let i = 0; i < iterations; i++) {
        wrappedJsonParseFn();
    }
    const wrappedJsonParseEnd = performance.now();
    const wrappedJsonParseTime = wrappedJsonParseEnd - wrappedJsonParseStart;

    return {
        name,
        tokenizerTime,
        regexTime,
        jsonParseTime,
        wrappedJsonParseTime,
        tokenizerRatio: tokenizerTime / jsonParseTime,
        regexRatio: regexTime / jsonParseTime,
        wrappedRatio: wrappedJsonParseTime / jsonParseTime,
        iterations
    };
}

// Simulate JIT-generated object parsing: {"name":"John","age":30}
function parseObjectWithTokenizer(str: string) {
    let pos = 0;
    
    // Parse opening brace
    pos = parseStartObject(str, pos);
    
    // Parse first key "name"
    const key1 = parseJsonString(str, pos);
    pos = key1.nextPos;
    
    // Parse colon
    pos = parseColon(str, pos);
    
    // Parse first value "John"
    const value1 = parseJsonString(str, pos);
    pos = value1.nextPos;
    
    // Parse comma
    pos = parseComma(str, pos);
    
    // Parse second key "age"
    const key2 = parseJsonString(str, pos);
    pos = key2.nextPos;
    
    // Parse colon
    pos = parseColon(str, pos);
    
    // Parse second value 30
    const value2 = parseJsonNumber(str, pos);
    pos = value2.nextPos;
    
    // Parse closing brace
    pos = parseEndObject(str, pos);
    
    return { [key1.value]: value1.value, [key2.value]: value2.value };
}

// Simulate JIT-generated array parsing: [123,"hello",true]
function parseArrayWithTokenizer(str: string) {
    let pos = 0;
    
    // Parse opening bracket
    pos = parseStartArray(str, pos);
    
    // Parse first element 123
    const elem1 = parseJsonNumber(str, pos);
    pos = elem1.nextPos;
    
    // Parse comma
    pos = parseComma(str, pos);
    
    // Parse second element "hello"
    const elem2 = parseJsonString(str, pos);
    pos = elem2.nextPos;
    
    // Parse comma
    pos = parseComma(str, pos);
    
    // Parse third element true
    const elem3 = parseJsonTrue(str, pos);
    pos = elem3.nextPos;
    
    // Parse closing bracket
    pos = parseEndArray(str, pos);
    
    return [elem1.value, elem2.value, elem3.value];
}

// Run all benchmarks
export function runJsonTokenizerBenchmarks(): BenchmarkResult[] {
    console.log('🚀 Starting JSON Tokenizer Performance Benchmarks...\n');
    
    const results: BenchmarkResult[] = [];
    const iterations = 100000;
    
    // Test basic value types
    console.log('📊 Basic Value Types:');
    
    results.push(benchmark(
        'Number parsing',
        () => parseJsonNumber('123.45'),
        () => JSON.parse('123.45'),
        () => wrappedJsonParseNumber('123.45'),
        iterations
    ));

    results.push(benchmark(
        'Boolean parsing',
        () => parseJsonTrue('true'),
        () => JSON.parse('true'),
        () => wrappedJsonParseBoolean('true'),
        iterations
    ));

    results.push(benchmark(
        'Null parsing',
        () => parseJsonNull('null'),
        () => JSON.parse('null'),
        () => wrappedJsonParseNull('null'),
        iterations
    ));
    
    // Test string lengths
    console.log('\n📏 String Length Tests:');
    const strings = generateTestStrings();

    results.push(benchmarkString(
        'Short string (7 chars)',
        () => parseJsonString(strings.short),
        () => parseJsonStringRegex(strings.short),
        () => JSON.parse(strings.short),
        () => wrappedJsonParseString(strings.short),
        iterations
    ));

    results.push(benchmarkString(
        'Medium string (~80 chars)',
        () => parseJsonString(strings.medium),
        () => parseJsonStringRegex(strings.medium),
        () => JSON.parse(strings.medium),
        () => wrappedJsonParseString(strings.medium),
        iterations
    ));

    results.push(benchmarkString(
        'Long string (~1000 chars)',
        () => parseJsonString(strings.long),
        () => parseJsonStringRegex(strings.long),
        () => JSON.parse(strings.long),
        () => wrappedJsonParseString(strings.long),
        iterations
    ));
    
    // Test escape densities
    console.log('\n🔤 Escape Character Tests:');
    const escapeStrings = generateEscapeTestStrings();

    results.push(benchmarkString(
        'No escapes',
        () => parseJsonString(escapeStrings.noEscapes),
        () => parseJsonStringRegex(escapeStrings.noEscapes),
        () => JSON.parse(escapeStrings.noEscapes),
        () => wrappedJsonParseString(escapeStrings.noEscapes),
        iterations
    ));

    results.push(benchmarkString(
        'Light escapes',
        () => parseJsonString(escapeStrings.lightEscapes),
        () => parseJsonStringRegex(escapeStrings.lightEscapes),
        () => JSON.parse(escapeStrings.lightEscapes),
        () => wrappedJsonParseString(escapeStrings.lightEscapes),
        iterations
    ));

    results.push(benchmarkString(
        'Heavy escapes',
        () => parseJsonString(escapeStrings.heavyEscapes),
        () => parseJsonStringRegex(escapeStrings.heavyEscapes),
        () => JSON.parse(escapeStrings.heavyEscapes),
        () => wrappedJsonParseString(escapeStrings.heavyEscapes),
        iterations
    ));

    results.push(benchmarkString(
        'Unicode heavy',
        () => parseJsonString(escapeStrings.unicodeHeavy),
        () => parseJsonStringRegex(escapeStrings.unicodeHeavy),
        () => JSON.parse(escapeStrings.unicodeHeavy),
        () => wrappedJsonParseString(escapeStrings.unicodeHeavy),
        iterations
    ));
    
    // Test JIT-style parsing (lower iterations for complex operations)
    console.log('\n🏗️ JIT-Style Complex Parsing:');
    const complexIterations = 50000;
    
    const objectStr = '{"name":"John","age":30}';
    results.push(benchmark(
        'Object parsing (JIT-style)',
        () => parseObjectWithTokenizer(objectStr),
        () => JSON.parse(objectStr),
        () => wrappedJsonParseAny(objectStr),
        complexIterations
    ));

    const arrayStr = '[123,"hello",true]';
    results.push(benchmark(
        'Array parsing (JIT-style)',
        () => parseArrayWithTokenizer(arrayStr),
        () => JSON.parse(arrayStr),
        () => wrappedJsonParseAny(arrayStr),
        complexIterations
    ));
    
    return results;
}

// Display results
export function displayBenchmarkResults(results: BenchmarkResult[]) {
    console.log('\n📈 Benchmark Results:');
    console.log('=' .repeat(150));
    console.log('Test Name'.padEnd(30) + 'Tokenizer(ms)'.padEnd(15) + 'Regex(ms)'.padEnd(12) + 'JSON.parse(ms)'.padEnd(15) + 'Wrapped(ms)'.padEnd(15) + 'T/J'.padEnd(8) + 'R/J'.padEnd(8) + 'W/J'.padEnd(8) + 'Best Performance');
    console.log('-'.repeat(150));

    results.forEach(result => {
        const tokenizerMs = result.tokenizerTime.toFixed(2);
        const regexMs = result.regexTime ? result.regexTime.toFixed(2) : 'N/A';
        const jsonParseMs = result.jsonParseTime.toFixed(2);
        const wrappedMs = result.wrappedJsonParseTime.toFixed(2);
        const tokenizerRatio = result.tokenizerRatio.toFixed(2);
        const regexRatio = result.regexRatio ? result.regexRatio.toFixed(2) : 'N/A';
        const wrappedRatio = result.wrappedRatio.toFixed(2);

        let performance = '';
        const hasRegex = result.regexRatio !== undefined;

        if (hasRegex) {
            // For string tests, compare all three
            const minRatio = Math.min(result.tokenizerRatio, result.regexRatio!, 1.0);
            if (result.regexRatio! < 0.8 && result.regexRatio! <= result.tokenizerRatio) {
                performance = '🚀 Regex wins';
            } else if (result.tokenizerRatio < 0.8 && result.tokenizerRatio <= result.regexRatio!) {
                performance = '🚀 Tokenizer wins';
            } else if (minRatio >= 1.0 && minRatio < 1.2) {
                performance = '⚖️ JSON.parse wins (close)';
            } else if (minRatio >= 1.0) {
                performance = '🏆 JSON.parse wins';
            } else {
                performance = '⚖️ Mixed results';
            }
        } else {
            // For non-string tests, use original logic
            if (result.tokenizerRatio < 0.8) {
                performance = '🚀 Tokenizer wins';
            } else if (result.tokenizerRatio < 1.2) {
                performance = '⚖️ Similar to direct';
            } else if (result.tokenizerRatio < 2.0) {
                performance = '🐌 Slower than direct';
            } else {
                performance = '🐢 Much slower';
            }
        }

        console.log(
            result.name.padEnd(30) +
            tokenizerMs.padEnd(15) +
            regexMs.padEnd(12) +
            jsonParseMs.padEnd(15) +
            wrappedMs.padEnd(15) +
            tokenizerRatio.padEnd(8) +
            regexRatio.padEnd(8) +
            wrappedRatio.padEnd(8) +
            performance
        );
    });

    console.log('-'.repeat(150));
    console.log(`Iterations per test: ${results[0]?.iterations.toLocaleString()}`);
    console.log('T/J: Tokenizer/JSON.parse ratio | R/J: Regex/JSON.parse ratio | W/J: Wrapped/JSON.parse ratio');
    console.log('Lower ratios are better (closer to native JSON.parse performance)');

    // Calculate average function call overhead
    const avgWrappedOverhead = results.reduce((sum, r) => sum + r.wrappedRatio, 0) / results.length;
    console.log(`\n💡 Average function call overhead: ${((avgWrappedOverhead - 1) * 100).toFixed(2)}% (${avgWrappedOverhead.toFixed(3)}x)`);

    // Calculate regex performance summary for string tests
    const stringResults = results.filter(r => r.regexRatio !== undefined);
    if (stringResults.length > 0) {
        const avgRegexRatio = stringResults.reduce((sum, r) => sum + r.regexRatio!, 0) / stringResults.length;
        const avgTokenizerRatio = stringResults.reduce((sum, r) => sum + r.tokenizerRatio, 0) / stringResults.length;
        console.log(`\n🔤 String parsing summary:`);
        console.log(`   Average Tokenizer ratio: ${avgTokenizerRatio.toFixed(2)}x`);
        console.log(`   Average Regex ratio: ${avgRegexRatio.toFixed(2)}x`);
        console.log(`   Regex improvement: ${((avgTokenizerRatio - avgRegexRatio) / avgTokenizerRatio * 100).toFixed(1)}% faster than tokenizer`);
    }
}
