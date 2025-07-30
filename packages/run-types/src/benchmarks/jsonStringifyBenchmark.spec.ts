/**
 * Tests for JSON stringify benchmark functions
 */

import { runJsonStringifyBenchmarks } from './jsonStringifyBenchmark';

describe('JSON Stringify Benchmarks', () => {
    it('should run benchmarks without errors', () => {
        // Mock console.log to avoid spam during tests
        const originalLog = console.log;
        console.log = jest.fn();
        
        try {
            const results = runJsonStringifyBenchmarks();
            
            // Should return an array of results
            expect(Array.isArray(results)).toBe(true);
            expect(results.length).toBeGreaterThan(0);
            
            // Each result should have the expected structure
            results.forEach(result => {
                expect(result).toHaveProperty('name');
                expect(result).toHaveProperty('jitTime');
                expect(result).toHaveProperty('nativeTime');
                expect(result).toHaveProperty('ratio');
                expect(result).toHaveProperty('iterations');
                expect(result).toHaveProperty('resultsMatch');
                
                expect(typeof result.name).toBe('string');
                expect(typeof result.jitTime).toBe('number');
                expect(typeof result.nativeTime).toBe('number');
                expect(typeof result.ratio).toBe('number');
                expect(typeof result.iterations).toBe('number');
                expect(typeof result.resultsMatch).toBe('boolean');
                
                // Times should be positive
                expect(result.jitTime).toBeGreaterThan(0);
                expect(result.nativeTime).toBeGreaterThan(0);
                expect(result.ratio).toBeGreaterThan(0);
                expect(result.iterations).toBeGreaterThan(0);
            });
            
        } finally {
            // Restore console.log
            console.log = originalLog;
        }
    });
    
    it('should have expected benchmark categories', () => {
        const originalLog = console.log;
        console.log = jest.fn();
        
        try {
            const results = runJsonStringifyBenchmarks();
            const names = results.map(r => r.name);
            
            // Should include basic types
            expect(names).toContain('String');
            expect(names).toContain('Number');
            expect(names).toContain('Boolean');
            expect(names).toContain('Null');
            
            // Should include arrays
            expect(names).toContain('Simple array');
            expect(names.some(name => name.includes('Large array'))).toBe(true);
            
            // Should include objects
            expect(names).toContain('Simple object');
            expect(names).toContain('Medium object');
            expect(names).toContain('Complex nested object');
            expect(names.some(name => name.includes('Wide object'))).toBe(true);
            
        } finally {
            console.log = originalLog;
        }
    });
    
    it('should produce matching results between JIT and native', () => {
        const originalLog = console.log;
        console.log = jest.fn();
        
        try {
            const results = runJsonStringifyBenchmarks();
            
            // All results should match between JIT and native
            const allMatch = results.every(r => r.resultsMatch);
            expect(allMatch).toBe(true);
            
            // If any don't match, log details for debugging
            const mismatches = results.filter(r => !r.resultsMatch);
            if (mismatches.length > 0) {
                console.error('Mismatched results:', mismatches.map(r => ({
                    name: r.name,
                    jitResult: r.jitResult,
                    nativeResult: r.nativeResult
                })));
            }
            
        } finally {
            console.log = originalLog;
        }
    });
});
