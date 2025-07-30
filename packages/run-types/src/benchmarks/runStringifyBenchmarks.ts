#!/usr/bin/env node

/**
 * Runner for JSON stringify benchmarks
 * Usage: npx ts-node src/benchmarks/runStringifyBenchmarks.ts
 */

import { runJsonStringifyBenchmarks, displayStringifyBenchmarkResults } from './jsonStringifyBenchmark';

async function main() {
    console.log('🎯 JIT JSON Stringify vs Native JSON.stringify Performance Comparison\n');
    
    try {
        const results = runJsonStringifyBenchmarks();
        displayStringifyBenchmarkResults(results);
        
        console.log('\n💡 Key Insights:');
        console.log('- Lower ratio = JIT stringify is faster');
        console.log('- Higher ratio = native JSON.stringify is faster');
        console.log('- JIT compilation optimizes for known schemas');
        console.log('- Performance varies by object complexity and structure');
        
    } catch (error) {
        console.error('❌ Benchmark failed:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}
