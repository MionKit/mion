/* ########
 * 2021 ApiDS
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {JSONSchema} from 'json-schema-to-typescript';
import * as tsj from 'ts-json-schema-generator';
import * as fs from 'fs';
import * as path from 'path';
import * as model1 from './../examples/api/model1/index';
import {addApiRoutes} from './router';
import {ApiRouterConfig} from './types';

describe('generate types', () => {
    // it('should compile', async () => {
    //     const mySchema = {
    //         type: 'object',
    //         properties: {
    //             firstName: {type: 'string'},
    //             lastName: {type: 'string'},
    //             age: {
    //                 description: 'Age in years',
    //                 type: 'integer',
    //                 minimum: 0,
    //             },
    //             hairColor: {
    //                 enum: ['black', 'brown', 'blue'],
    //                 type: 'string',
    //             },
    //         },
    //         additionalProperties: false,
    //         required: ['firstName', 'lastName'],
    //     } as JSONSchema;
    //     const ts = await compile(mySchema, 'My Schema');
    //     expect(typeof ts).toEqual('string');
    //     expect(ts).toContain('export interface MySchema {');
    //     expect(ts).toContain('firstName: string;');
    //     expect(ts).toContain('lastName: string;');
    //     expect(ts).toContain('age?: number;');
    //     expect(ts).toContain('hairColor?: "black" | "brown" | "blue";');
    //     console.log(ts);
    // });

    xit('compile file', async () => {
        const config = {
            path: path.resolve(path.join(__dirname, '../examples/api/model1/index.ts')),
            tsconfig: path.resolve(path.join(__dirname, '../tsconfig.json')),
            type: '*', // Or <type-name> if you want to generate schema for that one type only
            output: path.resolve(path.join(__dirname, '../.dist')),
        };

        console.log(config);

        const schema = tsj.createGenerator(config).createSchema(config.type);
        const schemaString = JSON.stringify(schema, null, 2);
        fs.writeFile(config.output, schemaString, (err) => {
            if (err) throw err;
        });
    });

    xit('import *', async () => {
        const keys = Object.keys(model1);
        console.log(model1);
        console.log(keys);
        addApiRoutes('some/file/', model1);
        expect(keys).toEqual(['sayHello', 'sayHello2', 'sayHello3', 'getById']);
    });
});
