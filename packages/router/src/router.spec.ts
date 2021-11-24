/* ########
 * 2021 ApiDS
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {JSONSchema} from 'json-schema-to-typescript';
import {compile, compileFromFile, Options} from './router';

describe('generate types', () => {
    it('should re export methods and properties from json schema to typescript', async () => {
        expect(typeof compile).toEqual('function');
        expect(typeof compileFromFile).toEqual('function');
    });

    it('should compile', async () => {
        const mySchema = {
            type: 'object',
            properties: {
                firstName: {type: 'string'},
                lastName: {type: 'string'},
                age: {
                    description: 'Age in years',
                    type: 'integer',
                    minimum: 0,
                },
                hairColor: {
                    enum: ['black', 'brown', 'blue'],
                    type: 'string',
                },
            },
            additionalProperties: false,
            required: ['firstName', 'lastName'],
        } as JSONSchema;
        const ts = await compile(mySchema, 'My Schema');
        expect(typeof ts).toEqual('string');
        expect(ts).toContain('export interface MySchema {');
        expect(ts).toContain('firstName: string;');
        expect(ts).toContain('lastName: string;');
        expect(ts).toContain('age?: number;');
        expect(ts).toContain('hairColor?: "black" | "brown" | "blue";');
        console.log(ts);
    });
});
