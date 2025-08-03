/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {runType} from '@mionkit/run-types/src/lib/runType';
import {JitFunctions} from '../constants.functions';

describe('jsonParse', () => {
    describe('Atomic Types', () => {
        it('should parse string types', () => {
            type TestType = string;
            const rt = runType<TestType>();
            const jsonParse = rt.createJitFunction(JitFunctions.jsonParse);
            const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);

            const testValue = 'hello world';
            const jsonString = jsonStringify(testValue);
            const parsed = JSON.parse(jsonString);
            const result = jsonParse(parsed);

            expect(result).toBe(testValue);
        });

        it('should parse number types', () => {
            type TestType = number;
            const rt = runType<TestType>();
            const jsonParse = rt.createJitFunction(JitFunctions.jsonParse);
            const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);

            const testValue = 42.5;
            const jsonString = jsonStringify(testValue);
            const parsed = JSON.parse(jsonString);
            const result = jsonParse(parsed);

            expect(result).toBe(testValue);
        });

        it('should parse boolean types', () => {
            type TestType = boolean;
            const rt = runType<TestType>();
            const jsonParse = rt.createJitFunction(JitFunctions.jsonParse);
            const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);

            const testValue = true;
            const jsonString = jsonStringify(testValue);
            const parsed = JSON.parse(jsonString);
            const result = jsonParse(parsed);

            expect(result).toBe(testValue);
        });

        it('should parse null types', () => {
            type TestType = null;
            const rt = runType<TestType>();
            const jsonParse = rt.createJitFunction(JitFunctions.jsonParse);
            const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);

            const testValue = null;
            const jsonString = jsonStringify(testValue);
            const parsed = JSON.parse(jsonString);
            const result = jsonParse(parsed);

            expect(result).toBe(testValue);
        });

        it('should parse bigint types', () => {
            type TestType = bigint;
            const rt = runType<TestType>();
            const jsonParse = rt.createJitFunction(JitFunctions.jsonParse);
            const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);

            const testValue = 123456789012345678901234567890n;
            const jsonString = jsonStringify(testValue);
            const parsed = JSON.parse(jsonString);
            const result = jsonParse(parsed);

            expect(result).toBe(testValue);
        });

        it('should parse Date types', () => {
            type TestType = Date;
            const rt = runType<TestType>();
            const jsonParse = rt.createJitFunction(JitFunctions.jsonParse);
            const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);

            const testValue = new Date('2023-01-01T00:00:00.000Z');
            const jsonString = jsonStringify(testValue);
            const parsed = JSON.parse(jsonString);
            const result = jsonParse(parsed);

            expect(result).toEqual(testValue);
        });

        it('should parse RegExp types', () => {
            type TestType = RegExp;
            const rt = runType<TestType>();
            const jsonParse = rt.createJitFunction(JitFunctions.jsonParse);
            const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);

            const testValue = /test[0-9]+/gi;
            const jsonString = jsonStringify(testValue);
            const parsed = JSON.parse(jsonString);
            const result = jsonParse(parsed);

            expect(result).toEqual(testValue);
        });
    });

    describe('Array Types', () => {
        it('should parse simple arrays', () => {
            type TestType = number[];
            const rt = runType<TestType>();
            const jsonParse = rt.createJitFunction(JitFunctions.jsonParse);
            const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);

            const testValue = [1, 2, 3, 4, 5];
            const jsonString = jsonStringify(testValue);
            const parsed = JSON.parse(jsonString);
            const result = jsonParse(parsed);

            expect(result).toEqual(testValue);
        });

        it('should parse nested arrays', () => {
            type TestType = number[][];
            const rt = runType<TestType>();
            const jsonParse = rt.createJitFunction(JitFunctions.jsonParse);
            const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);

            const testValue = [
                [1, 2],
                [3, 4],
                [5, 6],
            ];
            const jsonString = jsonStringify(testValue);
            const parsed = JSON.parse(jsonString);
            const result = jsonParse(parsed);

            expect(result).toEqual(testValue);
        });

        it('should parse arrays with complex types', () => {
            type TestType = {name: string; age: number}[];
            const rt = runType<TestType>();
            const jsonParse = rt.createJitFunction(JitFunctions.jsonParse);
            const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);

            const testValue = [
                {name: 'John', age: 30},
                {name: 'Jane', age: 25},
            ];
            const jsonString = jsonStringify(testValue);
            const parsed = JSON.parse(jsonString);
            const result = jsonParse(parsed);

            expect(result).toEqual(testValue);
        });
    });

    describe('Object Types', () => {
        it('should parse simple objects', () => {
            type TestType = {name: string; age: number};
            const rt = runType<TestType>();
            const jsonParse = rt.createJitFunction(JitFunctions.jsonParse);
            const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);

            const testValue = {name: 'John', age: 30};
            const jsonString = jsonStringify(testValue);
            const parsed = JSON.parse(jsonString);
            const result = jsonParse(parsed);

            expect(result).toEqual(testValue);
        });

        it('should parse objects with optional properties', () => {
            type TestType = {name: string; age?: number; email?: string};
            const rt = runType<TestType>();
            const jsonParse = rt.createJitFunction(JitFunctions.jsonParse);
            const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);

            const testValue1 = {name: 'John', age: 30};
            const testValue2 = {name: 'Jane', email: 'jane@example.com'};
            const testValue3 = {name: 'Bob'};

            [testValue1, testValue2, testValue3].forEach((testValue) => {
                const jsonString = jsonStringify(testValue);
                const parsed = JSON.parse(jsonString);
                const result = jsonParse(parsed);
                expect(result).toEqual(testValue);
            });
        });

        it('should parse nested objects', () => {
            type TestType = {
                user: {name: string; age: number};
                settings: {theme: string; notifications: boolean};
            };
            const rt = runType<TestType>();
            const jsonParse = rt.createJitFunction(JitFunctions.jsonParse);
            const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);

            const testValue = {
                user: {name: 'John', age: 30},
                settings: {theme: 'dark', notifications: true},
            };
            const jsonString = jsonStringify(testValue);
            const parsed = JSON.parse(jsonString);
            const result = jsonParse(parsed);

            expect(result).toEqual(testValue);
        });
    });

    describe('Tuple Types', () => {
        it('should parse simple tuples', () => {
            type TestType = [string, number, boolean];
            const rt = runType<TestType>();
            const jsonParse = rt.createJitFunction(JitFunctions.jsonParse);
            const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);

            const testValue: TestType = ['hello', 42, true];
            const jsonString = jsonStringify(testValue);
            const parsed = JSON.parse(jsonString);
            const result = jsonParse(parsed);

            expect(result).toEqual(testValue);
        });

        it('should parse tuples with optional elements', () => {
            type TestType = [string, number?, boolean?];
            const rt = runType<TestType>();
            const jsonParse = rt.createJitFunction(JitFunctions.jsonParse);
            const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);

            const testValue1: TestType = ['hello', 42, true];
            const testValue2: TestType = ['hello', 42];
            const testValue3: TestType = ['hello'];

            [testValue1, testValue2, testValue3].forEach((testValue) => {
                const jsonString = jsonStringify(testValue);
                const parsed = JSON.parse(jsonString);
                const result = jsonParse(parsed);
                expect(result).toEqual(testValue);
            });
        });
    });

    describe('Union Types', () => {
        it('should parse simple unions', () => {
            type TestType = string | number | boolean;
            const rt = runType<TestType>();
            const jsonParse = rt.createJitFunction(JitFunctions.jsonParse);
            const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);

            const testValues: TestType[] = ['hello', 42, true];

            testValues.forEach((testValue) => {
                const jsonString = jsonStringify(testValue);
                const parsed = JSON.parse(jsonString);
                const result = jsonParse(parsed);
                expect(result).toEqual(testValue);
            });
        });

        it('should parse object unions', () => {
            type TestType = {type: 'user'; name: string} | {type: 'admin'; permissions: string[]};
            const rt = runType<TestType>();
            const jsonParse = rt.createJitFunction(JitFunctions.jsonParse);
            const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);

            const testValue1: TestType = {type: 'user', name: 'John'};
            const testValue2: TestType = {type: 'admin', permissions: ['read', 'write']};

            [testValue1, testValue2].forEach((testValue) => {
                const jsonString = jsonStringify(testValue);
                const parsed = JSON.parse(jsonString);
                const result = jsonParse(parsed);
                expect(result).toEqual(testValue);
            });
        });
    });

    describe('Native Collections', () => {
        it('should parse Map types', () => {
            type TestType = Map<string, number>;
            const rt = runType<TestType>();
            const jsonParse = rt.createJitFunction(JitFunctions.jsonParse);
            const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);

            const testValue = new Map([
                ['a', 1],
                ['b', 2],
                ['c', 3],
            ]);
            const jsonString = jsonStringify(testValue);
            const parsed = JSON.parse(jsonString);
            const result = jsonParse(parsed);

            expect(result).toEqual(testValue);
        });

        it('should parse Set types', () => {
            type TestType = Set<number>;
            const rt = runType<TestType>();
            const jsonParse = rt.createJitFunction(JitFunctions.jsonParse);
            const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);

            const testValue = new Set([1, 2, 3, 4, 5]);
            const jsonString = jsonStringify(testValue);
            const parsed = JSON.parse(jsonString);
            const result = jsonParse(parsed);

            expect(result).toEqual(testValue);
        });
    });

    describe('Literal Types', () => {
        it('should parse string literals', () => {
            type TestType = 'hello' | 'world';
            const rt = runType<TestType>();
            const jsonParse = rt.createJitFunction(JitFunctions.jsonParse);
            const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);

            const testValues: TestType[] = ['hello', 'world'];

            testValues.forEach((testValue) => {
                const jsonString = jsonStringify(testValue);
                const parsed = JSON.parse(jsonString);
                const result = jsonParse(parsed);
                expect(result).toEqual(testValue);
            });
        });

        it('should parse number literals', () => {
            type TestType = 1 | 2 | 3;
            const rt = runType<TestType>();
            const jsonParse = rt.createJitFunction(JitFunctions.jsonParse);
            const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);

            const testValues: TestType[] = [1, 2, 3];

            testValues.forEach((testValue) => {
                const jsonString = jsonStringify(testValue);
                const parsed = JSON.parse(jsonString);
                const result = jsonParse(parsed);
                expect(result).toEqual(testValue);
            });
        });
    });

    describe('Enum Types', () => {
        it('should parse string enums', () => {
            enum StringEnum {
                A = 'valueA',
                B = 'valueB',
                C = 'valueC',
            }
            type TestType = StringEnum;
            const rt = runType<TestType>();
            const jsonParse = rt.createJitFunction(JitFunctions.jsonParse);
            const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);

            const testValues = [StringEnum.A, StringEnum.B, StringEnum.C];

            testValues.forEach((testValue) => {
                const jsonString = jsonStringify(testValue);
                const parsed = JSON.parse(jsonString);
                const result = jsonParse(parsed);
                expect(result).toEqual(testValue);
            });
        });

        it('should parse number enums', () => {
            enum NumberEnum {
                A,
                B,
                C,
            }
            type TestType = NumberEnum;
            const rt = runType<TestType>();
            const jsonParse = rt.createJitFunction(JitFunctions.jsonParse);
            const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);

            const testValues = [NumberEnum.A, NumberEnum.B, NumberEnum.C];

            testValues.forEach((testValue) => {
                const jsonString = jsonStringify(testValue);
                const parsed = JSON.parse(jsonString);
                const result = jsonParse(parsed);
                expect(result).toEqual(testValue);
            });
        });
    });

    describe('Index Signature Types', () => {
        it('should parse objects with string index signatures', () => {
            type TestType = {[key: string]: number};
            const rt = runType<TestType>();
            const jsonParse = rt.createJitFunction(JitFunctions.jsonParse);
            const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);

            const testValue = {a: 1, b: 2, c: 3, dynamicKey: 42};
            const jsonString = jsonStringify(testValue);
            const parsed = JSON.parse(jsonString);
            const result = jsonParse(parsed);

            expect(result).toEqual(testValue);
        });

        it('should parse objects with mixed properties and index signatures', () => {
            type TestType = {name: string; [key: string]: string | number};
            const rt = runType<TestType>();
            const jsonParse = rt.createJitFunction(JitFunctions.jsonParse);
            const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);

            const testValue = {name: 'John', age: 30, city: 'New York', score: 95};
            const jsonString = jsonStringify(testValue);
            const parsed = JSON.parse(jsonString);
            const result = jsonParse(parsed);

            expect(result).toEqual(testValue);
        });
    });

    describe('Complex Nested Types', () => {
        it('should parse deeply nested structures', () => {
            type TestType = {
                users: {
                    id: number;
                    profile: {
                        name: string;
                        settings: {
                            theme: 'light' | 'dark';
                            notifications: boolean;
                            preferences: {[key: string]: any};
                        };
                    };
                    posts: {title: string; tags: string[]}[];
                }[];
                metadata: {
                    version: string;
                    lastUpdated: Date;
                };
            };
            const rt = runType<TestType>();
            const jsonParse = rt.createJitFunction(JitFunctions.jsonParse);
            const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);

            const testValue: TestType = {
                users: [
                    {
                        id: 1,
                        profile: {
                            name: 'John',
                            settings: {
                                theme: 'dark',
                                notifications: true,
                                preferences: {lang: 'en', timezone: 'UTC'},
                            },
                        },
                        posts: [
                            {title: 'Hello World', tags: ['intro', 'welcome']},
                            {title: 'TypeScript Tips', tags: ['typescript', 'tips']},
                        ],
                    },
                ],
                metadata: {
                    version: '1.0.0',
                    lastUpdated: new Date('2023-01-01'),
                },
            };

            const jsonString = jsonStringify(testValue);
            const parsed = JSON.parse(jsonString);
            const result = jsonParse(parsed);

            expect(result).toEqual(testValue);
        });
    });

    describe('Performance and Edge Cases', () => {
        it('should handle empty objects', () => {
            // eslint-disable-next-line @typescript-eslint/ban-types
            type TestType = {};
            const rt = runType<TestType>();
            const jsonParse = rt.createJitFunction(JitFunctions.jsonParse);
            const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);

            const testValue = {};
            const jsonString = jsonStringify(testValue);
            const parsed = JSON.parse(jsonString);
            const result = jsonParse(parsed);

            expect(result).toEqual(testValue);
        });

        it('should handle empty arrays', () => {
            type TestType = number[];
            const rt = runType<TestType>();
            const jsonParse = rt.createJitFunction(JitFunctions.jsonParse);
            const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);

            const testValue: number[] = [];
            const jsonString = jsonStringify(testValue);
            const parsed = JSON.parse(jsonString);
            const result = jsonParse(parsed);

            expect(result).toEqual(testValue);
        });

        it('should handle objects with unsafe property names', () => {
            type TestType = {'hello world': string; 'special-chars!@#': number};
            const rt = runType<TestType>();
            const jsonParse = rt.createJitFunction(JitFunctions.jsonParse);
            const jsonStringify = rt.createJitFunction(JitFunctions.jsonStringify);

            const testValue = {'hello world': 'test', 'special-chars!@#': 42};
            const jsonString = jsonStringify(testValue);
            const parsed = JSON.parse(jsonString);
            const result = jsonParse(parsed);

            expect(result).toEqual(testValue);
        });
    });

    describe('Error Cases', () => {
        it('should handle any types gracefully', () => {
            type TestType = any;
            const rt = runType<TestType>();

            // jsonParse should not be implemented for 'any' type as requested
            expect(() => rt.createJitFunction(JitFunctions.jsonParse)).toThrow();
        });

        it('should handle unknown types gracefully', () => {
            type TestType = unknown;
            const rt = runType<TestType>();

            // jsonParse should not be implemented for 'unknown' type as requested
            expect(() => rt.createJitFunction(JitFunctions.jsonParse)).toThrow();
        });
    });
});
