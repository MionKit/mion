/**
 * Performance benchmark comparing our JIT-compiled JSON stringify vs native JSON.stringify
 * Tests various object complexities, data types, and real-world scenarios
 */

import { runType } from '../lib/runType';
import { JitFunctions } from '../constants.functions';

// Define explicit types for JIT compilation
interface SimpleObject {
    id: number;
    name: string;
    active: boolean;
    score: null;
}

interface UserProfile {
    age: number;
    location: string;
    bio: string;
    skills: string[];
}

interface UserSettings {
    notifications: {
        email: boolean;
        push: boolean;
        sms: boolean;
    };
    privacy: {
        profileVisible: boolean;
        emailVisible: boolean;
    };
}

interface User {
    id: number;
    name: string;
    email: string;
    roles: string[];
    profile: UserProfile;
    settings: UserSettings;
}

interface Pagination {
    page: number;
    limit: number;
    total: number;
    hasNext: boolean;
    hasPrev: boolean;
}

interface DateRange {
    start: Date;
    end: Date;
}

interface Filters {
    active: boolean;
    roles: string[];
    dateRange: DateRange;
}

interface ComplexObject {
    users: User[];
    pagination: Pagination;
    filters: Filters;
}

interface UserPreferences {
    theme: string;
    notifications: boolean;
    language: string;
}

interface UserData {
    id: number;
    name: string;
    email: string;
    active: boolean;
    lastLogin: Date;
    preferences: UserPreferences;
}

interface Metadata {
    created: Date;
    updated: Date;
    version: number;
}

interface MediumObject {
    user: UserData;
    metadata: Metadata;
}

interface LargeArrayItem {
    id: number;
    name: string;
    value: number;
    active: boolean;
    tags: string[];
}

interface WideObject {
    [key: string]: string;
}

interface BenchmarkResult {
    name: string;
    jitTime: number;
    nativeTime: number;
    ratio: number; // jitTime / nativeTime (lower is better)
    iterations: number;
    jitResult?: string;
    nativeResult?: string;
    resultsMatch: boolean;
}

// Generate test data of various complexities
function generateTestData() {
    const simpleObject = {
        id: 123,
        name: "John Doe",
        active: true,
        score: null
    };

    const mediumObject = {
        user: {
            id: 123,
            name: "John Doe",
            email: "john@example.com",
            active: true,
            lastLogin: new Date('2023-01-01'),
            preferences: {
                theme: "dark",
                notifications: true,
                language: "en"
            }
        },
        metadata: {
            created: new Date('2022-01-01'),
            updated: new Date('2023-01-01'),
            version: 1.2
        }
    };

    const complexObject = {
        users: [
            {
                id: 1,
                name: "Alice",
                email: "alice@example.com",
                roles: ["admin", "user"],
                profile: {
                    age: 30,
                    location: "New York",
                    bio: "Software engineer with 10+ years experience",
                    skills: ["JavaScript", "TypeScript", "React", "Node.js"]
                },
                settings: {
                    notifications: {
                        email: true,
                        push: false,
                        sms: true
                    },
                    privacy: {
                        profileVisible: true,
                        emailVisible: false
                    }
                }
            },
            {
                id: 2,
                name: "Bob",
                email: "bob@example.com",
                roles: ["user"],
                profile: {
                    age: 25,
                    location: "San Francisco",
                    bio: "Frontend developer passionate about UX",
                    skills: ["React", "Vue", "CSS", "Design"]
                },
                settings: {
                    notifications: {
                        email: false,
                        push: true,
                        sms: false
                    },
                    privacy: {
                        profileVisible: false,
                        emailVisible: true
                    }
                }
            }
        ],
        pagination: {
            page: 1,
            limit: 10,
            total: 2,
            hasNext: false,
            hasPrev: false
        },
        filters: {
            active: true,
            roles: ["admin", "user"],
            dateRange: {
                start: new Date('2023-01-01'),
                end: new Date('2023-12-31')
            }
        }
    };

    // Array with many items
    const largeArray = Array.from({ length: 100 }, (_, i) => ({
        id: i,
        name: `Item ${i}`,
        value: Math.random() * 1000,
        active: i % 2 === 0,
        tags: [`tag${i}`, `category${i % 5}`]
    }));

    // Object with many properties
    const wideObject = Object.fromEntries(
        Array.from({ length: 50 }, (_, i) => [`prop${i}`, `value${i}`])
    );

    return {
        simpleObject,
        mediumObject,
        complexObject,
        largeArray,
        wideObject
    };
}

// Benchmark function with pre-compiled JIT function
function benchmark<T>(
    name: string,
    testData: T,
    jitStringifyFn: (data: T) => string,
    iterations: number = 10000
): BenchmarkResult {
    // Warm up
    for (let i = 0; i < 100; i++) {
        try {
            jitStringifyFn(testData);
            JSON.stringify(testData);
        } catch (e) {
            // Ignore warmup errors
        }
    }

    // Benchmark JIT stringify
    const jitStart = performance.now();
    let jitResult: string = '';
    for (let i = 0; i < iterations; i++) {
        jitResult = jitStringifyFn(testData);
    }
    const jitEnd = performance.now();
    const jitTime = jitEnd - jitStart;

    // Benchmark native JSON.stringify
    const nativeStart = performance.now();
    let nativeResult: string = '';
    for (let i = 0; i < iterations; i++) {
        nativeResult = JSON.stringify(testData);
    }
    const nativeEnd = performance.now();
    const nativeTime = nativeEnd - nativeStart;

    // Verify results match
    const resultsMatch = jitResult === nativeResult;

    return {
        name,
        jitTime,
        nativeTime,
        ratio: jitTime / nativeTime,
        iterations,
        jitResult,
        nativeResult,
        resultsMatch
    };
}

// Run all benchmarks
export function runJsonStringifyBenchmarks(): BenchmarkResult[] {
    console.log('🚀 Starting JSON Stringify Performance Benchmarks...\n');
    
    const results: BenchmarkResult[] = [];
    const testData = generateTestData();
    const iterations = 10000;
    
    // Test basic types
    console.log('📊 Basic Types:');

    // Create type-specific JIT functions
    const rtString = runType<string>();
    const stringifyString = rtString.createJitFunction(JitFunctions.jsonStringify);

    const rtNumber = runType<number>();
    const stringifyNumber = rtNumber.createJitFunction(JitFunctions.jsonStringify);

    const rtBoolean = runType<boolean>();
    const stringifyBoolean = rtBoolean.createJitFunction(JitFunctions.jsonStringify);

    const rtNull = runType<null>();
    const stringifyNull = rtNull.createJitFunction(JitFunctions.jsonStringify);

    results.push(benchmark(
        'String',
        "Hello, World!",
        stringifyString,
        iterations * 10
    ));

    results.push(benchmark(
        'Number',
        42.5,
        stringifyNumber,
        iterations * 10
    ));

    results.push(benchmark(
        'Boolean',
        true,
        stringifyBoolean,
        iterations * 10
    ));

    results.push(benchmark(
        'Null',
        null,
        stringifyNull,
        iterations * 10
    ));
    
    // Test arrays
    console.log('\n📋 Arrays:');

    // Create array-specific JIT functions
    const rtSimpleArray = runType<(number | string | boolean | null)[]>();
    const stringifySimpleArray = rtSimpleArray.createJitFunction(JitFunctions.jsonStringify);

    const rtLargeArray = runType<LargeArrayItem[]>();
    const stringifyLargeArray = rtLargeArray.createJitFunction(JitFunctions.jsonStringify);

    results.push(benchmark(
        'Simple array',
        [1, 2, 3, "hello", true, null],
        stringifySimpleArray,
        iterations
    ));

    results.push(benchmark(
        'Large array (100 items)',
        testData.largeArray,
        stringifyLargeArray,
        iterations / 5
    ));
    
    // Test objects
    console.log('\n🏗️ Objects:');

    // Create object-specific JIT functions
    const rtSimpleObject = runType<SimpleObject>();
    const stringifySimpleObject = rtSimpleObject.createJitFunction(JitFunctions.jsonStringify);

    const rtMediumObject = runType<MediumObject>();
    const stringifyMediumObject = rtMediumObject.createJitFunction(JitFunctions.jsonStringify);

    const rtComplexObject = runType<ComplexObject>();
    const stringifyComplexObject = rtComplexObject.createJitFunction(JitFunctions.jsonStringify);

    const rtWideObject = runType<WideObject>();
    const stringifyWideObject = rtWideObject.createJitFunction(JitFunctions.jsonStringify);

    results.push(benchmark(
        'Simple object',
        testData.simpleObject,
        stringifySimpleObject,
        iterations
    ));

    results.push(benchmark(
        'Medium object',
        testData.mediumObject,
        stringifyMediumObject,
        iterations
    ));

    results.push(benchmark(
        'Complex nested object',
        testData.complexObject,
        stringifyComplexObject,
        iterations / 2
    ));

    results.push(benchmark(
        'Wide object (50 props)',
        testData.wideObject,
        stringifyWideObject,
        iterations
    ));
    
    return results;
}

// Display results
export function displayStringifyBenchmarkResults(results: BenchmarkResult[]) {
    console.log('\n📈 JSON Stringify Benchmark Results:');
    console.log('=' .repeat(100));
    console.log('Test Name'.padEnd(30) + 'JIT(ms)'.padEnd(12) + 'Native(ms)'.padEnd(12) + 'Ratio'.padEnd(10) + 'Match'.padEnd(8) + 'Performance');
    console.log('-'.repeat(100));
    
    results.forEach(result => {
        const jitMs = result.jitTime.toFixed(2);
        const nativeMs = result.nativeTime.toFixed(2);
        const ratio = result.ratio.toFixed(2);
        const match = result.resultsMatch ? '✅' : '❌';
        
        let performance = '';
        if (result.ratio < 0.8) {
            performance = '🚀 JIT wins';
        } else if (result.ratio < 1.2) {
            performance = '⚖️ Similar';
        } else if (result.ratio < 2.0) {
            performance = '🐌 Slower';
        } else {
            performance = '🐢 Much slower';
        }
        
        console.log(
            result.name.padEnd(30) +
            jitMs.padEnd(12) +
            nativeMs.padEnd(12) +
            ratio.padEnd(10) +
            match.padEnd(8) +
            performance
        );
    });
    
    console.log('-'.repeat(100));
    console.log(`Iterations per test: varies (optimized per test complexity)`);
    console.log('Ratio: JIT time / Native time (lower is better)');
    console.log('Match: Whether JIT and native results are identical');
    
    // Calculate summary statistics
    const avgRatio = results.reduce((sum, r) => sum + r.ratio, 0) / results.length;
    const allMatch = results.every(r => r.resultsMatch);
    const fastestRatio = Math.min(...results.map(r => r.ratio));
    const slowestRatio = Math.max(...results.map(r => r.ratio));
    
    console.log(`\n📊 Summary:`);
    console.log(`   Average performance ratio: ${avgRatio.toFixed(2)}x`);
    console.log(`   Best performance ratio: ${fastestRatio.toFixed(2)}x`);
    console.log(`   Worst performance ratio: ${slowestRatio.toFixed(2)}x`);
    console.log(`   All results match: ${allMatch ? '✅' : '❌'}`);
    
    if (avgRatio < 1.0) {
        console.log(`   🎉 JIT stringify is ${((1 - avgRatio) * 100).toFixed(1)}% faster on average!`);
    } else {
        console.log(`   📉 JIT stringify is ${((avgRatio - 1) * 100).toFixed(1)}% slower on average`);
    }
}
