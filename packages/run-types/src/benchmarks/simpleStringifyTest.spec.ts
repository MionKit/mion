/**
 * Simple test to verify JIT stringify functionality and see basic performance
 */

import { runType } from '../lib/runType';
import { JitFunctions } from '../constants.functions';

// Define explicit types for JIT compilation
interface SimpleTestObject {
    id: number;
    name: string;
    active: boolean;
    score: null;
}

describe('Simple JSON Stringify Test', () => {
    it('should test JIT stringify vs native and show performance', () => {
        console.log('🧪 Testing JIT JSON Stringify vs Native JSON.stringify\n');
        
        // Test 1: Simple string
        console.log('📝 Test 1: String');
        const rtString = runType<string>();
        const stringifyString = rtString.createJitFunction(JitFunctions.jsonStringify);
        
        const testString = "Hello, World!";
        const jitResult1 = stringifyString(testString);
        const nativeResult1 = JSON.stringify(testString);
        
        console.log(`  JIT result:    ${jitResult1}`);
        console.log(`  Native result: ${nativeResult1}`);
        console.log(`  Match: ${jitResult1 === nativeResult1}\n`);
        
        // Test 2: Simple number
        console.log('🔢 Test 2: Number');
        const rtNumber = runType<number>();
        const stringifyNumber = rtNumber.createJitFunction(JitFunctions.jsonStringify);
        
        const testNumber = 42.5;
        const jitResult2 = stringifyNumber(testNumber);
        const nativeResult2 = JSON.stringify(testNumber);
        
        console.log(`  JIT result:    ${jitResult2}`);
        console.log(`  Native result: ${nativeResult2}`);
        console.log(`  Match: ${jitResult2 === nativeResult2}\n`);
        
        // Test 3: Simple object
        console.log('🏗️ Test 3: Simple Object');
        const testObject = {
            id: 123,
            name: "John",
            active: true,
            score: null
        };
        
        const rtObject = runType<SimpleTestObject>();
        const stringifyObject = rtObject.createJitFunction(JitFunctions.jsonStringify);
        
        const jitResult3 = stringifyObject(testObject);
        const nativeResult3 = JSON.stringify(testObject);
        
        console.log(`  JIT result:    ${jitResult3}`);
        console.log(`  Native result: ${nativeResult3}`);
        console.log(`  Match: ${jitResult3 === nativeResult3}\n`);
        
        // Test 4: Simple array
        console.log('📋 Test 4: Simple Array');
        const testArray = [1, "hello", true, null];
        
        const rtArray = runType<(number | string | boolean | null)[]>();
        const stringifyArray = rtArray.createJitFunction(JitFunctions.jsonStringify);
        
        const jitResult4 = stringifyArray(testArray);
        const nativeResult4 = JSON.stringify(testArray);
        
        console.log(`  JIT result:    ${jitResult4}`);
        console.log(`  Native result: ${nativeResult4}`);
        console.log(`  Match: ${jitResult4 === nativeResult4}\n`);
        
        // Performance test
        console.log('⚡ Performance Test: Simple Object (10,000 iterations)');
        const iterations = 10000;
        
        // Warm up
        for (let i = 0; i < 100; i++) {
            stringifyObject(testObject);
            JSON.stringify(testObject);
        }
        
        // JIT benchmark
        const jitStart = performance.now();
        for (let i = 0; i < iterations; i++) {
            stringifyObject(testObject);
        }
        const jitEnd = performance.now();
        const jitTime = jitEnd - jitStart;
        
        // Native benchmark
        const nativeStart = performance.now();
        for (let i = 0; i < iterations; i++) {
            JSON.stringify(testObject);
        }
        const nativeEnd = performance.now();
        const nativeTime = nativeEnd - nativeStart;
        
        console.log(`  JIT time:      ${jitTime.toFixed(2)}ms`);
        console.log(`  Native time:   ${nativeTime.toFixed(2)}ms`);
        console.log(`  Ratio:         ${(jitTime / nativeTime).toFixed(2)}x`);
        
        if (jitTime < nativeTime) {
            console.log(`  🚀 JIT is ${((nativeTime - jitTime) / nativeTime * 100).toFixed(1)}% faster!`);
        } else {
            console.log(`  📉 JIT is ${((jitTime - nativeTime) / nativeTime * 100).toFixed(1)}% slower`);
        }
        
        // Basic assertions
        expect(jitResult1).toBe(nativeResult1);
        expect(jitResult2).toBe(nativeResult2);
        expect(jitResult3).toBe(nativeResult3);
        expect(jitResult4).toBe(nativeResult4);
    });
});
