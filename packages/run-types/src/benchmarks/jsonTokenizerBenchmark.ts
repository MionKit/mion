/**
 * Performance benchmark comparing our JSON tokenizer vs native JSON.parse
 * Focus on string parsing performance and JIT-style object/array parsing
 */

import {
    parseJsonNumber,
    parseJsonString,
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
    jsonParseTime: number;
    ratio: number; // tokenizerTime / jsonParseTime
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

// Benchmark function
function benchmark(name: string, tokenizerFn: () => void, jsonParseFn: () => void, iterations: number = 100000): BenchmarkResult {
    // Warm up
    for (let i = 0; i < 1000; i++) {
        tokenizerFn();
        jsonParseFn();
    }
    
    // Benchmark our tokenizer
    const tokenizerStart = performance.now();
    for (let i = 0; i < iterations; i++) {
        tokenizerFn();
    }
    const tokenizerEnd = performance.now();
    const tokenizerTime = tokenizerEnd - tokenizerStart;
    
    // Benchmark JSON.parse
    const jsonParseStart = performance.now();
    for (let i = 0; i < iterations; i++) {
        jsonParseFn();
    }
    const jsonParseEnd = performance.now();
    const jsonParseTime = jsonParseEnd - jsonParseStart;
    
    return {
        name,
        tokenizerTime,
        jsonParseTime,
        ratio: tokenizerTime / jsonParseTime,
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
        iterations
    ));
    
    results.push(benchmark(
        'Boolean parsing',
        () => parseJsonTrue('true'),
        () => JSON.parse('true'),
        iterations
    ));
    
    results.push(benchmark(
        'Null parsing',
        () => parseJsonNull('null'),
        () => JSON.parse('null'),
        iterations
    ));
    
    // Test string lengths
    console.log('\n📏 String Length Tests:');
    const strings = generateTestStrings();
    
    results.push(benchmark(
        'Short string (7 chars)',
        () => parseJsonString(strings.short),
        () => JSON.parse(strings.short),
        iterations
    ));
    
    results.push(benchmark(
        'Medium string (~80 chars)',
        () => parseJsonString(strings.medium),
        () => JSON.parse(strings.medium),
        iterations
    ));
    
    results.push(benchmark(
        'Long string (~1000 chars)',
        () => parseJsonString(strings.long),
        () => JSON.parse(strings.long),
        iterations
    ));
    
    // Test escape densities
    console.log('\n🔤 Escape Character Tests:');
    const escapeStrings = generateEscapeTestStrings();
    
    results.push(benchmark(
        'No escapes',
        () => parseJsonString(escapeStrings.noEscapes),
        () => JSON.parse(escapeStrings.noEscapes),
        iterations
    ));
    
    results.push(benchmark(
        'Light escapes',
        () => parseJsonString(escapeStrings.lightEscapes),
        () => JSON.parse(escapeStrings.lightEscapes),
        iterations
    ));
    
    results.push(benchmark(
        'Heavy escapes',
        () => parseJsonString(escapeStrings.heavyEscapes),
        () => JSON.parse(escapeStrings.heavyEscapes),
        iterations
    ));
    
    results.push(benchmark(
        'Unicode heavy',
        () => parseJsonString(escapeStrings.unicodeHeavy),
        () => JSON.parse(escapeStrings.unicodeHeavy),
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
        complexIterations
    ));
    
    const arrayStr = '[123,"hello",true]';
    results.push(benchmark(
        'Array parsing (JIT-style)',
        () => parseArrayWithTokenizer(arrayStr),
        () => JSON.parse(arrayStr),
        complexIterations
    ));
    
    return results;
}

// Display results
export function displayBenchmarkResults(results: BenchmarkResult[]) {
    console.log('\n📈 Benchmark Results:');
    console.log('=' .repeat(80));
    console.log('Test Name'.padEnd(30) + 'Tokenizer(ms)'.padEnd(15) + 'JSON.parse(ms)'.padEnd(15) + 'Ratio'.padEnd(10) + 'Performance');
    console.log('-'.repeat(80));
    
    results.forEach(result => {
        const tokenizerMs = result.tokenizerTime.toFixed(2);
        const jsonParseMs = result.jsonParseTime.toFixed(2);
        const ratio = result.ratio.toFixed(2);
        
        let performance = '';
        if (result.ratio < 0.8) {
            performance = '🚀 Faster';
        } else if (result.ratio < 1.2) {
            performance = '⚖️ Similar';
        } else if (result.ratio < 2.0) {
            performance = '🐌 Slower';
        } else {
            performance = '🐢 Much slower';
        }
        
        console.log(
            result.name.padEnd(30) +
            tokenizerMs.padEnd(15) +
            jsonParseMs.padEnd(15) +
            ratio.padEnd(10) +
            performance
        );
    });
    
    console.log('-'.repeat(80));
    console.log(`Iterations per test: ${results[0]?.iterations.toLocaleString()}`);
    console.log('Ratio: Tokenizer time / JSON.parse time (lower is better)');
}
