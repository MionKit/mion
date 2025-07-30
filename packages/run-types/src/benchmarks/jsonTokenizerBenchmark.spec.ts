/**
 * Tests for benchmark functions to ensure they work correctly
 */

import { runJsonTokenizerBenchmarks } from './jsonTokenizerBenchmark';

describe('JSON Tokenizer Benchmarks', () => {
    it('should run benchmarks without errors', () => {
        // Mock console.log to avoid spam during tests
        const originalLog = console.log;
        console.log = jest.fn();
        
        try {
            const results = runJsonTokenizerBenchmarks();
            
            // Should return an array of results
            expect(Array.isArray(results)).toBe(true);
            expect(results.length).toBeGreaterThan(0);
            
            // Each result should have the expected structure
            results.forEach(result => {
                expect(result).toHaveProperty('name');
                expect(result).toHaveProperty('tokenizerTime');
                expect(result).toHaveProperty('jsonParseTime');
                expect(result).toHaveProperty('wrappedJsonParseTime');
                expect(result).toHaveProperty('tokenizerRatio');
                expect(result).toHaveProperty('wrappedRatio');
                expect(result).toHaveProperty('iterations');

                expect(typeof result.name).toBe('string');
                expect(typeof result.tokenizerTime).toBe('number');
                expect(typeof result.jsonParseTime).toBe('number');
                expect(typeof result.wrappedJsonParseTime).toBe('number');
                expect(typeof result.tokenizerRatio).toBe('number');
                expect(typeof result.wrappedRatio).toBe('number');
                expect(typeof result.iterations).toBe('number');

                // Times should be positive
                expect(result.tokenizerTime).toBeGreaterThan(0);
                expect(result.jsonParseTime).toBeGreaterThan(0);
                expect(result.wrappedJsonParseTime).toBeGreaterThan(0);
                expect(result.tokenizerRatio).toBeGreaterThan(0);
                expect(result.wrappedRatio).toBeGreaterThan(0);
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
            const results = runJsonTokenizerBenchmarks();
            const names = results.map(r => r.name);
            
            // Should include basic value types
            expect(names).toContain('Number parsing');
            expect(names).toContain('Boolean parsing');
            expect(names).toContain('Null parsing');
            
            // Should include string length tests
            expect(names.some(name => name.includes('Short string'))).toBe(true);
            expect(names.some(name => name.includes('Medium string'))).toBe(true);
            expect(names.some(name => name.includes('Long string'))).toBe(true);
            
            // Should include escape tests
            expect(names).toContain('No escapes');
            expect(names).toContain('Light escapes');
            expect(names).toContain('Heavy escapes');
            expect(names).toContain('Unicode heavy');
            
            // Should include JIT-style tests
            expect(names).toContain('Object parsing (JIT-style)');
            expect(names).toContain('Array parsing (JIT-style)');
            
        } finally {
            console.log = originalLog;
        }
    });
});
