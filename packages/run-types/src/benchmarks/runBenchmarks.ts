#!/usr/bin/env node

/**
 * Simple runner for JSON tokenizer benchmarks
 * Usage: npx ts-node src/benchmarks/runBenchmarks.ts
 */

import { runJsonTokenizerBenchmarks, displayBenchmarkResults } from './jsonTokenizerBenchmark';

async function main() {
    console.log('🎯 JSON Tokenizer vs JSON.parse Performance Comparison\n');
    
    try {
        const results = runJsonTokenizerBenchmarks();
        displayBenchmarkResults(results);
        
        console.log('\n💡 Key Insights:');
        console.log('- Lower ratio = our tokenizer is faster');
        console.log('- Higher ratio = JSON.parse is faster');
        console.log('- JIT-style tests simulate generated code performance');
        console.log('- String performance varies by length and escape density');
        
    } catch (error) {
        console.error('❌ Benchmark failed:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}
